export type EffectMode = 'hold' | 'toggle' | 'oneshot';

export interface DriverEffect {
  id: string;
  mode: EffectMode;
  start(): void;
  stop(): void;
}

export class EffectDriver {
  private wasActive = new Set<string>();

  constructor(private effects: DriverEffect[]) {}

  apply(fired: string[], active: Set<string>): void {
    for (const e of this.effects) {
      if (e.mode === 'hold') {
        const isNow = active.has(e.id);
        const was = this.wasActive.has(e.id);
        if (isNow && !was) e.start();
        if (!isNow && was) e.stop();
      } else if (fired.includes(e.id)) {
        e.start(); // oneshot + toggle both react to the edge fire
      }
    }
    this.wasActive = new Set(active);
  }
}
