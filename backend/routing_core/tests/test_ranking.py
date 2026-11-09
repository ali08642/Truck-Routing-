import pytest

from routing_core.ranking import Checkpoint, Route, recommend, summarize_route
from routing_core.risk import Risk


def make_route(route_id, risks_and_miles, duration_hours=5.0):
    """risks_and_miles: list of (Risk, miles) pairs."""
    cps = [Checkpoint(0, 0, miles, risk) for risk, miles in risks_and_miles]
    return Route(route_id, sum(m for _, m in risks_and_miles), duration_hours, cps)


def test_summary_totals_miles_per_level():
    route = make_route("A", [(Risk.LOW, 50), (Risk.HIGH, 25), (Risk.HIGH, 25), (Risk.SEVERE, 10)])
    s = summarize_route(route)
    assert s.miles_by_risk[Risk.LOW] == 50
    assert s.high_miles == 50
    assert s.severe_miles == 10
    assert s.worst_risk == Risk.SEVERE


def test_average_risk_is_mile_weighted():
    # 75 mi at 0 and 25 mi at 4 -> (0*75 + 4*25) / 100 = 1.0
    route = make_route("A", [(Risk.LOW, 75), (Risk.NO_TRAVEL, 25)])
    assert summarize_route(route).avg_risk == pytest.approx(1.0)


def test_empty_route_does_not_crash():
    s = summarize_route(Route("A", 0, 0, []))
    assert s.avg_risk == 0.0 and s.worst_risk == Risk.LOW


def test_fewest_severe_miles_beats_everything_below_it():
    a = make_route("A", [(Risk.SEVERE, 10), (Risk.LOW, 90)], duration_hours=4)
    b = make_route("B", [(Risk.HIGH, 100)], duration_hours=9)
    rec = recommend([a, b])
    assert rec.best.route_id == "B"
    assert rec.decided_by == "severe_miles"


def test_fewest_high_miles_when_severe_equal():
    a = make_route("A", [(Risk.HIGH, 40), (Risk.LOW, 60)])
    b = make_route("B", [(Risk.HIGH, 20), (Risk.LOW, 80)])
    rec = recommend([a, b])
    assert rec.best.route_id == "B"
    assert rec.decided_by == "high_miles"


def test_average_risk_when_severe_and_high_equal():
    a = make_route("A", [(Risk.MODERATE, 100)])
    b = make_route("B", [(Risk.LOW, 50), (Risk.MODERATE, 50)])
    rec = recommend([a, b])
    assert rec.best.route_id == "B"
    assert rec.decided_by == "avg_risk"


def test_shortest_time_is_last_tiebreaker():
    a = make_route("A", [(Risk.LOW, 100)], duration_hours=6)
    b = make_route("B", [(Risk.LOW, 100)], duration_hours=5)
    rec = recommend([a, b])
    assert rec.best.route_id == "B"
    assert rec.decided_by == "duration_hours"


def test_no_travel_route_loses_even_if_otherwise_better():
    blocked = make_route("A", [(Risk.NO_TRAVEL, 5), (Risk.LOW, 95)], duration_hours=3)
    severe = make_route("B", [(Risk.SEVERE, 50), (Risk.LOW, 50)], duration_hours=8)
    rec = recommend([blocked, severe])
    assert rec.best.route_id == "B"
    assert rec.decided_by == "no_travel_miles"


def test_three_routes_ranked_best_first():
    a = make_route("A", [(Risk.SEVERE, 30), (Risk.LOW, 70)])
    b = make_route("B", [(Risk.HIGH, 30), (Risk.LOW, 70)])
    c = make_route("C", [(Risk.LOW, 100)])
    rec = recommend([a, b, c])
    assert [s.route_id for s in rec.ranked] == ["C", "B", "A"]


def test_exact_tie_reported():
    a = make_route("A", [(Risk.LOW, 100)])
    b = make_route("B", [(Risk.LOW, 100)])
    assert recommend([a, b]).decided_by == "tie"


def test_single_route():
    rec = recommend([make_route("A", [(Risk.LOW, 100)])])
    assert rec.best.route_id == "A"


def test_no_routes_raises():
    with pytest.raises(ValueError):
        recommend([])
