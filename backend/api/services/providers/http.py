"""One place for HTTP behaviour: timeouts, retries, and turning failures into ProviderError."""

import time

import requests

from .base import ProviderError

RETRY_BACKOFF_SECONDS = 0.6  # tests set this to 0


class UpstreamHTTPError(ProviderError):
    """The service answered with a 4xx (our request was refused or invalid)."""

    def __init__(self, status: int, detail: str):
        super().__init__(f"HTTP {status}: {detail}")
        self.status = status
        self.detail = detail


def _detail(resp: requests.Response) -> str:
    try:
        body = resp.json()
    except ValueError:
        return resp.text[:200]
    if isinstance(body, dict):
        err = body.get("error")
        if isinstance(err, dict):  # OpenRouteService: {"error": {"message": ...}}
            return str(err.get("message") or err)
        if err is True:  # Open-Meteo: {"error": true, "reason": ...}
            return str(body.get("reason", "unknown error"))
        if err:
            return str(err)
    return str(body)[:200]


def request_json(session: requests.Session, method: str, url: str, *, timeout: float, retries: int = 2, **kwargs):
    """Call an API and return parsed JSON.

    Retries network errors, 429 and 5xx (with growing delay). Other 4xx raise
    UpstreamHTTPError immediately because repeating a bad request won't help.
    """
    last_error: ProviderError | None = None
    for attempt in range(retries + 1):
        if attempt:
            time.sleep(RETRY_BACKOFF_SECONDS * attempt)
        try:
            resp = session.request(method, url, timeout=timeout, **kwargs)
        except requests.RequestException as exc:
            last_error = ProviderError(f"Could not reach the service ({type(exc).__name__}).")
            continue
        if resp.status_code == 429:
            last_error = ProviderError("The service's rate limit was reached. Try again shortly.")
            continue
        if resp.status_code >= 500:
            last_error = ProviderError(f"The service had an internal error (HTTP {resp.status_code}).")
            continue
        if resp.status_code >= 400:
            raise UpstreamHTTPError(resp.status_code, _detail(resp))
        try:
            return resp.json()
        except ValueError:
            raise ProviderError("The service returned a response we could not read.") from None
    raise last_error  # type: ignore[misc]
