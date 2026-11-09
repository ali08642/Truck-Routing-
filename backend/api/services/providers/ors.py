"""OpenRouteService: geocoding (Pelias) and truck routing (driving-hgv profile).

Why the "via waypoint" trick: ORS only offers its built-in alternative routes for
trips under 100 km, which is useless for trucking. Normal directions work up to
6,000 km, so we build alternatives ourselves: take the fastest route, push a
waypoint sideways from its midpoint (left and right), and route through it.
"""

from dataclasses import dataclass

import requests

from routing_core.geo import bearing_degrees, offset_point, route_overlap, simplify
from routing_core.sampling import LatLon, cumulative_miles, point_at

from .base import LocationNotFound, ProviderError, RawRoute, RouteNotFound
from .http import UpstreamHTTPError, request_json

METERS_PER_MILE = 1609.344
PROFILE = "driving-hgv"

# Tuning knobs for alternative routes (explained in docs/DESIGN_DECISIONS.md)
DETOUR_FRACTION = 0.15  # push the via point sideways by 15% of the route length...
MIN_OFFSET_MILES, MAX_OFFSET_MILES = 3, 100  # ...but keep it within these bounds
MAX_DETOUR_RATIO = 1.4  # reject alternatives >40% longer/slower than the fastest
OVERLAP_LIMIT = 0.85  # reject alternatives that follow an existing route >85% of the way


class _OrsBase:
    def __init__(self, api_key: str, base_url: str = "https://api.openrouteservice.org", session=None):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.session = session or requests.Session()

    def _call(self, method: str, path: str, *, timeout: float, **kwargs):
        try:
            return request_json(self.session, method, self.base_url + path, timeout=timeout, **kwargs)
        except UpstreamHTTPError as exc:
            if exc.status in (401, 403):
                raise ProviderError("OpenRouteService rejected the API key. Check ORS_API_KEY.") from exc
            raise


class OrsGeocoder(_OrsBase):
    def geocode(self, query: str) -> LatLon:
        params = {"api_key": self.api_key, "text": query, "size": 1, "boundary.country": "US"}
        try:
            data = self._call("GET", "/geocode/search", params=params, timeout=10)
        except UpstreamHTTPError as exc:
            raise ProviderError(f"Geocoding failed: {exc.detail}") from exc
        features = data.get("features") or []
        if not features:
            raise LocationNotFound(f"Could not find a location for '{query}'.")
        lon, lat = features[0]["geometry"]["coordinates"][:2]  # GeoJSON order is lon, lat
        return (lat, lon)


@dataclass(frozen=True)
class _Candidate:
    geometry: list[LatLon]
    distance_miles: float
    duration_hours: float


class OrsRouter(_OrsBase):
    def get_routes(self, origin: LatLon, destination: LatLon) -> list[RawRoute]:
        try:
            base = self._directions([origin, destination])
        except UpstreamHTTPError as exc:
            raise RouteNotFound(f"No drivable truck route found: {exc.detail}") from exc

        kept = [base]
        simple = [simplify(base.geometry, 0.25)]  # coarse copies make overlap checks cheap

        cum = cumulative_miles(base.geometry)
        midpoint = point_at(base.geometry, cum, cum[-1] / 2)
        heading = bearing_degrees(origin, destination)
        offset = min(max(DETOUR_FRACTION * base.distance_miles, MIN_OFFSET_MILES), MAX_OFFSET_MILES)

        for side in (+90, -90):
            via = offset_point(midpoint, (heading + side) % 360, offset)
            try:
                cand = self._directions([origin, via, destination])
            except ProviderError:
                continue  # alternatives are best-effort; the base route is enough to proceed
            if (
                cand.duration_hours > base.duration_hours * MAX_DETOUR_RATIO
                or cand.distance_miles > base.distance_miles * MAX_DETOUR_RATIO
            ):
                continue
            cand_simple = simplify(cand.geometry, 0.25)
            if any(
                max(route_overlap(cand_simple, s), route_overlap(s, cand_simple)) >= OVERLAP_LIMIT
                for s in simple
            ):
                continue
            kept.append(cand)
            simple.append(cand_simple)

        kept.sort(key=lambda c: c.duration_hours)
        return [
            RawRoute(chr(ord("A") + i), c.geometry, c.distance_miles, c.duration_hours)
            for i, c in enumerate(kept)
        ]

    def _directions(self, waypoints: list[LatLon]) -> _Candidate:
        body = {
            "coordinates": [[lon, lat] for lat, lon in waypoints],
            "radiuses": [-1] * len(waypoints),  # snap to the nearest road however far
            "instructions": False,  # we only need the shape, not turn-by-turn text
        }
        data = self._call(
            "POST",
            f"/v2/directions/{PROFILE}/geojson",
            json=body,
            headers={"Authorization": self.api_key},
            timeout=30,
        )
        try:
            feature = data["features"][0]
            coords = feature["geometry"]["coordinates"]
            summary = feature["properties"]["summary"]
            return _Candidate(
                geometry=[(c[1], c[0]) for c in coords],
                distance_miles=summary["distance"] / METERS_PER_MILE,
                duration_hours=summary["duration"] / 3600,
            )
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderError("Routing service returned an unexpected response.") from exc
