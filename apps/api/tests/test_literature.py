"""NASA ADS literature adapter tests.

The object-resolver translation (`object:` -> simbid/nedid/abs) and its
fallback are unit-tested with a stubbed httpx so they run in CI. Live
round-trips are marked `integration` (need ADS_TOKEN, skipped in CI).
"""

from __future__ import annotations

import httpx
import pytest

from astroscout_api.config import settings
from astroscout_api.datasources import literature
from astroscout_api.datasources.literature import (
    count_literature,
    fallback_query,
    fetch_abstracts,
    resolve_object_query,
)

_STUB_REQUEST = httpx.Request("POST", "https://api.adsabs.harvard.edu/v1/objects/query")


# --- unit: resolver behavior, no network (runs in CI) ---


def test_resolver_requires_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ads_token", None)
    with pytest.raises(RuntimeError, match="ADS_TOKEN"):
        resolve_object_query("M31")


def test_resolver_returns_translation_verbatim(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ads_token", "test-token")
    translated = '((=abs:"M31" OR simbid:"1575544" OR nedid:"Messier_031") database:astronomy)'

    def stub(*args: object, **kwargs: object) -> httpx.Response:
        return httpx.Response(200, json={"query": translated}, request=_STUB_REQUEST)

    monkeypatch.setattr(literature.httpx, "post", stub)
    assert resolve_object_query("M31") == translated


def test_resolver_falls_back_when_service_unreachable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ads_token", "test-token")

    def boom(*args: object, **kwargs: object) -> httpx.Response:
        raise httpx.ConnectError("resolver down")

    monkeypatch.setattr(literature.httpx, "post", boom)
    assert resolve_object_query("M31") == fallback_query("M31")


def test_resolver_falls_back_on_http_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ads_token", "test-token")

    def stub(*args: object, **kwargs: object) -> httpx.Response:
        return httpx.Response(500, json={}, request=_STUB_REQUEST)

    monkeypatch.setattr(literature.httpx, "post", stub)
    assert resolve_object_query("M31") == fallback_query("M31")


def test_resolver_falls_back_on_empty_translation(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ads_token", "test-token")

    def stub(*args: object, **kwargs: object) -> httpx.Response:
        return httpx.Response(200, json={"query": ""}, request=_STUB_REQUEST)

    monkeypatch.setattr(literature.httpx, "post", stub)
    assert resolve_object_query("M31") == fallback_query("M31")


def test_fallback_query_is_a_real_solr_field() -> None:
    q = fallback_query("NGC7000")
    assert q == 'abs:"NGC7000"'
    assert "object:" not in q


# --- live round-trips (need ADS_TOKEN; excluded by `pytest -m "not integration"`) ---

_requires_token = pytest.mark.skipif(not settings.ads_token, reason="ADS_TOKEN not set")


@pytest.mark.integration
@_requires_token
def test_resolver_translates_m31_live() -> None:
    q = resolve_object_query("M31")
    assert "simbid" in q  # resolver produced real fields, not the fallback
    assert "object:" not in q


@pytest.mark.integration
@_requires_token
def test_count_literature_m31_live() -> None:
    out = count_literature("M31")
    assert int(out["num_found"]) > 0  # type: ignore[arg-type]


@pytest.mark.integration
@_requires_token
def test_fetch_abstracts_m31_live() -> None:
    papers = fetch_abstracts("M31", rows=3)
    assert papers
    assert all(p["abstract"] and p["bibcode"] for p in papers)
