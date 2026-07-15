from astroscout_api.protection import ProjectionGuard, SlidingWindowRateLimiter


def test_sliding_window_reopens_after_window() -> None:
    now = [0.0]
    limiter = SlidingWindowRateLimiter(2, 60, clock=lambda: now[0])

    assert limiter.check("user").allowed
    assert limiter.check("user").allowed
    blocked = limiter.check("user")
    assert not blocked.allowed
    assert blocked.retry_after_seconds == 60

    now[0] = 61.0
    assert limiter.check("user").allowed


def test_projection_guard_bounds_concurrency() -> None:
    guard = ProjectionGuard(concurrency=1)
    assert guard.acquire()
    assert not guard.acquire(timeout_seconds=0)
    guard.release()
    assert guard.acquire(timeout_seconds=0)
    guard.release()


def test_projection_guard_has_global_limit_even_with_changing_clients() -> None:
    guard = ProjectionGuard(per_client_per_minute=10, global_per_minute=2)
    assert guard.check_rate("first").allowed
    assert guard.check_rate("second").allowed
    assert not guard.check_rate("third").allowed


def test_client_rejection_does_not_consume_global_capacity() -> None:
    guard = ProjectionGuard(per_client_per_minute=1, global_per_minute=2)
    assert guard.check_rate("first").allowed
    assert not guard.check_rate("first").allowed
    assert guard.check_rate("second").allowed
