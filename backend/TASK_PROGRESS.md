# Kyte Backend — Task Progress & Handover Log

**Plan source:** `~/Downloads/kyte_backend_implementation_plan.docx`
**Backend root:** `/Users/hemeshgupta/Projects/kyte_chrome_extension/backend/`
**Extension root:** `/Users/hemeshgupta/Projects/kyte_chrome_extension/`
**Extension remote:** `https://github.com/nikhargupta-18/kyte_chrome_extension.git`
**Stack:** FastAPI + Supabase (Auth + Postgres) + Polar one-time checkout
**Python:** 3.12.15 via `uv` (`.venv/` inside `backend/`)
**Status:** Tasks 0-2 complete. **Next: Task 3 — configuration and database access.**

---

## How to use this file

This is the single handover document for the backend build.

1. Pick the next un-started task from the table below.
2. Do **one** task at a time (plan §10).
3. On completion, update the task's status, then append a summary under
   `## Completed Task Summaries` covering: files changed, tests run + results,
   decisions made, deviations from the plan, and blockers.
4. Never commit a real `.env`. Never print secret values.

### Status legend
`NOT STARTED` · `IN PROGRESS` · `BLOCKED` · `DONE` · `WAITING APPROVAL`

---

## Task Status

| # | Task | Status | Commit |
|---|------|--------|--------|
| 0 | Repository inventory (no edits) | **DONE** | *uncommitted* |
| 1 | Backend skeleton | **DONE** | *uncommitted* |
| 2 | Health-check tests | **DONE** | *uncommitted* |
| 3 | Configuration and database access | NOT STARTED | — |
| 4 | SQL migrations and RLS | NOT STARTED | — |
| 5 | Supabase token verification | NOT STARTED | — |
| 6 | Entitlement service and API | NOT STARTED | — |
| 7 | Polar checkout | NOT STARTED | — |
| 8 | Webhook verification | NOT STARTED | — |
| 9 | Paid-order processing | NOT STARTED | — |
| 10 | Refund processing | NOT STARTED | — |
| 11 | Extension integration contract | NOT STARTED | — |
| 12 | Production hardening | NOT STARTED | — |
| 13 | Deploy and smoke test | NOT STARTED | — |

---

## Completed Task Summaries

### Task 0 — Repository inventory (no edits) — DONE

#### Acceptance criteria check

| Criterion | Status |
|---|---|
| No files changed | Met — `git status` clean on all pre-existing files |
| Report contains relevant paths | Met — see below |
| Report contains proposed integration points | Met — see `F` |
| Waited for approval before Task 1 | Met — no Task 1 work started |

> **Note on "no edits":** No pre-existing extension file was created, modified, or
> deleted. The only new file is this log (`backend/TASK_PROGRESS.md`), created at
> the explicit request of the user so the backend build has a handover trail.

---

#### A. Language, framework, manifest version

| Property | Value |
|---|---|
| Language | JavaScript (vanilla, modern browsers). No transpiler, no bundler, no framework. |
| Manifest version | **3** (MV3) |
| Extension version | **2.3.0** |
| Background | MV3 service worker — `service-worker.js` (ephemeral; state lives in `chrome.storage.local`) |
| Content script | `content/content.js` + `content/content.css` — `run_at: document_start`, `all_frames: false`, matches `*://*/*` |
| Popup | `popup/popup.html`, `popup/popup.js`, `popup/popup.css` |
| Interstitial page | `blocked.html`, `blocked.js`, `blocked.css` |
| Blocking engine | `declarativeNetRequest` — **dynamic** rules only; static `rules/blocked_rules.json` is an empty array `[]` |
| Permissions | `storage`, `tabs`, `declarativeNetRequest`, `declarativeNetRequestWithHostAccess`, `alarms` |
| Host permissions | `*://*/*` |
| Cross-browser | Firefox supported via `browser_specific_settings.gecko` (`buildkyte@gmail.com`, min Firefox 128) |
| Remote code | None. Pure static assets — nothing is fetched at runtime. |

**Rule ID layout** (`service-worker.js:33-111`) — matters if entitlement state is ever
stored as a DNR rule:
- `1000..1999` → ALLOW rules (priority 10) for explicitly permitted URLs
- `2000..2999` → BLOCK/REDIRECT rules (priority 1) for blocked domains/paths
- Base constant `RULE_ID_BASE = 1000` at `service-worker.js:6`

