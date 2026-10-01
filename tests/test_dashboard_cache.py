from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event
import unittest

from backend.app.dashboard_cache import DashboardReadCache


class DashboardReadCacheTests(unittest.TestCase):
    def setUp(self):
        self.now = 100.0
        self.cache = DashboardReadCache(
            max_entries=4, max_inflight=4, clock=lambda: self.now,
        )

    def get(self, key, loader, **kwargs):
        return self.cache.get(key, loader, ttl=30, **kwargs)

    def test_hit_reuses_payload(self):
        calls = []
        def read():
            calls.append(1)
            return {"items": [{"forecastAmount": 0}, {"forecastAmount": None}]}
        self.assertEqual(self.get('a', read), self.get('a', read))
        self.assertEqual(len(calls), 1)

    def test_expires_at_deadline_not_after(self):
        self.assertEqual(self.get('a', lambda: 1), 1)
        self.now += 30
        self.assertEqual(self.get('a', lambda: 2), 2)

    def test_ttl_starts_after_load_completion(self):
        def load():
            self.now += 20
            return 1
        self.get('a', load)
        self.now += 29
        self.assertEqual(self.get('a', lambda: 2), 1)

    def test_failed_load_not_cached_and_can_retry(self):
        with self.assertRaisesRegex(RuntimeError, 'synthetic'):
            self.get('a', lambda: (_ for _ in ()).throw(RuntimeError('synthetic')))
        self.assertEqual(self.cache.info()['inflight'], 0)
        self.assertEqual(self.get('a', lambda: 2), 2)

    def test_no_stale_on_error_fallback(self):
        self.get('a', lambda: 1)
        self.now += 31
        with self.assertRaises(ValueError):
            self.get('a', lambda: (_ for _ in ()).throw(ValueError()))
        self.assertEqual(self.cache.info()['entries'], 0)

    def test_lru_bound_and_recency(self):
        for key in 'abcd': self.get(key, lambda key=key: key)
        self.get('a', lambda: 'unexpected')
        self.get('e', lambda: 'e')
        self.assertEqual(self.get('a', lambda: 'wrong'), 'a')
        self.assertEqual(self.get('b', lambda: 'b-new'), 'b-new')
        self.assertEqual(self.cache.info()['entries'], 4)

    def test_many_expired_keys_do_not_retain_locks(self):
        cache = DashboardReadCache(clock=lambda: self.now)
        for key in range(1000): cache.get(str(key), lambda: None, ttl=30)
        self.assertEqual(cache.info()['entries'], 256)
        self.now += 31
        cache.get('new', lambda: 1, ttl=30)
        self.assertEqual(cache.info()['entries'], 1)
        self.assertEqual(cache.info()['inflight'], 0)

    def test_invalidation_before_any_cached_value(self):
        self.cache.invalidate_key('a')
        self.cache.invalidate_prefix('a')
        self.assertEqual(self.get('a', lambda: 1), 1)

    def test_key_invalidation_leaves_other_keys(self):
        self.get('a', lambda: 1); self.get('b', lambda: 2)
        self.cache.invalidate_key('a')
        self.assertEqual(self.get('a', lambda: 3), 3)
        self.assertEqual(self.get('b', lambda: 4), 2)

    def test_prefix_invalidation_leaves_other_keys(self):
        for key in ('bid:a', 'bid:b', 'projects'): self.get(key, lambda: 1)
        self.cache.invalidate_prefix('bid:')
        self.assertEqual(self.get('bid:a', lambda: 2), 2)
        self.assertEqual(self.get('bid:b', lambda: 2), 2)
        self.assertEqual(self.get('projects', lambda: 2), 1)

    def test_zero_ttl_removes_previous_value(self):
        self.get('a', lambda: 1)
        self.assertEqual(self.cache.get('a', lambda: 2, ttl=0), 2)
        self.assertEqual(self.get('a', lambda: 3), 3)

    def test_invalid_ttl_does_not_retain_data(self):
        for ttl in (-1, float('nan'), float('inf')):
            with self.subTest(ttl=ttl):
                self.cache.get('a', lambda: 2, ttl=ttl)
                self.assertEqual(self.cache.info()['entries'], 0)

    def test_invalid_bounds_rejected(self):
        for bounds in ({'max_entries': 0}, {'max_inflight': 0}):
            with self.assertRaises(ValueError): DashboardReadCache(**bounds)

    def test_regular_same_key_misses_coalesce(self):
        started, release, follower_started = Event(), Event(), Event()
        def leader():
            started.set()
            self.assertTrue(release.wait(3))
            return 1
        def unexpected():
            raise AssertionError('Duplicate loader executed')
        with ThreadPoolExecutor(2) as pool:
            a = pool.submit(self.get, 'a', leader)
            self.assertTrue(started.wait(3))
            # Signal only once the follower has actually entered Future.result.
            flight = self.cache._flights['a']
            original_result = flight.result
            def observed_result(*args, **kwargs):
                follower_started.set()
                return original_result(*args, **kwargs)
            flight.result = observed_result
            b = pool.submit(self.get, 'a', unexpected)
            try: self.assertTrue(follower_started.wait(3))
            finally: release.set()
            self.assertEqual(a.result(3), 1); self.assertEqual(b.result(3), 1)
        self.assertEqual(self.cache.info()['inflight'], 0)

    def test_different_keys_load_in_parallel(self):
        barrier = Barrier(2)
        def read(value):
            barrier.wait(timeout=3)
            return value
        with ThreadPoolExecutor(2) as pool:
            a=pool.submit(self.get, 'a', lambda: read(1))
            b=pool.submit(self.get, 'b', lambda: read(2))
            self.assertEqual(a.result(4), 1); self.assertEqual(b.result(4), 2)

    def late_reader(self, invalidate, *, first_fresh=False):
        started, release = Event(), Event()
        def old():
            started.set()
            self.assertTrue(release.wait(3))
            return 'old'
        with ThreadPoolExecutor(1) as pool:
            a = pool.submit(self.get, 'a', old, fresh=first_fresh)
            self.assertTrue(started.wait(3))
            try:
                invalidate()
                self.assertEqual(self.get('a', lambda: 'new'), 'new')
            finally: release.set()
            self.assertEqual(a.result(3), 'old')
        self.assertEqual(self.get('a', lambda: 'wrong'), 'new')
        self.assertEqual(self.cache.info()['inflight'], 0)

    def test_old_read_cannot_repopulate_after_write_invalidation(self):
        self.late_reader(lambda: self.cache.invalidate_key('a'))

    def test_prefix_revokes_inflight_read_even_without_stored_value(self):
        self.late_reader(lambda: self.cache.invalidate_prefix('a'))

    def test_fresh_bypasses_stored_value(self):
        self.get('a', lambda: 1)
        self.assertEqual(self.get('a', lambda: 2, fresh=True), 2)
        self.assertEqual(self.get('a', lambda: 3), 2)

    def test_fresh_bypasses_an_older_normal_load(self):
        self.late_reader(lambda: self.get('a', lambda: 'new', fresh=True))

    def test_postwrite_fresh_does_not_join_an_older_forced_load(self):
        self.late_reader(lambda: self.get('a', lambda: 'new', fresh=True), first_fresh=True)

    def test_fresh_failure_cannot_resurrect_prewrite_cache(self):
        started, release = Event(), Event()
        def old():
            started.set(); self.assertTrue(release.wait(3)); return 'old'
        with ThreadPoolExecutor(1) as pool:
            a=pool.submit(self.get,'a',old); self.assertTrue(started.wait(3))
            try:
                with self.assertRaises(ValueError):
                    self.get('a', lambda: (_ for _ in ()).throw(ValueError()), fresh=True)
            finally: release.set()
            self.assertEqual(a.result(3),'old')
        self.assertEqual(self.cache.info()['entries'],0)
        self.assertEqual(self.get('a',lambda:'new'),'new')

    def test_old_exception_does_not_erase_newer_entry(self):
        started, release = Event(), Event()
        def old():
            started.set(); self.assertTrue(release.wait(3)); raise ValueError('old')
        with ThreadPoolExecutor(1) as pool:
            a=pool.submit(self.get,'a',old); self.assertTrue(started.wait(3))
            try: self.assertEqual(self.get('a',lambda:'new',fresh=True),'new')
            finally: release.set()
            with self.assertRaises(ValueError): a.result(3)
        self.assertEqual(self.get('a',lambda:'wrong'),'new')

    def test_inflight_registry_is_bounded_overflow_is_uncached(self):
        cache=DashboardReadCache(max_inflight=1)
        started, release=Event(),Event()
        def old():
            started.set(); self.assertTrue(release.wait(3)); return 1
        with ThreadPoolExecutor(1) as pool:
            a=pool.submit(cache.get,'a',old,ttl=30); self.assertTrue(started.wait(3))
            try:
                self.assertEqual(cache.get('b',lambda:2,ttl=30),2)
                self.assertEqual(cache.info()['inflight'],1)
                self.assertEqual(cache.info()['entries'],0)
            finally: release.set()
            a.result(3)
        self.assertEqual(cache.get('b',lambda:3,ttl=30),3)

    def test_payload_is_not_normalized(self):
        value={'latest':{'forecastVersionId':179,'versionNumber':1},'items':[
            {'monthStart':'2027-08-01','pmForecastAmount':0,'systemBaselineAmount':None},
            {'monthStart':'2027-09-01','pmForecastAmount':None,'foundationActualAmount':17.25},
        ],'needsRebalance':True}
        self.assertEqual(self.get('a',lambda:value),value)
        self.assertEqual(self.get('a',lambda:None),value)


if __name__ == '__main__': unittest.main()
