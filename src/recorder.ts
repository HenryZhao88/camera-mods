import { CaptureAccumulator, type StageCapture } from './gesture/capture';
import { landmarkDistance } from './gesture/distance';
import type { GestureTemplate, HandResult } from './types';

export interface RecordStage {
  prompt: string;
  handsNeeded: 1 | 2;
}

export interface RecordFlow {
  effectId: string;
  title: string;
  stages: RecordStage[];
  build(captures: StageCapture[]): GestureTemplate;
  validate?(captures: StageCapture[]): string | null;
}

const FRAMES_NEEDED = 12;
const STAGE_TIMEOUT_MS = 6000;
const COUNTDOWN_FROM = 3;

function el<T extends HTMLElement>(root: HTMLElement, sel: string): T {
  const found = root.querySelector<T>(sel);
  if (!found) throw new Error(`recorder: missing ${sel}`);
  return found;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// Guided recording overlay. The compositor keeps running; main.ts feeds every
// frame's hand results into feedHands(), and the wizard samples them on its own
// rAF — there is never a second MediaPipe consumer.
export class RecorderWizard {
  private root = document.getElementById('recorder') as HTMLDivElement;
  private title = el<HTMLDivElement>(this.root, '.r-title');
  private step = el<HTMLDivElement>(this.root, '.r-step');
  private prompt = el<HTMLDivElement>(this.root, '.r-prompt');
  private count = el<HTMLDivElement>(this.root, '.r-count');
  private ring = el<HTMLDivElement>(this.root, '.r-ring');
  private msg = el<HTMLDivElement>(this.root, '.r-msg');
  private retryBtn = el<HTMLButtonElement>(this.root, '.r-retry');
  private cancelBtn = el<HTMLButtonElement>(this.root, '.r-cancel');

  private hands: HandResult[] = [];
  private open = false;
  private cancelled = false;

  feedHands(h: HandResult[]): void { this.hands = h; }
  get isOpen(): boolean { return this.open; }

  // Returns the built template, or null if the user cancelled.
  async run(flow: RecordFlow): Promise<GestureTemplate | null> {
    if (this.open) return null;
    this.open = true;
    this.cancelled = false;
    this.root.classList.remove('hidden');
    this.title.textContent = flow.title;

    const onCancel = () => { this.cancelled = true; };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') this.cancelled = true; };
    this.cancelBtn.onclick = onCancel;
    window.addEventListener('keydown', onKey);

    try {
      const captures: StageCapture[] = [];
      for (let s = 0; s < flow.stages.length; s++) {
        const cap = await this.runStage(flow.stages[s], s, flow.stages.length);
        if (!cap) return null; // cancelled
        captures.push(cap);
      }

      const problem = flow.validate?.(captures);
      if (problem) {
        this.msg.textContent = problem;
        this.msg.style.color = '#ff9d9d';
        await sleep(2200);
        return null;
      }

      this.showSaved();
      await sleep(900);
      return flow.build(captures);
    } finally {
      window.removeEventListener('keydown', onKey);
      this.root.classList.add('hidden');
      this.open = false;
    }
  }

  // One stage: countdown -> capture (with retry-on-timeout loop). Null = cancelled.
  private async runStage(stage: RecordStage, idx: number, total: number): Promise<StageCapture | null> {
    for (;;) {
      this.step.textContent = total > 1 ? `step ${idx + 1} of ${total}` : '';
      this.prompt.textContent = stage.prompt;
      this.msg.textContent = '';
      this.msg.style.color = '';
      this.retryBtn.classList.add('hidden');
      this.ring.classList.add('hidden');

      // countdown
      this.count.classList.remove('hidden');
      for (let n = COUNTDOWN_FROM; n >= 1; n--) {
        if (this.cancelled) return null;
        this.count.textContent = String(n);
        await sleep(1000);
      }
      this.count.classList.add('hidden');

      // capture
      this.ring.classList.remove('hidden');
      const acc = new CaptureAccumulator(stage.handsNeeded);
      const t0 = performance.now();
      while (acc.count < FRAMES_NEEDED) {
        if (this.cancelled) return null;
        if (performance.now() - t0 > STAGE_TIMEOUT_MS) break;
        acc.add(this.hands);
        this.ring.style.setProperty('--p', String((acc.count / FRAMES_NEEDED) * 100));
        await new Promise(requestAnimationFrame);
      }
      this.ring.classList.add('hidden');

      if (acc.count >= FRAMES_NEEDED) return acc.finish();

      // timeout: offer retry / cancel
      this.msg.textContent = stage.handsNeeded === 2
        ? "Couldn't see both hands — get them in frame and retry"
        : "Couldn't see your hand — try again";
      this.retryBtn.classList.remove('hidden');
      const retry = await new Promise<boolean>(resolve => {
        this.retryBtn.onclick = () => resolve(true);
        const poll = () => {
          if (this.cancelled) return resolve(false);
          setTimeout(poll, 100);
        };
        poll();
      });
      this.retryBtn.onclick = null;
      if (!retry) return null;
    }
  }

  private showSaved(): void {
    this.step.textContent = '';
    this.prompt.textContent = 'Saved — try it!';
    this.msg.textContent = '';
    this.msg.style.color = '#7dffb2';
  }
}

// ---- flow definitions ----

export function singlePoseFlow(effectId: string, name: string): RecordFlow {
  return {
    effectId,
    title: `Record: ${name}`,
    stages: [{ prompt: 'Hold your pose', handsNeeded: 1 }],
    build: ([cap]) => ({
      kind: 'hand',
      effectId,
      landmarks: cap.hands[0],
      handedness: 'Right',
      createdAt: new Date().toISOString(),
    }),
  };
}

export function gunFlow(): RecordFlow {
  return {
    effectId: 'gun-shot',
    title: 'Record: Finger Gun trigger',
    stages: [
      { prompt: 'Hold your READY pose (the "cocked" position)', handsNeeded: 1 },
      { prompt: 'Now hold your FIRE pose', handsNeeded: 1 },
    ],
    build: ([ready, fire]) => ({
      kind: 'stages',
      effectId: 'gun-shot',
      stages: [ready.hands[0], fire.hands[0]],
      createdAt: new Date().toISOString(),
    }),
    validate: ([ready, fire]) => {
      // near-identical stages would make the trigger machine-gun
      return landmarkDistance(ready.hands[0], fire.hands[0]) < 0.35
        ? 'Those two poses look the same — record two clearly different poses'
        : null;
    },
  };
}

export function beamFlow(): RecordFlow {
  return {
    effectId: 'energy-beam',
    title: 'Record: Kamehameha charge pose',
    stages: [{ prompt: 'Hold your CHARGE pose with both hands', handsNeeded: 2 }],
    build: ([cap]) => ({
      kind: 'two-hand',
      effectId: 'energy-beam',
      left: cap.hands[0],
      right: cap.hands[1],
      span: cap.span ?? 1,
      createdAt: new Date().toISOString(),
    }),
  };
}
