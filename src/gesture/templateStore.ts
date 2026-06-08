import type { GestureTemplate } from '../types';

const KEY = 'cammods.templates';

export function loadTemplates(): GestureTemplate[] {
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GestureTemplate[]) : [];
  } catch {
    return [];
  }
}

export function saveTemplate(t: GestureTemplate): void {
  const all = loadTemplates().filter(x => x.effectId !== t.effectId);
  all.push(t);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function clearTemplates(): void {
  localStorage.removeItem(KEY);
}

export function exportTemplates(): string {
  return JSON.stringify(loadTemplates(), null, 2);
}

export function importTemplates(json: string): GestureTemplate[] {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error('invalid templates file');
  localStorage.setItem(KEY, JSON.stringify(parsed));
  return parsed as GestureTemplate[];
}
