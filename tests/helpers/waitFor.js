// Controllers intentionally fire-and-forget notify()/push() calls (not awaited,
// to keep the HTTP response fast). Tests asserting on their DB side effect must
// tolerate a short delay rather than racing the write — poll instead of reading once.
// `predicate` decides when `fn`'s result is ready — an empty array is truthy in
// JS, so a naive `if (result)` check would return on the very first (empty) read.
export const waitFor = async (fn, predicate = (r) => !!r, { timeout = 2000, interval = 20 } = {}) => {
  const start = Date.now();
  for (;;) {
    const result = await fn();
    if (predicate(result)) return result;
    if (Date.now() - start > timeout) return result;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
};
