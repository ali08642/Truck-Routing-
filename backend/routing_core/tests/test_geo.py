import pytest

from routing_core.geo import bearing_degrees, offset_point, route_overlap, simplify
from routing_core.sampling import haversine_miles


@pytest.mark.parametrize(
    "dest, expected",
    [((1, 0), 0), ((0, 1), 90), ((-1, 0), 180), ((0, -1), 270)],
)
def test_bearing_cardinal_directions(dest, expected):
    assert bearing_degrees((0, 0), dest) == pytest.approx(expected, abs=0.5)


def test_offset_point_travels_the_requested_distance():
    p = (32.0, -96.0)
    q = offset_point(p, 135, 40)
    assert haversine_miles(p, q) == pytest.approx(40, abs=0.01)


def test_bearing_and_offset_agree():
    p = (40.0, -100.0)
    assert bearing_degrees(p, offset_point(p, 45, 30)) == pytest.approx(45, abs=0.2)


def test_offset_north_increases_latitude():
    assert offset_point((10.0, 10.0), 0, 69.09)[0] == pytest.approx(11.0, abs=0.01)


LINE = [(0.0, 0.0), (0.0, 1.0)]  # 2 vertices, ~69 miles long


def test_overlap_identical_routes_with_sparse_vertices():
    # Regression guard: measuring to *vertices* would call this 0% overlap.
    assert route_overlap(LINE, [(0.0, 0.0), (0.0, 1.0)]) == 1.0


def test_overlap_of_parallel_far_routes_is_zero():
    assert route_overlap(LINE, [(1.0, 0.0), (1.0, 1.0)]) == 0.0


def test_overlap_partial():
    half = [(0.0, 0.0), (0.0, 0.5)]
    assert route_overlap(LINE, half) == pytest.approx(0.5, abs=0.1)


def test_simplify_collinear_points_collapse_to_endpoints():
    pts = [(0.0, i / 10) for i in range(11)]
    assert simplify(pts, 0.05) == [pts[0], pts[-1]]


def test_simplify_keeps_a_real_corner():
    pts = [(0.0, 0.0), (0.0, 0.5), (0.5, 0.5)]
    assert simplify(pts, 0.5) == pts


def test_simplify_reduces_noisy_line_and_keeps_endpoints():
    pts = [(0.0001 * (i % 2), i * 0.01) for i in range(500)]  # ~0.007 mi wiggle
    out = simplify(pts, 0.05)
    assert out[0] == pts[0] and out[-1] == pts[-1]
    assert len(out) < 10


def test_simplify_short_inputs_untouched():
    assert simplify([(0, 0)], 1) == [(0, 0)]
    assert simplify([(0, 0), (1, 1)], 1) == [(0, 0), (1, 1)]
