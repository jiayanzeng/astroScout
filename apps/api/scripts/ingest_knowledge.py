"""Ingest astronomy literature into the pgvector knowledge base.

Usage:
    uv run python scripts/ingest_knowledge.py --all
    uv run python scripts/ingest_knowledge.py --target M31 --rows 12

Requires OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY, and ADS_TOKEN in the env.
Run the 0002_knowledge.sql migration first.
"""

from __future__ import annotations

import argparse

from astroscout_api.rag.ingest import ingest_catalog, ingest_target


def main() -> int:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--all", action="store_true", help="ingest the whole built-in catalog")
    group.add_argument("--target", help="single target name, e.g. M31")
    parser.add_argument("--rows", type=int, default=8, help="abstracts per target")
    args = parser.parse_args()

    if args.all:
        results = ingest_catalog(rows=args.rows)
        for name, n in results.items():
            print(f"{name:10s} {n:4d} chunks")
        print(f"\nTotal: {sum(results.values())} chunks across {len(results)} targets")
    else:
        n = ingest_target(args.target, rows=args.rows)
        print(f"{args.target}: {n} chunks stored")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
