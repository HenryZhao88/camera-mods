// Pure Domain Expansion state machine. The effect feeds it one signHeld sample
// per frame; collapse() is called by the X key / Collapse button. All tuning
// constants live here.
export type DomainState = 'idle' | 'arming' | 'casting' | 'active' | 'collapsing' | 'cooldown';

export interface DomainEvents { slammed?: boolean; }

const ARM_S = 0.6;          // sign hold time to begin the cast
const ARM_DECAY_MULT = 2;   // arm decay speed vs growth when the sign breaks
const CAST_S = 1.4;         // full cast duration
const SLAM_AT = 0.5;        // slam moment within the cast
const COLLAPSE_S = 0.8;
const COOLDOWN_S = 1.0;

export class DomainCore {
  state: DomainState = 'idle';
  arm = 0;   // 0..1 while arming
  t = 0;     // seconds within casting/collapsing/cooldown
  private slamFired = false;

  step(signHeld: boolean, dt: number): DomainEvents {
    const ev: DomainEvents = {};

    switch (this.state) {
      case 'idle':
        if (signHeld) { this.state = 'arming'; this.arm = 0; }
        break;

      case 'arming':
        if (signHeld) this.arm = Math.min(1, this.arm + dt / ARM_S);
        else this.arm = Math.max(0, this.arm - (dt / ARM_S) * ARM_DECAY_MULT);
        if (this.arm >= 1) { this.state = 'casting'; this.t = 0; this.slamFired = false; }
        else if (this.arm === 0 && !signHeld) this.state = 'idle';
        break;

      case 'casting': // sign state ignored: the cast completes regardless
        this.t += dt;
        if (!this.slamFired && this.t >= SLAM_AT) { this.slamFired = true; ev.slammed = true; }
        if (this.t >= CAST_S) { this.state = 'active'; this.t = 0; }
        break;

      case 'active':
        // no autonomous transitions — collapse() handles the exit synchronously
        break;

      case 'collapsing':
        this.t += dt;
        if (this.t >= COLLAPSE_S) { this.state = 'cooldown'; this.t = 0; }
        break;

      case 'cooldown':
        this.t += dt;
        if (this.t >= COOLDOWN_S) { this.state = 'idle'; this.arm = 0; }
        break;
    }
    return ev;
  }

  // Synchronously begin collapsing; call site is responsible for triggering sfx.
  // No-op outside the active state.
  collapse(): void {
    if (this.state === 'active') {
      this.state = 'collapsing';
      this.t = 0;
    }
  }

  // Single source of truth for the bleed: 0 closed, 1 fully expanded.
  get progress(): number {
    switch (this.state) {
      case 'casting': return Math.max(0, Math.min(1, (this.t - SLAM_AT) / (CAST_S - SLAM_AT)));
      case 'active': return 1;
      case 'collapsing': return Math.max(0, 1 - this.t / COLLAPSE_S);
      default: return 0;
    }
  }

  reset(): void {
    this.state = 'idle';
    this.arm = 0;
    this.t = 0;
    this.slamFired = false;
  }
}
