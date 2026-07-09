"""Tests for config.py — env-file anchoring and CWD independence."""

from pathlib import Path

import pytest

from astroscout_api.config import Settings


def test_env_file_is_anchored_to_repo_root() -> None:
    """Assert env_file is a 2-tuple of absolute Paths anchored to known locations."""
    env_file = Settings.model_config["env_file"]  # type: ignore[literal-required]
    assert isinstance(env_file, tuple), f"expected tuple, got {type(env_file)}"
    assert len(env_file) == 2, f"expected 2 entries, got {len(env_file)}"

    first = Path(env_file[0])
    second = Path(env_file[1])

    # config.py is at apps/api/src/astroscout_api/config.py
    # config.py's parents[4] == repo root; parents[2] == apps/api
    # test_config.py is at apps/api/tests/test_config.py
    # test_config.py's parents[3] == repo root; parents[1] == apps/api
    repo_root = Path(__file__).resolve().parents[3]
    assert first == repo_root / ".env", f"{first} != {repo_root / '.env'}"

    api_local = Path(__file__).resolve().parents[1]
    assert second == api_local / ".env", f"{second} != {api_local / '.env'}"

    # Both must be absolute
    assert first.is_absolute(), f"{first} is not absolute"
    assert second.is_absolute(), f"{second} is not absolute"


def test_settings_independent_of_cwd(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Settings() does not raise when CWD is not the repo root."""
    monkeypatch.chdir(tmp_path)
    # Instantiation must not raise (env files are resolved via absolute paths).
    s = Settings()
    # Fields are present regardless of CWD (values come from real .env if it exists).
    assert hasattr(s, "openai_api_key")
    assert hasattr(s, "openai_base_url")
    assert hasattr(s, "cors_origins_raw")
