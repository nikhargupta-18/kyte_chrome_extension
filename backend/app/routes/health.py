"""Liveness and readiness endpoints.

``GET /health`` is a liveness probe. It answers only "is this process alive?"
and must therefore stay fast and must never contact Polar or Supabase.

``GET /ready`` reports whether required dependencies are usable. Dependency
checking lands in Task 3, once database access exists.
"""

from __future__ import annotations

from fastapi import APIRouter, status
from pydantic import BaseModel

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    """Liveness result. Deliberately carries nothing but a status string."""

    status: str


class ReadyResponse(BaseModel):
    """Readiness result. Deliberately minimal: no hosts, errors, or config."""

    status: str


@router.get("/health", response_model=HealthResponse, status_code=status.HTTP_200_OK)
async def health() -> HealthResponse:
    """Liveness probe. Always returns 200 while the process is running."""
    return HealthResponse(status="ok")


@router.get("/ready", response_model=ReadyResponse, status_code=status.HTTP_200_OK)
async def ready() -> ReadyResponse:
    """Readiness probe.

    TODO(Task 3): verify that required configuration is present and that the
    database is reachable, returning 503 when a required dependency is
    unavailable. Until then this reports ready without contacting any
    dependency.
    """
    return ReadyResponse(status="ready")