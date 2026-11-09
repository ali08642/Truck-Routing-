# Weather-Aware Truck Routing

React + Django app that compares three truck routes by weather risk, load weight
and travel time, and recommends the safest one.

> Status: backend complete with live API providers. Frontend and heatmap in progress.
> Design reasoning: see `docs/DESIGN_DECISIONS.md`.

## Project structure

```
backend/
  config/            Django settings, root urls, wsgi
  routing_core/      Pure Python logic (no Django, no network)
    risk.py            classify wind/rain/snow + load rules -> risk level
    sampling.py        place checkpoints along a route polyline
    ranking.py         summarize miles per risk level, pick best route
    tests/
  api/               Django REST layer
    serializers.py     input validation
    views.py, urls.py  POST /api/routes/analyze/, GET /api/health/
    services/
      analysis.py      pipeline: geocode -> routes -> checkpoints -> ETA
                       -> weather -> risk -> recommendation
      providers/       base.py (interfaces), fake.py (offline),
                       ors.py (geocode + truck routes), open_meteo.py (weather),
                       http.py (retries/timeouts)
    tests/
frontend/            React + Leaflet (coming)
```

## Run the backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
pytest                                  # run tests
python manage.py runserver              # http://localhost:8000
```

Try it (fake data knows Dallas, Houston, Austin, San Antonio, Denver, Chicago,
Kansas City, Oklahoma City, Memphis, Atlanta, Phoenix, Los Angeles, or `lat,lon`):

```bash
curl -X POST localhost:8000/api/routes/analyze/ \
  -H 'Content-Type: application/json' \
  -d '{"origin":"Dallas","destination":"Houston","departure_time":"2026-11-10T14:00:00Z","load_lb":45000}'
```

## Live mode (real APIs)

1. Get a free OpenRouteService key (openrouteservice.org -> sign up -> dashboard -> Request a token).
2. `cp backend/.env.example backend/.env` and paste the key. Open-Meteo needs no key.
3. Smoke test: `python manage.py check_providers` (prints routes, risk miles and timing).
4. `python manage.py runserver` now serves real data. Set `ROUTING_PROVIDER=fake` to go offline.

## Assumptions and decisions

- **Checkpoint spacing:** 10 mi for routes under 150 mi, 25 mi up to 500 mi,
  50 mi beyond. Each checkpoint owns the road halfway to its neighbours, so the
  per-risk mileage adds up to the full route length.
- **Weather timing:** each checkpoint uses the forecast for the hour nearest to
  the truck's ETA there.
- **Threshold edges:** wind bands are lower-inclusive (35 mph = High); rain and
  snow bands are upper-inclusive (0.25 in/hr = Moderate), matching the spec's
  ">1.00" / ">3.0" wording.
- **Load rules:** strictly "greater than" (exactly 30,000 lb does not trigger).
- **Recommendation order:** No Travel miles (disqualifier) > Severe miles >
  High miles > mile-weighted average risk (0-4) > travel time.
# Truck-Routing-
