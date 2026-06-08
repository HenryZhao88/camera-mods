// Per-effect on/off state, persisted so it survives restarts.
const KEY = 'cammods.enabled';

export function loadEnabled(): Record<string, boolean> {
  const raw = localStorage.getItem(KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function isEnabled(effectId: string, fallback: boolean): boolean {
  const v = loadEnabled()[effectId];
  return v === undefined ? fallback : v;
}

export function setEnabled(effectId: string, value: boolean): void {
  const all = loadEnabled();
  all[effectId] = value;
  localStorage.setItem(KEY, JSON.stringify(all));
}
