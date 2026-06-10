// Node 25 ships a stub globalThis.localStorage with no methods.
// jsdom does NOT override it because the key already exists.
// Replace it with a functional in-memory implementation before any test runs.
(function patchLocalStorage() {
  const hasRealLS =
    typeof localStorage !== 'undefined' &&
    typeof (localStorage as Storage).setItem === 'function';
  if (hasRealLS) return;

  const store: Record<string, string> = {};
  const fake: Storage = {
    getItem: (key: string) => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    get length() { return Object.keys(store).length; },
    key: (n: number) => Object.keys(store)[n] ?? null,
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: fake });
})();

// jsdom has no canvas implementation; pixi probes getContext at import time and
// GlitchFilter draws its displacement map through a 2D context. A no-op 2D mock
// keeps both quiet and lets filter rigs construct under jsdom. (WebGL stays null —
// nothing in unit tests may render.)
if (typeof HTMLCanvasElement !== 'undefined') {
  const noop2d = () =>
    new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === 'canvas') return undefined;
          // gradients etc. also need method-bearing objects
          return typeof prop === 'string' ? () => noop2dValue : undefined;
        },
        set: () => true,
      },
    );
  const noop2dValue = new Proxy(function () {} as unknown as object, {
    get: () => () => noop2dValue,
    apply: () => noop2dValue,
  });
  HTMLCanvasElement.prototype.getContext = function (kind: string) {
    return kind === '2d' ? (noop2d() as unknown as CanvasRenderingContext2D) : null;
  } as typeof HTMLCanvasElement.prototype.getContext;
}
