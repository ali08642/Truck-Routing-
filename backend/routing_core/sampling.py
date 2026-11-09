"""Place weather checkpoints along a route polyline.

Pure Python. A route is a list of (lat, lon) points. We measure distance along
it, drop a checkpoint every `spacing` miles (plus one at the destination), and
give each checkpoint the stretch of road it represents.
"""

from bisect import bisect_right
from dataclasses import dataclass
from math import asin, cos, radians, sin, sqrt

EARTH_RADIUS_MILES = 3958.8
LatLon = tuple[float, float]


@dataclass(frozen=True)
class SamplePoint:
    lat: float
    lon: float
    mile: float  # distance from the origin along the route
    segment_miles: float  # road this checkpoint stands for (sums to route length)


def haversine_miles(a: LatLon, b: LatLon) -> float:
    lat1, lon1 = map(radians, a)
    lat2, lon2 = map(radians, b)
    h = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_MILES * asin(sqrt(h))


def cumulative_miles(points: list[LatLon]) -> list[float]:
    cum = [0.0]
    for a, b in zip(points, points[1:]):
        cum.append(cum[-1] + haversine_miles(a, b))
    return cum


def point_at(points: list[LatLon], cum: list[float], mile: float) -> LatLon:
    """Coordinates of the spot `mile` miles along the route."""
    if mile <= 0:
        return points[0]
    if mile >= cum[-1]:
        return points[-1]
    i = bisect_right(cum, mile) - 1  # cum[i] <= mile < cum[i + 1]
    seg = cum[i + 1] - cum[i]
    t = (mile - cum[i]) / seg
    return (
        points[i][0] + t * (points[i + 1][0] - points[i][0]),
        points[i][1] + t * (points[i + 1][1] - points[i][1]),
    )


def choose_spacing(total_miles: float) -> int:
    """The spec says 10 / 25 / 50 miles; we pick by route length.

    Short trips get fine detail; very long trips stay within API limits.
    """
    if total_miles < 150:
        return 10
    if total_miles <= 500:
        return 25
    return 50


def sample_checkpoints(points: list[LatLon], spacing_miles: float) -> list[SamplePoint]:
    if len(points) < 2:
        raise ValueError("A route needs at least two points")
    if spacing_miles <= 0:
        raise ValueError("spacing_miles must be positive")

    cum = cumulative_miles(points)
    total = cum[-1]

    markers = [i * spacing_miles for i in range(int(total // spacing_miles) + 1)]
    if total - markers[-1] > 1e-6:
        markers.append(total)  # always check the destination

    # Each checkpoint owns the road halfway to its neighbours on either side,
    # so the segments add up to exactly the route length.
    bounds = [markers[0]]
    bounds += [(markers[i - 1] + markers[i]) / 2 for i in range(1, len(markers))]
    bounds.append(markers[-1])

    result = []
    for i, m in enumerate(markers):
        lat, lon = point_at(points, cum, m)
        result.append(SamplePoint(lat, lon, m, bounds[i + 1] - bounds[i]))
    return result
