"""Meta-tests proving the ``no_outbound_network`` fixture actually works.

A tripwire that cannot fail is worse than no tripwire, because it reports a
guarantee that does not exist. These tests deliberately attempt real network
calls and assert that the fixture blocks them.

They also guard the specific regression that occurred during Task 2: Starlette
1.7 does ``import httpx2 as httpx`` inside ``starlette.testclient``, so once
``httpx2`` is installed the test client stops routing through ``httpx``. A
tripwire patching only ``httpx`` would have silently stopped catching anything
while the whole suite still passed.
"""

from __future__ import annotations

import asyncio
import importlib

import pytest
from fastapi.testclient import TestClient


def test_tripwire_blocks_sync_outbound_request(no_outbound_network: None) -> None:
    """A real synchronous outbound request must raise."""
    httpx = importlib.import_module("httpx")
    with pytest.raises(AssertionError, match="Unexpected outbound HTTP request"):
        httpx.get("https://example.com/")


def test_tripwire_blocks_async_outbound_request(no_outbound_network: None) -> None:
    """A real asynchronous outbound request must raise."""

    async def go() -> None:
        httpx2 = importlib.import_module("httpx2")
        async with httpx2.AsyncClient() as http_client:
            await http_client.get("https://example.com/")

    with pytest.raises(AssertionError, match="Unexpected outbound HTTP request"):
        asyncio.run(go())


def test_tripwire_blocks_every_installed_client(no_outbound_network: None) -> None:
    """Each installed httpx library must be covered, not just the first one.

    This is the regression guard. The list of libraries is resolved here
    independently of ``tests.conftest._http_client_modules`` on purpose: reusing
    that helper would make the test check only whatever the helper chose to
    return, so dropping ``httpx2`` from the helper would leave this test passing
    while the guarantee silently disappeared.
    """
    installed: list[str] = []
    for name in ("httpx", "httpx2"):
        try:
            module = importlib.import_module(name)
        except ImportError:
            continue
        installed.append(name)

        assert module.HTTPTransport.handle_request.__name__ == "_blocked_sync", (
            f"{name}.HTTPTransport.handle_request is not patched"
        )
        assert module.AsyncHTTPTransport.handle_async_request.__name__ == "_blocked_async", (
            f"{name}.AsyncHTTPTransport.handle_async_request is not patched"
        )

    assert installed, "expected at least one httpx client library installed"
    assert "httpx2" in installed, (
        "httpx2 is required: starlette.testclient imports it as its client. "
        "Without it the suite runs on deprecated httpx."
    )


def test_tripwire_does_not_break_the_test_client(
    no_outbound_network: None, client: TestClient
) -> None:
    """The fixture must leave in-process ASGI calls working."""
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/ready").json() == {"status": "ready"}