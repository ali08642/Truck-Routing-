"""Geometry helpers: bearings, sideways offsets, route overlap, simplification.

Pure Python. Distances are in miles; points are (lat, lon).
"""

from math import asin, atan2, cos, degrees, radians, sin, sqrt

from .sampling import EARTH_RADIUS_MILES, LatLon, cumulative_miles, point_at


def bearing_degrees(a: LatLon, b: LatLon) -> float:
    """Compass direction (0 = north, 90 = east) to travel from a to b."""
    lat1, lon1 = map(radians, a)
    lat2, lon2 = map(radians, b)
    dlon = lon2 - lon1
    x = sin(dlon) * cos(lat2)
    y = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dlon)
    return (degrees(atan2(x, y)) + 360) % 360


def offset_point(p: LatLon, bearing: float, miles: float) -> LatLon:
    """The point reached by travelling `miles` from p along `bearing`."""
    lat1, lon1 = map(radians, p)
    brg = radians(bearing)
    d = miles / EARTH_RADIUS_MILES
    lat2 = asin(sin(lat1) * cos(d) + cos(lat1) * sin(d) * cos(brg))
    lon2 = lon1 + atan2(sin(brg) * sin(d) * cos(lat1), cos(d) - sin(lat1) * sin(lat2))
    return (degrees(lat2), (degrees(lon2) + 540) % 360 - 180)


def _point_to_segment_miles(p: LatLon, a: LatLon, b: LatLon) -> float:
    """Distance from p to the segment a-b (flat-earth approximation, fine locally)."""
    k = cos(radians(p[0]))  # shrink longitude degrees where meridians converge
    ax, ay = (a[1] - p[1]) * k, a[0] - p[0]
    bx, by = (b[1] - p[1]) * k, b[0] - p[0]
    dx, dy = bx - ax, by - ay
    seg2 = dx * dx + dy * dy
    t = 0.0 if seg2 == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / seg2))
    cx, cy = ax + t * dx, ay + t * dy
    return radians(sqrt(cx * cx + cy * cy)) * EARTH_RADIUS_MILES


def distance_to_route_miles(p: LatLon, route: list[LatLon]) -> float:
    return min(_point_to_segment_miles(p, a, b) for a, b in zip(route, route[1:]))


def route_overlap(a: list[LatLon], b: list[LatLon], samples: int = 40, tol_miles: float = 2.0) -> float:
    """Fraction (0-1) of route `a` that runs within `tol_miles` of route `b`."""
    cum = cumulative_miles(a)
    total = cum[-1]
    if total == 0:
        return 1.0
    close = 0
    for i in range(samples):
        p = point_at(a, cum, total * (i + 0.5) / samples)
        if distance_to_route_miles(p, b) <= tol_miles:
            close += 1
    return close / samples


def simplify(points: list[LatLon], tolerance_miles: float) -> list[LatLon]:
    """Ramer-Douglas-Peucker: drop points that barely change the shape.

    Iterative (explicit stack) so very long routes can't hit Python's recursion limit.
    """
    n = len(points)
    if n <= 2:
        return list(points)
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        start, end = stack.pop()
        far_dist, far_idx = -1.0, -1
        for i in range(start + 1, end):
            d = _point_to_segment_miles(points[i], points[start], points[end])
            if d > far_dist:
                far_dist, far_idx = d, i
        if far_dist > tolerance_miles:
            keep[far_idx] = True
            stack.append((start, far_idx))
            stack.append((far_idx, end))
    return [p for p, k in zip(points, keep) if k]
