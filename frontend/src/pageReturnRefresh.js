// Revalidate a visible page on return without launching a global cache rebuild.
// Rapid back-and-forth navigation is coalesced into one recent successful read.
// An invalidated or absent snapshot is never considered recent.
export const PAGE_RETURN_RECHECK_MS = 20_000;

export function shouldRevalidateOnReturn({loadedAt = 0, hasData = false} = {},
  now = Date.now(), minimumAgeMs = PAGE_RETURN_RECHECK_MS) {
  if (!hasData || !Number.isFinite(loadedAt) || loadedAt <= 0 || now < loadedAt) {
    return true;
  }
  return now - loadedAt >= minimumAgeMs;
}
