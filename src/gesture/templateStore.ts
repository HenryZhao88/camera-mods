import type { GestureTemplate } from '../types';

const V1_KEY = 'cammods.templates';
const KEY = 'cammods.templates.v2';

const KINDS = new Set(['hand', 'two-hand', 'stages']);

// Wrap legacy kindless records; reject unknown kinds by name.
function upgrade(entry: Record<string, unknown>): GestureTemplate {
  if (entry.kind == null) return { kind: 'hand', ...entry } as GestureTemplate;
  if (!KINDS.has(entry.kind as string)) throw new Error(`unknown template kind: ${String(entry.kind)}`);
  return entry as unknown as GestureTemplate;
}

function write(all: GestureTemplate[]): void {
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function loadTemplates(): GestureTemplate[] {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(upgrade) : [];
    } catch {
      return [];
    }
  }
  // one-time migration from the v1 (kindless, one-hand-only) store
  const v1 = localStorage.getItem(V1_KEY);
  if (!v1) return [];
  try {
    const parsed = JSON.parse(v1);
    const migrated = Array.isArray(parsed) ? parsed.map(upgrade) : [];
    write(migrated);
    localStorage.removeItem(V1_KEY);
    return migrated;
  } catch {
    return [];
  }
}

export function saveTemplate(t: GestureTemplate): void {
  const all = loadTemplates().filter(x => x.effectId !== t.effectId);
  all.push(t);
  write(all);
}

export function removeTemplate(effectId: string): void {
  write(loadTemplates().filter(x => x.effectId !== effectId));
}

export function clearTemplates(): void {
  localStorage.removeItem(KEY);
  localStorage.removeItem(V1_KEY);
}

export function exportTemplates(): string {
  return JSON.stringify(loadTemplates(), null, 2);
}

export function importTemplates(json: string): GestureTemplate[] {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error('invalid templates file');
  const upgraded = parsed.map(upgrade);
  write(upgraded);
  return upgraded;
}
