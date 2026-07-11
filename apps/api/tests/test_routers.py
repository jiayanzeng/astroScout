import pytest
from fastapi.testclient import TestClient

from astroscout_api.main import app

client = TestClient(app)


# --- coordinate validation: rejected before any astropy work (fast) ---
def test_plan_night_rejects_bad_latitude() -> None:
    assert client.get("/plan/night", params={"lat": 200, "lon": 0}).status_code == 422


def test_plan_night_rejects_bad_longitude() -> None:
    assert client.get("/plan/night", params={"lat": 0, "lon": 999}).status_code == 422


def test_plan_target_rejects_bad_coords() -> None:
    r = client.get("/plan/target", params={"name": "M31", "lat": 91, "lon": 0})
    assert r.status_code == 422


def test_visibility_rejects_bad_coords() -> None:
    r = client.get("/visibility", params={"target": "M31", "lat": 99, "lon": 0})
    assert r.status_code == 422


def test_plan_night_rejects_malformed_when() -> None:
    r = client.get("/plan/night", params={"lat": 0, "lon": 0, "when": "not-a-date"})
    assert r.status_code == 422


@pytest.mark.parametrize(
    ("parameter", "value"),
    [("f_ratio", 0), ("filter", "solar"), ("sqm", 30)],
)
def test_plan_night_rejects_invalid_budget_values(parameter: str, value: object) -> None:
    params: dict[str, object] = {"lat": 0, "lon": 0, parameter: value}
    assert client.get("/plan/night", params=params).status_code == 422


@pytest.mark.parametrize(
    ("override", "value"),
    [
        ("when", "not-a-date"),
        ("nights", 0),
        ("f_ratio", 0),
        ("filter", "solar"),
        ("sqm", 30),
    ],
)
def test_plan_project_rejects_invalid_query_values(override: str, value: object) -> None:
    params: dict[str, object] = {
        "name": "M42",
        "lat": -36.85,
        "lon": 174.76,
        "f_ratio": 5.0,
    }
    params[override] = value
    assert client.get("/plan/project", params=params).status_code == 422


# --- future-date planning end to end (astropy compute) ---
@pytest.mark.integration
def test_plan_night_future_date_returns_ranked_targets() -> None:
    r = client.get("/plan/night", params={"lat": -36.85, "lon": 174.76, "when": "2026-08-15"})
    assert r.status_code == 200
    body = r.json()
    assert "bortle" in body and 1 <= body["bortle"] <= 9
    assert isinstance(body["targets"], list) and len(body["targets"]) > 0
    scores = [t["score"] for t in body["targets"]]
    assert scores == sorted(scores, reverse=True)


@pytest.mark.integration
def test_plan_night_default_is_tonight() -> None:
    r = client.get("/plan/night", params={"lat": -36.85, "lon": 174.76})
    assert r.status_code == 200
    assert "bortle" in r.json()
