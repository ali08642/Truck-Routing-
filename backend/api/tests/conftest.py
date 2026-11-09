import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _isolate(monkeypatch):
    cache.clear()  # weather cache must not leak between tests
    monkeypatch.setattr("api.services.providers.http.RETRY_BACKOFF_SECONDS", 0)
