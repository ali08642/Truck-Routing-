from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

from .base import Providers


def get_providers() -> Providers:
    name = settings.ROUTING_PROVIDER
    if name == "fake":
        from .fake import FakeGeocoder, FakeRouter, FakeWeather

        return Providers(FakeGeocoder(), FakeRouter(), FakeWeather())
    if name == "live":
        from .open_meteo import OpenMeteoWeather
        from .ors import OrsGeocoder, OrsRouter

        if not settings.ORS_API_KEY:
            raise ImproperlyConfigured("ROUTING_PROVIDER=live needs ORS_API_KEY to be set.")
        return Providers(
            OrsGeocoder(settings.ORS_API_KEY, settings.ORS_BASE_URL),
            OrsRouter(settings.ORS_API_KEY, settings.ORS_BASE_URL),
            OpenMeteoWeather(settings.OPEN_METEO_URL),
        )
    raise ImproperlyConfigured(f"Unknown ROUTING_PROVIDER '{name}' (use 'fake' or 'live').")
