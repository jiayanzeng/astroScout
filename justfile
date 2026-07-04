# `just` runs recipes from the repo root. Install: https://github.com/casey/just

default:
    @just --list

# Validate every external data source the MVP depends on.
validate target="M31" lat="-36.85" lon="174.76":
    cd apps/api && uv run python scripts/validate_sources.py --target "{{target}}" --lat {{lat}} --lon {{lon}}

# Run the API locally (http://127.0.0.1:8000/docs).
api-dev:
    cd apps/api && uv run uvicorn astroscout_api.main:app --reload

# Lint + type-check + unit tests (what CI runs).
api-check:
    cd apps/api && uv run ruff check . && uv run ruff format --check . && uv run mypy src && uv run pytest -m "not integration"
