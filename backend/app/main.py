"""FastAPI application entrypoint for the Kyte backend.

Task 1 scope: application skeleton, configuration loading, CORS, and the
liveness/readiness endpoints. No payment, auth, or database logic yet.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes import health

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Fail fast on missing configuration in production.

    In production, missing required settings abort startup so a misconfigured
    deploy never serves traffic. In development the process still starts, so
    the health endpoints remain reachable for local work.

    Only the *names* of missing variables are reported, never their values.
    """
    missing = settings.missing_required_settings
    if missing:
        message = "Missing required configuration: " + ", ".join(missing)
        if settings.is_production:
            logger.error(message)
            raise RuntimeError(message)
        logger.warning("%s Continuing in %s mode.", message, settings.app_env)
    yield


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""
    application = FastAPI(
        title="Kyte Backend",
        version="0.1.0",
        summary="Entitlement and checkout service for the Kyte Chrome extension.",
        lifespan=lifespan,
    )

    origins = settings.cors_origins
    if origins:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            # The API authenticates with a bearer token in the Authorization
            # header, not cookies, so credentialed cross-origin requests are
            # never needed and stay disabled.
            allow_credentials=False,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type"],
        )
    else:
        logger.warning(
            "FRONTEND_ORIGIN is not set; CORS is disabled. "
            "Browser clients (including the extension) will be blocked."
        )

    application.include_router(health.router)
    return application


app = create_app()