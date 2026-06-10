import { describe, it, expect } from 'vitest';
import { SCREEN_FILTERS, buildFilterRig } from '../../src/filters';

describe('filter registry', () => {
  it('lists none/glitch/crt/cyberpunk in dropdown order', () => {
    expect(SCREEN_FILTERS.map(f => f.id)).toEqual(['none', 'glitch', 'crt', 'cyberpunk']);
  });

  it('builds a live rig for every non-none filter', () => {
    for (const { id } of SCREEN_FILTERS) {
      const rig = buildFilterRig(id);
      if (id === 'none') {
        expect(rig).toBeNull();
      } else {
        expect(rig).not.toBeNull();
        expect(rig!.filters.length).toBeGreaterThan(0);
        rig!.update(1 / 60, 0.5); // animator must not throw
        rig!.destroy();
      }
    }
  });
});
