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
// jsdom prints a noisy "Not implemented" error for every test file that imports
// pixi. Returning null matches jsdom's actual behavior, minus the noise.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
}
