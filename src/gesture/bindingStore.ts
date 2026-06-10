import type { GestureId } from './handGestures';

// Per-effect activation choice: a built-in preset (bindable effects), 'default'
// (self-driven effects' built-in trigger), or 'custom' (recorded gesture).
export type GestureChoice = GestureId | 'custom' | 'default';

const KEY = 'cammods.bindings';

export function loadChoices(): Record<string, GestureChoice> {
  const raw = localStorage.getItem(KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, GestureChoice>) : {};
  } catch {
    return {};
  }
}

export function saveChoice(effectId: string, choice: GestureChoice): void {
  const all = loadChoices();
  all[effectId] = choice;
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function getChoice(effectId: string, fallback: GestureChoice): GestureChoice {
  return loadChoices()[effectId] ?? fallback;
}
