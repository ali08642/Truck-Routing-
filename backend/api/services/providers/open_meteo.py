"""Open-Meteo hourly forecasts, batched and cached.

Free, no API key. We ask for mph and inches directly so no unit conversion is
needed. Many coordinates go in one request, and every (place, hour) result is
cached so repeated or overlapping trips don't hit the API again.
"""

from datetime import datetime, timezone

import requests
from django.core.cache import cache as default_cache

from .base import ProviderError, Weather
from .http import UpstreamHTTPError, request_json

HOURLY_VARIABLES = "wind_speed_10m,rain,showers,snowfall"
CHUNK_SIZE = 50  # coordinates per request (keeps URLs short)
CACHE_TTL_SECONDS = 30 * 60
GRID_DECIMALS = 2  # ~1 km; forecast model cells are ~9-11 km, so this loses nothing


def _chunks(items: list, size: int):
    for i in range(0, len(items), size):
        yield items[i : i + size]


class OpenMeteoWeather:
    def __init__(self, base_url: str = "https://api.open-meteo.com/v1/forecast", session=None, cache=None):
        self.base_url = base_url
        self.session = session or requests.Session()
        self.cache = cache or default_cache

    # -- helpers ----------------------------------------------------------
    @staticmethod
    def _grid(lat: float, lon: float) -> tuple[float, float]:
        return (round(lat, GRID_DECIMALS), round(lon, GRID_DECIMALS))

    @staticmethod
    def _hour(when: datetime) -> datetime:
        return when.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)

    @staticmethod
    def _key(grid: tuple[float, float], hour: datetime) -> str:
        return f"wx:{grid[0]:.2f}:{grid[1]:.2f}:{hour:%Y%m%dT%H}"

    # -- public -----------------------------------------------------------
    def get_weather(self, requests: list[tuple[float, float, datetime]]) -> list[Weather]:
        wanted = [(self._grid(lat, lon), self._hour(when)) for lat, lon, when in requests]
        cached = self.cache.get_many({self._key(g, h) for g, h in wanted})

        missing = [(g, h) for g, h in wanted if self._key(g, h) not in cached]
        if missing:
            grids = sorted({g for g, _ in missing})
            start = min(h for _, h in missing).date()
            end = max(h for _, h in missing).date()
            fresh: dict[str, Weather] = {}
            for chunk in _chunks(grids, CHUNK_SIZE):
                fresh.update(self._fetch(chunk, start, end))
            self.cache.set_many(fresh, CACHE_TTL_SECONDS)
            cached.update(fresh)

        result = []
        for grid, hour in wanted:
            weather = cached.get(self._key(grid, hour))
            if weather is None:
                raise ProviderError(
                    f"No forecast available for {grid[0]}, {grid[1]} at {hour:%Y-%m-%d %H:00} UTC."
                )
            result.append(weather)
        return result

    # -- one HTTP call ------------------------------------------------------
    def _fetch(self, grids: list[tuple[float, float]], start, end) -> dict[str, Weather]:
        params = {
            "latitude": ",".join(f"{g[0]:.2f}" for g in grids),
            "longitude": ",".join(f"{g[1]:.2f}" for g in grids),
            "hourly": HOURLY_VARIABLES,
            "wind_speed_unit": "mph",
            "precipitation_unit": "inch",
            "timezone": "UTC",
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
        }
        try:
            data = request_json(self.session, "GET", self.base_url, params=params, timeout=20)
        except UpstreamHTTPError as exc:
            raise ProviderError(f"Weather service error: {exc.detail}") from exc

        if isinstance(data, dict):  # a single location comes back as an object, not a list
            data = [data]
        if len(data) != len(grids):
            raise ProviderError("Weather service returned an incomplete response.")

        out: dict[str, Weather] = {}
        for grid, location in zip(grids, data):
            hourly = location.get("hourly") or {}
            try:
                times = hourly["time"]
                winds, rains = hourly["wind_speed_10m"], hourly["rain"]
                showers, snows = hourly["showers"], hourly["snowfall"]
            except KeyError as exc:
                raise ProviderError("Weather service response was missing data.") from exc
            for i, stamp in enumerate(times):
                values = (winds[i], rains[i], showers[i], snows[i])
                if any(v is None for v in values):
                    continue  # unknown is not "calm": leave it out so it errors if requested
                hour = datetime.fromisoformat(stamp).replace(tzinfo=timezone.utc)
                out[self._key(grid, hour)] = Weather(
                    wind_mph=round(values[0], 1),
                    rain_in_hr=round(values[1] + values[2], 3),
                    snow_in_hr=round(values[3], 3),
                )
        return out
