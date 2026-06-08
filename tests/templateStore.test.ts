import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveTemplate, loadTemplates, clearTemplates, removeTemplate, exportTemplates, importTemplates,
} from '../src/gesture/templateStore';
import type { GestureTemplate } from '../src/types';

const mk = (effectId: string): GestureTemplate => ({
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
