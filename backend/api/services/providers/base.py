"""Interfaces for the outside world (geocoding, routing, weather).

The pipeline only talks to these, so real APIs and fakes are interchangeable.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

LatLon = tuple[float, float]


class ProviderError(Exception):
    """An upstream service failed or returned something unusable."""


class LocationNotFound(ProviderError):
    """The user's origin/destination could not be geocoded."""


class RouteNotFound(ProviderError):
    """No drivable route exists between the two places (a user-facing problem)."""


@dataclass(frozen=True)
class RawRoute:
    route_id: str
    geometry: list[LatLon]  # decoded polyline
    distance_miles: float
    duration_hours: float


@dataclass(frozen=True)
class Weather:
    wind_mph: float
    rain_in_hr: float
    snow_in_hr: float


class GeocodingProvider(Protocol):
    def geocode(self, query: str) -> LatLon: ...


class RoutingProvider(Protocol):
    def get_routes(self, origin: LatLon, destination: LatLon) -> list[RawRoute]:
        """Up to 3 alternative routes."""
        ...


class WeatherProvider(Protocol):
    def get_weather(self, requests: list[tuple[float, float, datetime]]) -> list[Weather]:
        """One Weather per (lat, lon, hour) request, same order. Batched on purpose."""
        ...


@dataclass(frozen=True)
class Providers:
    geocoder: GeocodingProvider
    router: RoutingProvider
    weather: WeatherProvider
