import json
from datetime import date, datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import pytest
import responses

from api.services.providers.base import ProviderError
from api.services.providers.open_meteo import OpenMeteoWeather

URL = "https://meteo.test/v1/forecast"
T = datetime(2026, 11, 10, 14, 0, tzinfo=timezone.utc)


def location(lat, start, end, **override):
    """A fake hourly payload: wind = latitude + hour-of-day, rain .01, showers .02, snow .5."""
    times, d = [], start
    while d <= end:
        times += [f"{d.isoformat()}T{h:02d}:00" for h in range(24)]
        d += timedelta(days=1)
    n = len(times)
    hourly = {
        "time": times,
        "wind_speed_10m": [lat + int(t[11:13]) for t in times],
        "rain": [0.01] * n,
        "showers": [0.02] * n,
        "snowfall": [0.5] * n,
    }
    hourly.update(override)
    return {"hourly": hourly}


def install_server():
    def callback(request):
        q = parse_qs(urlparse(request.url).query)
        lats = [float(x) for x in q["latitude"][0].split(",")]
        start, end = date.fromisoformat(q["start_date"][0]), date.fromisoformat(q["end_date"][0])
        payload = [location(lat, start, end) for lat in lats]
        return (200, {}, json.dumps(payload[0] if len(payload) == 1 else payload))

    responses.add_callback(responses.GET, URL, callback=callback, content_type="application/json")


@pytest.fixture
def wx():
    return OpenMeteoWeather(URL)


def query_of(call):
    return parse_qs(urlparse(call.request.url).query)


@responses.activate
def test_single_location_object_is_handled(wx):
    install_server()
    (w,) = wx.get_weather([(30.0, -95.0, T)])
    assert w.wind_mph == 44.0  # 30 + hour 14
    assert w.rain_in_hr == pytest.approx(0.03)  # rain + showers
    assert w.snow_in_hr == 0.5


@responses.activate
def test_asks_for_mph_and_inches_in_utc(wx):
    install_server()
    wx.get_weather([(30.0, -95.0, T)])
    q = query_of(responses.calls[0])
    assert q["wind_speed_unit"] == ["mph"] and q["precipitation_unit"] == ["inch"] and q["timezone"] == ["UTC"]
    assert q["start_date"] == q["end_date"] == ["2026-11-10"]


@responses.activate
def test_multiple_locations_keep_their_order(wx):
    install_server()
    a, b = wx.get_weather([(30.0, -95.0, T), (31.0, -96.0, T)])
    assert (a.wind_mph, b.wind_mph) == (44.0, 45.0)
    assert len(responses.calls) == 1  # one batched request


@responses.activate
def test_same_place_many_hours_is_one_location_in_the_request(wx):
    install_server()
    out = wx.get_weather([(30.001, -95.001, T), (30.004, -95.004, T + timedelta(hours=1))])
    assert [w.wind_mph for w in out] == [44.0, 45.0]
    assert query_of(responses.calls[0])["latitude"] == ["30.00"]


@responses.activate
def test_date_range_spans_midnight(wx):
    install_server()
    wx.get_weather([(30.0, -95.0, T + timedelta(hours=9)), (30.0, -95.0, T + timedelta(hours=14))])
    q = query_of(responses.calls[0])
    assert (q["start_date"], q["end_date"]) == (["2026-11-10"], ["2026-11-11"])


@responses.activate
def test_non_utc_times_are_converted(wx):
    install_server()
    est = timezone(timedelta(hours=-5))
    (w,) = wx.get_weather([(30.0, -95.0, datetime(2026, 11, 10, 9, 0, tzinfo=est))])  # = 14:00 UTC
    assert w.wind_mph == 44.0


@responses.activate
def test_second_identical_request_comes_from_cache(wx):
    install_server()
    wx.get_weather([(30.0, -95.0, T)])
    wx.get_weather([(30.0, -95.0, T)])
    assert len(responses.calls) == 1


@responses.activate
def test_requests_are_chunked(wx):
    install_server()
    wx.get_weather([(20.0 + i * 0.1, -95.0, T) for i in range(120)])
    assert len(responses.calls) == 3  # 50 + 50 + 20


@responses.activate
def test_missing_value_is_an_error_not_calm_weather(wx):
    def callback(request):
        d = date(2026, 11, 10)
        bad = [None] * 24
        return (200, {}, json.dumps(location(30.0, d, d, wind_speed_10m=bad)))

    responses.add_callback(responses.GET, URL, callback=callback, content_type="application/json")
    with pytest.raises(ProviderError, match="No forecast"):
        wx.get_weather([(30.0, -95.0, T)])


@responses.activate
def test_api_error_reason_is_reported(wx):
    responses.add(responses.GET, URL, status=400, json={"error": True, "reason": "Date out of range"})
    with pytest.raises(ProviderError, match="Date out of range"):
        wx.get_weather([(30.0, -95.0, T)])
