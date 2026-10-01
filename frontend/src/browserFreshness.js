// Request sequencing only. Data remains owned by the screen and SQL/API.
// No localStorage, business calculations, cache of response bodies, or writes.
export const FRESHNESS_MAX_AGE_MS = 30_000;
export const VISIBLE_REFRESH_INTERVAL_MS = 60_000;
export const PASSIVE_READ_HEADER = 'X-Riggs-Passive-Read';

export function freshReadPath(path, fresh = false) {
  if (!fresh) return path;
  const [pathname, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  params.set('fresh', 'true');
  return `${pathname}?${params}`;
}

export function readOptions({ signal, passive = false } = {}) {
  return {
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
    ...(passive ? { headers: { [PASSIVE_READ_HEADER]: '1' } } : {}),
  };
}

export function createLatestRead({ read, publish, failed = () => {}, now = Date.now }) {
  let generation = 0;
  let flight = null;
  let lastSuccess = null;

  function cancel() {
    generation += 1;
    flight?.controller.abort();
    flight = null;
  }

  function load({ replace = false, maxAgeMs = 0, ...options } = {}) {
    if (replace) cancel();
    if (flight) return flight.promise;
    if (lastSuccess !== null && maxAgeMs > 0 && now() - lastSuccess < maxAgeMs) {
      return Promise.resolve({ status: 'recent' });
    }
    const token = ++generation;
    const controller = new AbortController();
    const current = { controller, promise: null };
    flight = current;
    current.promise = Promise.resolve().then(() => read({ ...options, signal: controller.signal }))
      .then(value => {
        if (token !== generation || controller.signal.aborted) return { status: 'superseded' };
        // A screen may decline publication if an edit began during the read.
        if (publish(value, options) === false) return { status: 'deferred' };
        lastSuccess = now();
        return { status: 'published' };
      })
      .catch(error => {
        if (token !== generation || controller.signal.aborted || error?.name === 'AbortError') {
          return { status: 'superseded' };
        }
        failed(error, options);
        return { status: 'failed', error };
      })
      .finally(() => {
        if (flight === current) flight = null;
      });
    return current.promise;
  }

  return { load, cancel, reset() { cancel(); lastSuccess = null; },
    get lastSuccessAt() { return lastSuccess; }, get pending() { return flight !== null; } };
}

// Timers never run reads in hidden tabs. Focus/visibility/pageshow are coalesced
// by the same latest-read owner; maxAgeMs prevents rapid focus churn.
export function watchVisibleReads(refresh, {
  windowTarget = window,
  documentTarget = document,
  intervalMs = VISIBLE_REFRESH_INTERVAL_MS,
  allowed = () => true,
} = {}) {
  let stopped = false;
  const check = () => {
    if (!stopped && documentTarget.visibilityState === 'visible' && allowed()) {
      void refresh({ passive: true, maxAgeMs: FRESHNESS_MAX_AGE_MS });
    }
  };
  const timer = windowTarget.setInterval(check, intervalMs);
  windowTarget.addEventListener('focus', check);
  windowTarget.addEventListener('pageshow', check);
  documentTarget.addEventListener('visibilitychange', check);
  check();
  return () => {
    stopped = true;
    windowTarget.clearInterval(timer);
    windowTarget.removeEventListener('focus', check);
    windowTarget.removeEventListener('pageshow', check);
    documentTarget.removeEventListener('visibilitychange', check);
  };
}
