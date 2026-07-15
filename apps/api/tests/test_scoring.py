from astroscout_api.scoring import (
    TargetConditions,
    light_pollution_factor,
    light_sensitivity_for_kind,
    rank,
    rate_target,
    score_target,
)


def cond(
    alt: float,
    illum: float = 0.1,
    sep: float = 90.0,
    hours: float = 5.0,
    bortle: int = 1,
    sensitivity: float = 0.5,
) -> TargetConditions:
    return TargetConditions(
        altitude_deg=alt,
        moon_illumination=illum,
        moon_separation_deg=sep,
        hours_visible=hours,
        bortle=bortle,
        light_sensitivity=sensitivity,
    )


# --- existing behaviour ---
def test_rate_buckets() -> None:
    assert rate_target(10, 0.1) == "poor"
    assert rate_target(60, 0.1) == "good"
    assert rate_target(30, 0.9) == "marginal"


def test_below_floor_scores_zero() -> None:
    assert score_target(cond(alt=10)) == 0.0


def test_higher_altitude_scores_higher() -> None:
    assert score_target(cond(alt=70)) > score_target(cond(alt=25))


def test_bright_close_moon_penalizes() -> None:
    assert score_target(cond(alt=60, illum=1.0, sep=5)) < score_target(
        cond(alt=60, illum=1.0, sep=90)
    )


def test_score_bounded_0_100() -> None:
    assert 0.0 <= score_target(cond(alt=90, illum=0.0, sep=180, hours=12, bortle=1)) <= 100.0


# --- light pollution ---
def test_sensitivity_by_kind() -> None:
    assert light_sensitivity_for_kind("planet") == 0.0
    assert light_sensitivity_for_kind("galaxy") == 0.90
    assert light_sensitivity_for_kind("open cluster") == 0.15
    assert light_sensitivity_for_kind("Globular Cluster") == 0.25  # case-insensitive
    assert light_sensitivity_for_kind("totally unknown") == 0.55  # default


def test_planet_is_neutral_to_light_pollution() -> None:
    sensitivity = light_sensitivity_for_kind("planet")
    assert light_pollution_factor(9, sensitivity) == 1.0


def test_moon_is_not_penalized_by_its_own_illumination() -> None:
    base = TargetConditions(
        altitude_deg=60,
        moon_illumination=1,
        moon_separation_deg=0,
        hours_visible=6,
        bortle=9,
        light_sensitivity=light_sensitivity_for_kind("moon"),
        is_moon=True,
    )
    assert light_sensitivity_for_kind("moon") == 0.0
    assert score_target(base) == 100.0


def test_lp_factor_pristine_is_neutral() -> None:
    assert light_pollution_factor(1, 1.0) == 1.0
    assert light_pollution_factor(1, 0.0) == 1.0


def test_lp_factor_monotonic() -> None:
    assert light_pollution_factor(9, 0.9) < light_pollution_factor(5, 0.9)
    assert light_pollution_factor(9, 0.9) < light_pollution_factor(9, 0.2)


def test_lp_factor_clamps_out_of_range() -> None:
    assert light_pollution_factor(99, 1.0) == light_pollution_factor(9, 1.0)
    assert light_pollution_factor(-5, 1.0) == light_pollution_factor(1, 1.0)


def test_sensitive_object_crushed_in_city() -> None:
    dark = score_target(cond(alt=60, bortle=1, sensitivity=0.9))
    city = score_target(cond(alt=60, bortle=9, sensitivity=0.9))
    assert city < 0.5 * dark  # a galaxy loses most of its score in the city


def test_robust_object_barely_affected() -> None:
    dark = score_target(cond(alt=60, bortle=1, sensitivity=0.15))
    city = score_target(cond(alt=60, bortle=9, sensitivity=0.15))
    assert city > 0.85 * dark  # a cluster keeps most of its score


def test_ranking_flips_between_dark_site_and_city() -> None:
    # galaxy has the better intrinsic conditions (higher altitude)...
    galaxy_dark = cond(alt=65, bortle=1, sensitivity=0.9)
    cluster_dark = cond(alt=55, bortle=1, sensitivity=0.15)
    assert score_target(galaxy_dark) > score_target(cluster_dark)  # dark: galaxy wins

    galaxy_city = cond(alt=65, bortle=9, sensitivity=0.9)
    cluster_city = cond(alt=55, bortle=9, sensitivity=0.15)
    assert score_target(cluster_city) > score_target(galaxy_city)  # city: cluster wins


def test_rank_orders_best_first() -> None:
    ranked = rank({"low": cond(alt=22), "high": cond(alt=75)})
    assert ranked[0][0] == "high"
