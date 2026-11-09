"""Offline stand-ins so the whole pipeline runs without API keys.

Weather is a smooth deterministic function of place and time, so results are
repeatable and look plausible (it varies gradually, like real weather would).
"""

from datetime import datetime
from math import cos, sin, sqrt

from routing_core.sampling import haversine_miles

from .base import LatLon, LocationNotFound, RawRoute, Weather

CITIES: dict[str, LatLon] = {
    "dallas": (32.7767, -96.7970),
    "houston": (29.7604, -95.3698),
    "austin": (30.2672, -97.7431),
    "san antonio": (29.4241, -98.4936),
    "oklahoma city": (35.4676, -97.5164),
    "kansas city": (39.0997, -94.5786),
    "denver": (39.7392, -104.9903),
    "chicago": (41.8781, -87.6298),
    "memphis": (35.1495, -90.0490),
    "atlanta": (33.7490, -84.3880),
    "phoenix": (33.4484, -112.0740),
    "los angeles": (34.0522, -118.2437),
}


class FakeGeocoder:
    def geocode(self, query: str) -> LatLon:
        text = query.strip().lower()
        # Accept raw "lat,lon" too.
        try:
            lat_s, lon_s = text.split(",")
            lat, lon = float(lat_s), float(lon_s)
            if -90 <= lat <= 90 and -180 <= lon <= 180:
                return (lat, lon)
        except ValueError:
            pass
        name = text.split(",")[0].strip()  # "Dallas, TX" -> "dallas"
        if name in CITIES:
            return CITIES[name]
        raise LocationNotFound(f"Could not find a location for '{query}'.")


class FakeRouter:
    # (route id, bend of the path, average speed in mph)
    VARIANTS = [("A", 0.0, 55.0), ("B", 0.18, 52.0), ("C", -0.18, 58.0)]
    STEPS = 40

    def get_routes(self, origin: LatLon, destination: LatLon) -> list[RawRoute]:
        routes = []
        for route_id, bend, speed in self.VARIANTS:
            geometry = self._curve(origin, destination, bend)
            miles = sum(haversine_miles(a, b) for a, b in zip(geometry, geometry[1:]))
            routes.append(RawRoute(route_id, geometry, miles, miles / speed))
        return routes

    def _curve(self, a: LatLon, b: LatLon, bend: float) -> list[LatLon]:
        # Quadratic Bezier with the middle control point pushed sideways.
        dlat, dlon = b[0] - a[0], b[1] - a[1]
        ctrl = ((a[0] + b[0]) / 2 - bend * dlon, (a[1] + b[1]) / 2 + bend * dlat)
        pts = []
        for i in range(self.STEPS + 1):
            t = i / self.STEPS
            u = 1 - t
            pts.append(
                (
                    u * u * a[0] + 2 * u * t * ctrl[0] + t * t * b[0],
                    u * u * a[1] + 2 * u * t * ctrl[1] + t * t * b[1],
                )
            )
        return pts


class FakeWeather:
    def get_weather(self, requests: list[tuple[float, float, datetime]]) -> list[Weather]:
        return [self._one(lat, lon, when) for lat, lon, when in requests]

    @staticmethod
    def _one(lat: float, lon: float, when: datetime) -> Weather:
        h = int(when.timestamp() // 3600)
        wind = 22 + 20 * sin(lat * 0.8 + h * 0.11) + 10 * cos(lon * 0.6 - h * 0.07)
        rain = 0.1 + 0.35 * sin(lon * 0.9 + h * 0.13)
        snow = 1.2 * sin(lat * 0.5 + lon * 0.3 + h * 0.05) - 0.8
        return Weather(
            wind_mph=round(max(0.0, wind), 1),
            rain_in_hr=round(max(0.0, rain), 2),
            snow_in_hr=round(max(0.0, snow), 2),
        )
