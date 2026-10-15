"""Shared pytest fixtures for the backend test suite.

The health checks must be verifiable in complete isolation: no Polar, no
Supabase, no database, no network. The fixtures here make that guarantee
enforceable rather than merely intended.
"""

from __future__ import annotations

import importlib
from collections.abc import Iterator
from types import ModuleType

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

# Unmistakable canary values. If any of these ever appears in an HTTP response,
# the endpoint is leaking credentials.
CANARY_SECRETS: dict[str, str] = {
    "SUPABASE_URL": "https://canary-supabase.invalid",
    "SUPABASE_SECRET_KEY": "CANARY_SUPABASE_SECRET_KEY_9f3a2b",
    "POLAR_ACCESS_TOKEN": "CANARY_POLAR_ACCESS_TOKEN_9f3a2b",
    "POLAR_WEBHOOK_SECRET": "CANARY_POLAR_WEBHOOK_SECRET_9f3a2b",
    "POLAR_PRODUCT_ID": "CANARY_POLAR_PRODUCT_ID_9f3a2b",
    "SUCCESS_URL": "https://canary-success.invalid/complete",
}

# Setting name (as in config.Settings) for each credential.
CREDENTIAL_SETTINGS = (
    "supabase_url",
    "supabase_secret_key",
    "polar_access_token",
    "polar_webhook_secret",
    "polar_product_id",
    "success_url",
)


@pytest.fixture
def client() -> Iterator[TestClient]:
    """A ``TestClient`` with the application lifespan running.

    Used as a context manager so the ``lifespan`` hook executes, which is where
    configuration validation happens.
    """
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def populated_secrets(monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    """Fill every credential setting with a canary value.

    ``app.config.settings`` is a single shared instance imported by both
    ``app.config`` and ``app.main``, so mutating its attributes is visible to the
    running app. ``monkeypatch`` restores the originals afterwards.

    Returns the env-var-name -> canary mapping for leak assertions.
    """
    for setting_name in CREDENTIAL_SETTINGS:
        monkeypatch.setattr(
            settings, setting_name, CANARY_SECRETS[setting_name.upper()], raising=True
        )
    return CANARY_SECRETS


@pytest.fixture
def cleared_secrets(monkeypatch: pytest.MonkeyPatch) -> None:
    """Blank out every credential setting, simulating a bare local checkout."""
    for setting_name in CREDENTIAL_SETTINGS:
        monkeypatch.setattr(settings, setting_name, None, raising=True)


@pytest.fixture
def no_outbound_network(monkeypatch: pytest.MonkeyPatch) -> None:
    """Tripwire: fail the test if any real outbound HTTP request is attempted.

    Patched at the ``HTTPTransport`` layer rather than ``Client.send`` because
    ``TestClient`` is itself httpx-based and routes through its own ASGI
    transport — patching ``Client.send`` would break the test client itself and
    produce a confusing false failure.

    Both ``httpx`` and ``httpx2`` are patched. Starlette 1.7 does
    ``import httpx2 as httpx`` inside ``starlette.testclient``, so once
    ``httpx2`` is installed the test client stops routing through ``httpx``
    entirely. Patching only ``httpx`` would leave this fixture silently
    ineffective while every test still passed — a false guarantee.
    """
    def _blocked_sync(*args: object, **kwargs: object) -> None:
        raise AssertionError("Unexpected outbound HTTP request during a health check")

    async def _blocked_async(*args: object, **kwargs: object) -> None:
        raise AssertionError("Unexpected outbound HTTP request during a health check")

    for module in _http_client_modules():
        monkeypatch.setattr(module.HTTPTransport, "handle_request", _blocked_sync)
        monkeypatch.setattr(module.AsyncHTTPTransport, "handle_async_request", _blocked_async)


def _http_client_modules() -> list[ModuleType]:
    """Return the installed httpx client modules (``httpx`` and/or ``httpx2``)."""
    modules: list[ModuleType] = []
    for name in ("httpx", "httpx2"):
        try:
            modules.append(importlib.import_module(name))
        except ImportError:  # pragma: no cover - depends on install extras
            continue
    return modules