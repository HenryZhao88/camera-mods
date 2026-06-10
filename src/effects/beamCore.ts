// Pure Kamehameha state machine: idle -> charging -> firing -> cooldown.
// The effect feeds it one BeamFrame per video frame (or null when hands are
// missing/not in pose); all tuning constants live here.
export type BeamState = 'idle' | 'charging' | 'firing' | 'cooldown';

export interface BeamFrame {
  palmsTogether: boolean;  // both hands open-ish + wrists close
  avgHandScale: number;    // average wrist->middle-MCP distance (normalized units)
  midX: number;            // hands midpoint, normalized 0..1
  midY: number;
}

export interface BeamEvents { fired?: boolean; fizzled?: boolean; }

const CHARGE_S = 1.2;          // 0 -> 1 charge time
const DRAIN_MULT = 2;          // drain speed vs charge speed
const FIRE_S = 1.4;            // firing duration
const COOLDOWN_S = 0.8;
const THRUST_WINDOW_MS = 240;  // scale samples considered for the thrust
const THRUST_RATIO = 1.18;     // >=18% scale growth = thrust
const THRUST_RATIO_FULL = 1.08;
const MIN_CHARGE = 0.35;
const FIZZLE_CHARGE = 0.3;     // losing more than this much charge emits a fizzle
// Palms pressed together occlude each other, so MediaPipe constantly drops one
// hand for a few frames mid-charge. Hold the charge (and the thrust buffer)
// through dropouts this long before starting to drain.
const GRACE_S = 0.35;

export class BeamCore {
  state: BeamState = 'idle';
  charge = 0;       // 0..1
  fireT = 0;        // seconds into firing
  originX = 0.5;    // captured at fire start (normalized)
  originY = 0.5;
  private scales: Array<{ t: number; s: number }> = [];
  private chargePeak = 0;
  private grace = 0;

  step(frame: BeamFrame | null, dt: number, nowMs: number): BeamEvents {
    const ev: BeamEvents = {};

    if (this.state === 'firing') {
      this.fireT += dt;
      if (this.fireT >= FIRE_S) { this.state = 'cooldown'; this.fireT = 0; }
      return ev;
    }
    if (this.state === 'cooldown') {
      this.fireT += dt;
      if (this.fireT >= COOLDOWN_S) { this.state = 'idle'; this.fireT = 0; }
      return ev;
    }

    if (frame?.palmsTogether) {
      this.state = 'charging';
      this.grace = GRACE_S;
      this.charge = Math.min(1, this.charge + dt / CHARGE_S);
      this.chargePeak = Math.max(this.chargePeak, this.charge);

      this.scales.push({ t: nowMs, s: frame.avgHandScale });
      this.scales = this.scales.filter(e => nowMs - e.t <= THRUST_WINDOW_MS);
      const oldest = this.scales[0];
      const ratio = oldest && oldest.s > 0 ? frame.avgHandScale / oldest.s : 1;
      const needed = this.charge >= 1 ? THRUST_RATIO_FULL : THRUST_RATIO;
      if (this.charge >= MIN_CHARGE && ratio >= needed) {
        this.state = 'firing';
        this.fireT = 0;
        this.originX = frame.midX;
        this.originY = frame.midY;
        this.charge = 0;
        this.chargePeak = 0;
        this.scales = [];
        ev.fired = true;
      }
    } else if (this.state === 'charging' && this.grace > 0) {
      // Brief dropout/pose flake: hold the charge and keep the (time-pruned)
      // thrust buffer so a push that straddles the dropout still fires.
      this.grace -= dt;
      this.scales = this.scales.filter(e => nowMs - e.t <= THRUST_WINDOW_MS);
    } else {
      this.charge = Math.max(0, this.charge - (dt / CHARGE_S) * DRAIN_MULT);
      this.scales = [];
      if (this.charge === 0 && this.state === 'charging') {
        if (this.chargePeak > FIZZLE_CHARGE) ev.fizzled = true;
        this.chargePeak = 0;
        this.state = 'idle';
      }
    }
    return ev;
  }

  reset(): void {
    this.state = 'idle';
    this.charge = 0;
    this.fireT = 0;
    this.scales = [];
    this.chargePeak = 0;
    this.grace = 0;
  }
}
