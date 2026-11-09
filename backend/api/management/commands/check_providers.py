"""Smoke test for the real APIs:  python manage.py check_providers

Run it once after adding your ORS key. It makes a few real calls and prints
what came back, so problems show up here instead of in the browser.
"""

import time
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from api.services.analysis import analyze_trip
from api.services.providers import get_providers
from api.services.providers.base import ProviderError


class Command(BaseCommand):
    help = "Call the configured geocoding, routing and weather providers once and print a summary."

    def add_arguments(self, parser):
        parser.add_argument("--origin", default="Dallas, TX")
        parser.add_argument("--destination", default="Oklahoma City, OK")
        parser.add_argument("--load", type=int, default=45000)

    def handle(self, *args, **opts):
        providers = get_providers()
        self.stdout.write(f"Providers: {type(providers.router).__name__} / {type(providers.weather).__name__}")
        departure = (timezone.now() + timedelta(hours=2)).replace(minute=0, second=0, microsecond=0)
        started = time.perf_counter()
        try:
            result = analyze_trip(
                origin=opts["origin"],
                destination=opts["destination"],
                departure=departure,
                load_lb=opts["load"],
                providers=providers,
            )
        except ProviderError as exc:
            raise CommandError(f"{type(exc).__name__}: {exc}") from exc
        elapsed = time.perf_counter() - started

        self.stdout.write(self.style.SUCCESS(f"OK in {elapsed:.1f}s"))
        self.stdout.write(f"{opts['origin']} -> {opts['destination']}, load {opts['load']} lb")
        for r in result["routes"]:
            miles = r["summary"]["miles_by_risk"]
            self.stdout.write(
                f"  Route {r['id']} (rank {r['rank']}): {r['distance_miles']} mi, {r['duration_hours']} h, "
                f"{len(r['checkpoints'])} checkpoints, {len(r['geometry'])} map points, "
                f"severe {miles['severe']} mi, high {miles['high']} mi"
            )
        self.stdout.write(f"Recommended: {result['recommended_route_id']} - {result['explanation']}")
        for w in result["warnings"]:
            self.stdout.write(self.style.WARNING(f"Warning: {w}"))
