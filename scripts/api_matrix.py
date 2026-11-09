"""Automated API test matrix. Works against local or deployed backends.

    python scripts/api_matrix.py                              # http://127.0.0.1:8000
    python scripts/api_matrix.py https://your-api.onrender.com

Needs only `requests` (already in requirements.txt). Exit code 1 if any case fails.
"""
import sys
import time
from datetime import datetime, timedelta, timezone

import requests

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/")
URL = f"{BASE}/api/routes/analyze/"


def iso(hours_ahead):
    return (datetime.now(timezone.utc) + timedelta(hours=hours_ahead)).strftime("%Y-%m-%dT%H:%M:%SZ")


def case(name, expect, **override):
    body = {"origin": "Atlanta, GA", "destination": "Chicago, IL", "departure_time": iso(3), "load_lb": 40000}
    body.update(override)
    body = {k: v for k, v in body.items() if v is not None}
    t = time.time()
    try:
        r = requests.post(URL, json=body, timeout=90)
        status, data = r.status_code, (r.json() if r.content else {})
    except Exception as exc:  # network / non-JSON
        status, data = -1, {"detail": str(exc)}
    ok = status == expect
    extra = ""
    if status == 200:
        routes = data["routes"]
        extra = f"{len(routes)} routes, rec={data['recommended_route_id']}, {time.time() - t:.1f}s"
        # invariants every successful response must satisfy
        assert sum(r_["is_recommended"] for r_ in routes) == 1, "exactly one recommended route"
        assert [r_["rank"] for r_ in routes] == sorted(r_["rank"] for r_ in routes), "sorted by rank"
        for r_ in routes:
            assert abs(sum(r_["summary"]["miles_by_risk"].values()) - r_["distance_miles"]) < 1.5, "risk miles add up"
    else:
        extra = str(data.get("detail") or data)[:90]
    print(f"{'PASS' if ok else 'FAIL'}  {name:<34} expected {expect} got {status}  {extra}")
    return ok


results = [
    case("happy path, 40k lb", 200),
    case("same request again (cache)", 200),
    case("light load 20k", 200, load_lb=20000),
    case("heavy load 80k", 200, load_lb=80000),
    case("max load 120k", 200, load_lb=120000),
    case("load too high", 400, load_lb=120001),
    case("negative load", 400, load_lb=-5),
    case("load is text", 400, load_lb="heavy"),
    case("missing destination", 400, destination=None),
    case("empty origin", 400, origin=""),
    case("origin == destination", 400, destination="Atlanta, GA"),
    case("departure far in the past", 400, departure_time="2020-01-01T00:00:00Z"),
    case("departure 30 days ahead", 400, departure_time=iso(24 * 30)),
    case("departure not a date", 400, departure_time="tomorrow"),
    case("unknown place (typo)", 400, origin="Atlanka"),
    case("short trip", 200, origin="Atlanta, GA", destination="Marietta, GA"),
    case("long trip LA to NYC", 200, origin="Los Angeles, CA", destination="New York, NY"),
    case("winter state trip", 200, origin="Denver, CO", destination="Minneapolis, MN"),
]
# -- heatmap endpoint -------------------------------------------------------
def heatmap_case(name, expect, **override):
    body = {
        "origin": {"lat": 33.77, "lon": -84.41},
        "destination": {"lat": 41.88, "lon": -87.66},
        "departure_time": iso(3),
        "load_lb": 40000,
    }
    body.update(override)
    t = time.time()
    r = requests.post(f"{BASE}/api/weather/heatmap/", json=body, timeout=90)
    ok, extra = r.status_code == expect, ""
    if r.status_code == 200:
        d = r.json()
        n = len(d["cells"])
        shape_ok = len(d["risk"]) == d["hours"] + 1 and all(len(f) == n for f in d["risk"])
        range_ok = all(0 <= v <= 4 for f in d["risk"] for v in f)
        ok = ok and shape_ok and range_ok
        extra = f"{n} cells x {len(d['risk'])} frames, {time.time() - t:.1f}s"
    else:
        extra = str(r.json().get("detail") or r.json())[:90]
    print(f"{'PASS' if ok else 'FAIL'}  {name:<34} expected {expect} got {r.status_code}  {extra}")
    return ok


results += [
    heatmap_case("heatmap happy path", 200),
    heatmap_case("heatmap again (weather cached)", 200),
    heatmap_case("heatmap hours=6", 200, hours=6),
    heatmap_case("heatmap bad latitude", 400, origin={"lat": 120, "lon": 0}),
    heatmap_case("heatmap hours too large", 400, hours=49),
    heatmap_case("heatmap past departure", 400, departure_time="2020-01-01T00:00:00Z"),
]

passed = sum(results)
print(f"\n{passed}/{len(results)} passed")
sys.exit(0 if passed == len(results) else 1)
