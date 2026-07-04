"""Week-1 de-risking: prove every external data source the MVP depends on
returns usable data before we build anything on top of it.

Usage:
    uv run python scripts/validate_sources.py --target "M31" --lat -36.85 --lon 174.76

Notes:
    - All times are UTC.
    - Network access required (Simbad/CDS, NASA ADS).
    - The `literature` check needs ADS_TOKEN in your environment / .env.
    - Exit code is non-zero if a *critical* source fails, so it doubles as a smoke test.
"""

from __future__ import annotations

import argparse
import time
from collections.abc import Callable
from dataclasses import dataclass

from astroscout_api.datasources.catalog import resolve_object
from astroscout_api.datasources.literature import count_literature
from astroscout_api.datasources.visibility import get_darkness, get_visibility


@dataclass
class CheckResult:
    name: str
    ok: bool
    latency_ms: float
    detail: str


def timed(fn: Callable[[], object]) -> tuple[bool, str, float]:
    start = time.perf_counter()
    try:
        detail, ok = str(fn()), True
    except Exception as exc:  # probe: record every failure instead of crashing
        detail, ok = f"{type(exc).__name__}: {exc}", False
    return ok, detail, (time.perf_counter() - start) * 1000


CRITICAL = {"catalog", "visibility", "darkness"}  # MVP cannot function without these


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", default="M31")
    parser.add_argument("--lat", type=float, default=-36.85)  # Auckland default
    parser.add_argument("--lon", type=float, default=174.76)
    args = parser.parse_args()

    checks: dict[str, Callable[[], object]] = {
        "catalog": lambda: resolve_object(args.target),
        "visibility": lambda: get_visibility(args.target, args.lat, args.lon),
        "darkness": lambda: get_darkness(args.lat, args.lon),
        "literature": lambda: count_literature(args.target),
    }

    results: list[CheckResult] = []
    for name, fn in checks.items():
        ok, detail, latency = timed(fn)
        results.append(CheckResult(name, ok, latency, detail))
        print(f"[{'PASS' if ok else 'FAIL'}] {name:11s} {latency:7.0f}ms  {detail}")

    failed = [r.name for r in results if not r.ok and r.name in CRITICAL]
    if failed:
        print(f"\nFAIL: critical sources failed: {failed}")
        return 1
    print("\nOK: all critical sources passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
