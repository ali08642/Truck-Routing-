from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

URL = "/api/weather/heatmap/"
DEPARTURE = (timezone.now() + timedelta(hours=3)).replace(minute=0, second=0, microsecond=0)


@pytest.fixture
def client():
    return APIClient()


def body(**overrides):
    data = {
        "origin": {"lat": 32.78, "lon": -96.8},
        "destination": {"lat": 29.76, "lon": -95.37},
        "departure_time": DEPARTURE.isoformat(),
        "load_lb": 40000,
    }
    data.update(overrides)
    return data


def test_returns_49_frames_with_consistent_shapes(client):
    res = client.post(URL, body(), format="json")
    assert res.status_code == 200
    d = res.json()
    n = len(d["cells"])
    assert d["hours"] == 48
    for key in ("risk", "wind_mph", "rain_in_hr", "snow_in_hr"):
        assert len(d[key]) == 49
        assert all(len(frame) == n for frame in d[key])
    assert all(0 <= v <= 4 for frame in d["risk"] for v in frame)


def test_heavier_load_never_lowers_risk(client):
    light = client.post(URL, body(load_lb=20000), format="json").json()["risk"]
    heavy = client.post(URL, body(load_lb=80000), format="json").json()["risk"]
    assert all(h >= l for lf, hf in zip(light, heavy) for l, h in zip(lf, hf))


def test_hours_can_be_shortened(client):
    d = client.post(URL, body(hours=6), format="json").json()
    assert len(d["risk"]) == 7


@pytest.mark.parametrize(
    "override",
    [
        {"hours": 49},
        {"hours": 0},
        {"load_lb": 999999},
        {"origin": {"lat": 120, "lon": 0}},
        {"origin": {"lat": 10}},
        {"departure_time": "2020-01-01T00:00:00Z"},
        {"departure_time": (timezone.now() + timedelta(days=30)).isoformat()},
    ],
)
def test_bad_input_is_400(client, override):
    assert client.post(URL, body(**override), format="json").status_code == 400
