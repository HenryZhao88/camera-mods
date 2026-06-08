import { describe, it, expect, beforeEach } from 'vitest';
import { loadEnabled, isEnabled, setEnabled } from '../src/gesture/enabledStore';

describe('enabledStore', () => {
  beforeEach(() => localStorage.removeItem('cammods.enabled'));

  it('returns {} when nothing is saved', () => {
    expect(loadEnabled()).toEqual({});
  });

  it('uses the fallback when an effect has no saved state', () => {
    expect(isEnabled('lightning', true)).toBe(true);
    expect(isEnabled('fire-breath', false)).toBe(false);
  });

  it('saves and reads per-effect state', () => {
    setEnabled('lightning', false);
    setEnabled('fire-breath', true);
    expect(isEnabled('lightning', true)).toBe(false);
    expect(isEnabled('fire-breath', false)).toBe(true);
  });

  it('overwrites an existing value', () => {
    setEnabled('blast', false);
    setEnabled('blast', true);
    expect(isEnabled('blast', false)).toBe(true);
  });
});
