# Design decisions (my talking points)

## 1. Architecture: a pure core with thin layers around it
- `routing_core/` has the logic that decides correctness (risk, ranking, sampling, geometry). It imports
  no Django and does no network calls, so it is fast to test (no mocks) and easy to reason about.
- `api/` is the Django layer: validate input, call the pipeline, return JSON.
- `providers/` hides the outside world (geocoding, routing, weather) behind small interfaces. The pipeline
  doesn't know whether it is talking to ORS or to fakes. I can swap vendors, run offline, and test the
  pipeline without keys. (Adapter / dependency-inversion pattern.)

## 2. Weather is sampled at the truck's ETA, not at departure
For each checkpoint: ETA = departure + route duration x (distance so far / total distance), rounded to the
nearest forecast hour. A truck reaches mile 400 around 7 hours later, so using the departure-hour weather
would be wrong.

## 3. Checkpoint spacing (spec said "10 / 25 / 50 miles")
I read this as a choice by trip length: <150 mi -> 10, <=500 mi -> 25, >500 mi -> 50. Fine detail for short
trips, bounded API cost for cross-country ones. Each checkpoint "owns" the road halfway to its neighbours so
the mileage per risk level sums to the real route length (needed for "fewest Severe miles").

## 4. Risk rules
- Overall risk = worst of wind, rain, snow, and the load-rule override.
- Ambiguous boundaries are decided once, in one place, and tested (see `risk.py` docstring).
- Load rules use strict ">" as written.

## 5. Recommendation order
No Travel miles (disqualifier) > Severe miles > High miles > mile-weighted average risk > duration.
Why add No Travel first: a route you can't drive shouldn't win because it has few Severe miles.
The response includes which criterion decided the winner and a plain-English explanation.

## 6. Getting three routes
ORS built-in alternatives only work under 100 km. For long trips I route the fastest path, then force two
more by routing through a waypoint pushed sideways from the midpoint (15% of trip length, 3-100 mi).
Candidates are rejected if they are >40% slower/longer or share >=85% of their path with a kept route.
If fewer than 3 survive, the API returns what it has plus a warning rather than failing.

## 7. Performance
- One batched weather request per 50 places (not one per checkpoint).
- Cache per (place rounded to ~1 km, hour) for 30 minutes. A repeat or overlapping trip makes no calls.
- Geometry is simplified (Ramer-Douglas-Peucker, ~160 m) before sending to the browser: same shape, far
  fewer points. Sampling still uses full-resolution geometry for accuracy.
- Retries (with backoff) only for transient failures: network errors, 429, 5xx. 4xx errors fail fast.

## 8. Error design
- 400: the user can fix it (bad input, unknown place, no route, departure out of range).
- 502: an upstream service failed.
- Missing weather data is an error, never silently treated as calm weather (that would understate risk).

## 9. Stateless backend
No database: each request is computed from inputs plus cached weather. Simpler to deploy and reason about.

## Known limitations / what I'd do next
- Sustained wind is used, not gusts (gusts matter a lot for high-profile trailers).
- Routing uses the truck profile but not the load's weight as a road restriction.
- The waypoint trick is heuristic; real alternatives engines can do better.
- Cache is per-process; use Redis if running several workers.
