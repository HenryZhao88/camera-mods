import { describe, it, expect, beforeEach } from 'vitest';
import { loadChoices, saveChoice, getChoice } from '../src/gesture/bindingStore';

describe('bindingStore', () => {
  beforeEach(() => localStorage.removeItem('cammods.bindings'));

  it('returns {} when nothing is saved', () => {
    expect(loadChoices()).toEqual({});
  });

  it('saves and reads a choice per effect', () => {
    saveChoice('lightning', 'peace');
    saveChoice('blast', 'custom');
    expect(getChoice('lightning', 'open')).toBe('peace');
    expect(getChoice('blast', 'open')).toBe('custom');
  });

  it('falls back when an effect has no saved choice', () => {
    expect(getChoice('draw', 'pinch')).toBe('pinch');
  });

  it('overwrites an existing choice', () => {
    saveChoice('lightning', 'peace');
    saveChoice('lightning', 'fist');
    expect(getChoice('lightning', 'open')).toBe('fist');
  });
});
