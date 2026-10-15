# Kyte Backend

Entitlement and checkout service for the Kyte Chrome extension.

Lock-in Mode is the only paid feature (US$9, one time). Everything else in the
extension stays free. A verified Polar purchase unlocks Lock-in Mode for the
same Supabase account across unlimited devices. **The backend owns every
entitlement decision** — the extension never decides for itself whether a user
has paid.

**Status:** Task 1 (backend skeleton) complete. Auth, database, and payment
logic are deliberately not implemented yet. See `TASK_PROGRESS.md` for the
per-task handover log.

## Stack

Python 3.12+ · FastAPI · Pydantic settings · Supabase (Auth + Postgres) · Polar

## Setup

```bash
cd backend
uv venv --python 3.12          # or: python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env           # then fill in real values
```

`.env` is git-ignored. Only `.env.example` (placeholders) is committed.

## Run

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Verify:

```bash
curl -i http://127.0.0.1:8000/health
curl -i http://127.0.0.1:8000/ready
```

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | Liveness. Returns `{"status":"ok"}`. Never touches Polar or Supabase. |
| GET | `/ready` | none | Readiness. Returns `{"status":"ready"}`. Dependency checks arrive in Task 3. |
| GET | `/v1/me/entitlement` | Supabase token | _Planned, Task 6._ |
| POST | `/v1/checkout` | Supabase token | _Planned, Task 7._ |
| POST | `/v1/webhooks/polar` | Polar signature | _Planned, Task 8._ |

## Configuration

All settings are read from environment variables (see `.env.example`).

| Variable | Required in production | Secret |
|---|---|---|
| `APP_ENV` | no (`development`) | no |
| `PORT` | no (`8000`) | no |
| `SUPABASE_URL` | yes | no |
| `SUPABASE_SECRET_KEY` | yes | **yes** |
| `POLAR_ACCESS_TOKEN` | yes | **yes** |
| `POLAR_WEBHOOK_SECRET` | yes | **yes** |
| `POLAR_PRODUCT_ID` | yes | no |
| `SUCCESS_URL` | yes | no |
| `FRONTEND_ORIGIN` | no | no |

`SUPABASE_SECRET_KEY` and `POLAR_WEBHOOK_SECRET` are declared with
`repr=False` so they cannot leak through a stray `print(settings)` or an
unhandled exception repr. Missing configuration is reported by **variable name
only**.

Startup behaviour: in production, missing required settings abort startup.
In development the process starts anyway so the health endpoints stay usable
for local work.

`FRONTEND_ORIGIN` is a comma-separated list of exact origins. CORS is disabled
entirely when it is unset.

## Layout

```
backend/
  app/
    __init__.py
    main.py            FastAPI app, CORS, startup config validation
    config.py          Typed settings (Pydantic)
    routes/
      health.py        /health, /ready
  migrations/          SQL migrations (Task 4)
  tests/               pytest suite (Task 2)
  requirements.txt
  .env.example
```

`auth.py`, `database.py`, `schemas.py`, and `services/` arrive with Tasks 3-8.

## Tests

```bash
pytest -q                              # full suite
pytest -q tests/test_health.py         # health checks only
pytest -v tests/test_health.py -k secret
```

The suite is fully offline. `tests/conftest.py` provides a
`no_outbound_network` fixture that fails any test attempting a real HTTP
request, so `GET /health` and `GET /ready` are *proven* not to depend on Polar
or Supabase rather than merely assumed to. `tests/test_no_network_tripwire.py`
verifies that this tripwire itself still works — read its docstring for why
that is not paranoia.

Current suite: 24 tests.

## Troubleshooting

**`StarletteDeprecationWarning: Using httpx with starlette.testclient is deprecated`**
Starlette 1.7 imports `httpx2` as its test client. Install it with
`pip install httpx2`. It is already pinned in `requirements.txt`.

**Tests fail with "Unexpected outbound HTTP request during a health check"**
A health check started making a network call. That is a real regression:
`/health` must remain a pure liveness probe with no dependencies. If Polar or
Supabase calls are ever added, they belong on `/ready`, not `/health`.

**Tests cannot see changed environment variables**
`app.config.settings` is constructed once at import time and `get_settings` is
`lru_cache`d. To vary configuration in a test, use
`monkeypatch.setattr` on the shared `settings` object (as `conftest.py` does),
or call `get_settings.cache_clear()` after mutating `os.environ`.

## Security notes

- **Never put Supabase or Polar secrets in extension code.** The extension calls
  this API with a short-lived Supabase user token and nothing else.
- Keep Polar **sandbox** credentials separate from production until Task 13.
- `/health` and `/ready` must never return credentials, hostnames, exception
  text, or internal configuration.
- Entitlements must **fail closed**: a database error must never be interpreted
  as paid access.