**Only Python in the repo:** `maximize_logo.py` — a one-off dev script for icon
resizing. It hardcodes `/home/nikhargupta/...` paths, requires Pillow, and is
excluded from the store bundle by the `*.py` rule in `package-extension.sh`.
There is **no Python package, no venv, and no Python tooling** in the repo today.

#### B. Tests

**None.** No `package.json`, no test runner, no test directory, no fixtures.
There is zero automated test coverage of the extension. The backend will be the
first tested code in this repository (plan §3 `tests/`, §6 Task 2).

#### C. Deployment / repo conventions

- **Build step:** none. Source ships as-is.
- **Packaging:** `package-extension.sh` — bash + `zip`. Reads the version out of
  `manifest.json` via `python3 -c`, produces `kyte-v<version>.zip`.
- **CI:** none (no `.github/`, no `.gitlab-ci.yml`, no any `*.yml`/`*.yaml`).
- **`.gitignore`:** **does not exist.** `.DS_Store` and three release zips
  (`kyte-v2.1.0-firefox.zip`, `kyte-v2.3.0.zip`, `kyte-v3.0.0.zip`) are committed.
- **Lint/format config:** none.
- **Git history:** 4 commits, `main`, HEAD `ad84fd8 "new UI"`.
- **Docs:** `CHROMEWEBSTORE.md` (190 lines, full listing copy + permission
  justifications), `FIREFOXSTORE.md` (86 lines).
- **Brand site:** `https://getkyte.online` (opened via `chrome.tabs.create` at
  `popup/popup.js:111-114`).

**JS style conventions to match:** 2-space indent, single quotes, semicolons,
`UPPER_SNAKE` constants for IDs/timers, and `// ── Section Name ────` banner
comments. Zero semicolon-free or bracket-style variance observed.

#### D. Existing backend

**None.** The extension makes **no network requests at all**. The only URLs in the
codebase are the static links to `getkyte.online` and the Chrome Web Store console
inside `package-extension.sh`. There is no auth, no payment, no licensing, no
entitlement, no analytics, no telemetry.

#### E. Current Lock-in flow (full trace)

**Lock-in Mode is currently 100% free, ungated, and entirely local. There is no
payment or entitlement code anywhere in the repository.** Full call path:

1. **UI** — `popup/popup.html:76-90`. A `.session-lock-row` containing the label
   *"Locked In Mode"*, sublabel *"Irreversible until the active timer expires"*,
   and `#lock-toggle`, a `button[role="switch"]` with `aria-checked="false"`.

2. **Toggle handler** — `popup/popup.js:101-105`. Flips the module-scoped variable
   `lockEnabled` (declared `popup/popup.js:19`) and updates `aria-checked`.
   **No persistence, no permission check, no network call.**

3. **Session start** — `popup/popup.js:202-218` `startSession()` sends
   `START_SESSION` with `{ durationMinutes, locked: lockEnabled, lockedMinutes: selectedDurationMinutes }`.
   The client-supplied boolean is passed straight through to the service worker.

4. **Authoritative write** — `service-worker.js:162-177` `START_SESSION` computes
   `sessionLockedUntil = now + (lockedMinutes || durationMinutes) * 60 * 1000` and
   persists it via `setState()` to `chrome.storage.local`.

5. **Enforcement read sites** (all compare `sessionLockedUntil > Date.now()`):
   - `service-worker.js:179-196` `END_SESSION` → responds `{ ok: false, reason: 'locked' }`
   - `service-worker.js:214-232` `REMOVE_DOMAIN` → `{ ok: false, reason: 'locked' }`
   - `service-worker.js:247-259` `REMOVE_ALLOWED_URL` → `{ ok: false, reason: 'locked' }`
   - `popup/popup.js:41-44` master toggle guard → `flashLocked()` (`popup/popup.js:378`)
   - `blocked.js:37-41` renders *"Session Active · Locked"* on the interstitial

6. **The only unlock path** — `service-worker.js:115-139`. The `kyte-session-end`
   alarm fires at session expiry and **clears** `sessionLockedUntil` while disabling
   blocking. Users cannot disable the extension or clear storage, but uninstall or
   storage clear would also defeat the lock.

