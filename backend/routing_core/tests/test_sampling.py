import pytest

from routing_core.sampling import (
    choose_spacing,
    cumulative_miles,
    haversine_miles,
    point_at,
    sample_checkpoints,
)

# One degree of latitude is about 69.09 miles.
STRAIGHT = [(0.0, 0.0), (1.0, 0.0)]


def test_haversine_one_degree_latitude():
    assert haversine_miles((0, 0), (1, 0)) == pytest.approx(69.09, abs=0.05)


@pytest.mark.parametrize(
    "miles, spacing",
    [(10, 10), (149.9, 10), (150, 25), (500, 25), (500.1, 50), (2000, 50)],
)
def test_choose_spacing(miles, spacing):
    assert choose_spacing(miles) == spacing


def test_point_at_midpoint():
    cum = cumulative_miles(STRAIGHT)
    lat, lon = point_at(STRAIGHT, cum, cum[-1] / 2)
    assert (lat, lon) == pytest.approx((0.5, 0.0))


def test_point_at_follows_the_bend():
    path = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0)]  # north, then east
    cum = cumulative_miles(path)
    lat, lon = point_at(path, cum, cum[1] + 5)  # 5 miles after the corner
    assert lat == pytest.approx(1.0, abs=1e-6)
    assert lon > 0


def test_checkpoints_start_at_origin_and_end_at_destination():
    pts = sample_checkpoints(STRAIGHT, 10)
    assert pts[0].mile == 0 and (pts[0].lat, pts[0].lon) == (0.0, 0.0)
    assert (pts[-1].lat, pts[-1].lon) == (1.0, 0.0)
    assert pts[-1].mile == pytest.approx(69.09, abs=0.05)


def test_checkpoint_spacing_and_count():
    pts = sample_checkpoints(STRAIGHT, 10)
    assert len(pts) == 8  # 0,10,...,60 plus destination
    gaps = [b.mile - a.mile for a, b in zip(pts[:6], pts[1:7])]
    assert gaps == pytest.approx([10] * 6)


def test_segments_add_up_to_route_length():
    pts = sample_checkpoints(STRAIGHT, 10)
    assert sum(p.segment_miles for p in pts) == pytest.approx(pts[-1].mile)


def test_exact_multiple_has_no_duplicate_end_point():
    path = [(0.0, 0.0), (0.0, 0.1)]
    total = cumulative_miles(path)[-1]
    pts = sample_checkpoints(path, total)  # spacing == route length
    assert [round(p.mile, 3) for p in pts] == [0, round(total, 3)]


def test_zero_length_route():
    pts = sample_checkpoints([(1.0, 1.0), (1.0, 1.0)], 10)
    assert len(pts) == 1 and pts[0].segment_miles == 0


def test_invalid_input():
    with pytest.raises(ValueError):
        sample_checkpoints([(0, 0)], 10)
    with pytest.raises(ValueError):
        sample_checkpoints(STRAIGHT, 0)
