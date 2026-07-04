from astroscout_api.rag.chunking import chunk_text


def test_empty_returns_nothing() -> None:
    assert chunk_text("") == []
    assert chunk_text("   \n  ") == []


def test_short_text_single_chunk() -> None:
    assert chunk_text("Orion is a winter constellation.") == ["Orion is a winter constellation."]


def test_normalizes_whitespace() -> None:
    assert chunk_text("a   b\n\nc") == ["a b c"]


def test_long_text_splits_under_cap() -> None:
    text = " ".join(f"word{i}" for i in range(2000))
    chunks = chunk_text(text, max_chars=200, overlap=40)
    assert len(chunks) > 1
    assert all(len(c) <= 200 for c in chunks)
    assert all(c for c in chunks)


def test_overlap_smaller_than_max_enforced() -> None:
    import pytest

    with pytest.raises(ValueError):
        chunk_text("x" * 100, max_chars=50, overlap=50)


def test_coverage_roughly_complete() -> None:
    text = " ".join(f"w{i}" for i in range(500))
    chunks = chunk_text(text, max_chars=300, overlap=50)
    # every original word appears in at least one chunk
    joined = " ".join(chunks)
    assert "w0" in joined and "w499" in joined
