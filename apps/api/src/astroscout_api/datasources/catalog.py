"""Resolve an object name to coordinates / metadata via Simbad (CDS)."""

from __future__ import annotations

from astroquery.simbad import Simbad


def resolve_object(name: str) -> dict[str, object]:
    """Resolve a target name through Simbad.

    Column names differ across astroquery versions (older: MAIN_ID/RA/DEC;
    newer: lowercase), so we surface them instead of hard-coding.
    """
    result = Simbad.query_object(name)
    if result is None or len(result) == 0:
        raise ValueError(f"Simbad returned no rows for {name!r}")
    cols = list(result.colnames)[:6]
    return {"columns": cols, "sample": {c: str(result[0][c]) for c in cols}}