**Local storage schema** (`service-worker.js:11-18`, the `getState()` defaults) —
this is where the 7-day entitlement cache from plan §1 should live:

| Key | Type | Meaning |
|---|---|---|
| `kyteEnabled` | boolean | Master blocking switch |
| `sessionActive` | boolean | A focus session is running |
| `sessionLockedUntil` | number | Epoch ms; `0` = not locked |
| `sessionEndTime` | number | Epoch ms; `0` = no timer |
| `blockedDomains` | string[] | `['youtube.com']` or `['instagram.com/reels']` |
| `allowedUrls` | string[] | Full URLs that bypass a block |

#### F. Proposed integration points

None of these are edited yet — they are the recommended seams for Tasks 1-12.

**Frontend / UI**
1. `popup/popup.html:76-90` — add a paid badge / "Unlock · $9" CTA and a Google
   sign-in control inside or beside `.session-lock-row`. A dedicated upgrade
   surface (e.g. `popup/upgrade.html`) does not exist yet and would be new.
2. `popup/popup.js:19` + `:101-105` — gate the toggle. When not entitled, the
   click should open the upgrade flow instead of flipping `lockEnabled`.
3. `popup/popup.js:202-218` `startSession()` — must resolve entitlement *before*
   sending `locked`. Today it forwards the raw local boolean.

**Backend-of-the-extension (service worker) — this is the trust boundary**
4. `service-worker.js:162-177` `START_SESSION` — **the authoritative gate.** Must
   verify a cached entitlement before honouring `locked: true`, and fail closed.
   Gating only in the popup is bypassable, because the user can edit popup state.
5. `service-worker.js:143-272` message router — add new message types, e.g.
   `GET_ENTITLEMENT`, `REFRESH_ENTITLEMENT`, `START_CHECKOUT`. Note the listener
   already returns `true` to keep the channel open for async work.
6. `service-worker.js:275-276` `onStartup` / `onInstalled` — natural hook to refresh
   the entitlement cache (the plan allows 7-day staleness) and to surface
   "just purchased / reinstalled" cases.

**New extension files (do not exist yet)**
7. e.g. `lib/api.js` (backend client), `lib/auth.js` (Supabase session/token
   handling), `lib/entitlement-cache.js` (7-day TTL per plan §1).

**Backend service (to be created under `backend/` in Tasks 1-11)**
8. `backend/app/` per plan §3 layout, exposing `GET /v1/me/entitlement` and
   `POST /v1/checkout` per plan §2, plus `GET /health` and `GET /ready`.

#### G. Blockers and risks for later tasks

1. **Store listing contradicts the paid model — highest-priority external risk.**
   `CHROMEWEBSTORE.md:34` states *"All data ... is stored locally on your device
   using Chrome's storage API. Nothing is sent to any server. No accounts. No
   analytics."* and `:117` repeats *"This data never leaves your device. It is not
   sent to any server, is not synced to your Google account, and is not shared with
   any third party."* Introducing Supabase Google sign-in and backend calls makes
   both statements false. These must be rewritten and the Web Store data-usage /
   privacy disclosure updated **before resubmission**, or the listing risks policy
   rejection. Affects Tasks 11 and 13.
2. **Packaging leak — needs a fix before any release zip is built.**
   `package-extension.sh` excludes `*.py`, `*.zip`, `_metadata/*`, etc., but has
   **no `backend/*` exclusion**. Now that `backend/` exists, backend sources
   (`requirements.txt`, `migrations/*.sql`, `README.md`, `.env.example`) would be
   zipped into the Chrome Web Store bundle. Add `-x "backend/*"` to the zip command.
   Not changed in Task 0 per the no-edits rule — flagged for Task 1 or Task 11.
3. **No `.gitignore` anywhere.** `backend/.gitignore` with `.env` is required before
   any secrets work begins (Task 1).
4. **Client-trust is unavoidable for the offline cache.** Plan §1 permits 7 days of
   cached entitlement. That is inherently client-side and a determined user can
   forge it. Acceptable for a self-hosted focus-blocker product, but the trade-off
   should be recorded in the backend README rather than left implicit.
5. **MV3 CSP forbids remote scripts.** If Supabase auth is done from the popup,
   the SDK cannot be loaded from a CDN. Either bundle it, or perform auth over REST
   from the service worker. Decide during Task 11.
