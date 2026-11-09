from datetime import datetime, timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

URL = "/api/routes/analyze/"
RISKS = {"low", "moderate", "high", "severe", "no_travel"}
DEPARTURE = (timezone.now() + timedelta(days=1)).replace(minute=0, second=0, microsecond=0)


@pytest.fixture
def client():
    return APIClient()


def payload(**overrides):
    body = {
        "origin": "Dallas, TX",
        "destination": "Houston, TX",
        "departure_time": DEPARTURE.isoformat(),
        "load_lb": 45000,
    }
    body.update(overrides)
    return body


def post(client, **overrides):
    return client.post(URL, payload(**overrides), format="json")


def test_health(client):
    assert client.get("/api/health/").json() == {"status": "ok"}


def test_returns_three_routes_and_one_recommendation(client):
    res = post(client)
    assert res.status_code == 200
    data = res.json()
    assert len(data["routes"]) == 3
    assert sum(r["is_recommended"] for r in data["routes"]) == 1
    rec = next(r for r in data["routes"] if r["is_recommended"])
    assert rec["id"] == data["recommended_route_id"] and rec["rank"] == 1
    assert sorted(r["rank"] for r in data["routes"]) == [1, 2, 3]
    assert data["explanation"]


def test_checkpoints_are_ordered_and_consistent(client):
    data = post(client).json()
    departure = DEPARTURE
    for route in data["routes"]:
        cps = route["checkpoints"]
        assert len(cps) >= 2
        assert datetime.fromisoformat(cps[0]["eta"]) == departure
        etas = [datetime.fromisoformat(c["eta"]) for c in cps]
        assert etas == sorted(etas)
        miles = [c["mile"] for c in cps]
        assert miles == sorted(miles)
        assert all(c["risk"] in RISKS for c in cps)
        # checkpoint segments and the summary both cover the whole route
        assert sum(c["segment_miles"] for c in cps) == pytest.approx(route["distance_miles"], abs=1.5)
        assert sum(route["summary"]["miles_by_risk"].values()) == pytest.approx(
            route["distance_miles"], abs=1.5
        )


def test_last_eta_matches_route_duration(client):
    data = post(client).json()
    route = data["routes"][0]
    last = datetime.fromisoformat(route["checkpoints"][-1]["eta"])
    first = datetime.fromisoformat(route["checkpoints"][0]["eta"])
    assert (last - first).total_seconds() / 3600 == pytest.approx(route["duration_hours"], abs=0.02)


def test_spacing_depends_on_route_length(client):
    short = post(client, origin="Dallas", destination="Austin").json()  # ~180 mi
    long_ = post(client, origin="Denver", destination="Chicago").json()  # ~900 mi
    assert short["routes"][0]["spacing_miles"] == 25
    assert long_["routes"][0]["spacing_miles"] == 50


def test_heavier_load_never_lowers_risk(client):
    light = post(client, load_lb=10000).json()
    heavy = post(client, load_lb=80000).json()
    order = ["low", "moderate", "high", "severe", "no_travel"]
    for lr, hr in zip(light["routes"], heavy["routes"]):
        for lc, hc in zip(lr["checkpoints"], hr["checkpoints"]):
            assert order.index(hc["risk"]) >= order.index(lc["risk"])


def test_same_request_gives_same_answer(client):
    assert post(client).json() == post(client).json()


def test_accepts_lat_lon_input(client):
    res = post(client, origin="32.78,-96.80", destination="29.76,-95.37")
    assert res.status_code == 200


def test_unknown_location_is_400(client):
    res = post(client, origin="Atlantis")
    assert res.status_code == 400
    assert "Atlantis" in res.json()["detail"]


@pytest.mark.parametrize(
    "bad",
    [
        {"load_lb": -5},
        {"load_lb": 999999},
        {"load_lb": "heavy"},
        {"departure_time": "not a date"},
        {"origin": "Dallas", "destination": " dallas "},  # same place, different spelling
        {"origin": ""},
    ],
)
def test_bad_input_is_400(client, bad):
    assert post(client, **bad).status_code == 400


def test_missing_fields_is_400(client):
    assert client.post(URL, {}, format="json").status_code == 400


def test_departure_in_the_past_is_400(client):
    assert post(client, departure_time=(timezone.now() - timedelta(days=2)).isoformat()).status_code == 400


def test_departure_too_far_ahead_is_400(client):
    assert post(client, departure_time=(timezone.now() + timedelta(days=30)).isoformat()).status_code == 400


def test_response_geometry_is_slimmed_but_keeps_endpoints(client):
    route = post(client).json()["routes"][0]
    assert route["geometry"][0] != route["geometry"][-1]
    assert 2 <= len(route["geometry"]) <= 41  # fake routes have 41 points
