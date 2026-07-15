"""In-process resource guards for expensive public API work.

The semaphore and sliding windows protect each API process. A deployment with
multiple workers should also enforce an upstream/global limit at its gateway.
"""

from __future__ import annotations

from collections import defaultdict, deque
from collections.abc import Callable
from dataclasses import dataclass
from threading import BoundedSemaphore, Lock
from time import monotonic


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    retry_after_seconds: int = 0


class SlidingWindowRateLimiter:
    def __init__(
        self,
        limit: int,
        window_seconds: float,
        clock: Callable[[], float] = monotonic,
    ) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._clock = clock
        self._events: defaultdict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str) -> RateLimitResult:
        now = self._clock()
        cutoff = now - self.window_seconds
        with self._lock:
            if len(self._events) > 1024:
                stale_keys = [
                    event_key
                    for event_key, event_times in self._events.items()
                    if not event_times or event_times[-1] <= cutoff
                ]
                for stale_key in stale_keys:
                    del self._events[stale_key]
            events = self._events[key]
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= self.limit:
                retry = max(1, int(self.window_seconds - (now - events[0]) + 0.999))
                return RateLimitResult(allowed=False, retry_after_seconds=retry)
            events.append(now)
            return RateLimitResult(allowed=True)

    def discard_latest(self, key: str) -> None:
        """Refund one just-recorded event when a second guard rejects the request."""
        with self._lock:
            events = self._events.get(key)
            if events:
                events.pop()
                if not events:
                    del self._events[key]


class ProjectionGuard:
    """Bound concurrent projections and both per-client and process request rates."""

    def __init__(
        self,
        concurrency: int = 2,
        per_client_per_minute: int = 6,
        global_per_minute: int = 30,
        clock: Callable[[], float] = monotonic,
    ) -> None:
        self._slots = BoundedSemaphore(concurrency)
        self._client_rate = SlidingWindowRateLimiter(per_client_per_minute, 60.0, clock=clock)
        self._global_rate = SlidingWindowRateLimiter(global_per_minute, 60.0, clock=clock)

    def check_rate(self, client_key: str) -> RateLimitResult:
        global_result = self._global_rate.check("global")
        if not global_result.allowed:
            return global_result
        client_result = self._client_rate.check(client_key)
        if not client_result.allowed:
            self._global_rate.discard_latest("global")
        return client_result

    def acquire(self, timeout_seconds: float = 0.0) -> bool:
        return self._slots.acquire(timeout=timeout_seconds)

    def release(self) -> None:
        self._slots.release()