6. **No CI means no automated guard** against committing `.env` files or shipping
   backend code in a release zip. Plan §12 asks for a secrets check; consider adding
   a minimal workflow at Task 12.

#### H. Open questions for the owner

1. Backend lives at `backend/` inside the extension repo per the user's decision.
   Confirm who owns commits to that repo — it is the same public GitHub repo used
   for the Chrome Web Store submission.
2. Is the US$9 price a Polar one-time product already created, or is product
   creation part of this build?
3. Should a still-running locked session survive a refund-driven revocation
   mid-session, or revoke immediately? Affects Task 10.

---

### Task 1 — Backend skeleton — DONE

#### Acceptance criteria check

| Criterion | Result |
|---|---|
| Run the server locally | Pass — uvicorn boots on 127.0.0.1:8000 |
| `GET /health` returns 200 | Pass — `HTTP/1.1 200 OK`, body exactly `{"status":"ok"}` |
| Missing production config reported clearly | Pass — startup aborts, listing names |
| ...without printing secrets | Pass — verified, see D below |
| No payment logic yet | Pass — no Polar/Supabase/DB calls exist |

#### A. Files created (all new; no pre-existing extension file touched)

| Path | Purpose |
|---|---|
| `backend/app/__init__.py` | Package marker, `__version__ = "0.1.0"` |
| `backend/app/config.py` | Typed `Settings` (Pydantic settings) + `get_settings()` |
| `backend/app/main.py` | App factory, CORS, startup config validation via `lifespan` |
| `backend/app/routes/__init__.py` | Route package marker |
| `backend/app/routes/health.py` | `GET /health`, `GET /ready` |
| `backend/tests/__init__.py` | Test package marker (tests land in Task 2) |
| `backend/migrations/.gitkeep` | Placeholder; migration SQL lands in Task 4 |
| `backend/requirements.txt` | Pinned runtime + test dependencies |
| `backend/.env.example` | Placeholders only |
| `backend/.gitignore` | `.env`, `.venv/`, caches, `.DS_Store` |
| `backend/README.md` | Setup, run, config table, endpoints, security notes |
| `backend/.venv/` | Local venv (git-ignored) |

#### B. Verified behaviour

- `GET /health` → `200`, `{"status":"ok"}`. Calls no external dependency.
- `GET /ready` → `200`, `{"status":"ready"}`. Dependency check is a marked
  `TODO(Task 3)` in `routes/health.py:47`.
- `APP_ENV=production` with incomplete config → startup raises `RuntimeError`
  listing the six missing variable **names**.
- `APP_ENV=development` with incomplete config → starts, logs a **warning**
  instead, so local work and health probes stay usable.
- Production with complete config → starts with `missing == []`.

#### C. Decisions made (and why)

1. **Settings are optional-with-production-check, not strictly required.** If the
   Supabase/Polar variables were hard-required, `uvicorn` could not boot locally
   and the Task 1 "run the server locally" criterion would fail. Production
   strictness is therefore enforced in `lifespan` (`app/main.py:20-34`) rather
   than by field validators. `missing_required_settings` stays a property so
   Task 3 can reuse it for `/ready`.
2. **Secrets use `Field(repr=False)`.** `SUPABASE_SECRET_KEY`,
   `POLAR_ACCESS_TOKEN`, and `POLAR_WEBHOOK_SECRET` cannot appear in
   `repr(settings)` or in an unhandled-exception repr.
3. **CORS is an explicit allowlist, and disabled when `FRONTEND_ORIGIN` is
   unset.** `allow_credentials=False`, because the API uses an
   `Authorization: Bearer` header rather than cookies, so credentialed
   cross-origin requests are never needed. Logging a warning when CORS is off
   prevents a silent "works locally, broken in the extension" failure.
4. **Toolchain is `uv`, not bare `pip`/`venv`.** The machine's system Python is
   3.9.6, below the plan's 3.12+ floor and too old for the `X | None`
   annotations used throughout. `uv` was installed via Homebrew and pins
   CPython 3.12.15. `pip install -r requirements.txt` inside `.venv` still works
   exactly as the plan's §8 commands describe.
5. **Response models instead of bare dicts** for both health routes, so the
   OpenAPI schema documents the exact `{"status": ...}` shape Task 2 will assert.
