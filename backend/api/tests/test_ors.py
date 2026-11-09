import json

import pytest
import responses

from api.services.providers.base import LocationNotFound, ProviderError, RouteNotFound
from api.services.providers.ors import OrsGeocoder, OrsRouter
from routing_core.sampling import haversine_miles

BASE = "https://ors.test"
DALLAS, HOUSTON = (32.78, -96.80), (29.76, -95.37)


def dense(points, per_leg=30):
    out = []
    for (a_lat, a_lon), (b_lat, b_lon) in zip(points, points[1:]):
        for i in range(per_leg):
            t = i / per_leg
            out.append((a_lat + t * (b_lat - a_lat), a_lon + t * (b_lon - a_lon)))
    out.append(points[-1])
    return out


def directions_json(points, duration_h):
    miles = sum(haversine_miles(a, b) for a, b in zip(points, points[1:]))
    return {
        "features": [
            {
                "geometry": {"coordinates": [[lon, lat] for lat, lon in points]},
                "properties": {"summary": {"distance": miles * 1609.344, "duration": duration_h * 3600}},
            }
        ]
    }


def mock_directions(alt_handler):
    """Base route = straight line. For 3-waypoint requests, alt_handler(via) decides the reply."""

    def callback(request):
        coords = json.loads(request.body)["coordinates"]
        if len(coords) == 2:
            return (200, {}, json.dumps(directions_json(dense([DALLAS, HOUSTON]), 3.5)))
        via = (coords[1][1], coords[1][0])
        return alt_handler(via)

    responses.add_callback(
        responses.POST, f"{BASE}/v2/directions/driving-hgv/geojson", callback=callback, content_type="application/json"
    )


def bent(via, hours):
    return (200, {}, json.dumps(directions_json(dense([DALLAS, via, HOUSTON]), hours)))


@pytest.fixture
def router():
    return OrsRouter("KEY", BASE)


# -- geocoder ---------------------------------------------------------------
@responses.activate
def test_geocode_returns_lat_lon_not_lon_lat():
    responses.add(
        responses.GET, f"{BASE}/geocode/search", json={"features": [{"geometry": {"coordinates": [-96.8, 32.78]}}]}
    )
    assert OrsGeocoder("KEY", BASE).geocode("Dallas, TX") == (32.78, -96.8)
    query = responses.calls[0].request.url
    assert "boundary.country=US" in query and "api_key=KEY" in query


@responses.activate
def test_geocode_no_match_is_location_not_found():
    responses.add(responses.GET, f"{BASE}/geocode/search", json={"features": []})
    with pytest.raises(LocationNotFound):
        OrsGeocoder("KEY", BASE).geocode("zzzz")


@responses.activate
def test_bad_key_gives_a_helpful_message():
    responses.add(responses.GET, f"{BASE}/geocode/search", status=403, json={"error": "Access denied"})
    with pytest.raises(ProviderError, match="API key"):
        OrsGeocoder("KEY", BASE).geocode("Dallas")


@responses.activate
def test_server_errors_are_retried_then_reported():
    responses.add(responses.GET, f"{BASE}/geocode/search", status=503)
    with pytest.raises(ProviderError, match="internal error"):
        OrsGeocoder("KEY", BASE).geocode("Dallas")
    assert len(responses.calls) == 3  # first try + 2 retries


# -- router -----------------------------------------------------------------
@responses.activate
def test_three_distinct_routes_labelled_fastest_first(router):
    mock_directions(lambda via: bent(via, 4.0))
    routes = router.get_routes(DALLAS, HOUSTON)
    assert [r.route_id for r in routes] == ["A", "B", "C"]
    durations = [r.duration_hours for r in routes]
    assert durations == sorted(durations) and durations[0] == pytest.approx(3.5)


@responses.activate
def test_request_asks_for_truck_profile_with_unlimited_snap_radius(router):
    mock_directions(lambda via: bent(via, 4.0))
    router.get_routes(DALLAS, HOUSTON)
    request = responses.calls[0].request
    assert request.headers["Authorization"] == "KEY"
    body = json.loads(request.body)
    assert body["radiuses"] == [-1, -1] and body["instructions"] is False
    assert request.url.endswith("/v2/directions/driving-hgv/geojson")


@responses.activate
def test_alternatives_are_pushed_to_opposite_sides(router):
    mock_directions(lambda via: bent(via, 4.0))
    router.get_routes(DALLAS, HOUSTON)
    vias = [json.loads(c.request.body)["coordinates"][1] for c in responses.calls[1:]]
    assert len(vias) == 2 and vias[0][0] != vias[1][0]  # different longitudes = left vs right


@responses.activate
def test_duplicate_alternative_is_dropped(router):
    mock_directions(lambda via: (200, {}, json.dumps(directions_json(dense([DALLAS, HOUSTON]), 3.6))))
    assert [r.route_id for r in router.get_routes(DALLAS, HOUSTON)] == ["A"]


@responses.activate
def test_huge_detour_is_dropped(router):
    mock_directions(lambda via: bent(via, 3.5 * 2))  # twice as slow
    assert len(router.get_routes(DALLAS, HOUSTON)) == 1


@responses.activate
def test_failed_alternative_does_not_break_the_request(router):
    mock_directions(lambda via: (400, {}, json.dumps({"error": {"message": "nope"}})))
    assert len(router.get_routes(DALLAS, HOUSTON)) == 1


@responses.activate
def test_unroutable_base_is_route_not_found(router):
    responses.add(
        responses.POST,
        f"{BASE}/v2/directions/driving-hgv/geojson",
        status=404,
        json={"error": {"code": 2010, "message": "Could not find routable point"}},
    )
    with pytest.raises(RouteNotFound, match="routable point"):
        router.get_routes(DALLAS, HOUSTON)
