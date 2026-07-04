"""Write embedded passages to Supabase via PostgREST using the service-role key."""

from __future__ import annotations

import httpx


def _vector_literal(vec: list[float]) -> str:
    """pgvector accepts a bracketed string literal over PostgREST."""
    return "[" + ",".join(repr(x) for x in vec) + "]"


def upsert_documents(
    rows: list[dict[str, object]],
    supabase_url: str,
    service_key: str,
) -> int:
    """Insert document rows. `embedding` values must be list[float]; we serialize them."""
    if not rows:
        return 0
    payload = []
    for r in rows:
        emb = r.get("embedding")
        out = dict(r)
        if isinstance(emb, list):
            out["embedding"] = _vector_literal(emb)
        payload.append(out)

    resp = httpx.post(
        f"{supabase_url.rstrip('/')}/rest/v1/documents",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        json=payload,
        timeout=60,
    )
    resp.raise_for_status()
    return len(payload)