6. **Created only `routes/health.py`.** Plan §3 lists `routes/entitlement.py`,
   `routes/checkout.py`, and `routes/webhooks.py`, but each depends on services
   that Tasks 5-8 build. Empty stubs would be dead code, so they are deferred
   to the task that gives them meaning.

#### D. Verification commands and results

```
uv venv --python 3.12 && uv pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000

curl -i http://127.0.0.1:8000/health   -> 200  {"status":"ok"}
curl -i http://127.0.0.1:8000/ready    -> 200  {"status":"ready"}
```

Secret-containment check (env vars set to literal canary strings, then asserted
against `repr(settings)`):

```
repr contains SUPER_SECRET_VALUE  : False
repr contains WEBHOOK_SECRET_VALUE: False
repr -> Settings(app_env='development', port=8000, polar_product_id=None,
                  success_url=None, frontend_origin=None)
```

Production fail-fast check:

```
APP_ENV=production (no credentials)
  -> ERROR: Missing required configuration: SUPABASE_URL, SUPABASE_SECRET_KEY,
     POLAR_ACCESS_TOKEN, POLAR_WEBHOOK_SECRET, POLAR_PRODUCT_ID, SUCCESS_URL
  -> RuntimeError, process does not start
```

CORS check with `FRONTEND_ORIGIN=chrome-extension://aaaa…dddd`:

```
OPTIONS /health, allowed origin   -> access-control-allow-origin: chrome-extension://aaaa...dddd
GET /health, Origin: https://evil.example -> no access-control-* headers
```

`git check-ignore -v backend/.env backend/.venv` confirms both are ignored.

**Tests:** none written this task — Task 2 is the health-check test task. All
verification above was done against a live server, matching the Task 1
acceptance criteria, which ask for a running server rather than a test suite.

#### E. Pinned versions

`fastapi==0.143.0` · `uvicorn[standard]==0.54.0` · `pydantic==2.14.1` ·
`pydantic-settings==2.15.0` · `pytest==9.1.1` · `httpx==0.28.1`
(all verified on CPython 3.12.15, macOS arm64)

#### F. Carried-forward items for Task 2

1. Write `tests/test_health.py` covering status code, JSON shape, no auth
   required, and no secret leakage, plus `/ready` behaviour (plan Task 2).
2. Add a `conftest.py` with a `TestClient` fixture. Note `app.config.settings`
   is built at import time and `get_settings` is `lru_cache`d — tests that need
   a different `APP_ENV` must clear the cache
   (`get_settings.cache_clear()`) or set env before import.
3. Document test and run commands (already partly drafted in `README.md`).

#### G. Still-open risks (unchanged from Task 0)

- `package-extension.sh` still lacks a `-x "backend/*"` exclusion, so a release
  zip built today would ship backend sources to the store. Must be fixed before
  any packaging run. Not done here to respect the Task 0 no-edits boundary.
- `CHROMEWEBSTORE.md:34` and `:117` still claim no data ever leaves the device.

---

### Task 2 — Health-check tests — DONE

#### Acceptance criteria check

| Criterion | Result |
|---|---|
| `/health`: status code, JSON shape, no auth, no secret leakage | Pass — 16 tests |
| `/ready`: response behaviour | Pass — 6 tests |
| Document local test and run commands | Pass — `backend/README.md` "Tests" + "Troubleshooting" |
| Tests pass | Pass — **24 passed** |
| Health checks do not depend on Polar | Pass — *proven*, not assumed; see D |

#### A. Files

| Path | Change |
|---|---|
| `backend/tests/conftest.py` | **New.** Four fixtures (see B) |
| `backend/tests/test_health.py` | **New.** 20 health/readiness tests |
| `backend/tests/test_no_network_tripwire.py` | **New.** 4 meta-tests proving the tripwire works |
| `backend/requirements.txt` | Added `httpx2==2.13.1`; `httpx` kept deliberately |
| `backend/README.md` | Test commands + Troubleshooting section |

No source file under `app/` was changed in this task.

#### B. Fixtures in `conftest.py`

| Fixture | Purpose |
|---|---|
| `client` | `TestClient` entered as a context manager so the `lifespan` hook runs |
| `populated_secrets` | Sets every credential to a canary value; returns name→canary for leak assertions |
| `cleared_secrets` | Blanks every credential, simulating a bare checkout |
| `no_outbound_network` | Tripwire that raises on any real outbound HTTP request |

