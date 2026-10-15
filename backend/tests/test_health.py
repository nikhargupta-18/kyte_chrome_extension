"""Tests for ``GET /health`` and ``GET /ready`` (plan Task 2).

These tests must not require Polar, Supabase, or a database. If the health
checks ever start depending on a third party, the suite fails loudly rather than
silently becoming flaky in CI.

``/ready`` dependency checking is a Task 3 deliverable; the assertions here
pin the current contract and will be extended, not rewritten, then.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import settings


# ── GET /health ──────────────────────────────────────────────────────────────


def test_health_returns_200(client: TestClient) -> None:
    """Liveness answers 200 while the process is alive."""
    response = client.get("/health")
    assert response.status_code == 200


def test_health_returns_ok_status(client: TestClient) -> None:
    """Body matches the documented contract exactly: {"status": "ok"}."""
    response = client.get("/health")
    assert response.json() == {"status": "ok"}


def test_health_body_contains_only_status(client: TestClient) -> None:
    """No extra keys may appear; the payload must stay minimal."""
    body = client.get("/health").json()
    assert list(body.keys()) == ["status"]


def test_health_returns_json(client: TestClient) -> None:
    """Content type is JSON, as the contract in plan §7 specifies."""
    response = client.get("/health")
    assert response.headers["content-type"].startswith("application/json")


def test_health_requires_no_authentication(client: TestClient) -> None:
    """No Authorization header is needed — liveness is public."""
    assert client.get("/health").status_code == 200


def test_health_ignores_a_bogus_authorization_header(client: TestClient) -> None:
    """A malformed or forged token must not affect a public endpoint."""
    response = client.get("/health", headers={"Authorization": "Bearer not-a-real-token"})
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_works_without_any_credentials(cleared_secrets: None, client: TestClient) -> None:
    """Liveness succeeds even with no configuration whatsoever."""
    assert client.get("/health").status_code == 200
    assert client.get("/health").json() == {"status": "ok"}


def test_health_leaks_no_secrets(
    populated_secrets: dict[str, str], client: TestClient
) -> None:
    """No credential value may appear anywhere in the response.

    Checks the body and every response header, since a leak could arrive via a
    debug or echo header just as easily as via the payload.
    """
    response = client.get("/health")

    haystack = response.text + " " + " ".join(f"{k}: {v}" for k, v in response.headers.items())
    for name, canary in populated_secrets.items():
        assert canary not in haystack, f"{name} leaked in the /health response"


def test_health_makes_no_outbound_requests(
    no_outbound_network: None, client: TestClient
) -> None:
    """Liveness must not contact Polar, Supabase, or anything else."""
    response = client.get("/health")
    assert response.status_code == 200


# ── GET /ready ───────────────────────────────────────────────────────────────


def test_ready_returns_200(client: TestClient) -> None:
    """Readiness answers 200 while dependencies are unimplemented."""
    response = client.get("/ready")
    assert response.status_code == 200


def test_ready_returns_ready_status(client: TestClient) -> None:
    """Body matches the documented contract: {"status": "ready"}."""
    response = client.get("/ready")
    assert response.json() == {"status": "ready"}


def test_ready_body_contains_only_status(client: TestClient) -> None:
    """Readiness stays minimal: no hostnames, errors, or config details."""
    body = client.get("/ready").json()
    assert list(body.keys()) == ["status"]


def test_ready_requires_no_authentication(client: TestClient) -> None:
    """Readiness is public but must expose only a minimal result."""
    assert client.get("/ready").status_code == 200


def test_ready_leaks_no_secrets(
    populated_secrets: dict[str, str], client: TestClient
) -> None:
    """No credential value may appear in the readiness response."""
    response = client.get("/ready")

    haystack = response.text + " " + " ".join(f"{k}: {v}" for k, v in response.headers.items())
    for name, canary in populated_secrets.items():
        assert canary not in haystack, f"{name} leaked in the /ready response"


def test_ready_makes_no_outbound_requests(
    no_outbound_network: None, client: TestClient
) -> None:
    """Readiness must not contact Polar or Supabase yet (Task 3 adds a DB check)."""
    response = client.get("/ready")
    assert response.status_code == 200


# ── Configuration secret containment ──────────────────────────────────────────


def test_settings_repr_hides_secret_values(populated_secrets: dict[str, str]) -> None:
    """``repr(settings)`` is a common accidental-leak path; it must stay clean.

    Guards Task 1's ``Field(repr=False)`` markers, which would be easy to drop
    in a future refactor.
    """
    rendered = repr(settings)
    for name, canary in populated_secrets.items():
        if name in {"SUPABASE_URL", "POLAR_PRODUCT_ID", "SUCCESS_URL"}:
            # Non-secret configuration is intentionally visible.
            continue
        assert canary not in rendered, f"{name} is exposed by repr(settings)"


def test_missing_settings_are_reported_by_name_only(populated_secrets: dict[str, str]) -> None:
    """Absent configuration is reported as variable names, never values.

    Populating the secrets empties the missing list; clearing one puts its name
    back. Either way no value may appear in the report.
    """
    assert settings.missing_required_settings == []

    settings.supabase_url = None  # type: ignore[misc]
    try:
        missing = settings.missing_required_settings
        assert missing == ["SUPABASE_URL"]
        for canary in populated_secrets.values():
            assert canary not in " ".join(missing)
    finally:
        settings.supabase_url = populated_secrets["SUPABASE_URL"]  # type: ignore[misc]


# ── Unknown routes ───────────────────────────────────────────────────────────


@pytest.mark.parametrize("path", ["/v1/me/entitlement", "/v1/checkout", "/v1/webhooks/polar"])
def test_unimplemented_routes_are_404(client: TestClient, path: str) -> None:
    """Routes for later tasks must not exist yet.

    A premature 501 or a partially built endpoint should fail here rather than
    ship something half-finished.
    """
    response = client.post(path) if path != "/v1/me/entitlement" else client.get(path)
    assert response.status_code == 404