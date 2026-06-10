import type { Container, Filter } from 'pixi.js';

// Pixi v8 stores container filters as a readonly array (or null) — these helpers
// let multiple owners (dim grade, transient shockwaves) add/remove independently.
export function addFilter(c: Container, f: Filter): void {
  const cur = (c.filters as Filter[] | undefined) ?? [];
  c.filters = [...cur, f];
}

export function removeFilter(c: Container, f: Filter): void {
  const cur = (c.filters as Filter[] | undefined) ?? [];
  c.filters = cur.filter(x => x !== f);
}