Credential canaries use `.invalid` TLDs and a `CANARY_…_9f3a2b` marker so a leak
is unmistakable in a failure message.

#### C. Notable decisions

1. **Leak tests assert against body *and* every response header.** A secret can
   leak through a debug/echo header as easily as through the payload, so only
   checking `response.text` would under-test.
2. **`repr(settings)` is covered by a test.** This guards Task 1's
   `Field(repr=False)` markers, which a later refactor could silently drop.
3. **Unimplemented routes are asserted to be `404`.** `/v1/me/entitlement`,
   `/v1/checkout`, `/v1/webhooks/polar` must not exist yet, so a half-built
   endpoint cannot ship unnoticed.
4. **`httpx2` added alongside `httpx`.** Starlette 1.7 does
   `import httpx2 as httpx`, so with `httpx2` installed the test client stops
   routing through `httpx`. Keeping `httpx` installed lets the tripwire cover
   either client library. `httpx` is otherwise unused.
5. **Tripwire patches `HTTPTransport`, not `Client.send`.** `TestClient` is
   httpx-based and routes through its own ASGI transport; patching
   `Client.send` would break the test client itself and produce a confusing
   false failure.

#### D. The bug this task caught — worth reading before changing `conftest.py`

The first version of the tripwire patched **only `httpx`**. The full suite still
reported `20 passed`. That green result was **misleading**: once `httpx2` was
installed, Starlette's `TestClient` silently began routing through `httpx2`,
which the fixture no longer patched. The suite would have kept passing while the
"no outbound requests" guarantee quietly evaporated.

Fixed by patching every installed httpx library. The fix is itself verified by
mutation testing:

| Mutation | Result |
|---|---|
| Tripwire patched only `httpx` (the original bug) | **2 failed**, 22 passed |
| `/health` returns `settings.supabase_secret_key` | **5 failed**, 19 passed |

`tests/test_no_network_tripwire.py` keeps this honest going forward. Note its
`test_tripwire_blocks_every_installed_client` deliberately resolves the library
list *independently* of `conftest._http_client_modules` — the first version
reused that helper, which made it check only whatever the helper chose to
return, so dropping `httpx2` from the helper left that test passing. The
mutation table above is how that was caught.

#### E. Test commands and results

```bash
cd backend
.venv/bin/python -m pytest -q     ->  24 passed in 0.05s
```

Breakdown: 16 `/health` · 6 `/ready` · 4 tripwire meta-tests. No warnings
(after the `httpx2` fix; previously 1 `StarletteDeprecationWarning`).

#### F. Carried-forward items for Task 3

1. `/ready` must return **503** when the database is unreachable. The current
   test asserts only `200` + `{"status": "ready"}`; extend
   `TestReady` rather than rewriting it.
2. New tests needed: database reachable → 200; database down → 503; missing
   config → 503; and the response must still leak no hostnames, exception text,
   or credentials.
3. `cleared_secrets` and `populated_secrets` fixtures are ready to reuse.
4. Once `database.py` exists, add an outbound-network fixture scoped to
   *allowing* only the database client, so a real connection attempt fails
   loudly instead of hanging on a network timeout.
5. Keep `settings.missing_required_settings` as the single source of truth for
   "is configuration complete" — `/ready` should reuse it rather than
   re-deriving the list.

---

## Environment notes for the next agent

- Python target: **3.12+**, FastAPI, Pydantic settings. Use a `backend/.venv`.
- Local run (plan §8):
  ```
  cd backend
  python3 -m venv .venv && source .venv/bin/activate
  pip install -r requirements.txt
  uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
  # second terminal:
  curl -i http://127.0.0.1:8000/health
  curl -i http://127.0.0.1:8000/ready
  pytest -q
  ```
- Environment variables expected (plan §4): `APP_ENV`, `PORT`, `SUPABASE_URL`,
  `SUPABASE_SECRET_KEY`, `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`,
  `POLAR_PRODUCT_ID`, `SUCCESS_URL`, `FRONTEND_ORIGIN`.
- Use Polar **sandbox** and a Supabase **development** project until Task 13.
- Do not deploy or publish without explicit approval (plan §10).