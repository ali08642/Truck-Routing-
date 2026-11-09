"""Summarize routes by risk and pick the recommended one.

Ranking order (from the spec, with No Travel added as a disqualifier):
  0. Fewest No Travel miles (a route you legally/safely can't drive loses)
  1. Fewest Severe miles
  2. Fewest High miles
  3. Lowest average risk (mile-weighted, scale 0-4)
  4. Shortest travel time
"""

from dataclasses import dataclass, field

from .risk import Risk

# Criteria in priority order: (key name, human label)
CRITERIA = [
    ("no_travel_miles", "No Travel miles"),
    ("severe_miles", "Severe miles"),
    ("high_miles", "High miles"),
    ("avg_risk", "average risk"),
    ("duration_hours", "travel time"),
]


@dataclass(frozen=True)
class Checkpoint:
    lat: float
    lon: float
    miles: float  # length of road this checkpoint represents
    risk: Risk
    eta: str = ""  # ISO timestamp, filled in later


@dataclass(frozen=True)
class Route:
    route_id: str
    distance_miles: float
    duration_hours: float
    checkpoints: list[Checkpoint] = field(default_factory=list)


@dataclass(frozen=True)
class RouteSummary:
    route_id: str
    distance_miles: float
    duration_hours: float
    miles_by_risk: dict[Risk, float]
    avg_risk: float
    worst_risk: Risk

    @property
    def no_travel_miles(self) -> float:
        return self.miles_by_risk[Risk.NO_TRAVEL]

    @property
    def severe_miles(self) -> float:
        return self.miles_by_risk[Risk.SEVERE]

    @property
    def high_miles(self) -> float:
        return self.miles_by_risk[Risk.HIGH]

    def sort_key(self) -> tuple:
        # Rounded so tiny float noise doesn't decide a ranking.
        return (
            round(self.no_travel_miles, 1),
            round(self.severe_miles, 1),
            round(self.high_miles, 1),
            round(self.avg_risk, 2),
            round(self.duration_hours, 3),
        )


def summarize_route(route: Route) -> RouteSummary:
    """Total up miles at each risk level and the mile-weighted average risk."""
    miles_by_risk = {level: 0.0 for level in Risk}
    for cp in route.checkpoints:
        miles_by_risk[cp.risk] += cp.miles

    total = sum(miles_by_risk.values())
    avg = (
        sum(int(level) * miles for level, miles in miles_by_risk.items()) / total
        if total > 0
        else 0.0
    )
    worst = max((cp.risk for cp in route.checkpoints), default=Risk.LOW)

    return RouteSummary(
        route_id=route.route_id,
        distance_miles=route.distance_miles,
        duration_hours=route.duration_hours,
        miles_by_risk=miles_by_risk,
        avg_risk=avg,
        worst_risk=worst,
    )


@dataclass(frozen=True)
class Recommendation:
    best: RouteSummary
    ranked: list[RouteSummary]  # best first
    decided_by: str  # criterion that separated best from runner-up
    explanation: str


def _fmt(key: str, value: float) -> str:
    if key == "avg_risk":
        return f"{value:.2f}"
    if key == "duration_hours":
        return f"{value:.2f} h"
    return f"{value:.1f} mi"


def recommend(routes: list[Route]) -> Recommendation:
    if not routes:
        raise ValueError("Need at least one route to recommend")

    summaries = sorted(
        (summarize_route(r) for r in routes), key=lambda s: s.sort_key()
    )
    best = summaries[0]

    if len(summaries) == 1:
        return Recommendation(best, summaries, "only_option", "Only one route available.")

    runner_up = summaries[1]
    best_key, other_key = best.sort_key(), runner_up.sort_key()

    for i, (name, label) in enumerate(CRITERIA):
        if best_key[i] != other_key[i]:
            lead = {
                "avg_risk": f"Route {best.route_id} has a lower {label}",
                "duration_hours": f"Route {best.route_id} is faster",
            }.get(name, f"Route {best.route_id} has fewer {label}")
            explanation = (
                f"{lead} ({_fmt(name, getattr(best, name))} vs "
                f"{_fmt(name, getattr(runner_up, name))} on route {runner_up.route_id})."
            )
            return Recommendation(best, summaries, name, explanation)

    return Recommendation(
        best, summaries, "tie", f"Routes {best.route_id} and {runner_up.route_id} are tied."
    )
