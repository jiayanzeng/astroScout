"""Ingest astronomy literature for catalog targets into the pgvector store."""

from __future__ import annotations

from ..config import settings
from ..datasources.dso_catalog import CATALOG
from ..datasources.literature import fetch_abstracts
from .chunking import chunk_text
from .embeddings import embed_texts
from .store import upsert_documents


def _require_keys() -> tuple[str, str, str]:
    missing = [
        name
        for name, val in (
            ("OPENAI_API_KEY", settings.openai_api_key),
            ("SUPABASE_URL", settings.supabase_url),
            ("SUPABASE_SERVICE_KEY", settings.supabase_service_key),
        )
        if not val
    ]
    if missing:
        raise RuntimeError(f"Missing required settings: {', '.join(missing)}")
    assert settings.openai_api_key and settings.supabase_url and settings.supabase_service_key
    return settings.openai_api_key, settings.supabase_url, settings.supabase_service_key


def ingest_target(target: str, rows: int = 8) -> int:
    """Fetch -> chunk -> embed -> store literature for one target. Returns #chunks stored."""
    openai_key, supabase_url, service_key = _require_keys()

    abstracts = fetch_abstracts(target, rows=rows)
    pending: list[dict[str, object]] = []
    for paper in abstracts:
        for chunk in chunk_text(str(paper["abstract"])):
            pending.append(
                {
                    "target": target,
                    "title": paper.get("title"),
                    "source": "NASA ADS",
                    "bibcode": paper.get("bibcode"),
                    "url": f"https://ui.adsabs.harvard.edu/abs/{paper.get('bibcode')}",
                    "content": chunk,
                }
            )
    if not pending:
        return 0

    vectors = embed_texts([str(r["content"]) for r in pending], openai_key)
    for row, vec in zip(pending, vectors, strict=True):
        row["embedding"] = vec

    return upsert_documents(pending, supabase_url, service_key)


def ingest_catalog(rows: int = 8) -> dict[str, int]:
    """Ingest every built-in catalog target. Returns target -> #chunks stored."""
    results: dict[str, int] = {}
    for obj in CATALOG:
        results[obj.name] = ingest_target(obj.name, rows=rows)
    return results
