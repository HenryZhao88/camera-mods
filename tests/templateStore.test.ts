import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveTemplate, loadTemplates, clearTemplates, removeTemplate, exportTemplates, importTemplates,
} from '../src/gesture/templateStore';
import type { GestureTemplate } from '../src/types';

const mk = (effectId: string): GestureTemplate => ({
  kind: 'hand',
  effectId,
  landmarks: Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 })),
  handedness: 'Right',
  createdAt: '2026-06-08',
});

describe('templateStore', () => {
  beforeEach(() => clearTemplates());

  it('saves and loads a template', () => {
    saveTemplate(mk('a'));
    const all = loadTemplates();
    expect(all).toHaveLength(1);
    expect(all[0].effectId).toBe('a');
  });

  it('overwrites a template with the same effectId', () => {
    saveTemplate(mk('a'));
    saveTemplate(mk('a'));
    expect(loadTemplates()).toHaveLength(1);
  });

  it('round-trips through export/import', () => {
    saveTemplate(mk('a'));
    saveTemplate(mk('b'));
    const json = exportTemplates();
    clearTemplates();
    expect(loadTemplates()).toHaveLength(0);
    importTemplates(json);
    expect(loadTemplates().map(t => t.effectId).sort()).toEqual(['a', 'b']);
  });

  it('removes a single template by effectId, leaving others', () => {
    saveTemplate(mk('a'));
    saveTemplate(mk('b'));
    removeTemplate('a');
    expect(loadTemplates().map(t => t.effectId)).toEqual(['b']);
  });

  it('removeTemplate is a no-op when the effectId is absent', () => {
    saveTemplate(mk('a'));
    removeTemplate('zzz');
    expect(loadTemplates().map(t => t.effectId)).toEqual(['a']);
  });

  it('returns [] when storage is empty', () => {
    expect(loadTemplates()).toEqual([]);
  });
});

describe('templateStore v2', () => {
  const V1_KEY = 'cammods.templates';
  const V2_KEY = 'cammods.templates.v2';

  beforeEach(() => { localStorage.removeItem(V1_KEY); localStorage.removeItem(V2_KEY); });

  it('migrates v1 records to kind:"hand" and removes the old key', () => {
    const v1 = [{ effectId: 'fx', landmarks: [{ x: 0, y: 0, z: 0 }], handedness: 'Right', createdAt: 'now' }];
    localStorage.setItem(V1_KEY, JSON.stringify(v1));
    const out = loadTemplates();
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('hand');
    expect(localStorage.getItem(V1_KEY)).toBeNull();
    expect(localStorage.getItem(V2_KEY)).not.toBeNull();
  });

  it('round-trips two-hand and staged kinds', () => {
    const lm = [{ x: 0.1, y: 0.2, z: 0 }];
    saveTemplate({ kind: 'two-hand', effectId: 'beam', left: lm, right: lm, span: 1.4, createdAt: 'now' });
    saveTemplate({ kind: 'stages', effectId: 'gun', stages: [lm, lm], createdAt: 'now' });
    const kinds = loadTemplates().map(t => t.kind).sort();
    expect(kinds).toEqual(['stages', 'two-hand']);
  });

  it('one template per effectId regardless of kind', () => {
    const lm = [{ x: 0, y: 0, z: 0 }];
    saveTemplate({ kind: 'hand', effectId: 'fx', landmarks: lm, handedness: 'Right', createdAt: 'a' });
    saveTemplate({ kind: 'stages', effectId: 'fx', stages: [lm, lm], createdAt: 'b' });
    const all = loadTemplates().filter(t => t.effectId === 'fx');
    expect(all).toHaveLength(1);
    expect(all[0].kind).toBe('stages');
  });

  it('import wraps kindless entries as hand templates', () => {
    const json = JSON.stringify([
      { effectId: 'old', landmarks: [], handedness: 'Left', createdAt: 'x' },
      { kind: 'two-hand', effectId: 'beam', left: [], right: [], span: 1, createdAt: 'y' },
    ]);
    const out = importTemplates(json);
    expect(out[0].kind).toBe('hand');
    expect(out[1].kind).toBe('two-hand');
  });

  it('import rejects unknown kinds by name', () => {
    const json = JSON.stringify([{ kind: 'sorcery', effectId: 'z', createdAt: 'x' }]);
    expect(() => importTemplates(json)).toThrowError(/sorcery/);
  });
});
