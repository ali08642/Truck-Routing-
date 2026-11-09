from routing_core.heatmap import MAX_CELLS, build_grid


def test_cell_count_is_capped_for_any_trip_shape():
    trips = [
        ((33.75, -84.39), (41.88, -87.63)),  # long, diagonal
        ((34.05, -118.24), (40.71, -74.0)),  # cross-country
        ((32.78, -96.8), (32.78, -96.8)),  # same point
        ((32.0, -100.0), (32.0, -90.0)),  # due east
        ((30.0, -95.0), (45.0, -95.0)),  # due north
    ]
    for a, b in trips:
        grid = build_grid(a, b)
        assert 4 <= len(grid.cells) <= MAX_CELLS


def test_grid_covers_origin_and_destination_with_padding():
    a, b = (33.75, -84.39), (41.88, -87.63)
    grid = build_grid(a, b)
    lats = [c[0] for c in grid.cells]
    lons = [c[1] for c in grid.cells]
    assert min(lats) < min(a[0], b[0]) and max(lats) > max(a[0], b[0])
    assert min(lons) < min(a[1], b[1]) and max(lons) > max(a[1], b[1])


def test_cells_are_roughly_square_in_miles():
    grid = build_grid((33.75, -84.39), (41.88, -87.63))
    from math import cos, radians

    height = grid.lat_step * 69.0
    width = grid.lon_step * 69.0 * cos(radians(37.8))
    assert 0.5 < width / height < 2.0


def test_steps_are_positive():
    grid = build_grid((32.78, -96.8), (32.78, -96.8))
    assert grid.lat_step > 0 and grid.lon_step > 0
