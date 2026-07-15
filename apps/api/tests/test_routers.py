import pytest
from fastapi.testclient import TestClient

from astroscout_api.datasources.planning import NoAstronomicalDarknessError
from astroscout_api.datasources.targets import (
    TargetNotFound,
    UnsupportedTarget,
    UpstreamResolutionError,
    resolve_target,
)
from astroscout_api.main import app
from astroscout_api.protection import RateLimitResult
from astroscout_api.routers import planning as planning_router

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


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (TargetNotFound("AAA", "No target found."), 404, "target_not_found"),
        (
            UnsupportedTarget("Sun", "Use the solar flow.", "solar_daylight_planner_required"),
            422,
            "unsupported_target",
        ),
        (
            UpstreamResolutionError("Alpha Centauri", "Resolver unavailable."),
            502,
            "upstream_resolution_error",
        ),
    ],
)
def test_plan_target_maps_resolution_errors(
    monkeypatch: pytest.MonkeyPatch,
    error: Exception,
    status: int,
    code: str,
) -> None:
    def fail(*_args: object) -> dict[str, object]:
        raise error

    monkeypatch.setattr(planning_router, "target_detail", fail)
    response = client.get(
        "/plan/target",
        params={"name": "AAA", "lat": -36.85, "lon": 174.76},
    )
    assert response.status_code == status
    assert response.json()["detail"]["code"] == code


@pytest.mark.parametrize(
    ("path", "attribute", "params"),
    [
        ("/plan/night", "rank_targets", {"lat": 89.9, "lon": 0}),
        ("/plan/target", "target_detail", {"name": "M42", "lat": 89.9, "lon": 0}),
        (
            "/plan/project",
            "project_target",
            {"name": "M42", "lat": 89.9, "lon": 0, "f_ratio": 5},
        ),
    ],
)
def test_planning_routes_map_no_astronomical_darkness(
    monkeypatch: pytest.MonkeyPatch,
    path: str,
    attribute: str,
    params: dict[str, object],
) -> None:
    def fail(*_args: object) -> dict[str, object]:
        raise NoAstronomicalDarknessError

    monkeypatch.setattr(planning_router, attribute, fail)
    response = client.get(path, params=params)
    assert response.status_code == 422
    assert response.json()["detail"] == {
        "code": "no_astronomical_darkness",
        "message": "The Sun does not reach astronomical darkness during this 24-hour period.",
        "state": "no_astronomical_darkness",
        "flow": "daylight_or_twilight_planning_required",
    }


@pytest.mark.parametrize("name", ["M4", "Alpha Centauri"])
def test_plan_target_preserves_successful_resolution(
    monkeypatch: pytest.MonkeyPatch, name: str
) -> None:
    def resolved_detail(target: str, _lat: float, _lon: float, _when: object) -> dict[str, object]:
        if target == "Alpha Centauri":
            return {"name": target, "common_name": target, "kind": "unknown"}
        obj = resolve_target(target)
        return {"name": obj.name, "common_name": obj.common_name, "kind": obj.kind}

    monkeypatch.setattr(planning_router, "target_detail", resolved_detail)
    response = client.get(
        "/plan/target",
        params={"name": name, "lat": -36.85, "lon": 174.76},
    )
    assert response.status_code == 200
    assert response.json()["name"] == name


def test_plan_project_returns_structured_rate_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class RateLimitedGuard:
        def check_rate(self, _client_key: str) -> RateLimitResult:
            return RateLimitResult(allowed=False, retry_after_seconds=17)

    monkeypatch.setattr(planning_router, "projection_guard", RateLimitedGuard())
    response = client.get(
        "/plan/project",
        params={"name": "M42", "lat": 0, "lon": 0, "f_ratio": 5},
    )
    assert response.status_code == 429
    assert response.headers["retry-after"] == "17"
    assert response.json()["detail"]["code"] == "projection_rate_limited"


def test_plan_project_returns_structured_capacity_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class BusyGuard:
        def check_rate(self, _client_key: str) -> RateLimitResult:
            return RateLimitResult(allowed=True)

        def acquire(self) -> bool:
            return False

    monkeypatch.setattr(planning_router, "projection_guard", BusyGuard())
    response = client.get(
        "/plan/project",
        params={"name": "M42", "lat": 0, "lon": 0, "f_ratio": 5},
    )
    assert response.status_code == 503
    assert response.headers["retry-after"] == "2"
    assert response.json()["detail"]["code"] == "projection_capacity_exceeded"


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
