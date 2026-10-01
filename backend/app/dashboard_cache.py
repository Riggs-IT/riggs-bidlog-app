"""Bounded, process-local cache for the existing shared dashboard GETs only.

No timers, database access, user/session cache, or stale-on-error fallback.
Invalidation removes flight ownership as well as a value. An earlier caller
may still finish its original read, but it cannot repopulate this cache after
invalidation. Callers arriving afterward cannot join that obsolete read.
"""
from __future__ import annotations

from collections import OrderedDict
from concurrent.futures import Future
from dataclasses import dataclass
from math import isfinite
from threading import Lock
from time import monotonic
from typing import Callable, TypeVar


T = TypeVar("T")


@dataclass(frozen=True)
class _Entry:
    expires_at: float
    value: object


class DashboardReadCache:
    """Retain at most max_entries values and max_inflight tracked GETs.

    Ordinary same-key misses share a Future. Different keys can load in
    parallel. At the in-flight bookkeeping limit a read runs uncached; this
    class does not add another connection/concurrency gate.

    A fresh read is a new read barrier: it bypasses both stored data and ANY
    previously started load for that key, including another forced read.
    Forced callers deliberately do not join older forced reads: that older
    snapshot could predate a write on a different application instance.
    """

    def __init__(
        self,
        *,
        max_entries: int = 256,
        max_inflight: int = 256,
        clock: Callable[[], float] = monotonic,
    ) -> None:
        if max_entries < 1 or max_inflight < 1:
            raise ValueError("Cache bounds must be positive.")
        self._max_entries = max_entries
        self._max_inflight = max_inflight
        self._clock = clock
        self._lock = Lock()
        self._values: OrderedDict[str, _Entry] = OrderedDict()
        self._flights: dict[str, Future] = {}

    def _expire_locked(self) -> None:
        now = self._clock()
        for key in list(self._values):
            if self._values[key].expires_at <= now:
                del self._values[key]

    def invalidate_key(self, key: str) -> None:
        with self._lock:
            self._expire_locked()
            self._values.pop(key, None)
            # Existing readers hold their Future; do not cancel their HTTP
            # call or make them repeat it. Only revoke cache publication.
            self._flights.pop(key, None)

    def invalidate_prefix(self, prefix: str) -> None:
        with self._lock:
            self._expire_locked()
            for mapping in (self._values, self._flights):
                for key in list(mapping):
                    if key.startswith(prefix):
                        del mapping[key]

    def get(
        self,
        key: str,
        loader: Callable[[], T],
        *,
        ttl: float,
        fresh: bool = False,
    ) -> T:
        if not isfinite(ttl) or ttl <= 0:
            self.invalidate_key(key)
            return loader()

        with self._lock:
            self._expire_locked()
            if fresh:
                self._values.pop(key, None)
                self._flights.pop(key, None)
            else:
                cached = self._values.get(key)
                if cached is not None:
                    self._values.move_to_end(key)
                    return cached.value

            flight = self._flights.get(key)
            leader = flight is None
            tracked = False
            if leader:
                if len(self._flights) < self._max_inflight:
                    flight = Future()
                    self._flights[key] = flight
                    tracked = True
            else:
                tracked = True

        if not tracked:
            # No retained per-key lock or generation counter for overflow.
            return loader()
        if not leader:
            return flight.result()

        try:
            value = loader()
        except BaseException as exc:
            with self._lock:
                if self._flights.get(key) is flight:
                    del self._flights[key]
            flight.set_exception(exc)
            raise

        with self._lock:
            if self._flights.get(key) is flight:
                del self._flights[key]
                self._expire_locked()
                self._values[key] = _Entry(self._clock() + ttl, value)
                self._values.move_to_end(key)
                while len(self._values) > self._max_entries:
                    self._values.popitem(last=False)
        flight.set_result(value)
        return value

    def info(self) -> dict[str, int]:
        """Counts only, for tests/diagnostics; no payload or key exposure."""
        with self._lock:
            self._expire_locked()
            return {
                "entries": len(self._values),
                "inflight": len(self._flights),
                "max_entries": self._max_entries,
                "max_inflight": self._max_inflight,
            }
