"""Typed application configuration.

Values are read from environment variables, falling back to an optional local
``.env`` file (see ``.env.example``).

Secret values are marked ``repr=False`` so they cannot leak through an
accidental ``print(settings)`` or an unhandled exception repr. The only thing
this module ever reports about absent configuration is the *names* of the
missing variables — never their values.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the Kyte backend."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Runtime ────────────────────────────────────────────────────────
    app_env: str = Field(default="development")
    port: int = Field(default=8000)

    # ── Supabase (server-side only; never ship these to the extension) ──
    supabase_url: str | None = Field(default=None, repr=False)
    supabase_secret_key: str | None = Field(default=None, repr=False)

    # ── Polar ──────────────────────────────────────────────────────────
    polar_access_token: str | None = Field(default=None, repr=False)
    polar_webhook_secret: str | None = Field(default=None, repr=False)
    polar_product_id: str | None = Field(default=None)

    # ── Frontend / checkout ────────────────────────────────────────────
    success_url: str | None = None
    frontend_origin: str | None = None

    @property
    def is_production(self) -> bool:
        """True when running against production configuration."""
        return self.app_env.strip().lower() in {"production", "prod"}

    @property
    def cors_origins(self) -> list[str]:
        """Explicit allowed origins parsed from ``FRONTEND_ORIGIN``.

        ``FRONTEND_ORIGIN`` is a comma-separated list of exact origins, e.g.
        ``chrome-extension://abcdefghijklmnopabcdefghijklmnop``. An explicit
        allowlist is used rather than ``*`` because the API is token-authenticated
        and wildcard origins would widen the CORS surface for no benefit.
        """
        if not self.frontend_origin:
            return []
        return [origin.strip() for origin in self.frontend_origin.split(",") if origin.strip()]

    @property
    def missing_required_settings(self) -> list[str]:
        """Names of settings required in production that are not set.

        Returns variable *names* only. Callers must never log values.
        """
        required: dict[str, str | None] = {
            "SUPABASE_URL": self.supabase_url,
            "SUPABASE_SECRET_KEY": self.supabase_secret_key,
            "POLAR_ACCESS_TOKEN": self.polar_access_token,
            "POLAR_WEBHOOK_SECRET": self.polar_webhook_secret,
            "POLAR_PRODUCT_ID": self.polar_product_id,
            "SUCCESS_URL": self.success_url,
        }
        return [name for name, value in required.items() if not (value and value.strip())]


@lru_cache
def get_settings() -> Settings:
    """Return the cached settings instance."""
    return Settings()


settings = get_settings()