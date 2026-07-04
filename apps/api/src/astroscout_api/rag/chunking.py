"""Split text into overlapping chunks for embedding. Pure, no dependencies."""

from __future__ import annotations


def chunk_text(text: str, max_chars: int = 1200, overlap: int = 150) -> list[str]:
    """Split normalized text into chunks of at most `max_chars`, overlapping by ~`overlap`.

    Breaks on word boundaries where possible so chunks stay readable. Returns [] for
    empty input and a single chunk for short input.
    """
    normalized = " ".join(text.split())
    if not normalized:
        return []
    if len(normalized) <= max_chars:
        return [normalized]
    if overlap >= max_chars:
        raise ValueError("overlap must be smaller than max_chars")

    chunks: list[str] = []
    start = 0
    n = len(normalized)
    while start < n:
        end = min(start + max_chars, n)
        if end < n:
            # prefer a word boundary in the last `overlap` chars of the window
            boundary = normalized.rfind(" ", end - overlap, end)
            if boundary > start:
                end = boundary
        chunk = normalized[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= n:
            break
        start = max(end - overlap, start + 1)
    return chunks
