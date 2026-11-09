"""Choose the grid of points the weather heatmap is drawn on.

Pure Python (no Django, no network), so it is easy to test.

Idea: take the box around origin and destination, pad it so storms just off the
route are visible, and cut it into roughly square cells (in miles, not degrees,
because a degree of longitude gets shorter as you move away from the equator).
The number of cells is capped, because every cell costs one weather lookup.
"""

from dataclasses import dataclass
from math import cos, radians, sqrt

MILES_PER_DEGREE_LAT = 69.0
MAX_CELLS = 80  # <= 2 batched Open-Meteo requests (50 places each)
MIN_PAD_DEG = 1.0  # always show at least ~70 miles around the trip
PAD_FRACTION = 0.15  # or 15% of the trip's size, whichever is larger


@dataclass(frozen=True)
class Grid:
    cells: list[tuple[float, float]]  # (lat, lon) of each cell centre
    lat_step: float  # cell height in degrees
    lon_step: float  # cell width in degrees


def build_grid(
    origin: tuple[float, float],
    destination: tuple[float, float],
    max_cells: int = MAX_CELLS,
) -> Grid:
    (lat1, lon1), (lat2, lon2) = origin, destination

    # 1) Padded bounding box.
    lat_span, lon_span = abs(lat1 - lat2), abs(lon1 - lon2)
    lat_pad = max(MIN_PAD_DEG, PAD_FRACTION * lat_span)
    lon_pad = max(MIN_PAD_DEG, PAD_FRACTION * lon_span)
    south = max(-85.0, min(lat1, lat2) - lat_pad)
    north = min(85.0, max(lat1, lat2) + lat_pad)
    west = min(lon1, lon2) - lon_pad
    east = max(lon1, lon2) + lon_pad

    # 2) Pick rows/columns so cells are about square in miles.
    mid_lat = (south + north) / 2
    height_mi = (north - south) * MILES_PER_DEGREE_LAT
    width_mi = (east - west) * MILES_PER_DEGREE_LAT * cos(radians(mid_lat))
    n_lon = round(sqrt(max_cells * width_mi / height_mi))
    n_lon = max(2, min(max_cells // 2, n_lon))
    n_lat = max(2, max_cells // n_lon)  # integer division keeps n_lat * n_lon <= max_cells

    lat_step = (north - south) / n_lat
    lon_step = (east - west) / n_lon

    # 3) Cell centres.
    cells = [
        (south + (r + 0.5) * lat_step, west + (c + 0.5) * lon_step)
        for r in range(n_lat)
        for c in range(n_lon)
    ]
    return Grid(cells, lat_step, lon_step)
