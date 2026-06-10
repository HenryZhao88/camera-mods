// Pure finger-gun trigger logic for ONE hand (the effect keeps one core per hand).
// Cock with thumb up; dropping the thumb fires if cocked and off cooldown.
// If the cooldown blocks a fire, the hammer STAYS cocked (matches v1 behavior)
// so the shot happens as soon as the cooldown expires.
const COOLDOWN_MS = 350;

export interface GunPose { isGun: boolean; thumbUp: boolean; }

export class GunCore {
  private cocked = false;
  private lastShot = -Infinity;

  step(pose: GunPose | null, now: number): boolean {
    if (!pose || !pose.isGun) { this.cocked = false; return false; }
    if (pose.thumbUp) { this.cocked = true; return false; }
    if (this.cocked && now - this.lastShot >= COOLDOWN_MS) {
      this.cocked = false;
      this.lastShot = now;
      return true;
    }
    return false;
  }

  reset(): void { this.cocked = false; }
}
