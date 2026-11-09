"""The pipeline: geocode -> routes -> checkpoints -> ETAs -> weather -> risk -> recommend."""

from datetime import datetime, timedelta

from routing_core.geo import simplify
from routing_core.ranking import Checkpoint, Route, recommend
from routing_core.risk import Risk, assess_weather
from routing_core.sampling import choose_spacing, sample_checkpoints

from .providers.base import ProviderError, Providers


# Drawing needs far fewer points than sampling does; ~160 m keeps the shape but shrinks the payload.
DISPLAY_TOLERANCE_MILES = 0.1


def _round_to_hour(when: datetime) -> datetime:
    """Forecasts are hourly, so use the nearest hour to the truck's arrival."""
    return (when + timedelta(minutes=30)).replace(minute=0, second=0, microsecond=0)


def analyze_trip(
    *,
    origin: str,
    destination: str,
    departure: datetime,
    load_lb: float,
    providers: Providers,
) -> dict:
    start = providers.geocoder.geocode(origin)
    end = providers.geocoder.geocode(destination)
    raw_routes = providers.router.get_routes(start, end)
    if not raw_routes:
        raise ProviderError("No routes found between those locations.")

    # 1) Place checkpoints and work out when the truck reaches each one.
    plans = []
    weather_requests = []
    for raw in raw_routes:
        spacing = choose_spacing(raw.distance_miles)
        samples = sample_checkpoints(raw.geometry, spacing)
        route_len = samples[-1].mile
        etas = [
            departure + timedelta(hours=raw.duration_hours * (s.mile / route_len if route_len else 0))
            for s in samples
        ]
        plans.append((raw, spacing, samples, etas))
        weather_requests += [(s.lat, s.lon, _round_to_hour(e)) for s, e in zip(samples, etas)]

    # 2) One batched weather call for every checkpoint of every route.
    weather = providers.weather.get_weather(weather_requests)
    if len(weather) != len(weather_requests):
        raise ProviderError("Weather service returned an incomplete response.")

    # 3) Classify risk at each checkpoint.
    cursor = 0
    routes: list[Route] = []
    checkpoint_json: dict[str, list[dict]] = {}
    for raw, _spacing, samples, etas in plans:
        core_cps, json_cps = [], []
        for s, eta in zip(samples, etas):
            w = weather[cursor]
            cursor += 1
            a = assess_weather(w.wind_mph, w.rain_in_hr, w.snow_in_hr, load_lb)
            core_cps.append(Checkpoint(s.lat, s.lon, s.segment_miles, a.level, eta.isoformat()))
            json_cps.append(
                {
                    "lat": round(s.lat, 5),
                    "lon": round(s.lon, 5),
                    "mile": round(s.mile, 1),
                    "segment_miles": round(s.segment_miles, 1),
                    "eta": eta.isoformat(),
                    "wind_mph": w.wind_mph,
                    "rain_in_hr": w.rain_in_hr,
                    "snow_in_hr": w.snow_in_hr,
                    "risk": a.level.name.lower(),
                    "driver": a.driver,
                    "load_rule_applied": a.load_rule_applied,
                }
            )
        routes.append(Route(raw.route_id, raw.distance_miles, raw.duration_hours, core_cps))
        checkpoint_json[raw.route_id] = json_cps

    # 4) Rank routes.
    rec = recommend(routes)
    rank_of = {s.route_id: i + 1 for i, s in enumerate(rec.ranked)}
    summary_of = {s.route_id: s for s in rec.ranked}

    out_routes = []
    for raw, spacing, _samples, _etas in plans:
        s = summary_of[raw.route_id]
        out_routes.append(
            {
                "id": raw.route_id,
                "rank": rank_of[raw.route_id],
                "is_recommended": raw.route_id == rec.best.route_id,
                "distance_miles": round(raw.distance_miles, 1),
                "duration_hours": round(raw.duration_hours, 2),
                "spacing_miles": spacing,
                "geometry": [[round(la, 5), round(lo, 5)] for la, lo in simplify(raw.geometry, DISPLAY_TOLERANCE_MILES)],
                "summary": {
                    "miles_by_risk": {r.name.lower(): round(s.miles_by_risk[r], 1) for r in Risk},
                    "avg_risk": round(s.avg_risk, 2),
                    "worst_risk": s.worst_risk.name.lower(),
                },
                "checkpoints": checkpoint_json[raw.route_id],
            }
        )

    return {
        "origin": {"query": origin, "lat": start[0], "lon": start[1]},
        "destination": {"query": destination, "lat": end[0], "lon": end[1]},
        "departure_time": departure.isoformat(),
        "load_lb": load_lb,
        "recommended_route_id": rec.best.route_id,
        "decided_by": rec.decided_by,
        "explanation": rec.explanation,
        "warnings": (
            [f"Only {len(out_routes)} distinct route(s) could be found for this trip."]
            if len(out_routes) < 3
            else []
        ),
        "routes": out_routes,
    }
