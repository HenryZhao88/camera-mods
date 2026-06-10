import { describe, it, expect } from 'vitest';
import { Application, Container, Graphics, Sprite, Texture, ColorMatrixFilter } from 'pixi.js';
import {
  GlitchFilter, RGBSplitFilter, CRTFilter, AdvancedBloomFilter,
  GlowFilter, ShockwaveFilter, ZoomBlurFilter,
} from 'pixi-filters';

describe('pixi dependencies', () => {
  it('exports every class the cinematic stack uses', () => {
    for (const C of [Application, Container, Graphics, Sprite, ColorMatrixFilter,
      GlitchFilter, RGBSplitFilter, CRTFilter, AdvancedBloomFilter,
      GlowFilter, ShockwaveFilter, ZoomBlurFilter]) {
      expect(typeof C).toBe('function');
    }
    expect(Texture.WHITE).toBeDefined();
  });

  it('can construct display objects without a renderer (jsdom-safe)', () => {
    const c = new Container();
    c.addChild(new Graphics());
    c.addChild(new Sprite(Texture.WHITE));
    expect(c.children.length).toBe(2);
  });
});
