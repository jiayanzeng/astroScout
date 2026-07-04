from __future__ import annotations

import httpx

from ..config import settings

EMBED_MODEL = "text-embedding-3-small"
EMBED_DIM = 1536


def embed_texts(texts: list[str], api_key: str) -> list[list[float]]:
    """Embed a batch of texts. Returns one 1536-d vector per input, in order."""
    if not texts:
        return []
    
    # Dynamically Resolve Redirect URLs: Automatically falls back to the official OpenAI API if not configured.
    base_url = settings.openai_base_url or "https://api.openai.com/v1"
    url = f"{base_url.rstrip('/')}/embeddings"

    resp = httpx.post(
        url,  # Use a dynamically constructed URL.
        headers={"Authorization": f"Bearer {api_key}"},
        json={"model": EMBED_MODEL, "input": texts},
        timeout=60,
    )
    resp.raise_for_status()
    data = sorted(resp.json()["data"], key=lambda d: d["index"])
    return [d["embedding"] for d in data]