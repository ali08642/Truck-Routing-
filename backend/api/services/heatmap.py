"""Weather heatmap: risk for every grid cell for every hour from departure.

The frontend fetches this once and then scrubs its slider locally, so dragging
makes no network requests. Kept separate from /routes/analyze/ so the route
analysis stays fast and the map can show routes while the heatmap loads.
"""

from datetime import datetime, timedelta, timezone

from routing_core.heatmap import build_grid
from routing_core.risk import assess_weather

from .providers.base import ProviderError, Weather

MAX_HOURS = 48


def build_heatmap(
    *,
    origin: tuple[float, float],
    destination: tuple[float, float],
    departure: datetime,
    load_lb: float,
    weather_provider,
    hours: int = MAX_HOURS,
) -> dict:
    if not 1 <= hours <= MAX_HOURS:
        raise ValueError(f"hours must be between 1 and {MAX_HOURS}")

    grid = build_grid(origin, destination)
    start = departure.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)
    frames = [start + timedelta(hours=h) for h in range(hours + 1)]  # 0..hours inclusive

    # One batched call for every (cell, hour); the provider dedupes places and caches.
    requests = [(lat, lon, when) for when in frames for lat, lon in grid.cells]
    results: list[Weather] = weather_provider.get_weather(requests)
    if len(results) != len(requests):
        raise ProviderError("Weather service returned an incomplete response.")

    n = len(grid.cells)
    risk, wind, rain, snow = [], [], [], []
    for f in range(len(frames)):
        chunk = results[f * n : (f + 1) * n]
        risk.append([int(assess_weather(w.wind_mph, w.rain_in_hr, w.snow_in_hr, load_lb).level) for w in chunk])
        wind.append([w.wind_mph for w in chunk])
        rain.append([w.rain_in_hr for w in chunk])
        snow.append([w.snow_in_hr for w in chunk])

    return {
        "start_time": start.isoformat(),
        "hours": hours,
        "load_lb": load_lb,
        "cell_size": {"lat": round(grid.lat_step, 4), "lon": round(grid.lon_step, 4)},
        "cells": [[round(lat, 4), round(lon, 4)] for lat, lon in grid.cells],
        # frames[h][i] = value for cell i, h hours after start_time. risk is 0..4 (Low..No Travel).
        "risk": risk,
        "wind_mph": wind,
        "rain_in_hr": rain,
        "snow_in_hr": snow,
    }
