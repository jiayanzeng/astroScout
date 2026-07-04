"""NASA ADS literature lookups.

`object:` is a *virtual* query operator, not a real Solr field: the ADS UI
resolves it through the object service (SIMBAD/NED) into real fields
(`simbid`/`nedid`/`abs`) before the query ever reaches Solr. Sending `object:`
straight to /v1/search/query fails with 400 "undefined field object", so we do
the same translation here, falling back to a plain abstract search when the
resolver is unavailable.
"""

from __future__ import annotations

import httpx

from ..config import settings

_ADS_SEARCH_URL = "https://api.adsabs.harvard.edu/v1/search/query"
_ADS_OBJECTS_URL = "https://api.adsabs.harvard.edu/v1/objects/query"


def _auth_headers() -> dict[str, str]:
    if not settings.ads_token:
        raise RuntimeError("ADS_TOKEN not set (free token at ui.adsabs.harvard.edu)")
    return {"Authorization": f"Bearer {settings.ads_token}"}


def fallback_query(target: str) -> str:
    """Degraded query: plain abstract/title/keyword match.

    Fine for catalog designations (M31, NGC7000) but misses papers tagged only
    with canonical names (e.g. "Andromeda" without "M31").
    """
    return f'abs:"{target}"'


def resolve_object_query(target: str) -> str:
    """Translate `object:"{target}"` into real Solr fields via the object service.

    Live example for M31:
        ((=abs:"M31" OR simbid:"1575544" OR nedid:"Messier_031") database:astronomy)

    Falls back to `fallback_query` if the resolver errors or returns nothing, so
    ingest keeps working (degraded) through resolver outages. Needs ADS_TOKEN.
    """
    headers = _auth_headers()
    try:
        resp = httpx.post(
            _ADS_OBJECTS_URL,
            json={"query": [f'object:"{target}"']},
            headers=headers,
            timeout=20,
        )
        resp.raise_for_status()
        query = resp.json().get("query")
    except httpx.HTTPError:
        return fallback_query(target)
    if not isinstance(query, str) or not query.strip():
        return fallback_query(target)
    return query


def count_literature(target: str) -> dict[str, object]:
    """How much literature exists for this object? Needs ADS_TOKEN."""
    headers = _auth_headers()
    resp = httpx.get(
        _ADS_SEARCH_URL,
        params={"q": resolve_object_query(target), "rows": 1, "fl": "title,bibcode,year"},
        headers=headers,
        timeout=20,
    )
    resp.raise_for_status()
    body = resp.json().get("response", {})
    docs = body.get("docs", [])
    return {
        "num_found": body.get("numFound", 0),
        "sample_title": docs[0].get("title") if docs else None,
    }


def fetch_abstracts(target: str, rows: int = 8) -> list[dict[str, object]]:
    """Fetch top abstracts for an object, most-cited first. Needs ADS_TOKEN."""
    headers = _auth_headers()
    resp = httpx.get(
        _ADS_SEARCH_URL,
        params={
            "q": resolve_object_query(target),
            "rows": rows,
            "sort": "citation_count desc",
            "fl": "title,bibcode,abstract,year",
        },
        headers=headers,
        timeout=30,
    )
    resp.raise_for_status()
    out: list[dict[str, object]] = []
    for d in resp.json().get("response", {}).get("docs", []):
        abstract = d.get("abstract")
        if not abstract:
            continue
        title = d.get("title")
        out.append(
            {
                "title": title[0] if isinstance(title, list) and title else title,
                "bibcode": d.get("bibcode"),
                "year": d.get("year"),
                "abstract": abstract,
            }
        )
    return out
