// Every outbound network call (Yoco refund, and anything Resend's SDK makes)
// is routed through this so tests never touch the real internet. Default
// handler is a generic success — override per-test with setFetchHandler for
// paths that need a specific response (e.g. Yoco refund success/failure).
const originalFetch = globalThis.fetch;

const defaultHandler = async () => ({
  ok: true,
  status: 200,
  json: async () => ({}),
});

let handler = defaultHandler;

export const installFetchMock = () => {
  globalThis.fetch = (...args) => handler(...args);
};

export const restoreFetch = () => {
  globalThis.fetch = originalFetch;
};

export const setFetchHandler = (fn) => {
  handler = fn;
};

export const resetFetchHandler = () => {
  handler = defaultHandler;
};
