import { Camera } from './camera';
import { HandTracker } from './handTracker';
import { FaceTracker } from './faceTracker';
import { GestureEngine } from './gesture/gestureEngine';
import {
  loadTemplates, removeTemplate, clearTemplates, exportTemplates, importTemplates,
} from './gesture/templateStore';
import { Compositor } from './compositor';
import { calibrate, countdown } from './calibration';
import { FingertipLightning } from './effects/fingertipLightning';
import { DimLights } from './effects/dimLights';
import { PalmBlast } from './effects/palmBlast';
import { PinchDraw } from './effects/pinchDraw';
import { FireBreath } from './effects/fireBreath';
import type { Effect } from './types';

// ---- elements ----
const canvas = document.getElementById('view') as HTMLCanvasElement;
const idle = document.getElementById('idle') as HTMLDivElement;
const cardsEl = document.getElementById('cards') as HTMLDivElement;
const globalsEl = document.getElementById('globals') as HTMLDivElement;
const hintEl = document.getElementById('hint') as HTMLDivElement;
const liveDot = document.getElementById('livedot') as HTMLSpanElement;
const stateEl = document.getElementById('state') as HTMLSpanElement;
const fpsEl = document.getElementById('fps') as HTMLSpanElement;
const showPoints = document.getElementById('showpoints') as HTMLInputElement;

// ---- engine + effects ----
const camera = new Camera();
const tracker = new HandTracker();
const faceTracker = new FaceTracker();
const pinch = new PinchDraw();
const dim = new DimLights();
const lightning = new FingertipLightning();
const blast = new PalmBlast();
const fire = new FireBreath();
let faceReady = false;

// Render order (back to front): dim darkens first, glowing effects layer on top.
const effects: Effect[] = [dim, lightning, blast, fire, pinch];
const engine = new GestureEngine(loadTemplates(), { defaultThreshold: 0.6, cooldownMs: 800 });
let compositor: Compositor | null = null;
let running = false;

interface CardDef {
  id: string;
  icon: string;
  name: string;
  color: string;
  desc: string;
  calibratable: boolean;
  extra?: () => HTMLElement; // optional extra control (clear lines / enable toggle)
}

const CARDS: CardDef[] = [
  {
    id: 'fingertip-lightning', icon: '⚡', name: 'Lightning', color: '#7df9ff',
    desc: 'Sparks stream from your fingertips <b>while you hold</b> the gesture.',
    calibratable: true,
  },
  {
    id: 'palm-blast', icon: '💥', name: 'Blast', color: '#ffd27d',
    desc: 'A shockwave + flash <b>fires once</b> each time you make the gesture.',
    calibratable: true,
  },
  {
    id: 'pinch-draw', icon: '✏️', name: 'Draw', color: '#39ff14',
    desc: 'Hold the gesture to <b>draw neon lines</b> that follow your finger.',
    calibratable: true,
    extra: () => button('🧽 Clear lines', () => pinch.clear()),
  },
  {
    id: 'dim-lights', icon: '🌙', name: 'Dim', color: '#8aa0ff',
    desc: 'Automatic — close into a <b>fist</b> to slowly dim the room, open your <b>hand</b> to fade it back up.',
    calibratable: false,
    extra: dimToggle,
  },
  {
    id: 'fire-breath', icon: '🔥', name: 'Fire Breath', color: '#ff7a18',
    desc: 'Automatic — <b>open your mouth wide</b> and breathe a stream of fire in the direction you face. Uses face tracking.',
    calibratable: false,
    extra: fireToggle,
  },
];

const cardEls = new Map<string, HTMLDivElement>();
const flashUntil = new Map<string, number>(); // effectId -> ms, for one-shot highlight
const sensitivity = new Map<string, number>(); // effectId -> threshold, survives re-renders
const DEFAULT_THRESHOLD = 0.6;

// ---- helpers ----
function setState(text: string) { stateEl.textContent = text; }

function isSet(effectId: string): boolean {
  return loadTemplates().some(t => t.effectId === effectId);
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  b.onclick = onClick;
  return b;
}

function dimToggle(): HTMLElement {
  const label = document.createElement('label');
  label.className = 'toggle';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = dim.enabled;
  input.onchange = () => { dim.enabled = input.checked; };
  label.append(input, document.createTextNode('Enabled'));
  return label;
}

function fireToggle(): HTMLElement {
  const label = document.createElement('label');
  label.className = 'toggle';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = fire.enabled;
  input.onchange = async () => {
    fire.enabled = input.checked;
    if (input.checked && running) {
      const ok = await ensureFace();
      if (compositor) compositor.trackFace = ok;
      if (!ok) { fire.enabled = false; input.checked = false; }
    } else if (!input.checked && compositor) {
      compositor.trackFace = false;
    }
  };
  label.append(input, document.createTextNode('Enabled'));
  return label;
}

// Lazily load the face model the first time fire is needed.
async function ensureFace(): Promise<boolean> {
  if (faceReady) return true;
  setState('loading face model…');
  try {
    await faceTracker.init();
    faceReady = true;
    setState('live');
    return true;
  } catch {
    setState('face model failed to load');
    return false;
  }
}

// ---- card rendering ----
function renderCards() {
  cardsEl.innerHTML = '';
  cardEls.clear();

  for (const def of CARDS) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.setProperty('--c', def.color);
    cardEls.set(def.id, card);

    const top = document.createElement('div');
    top.className = 'top';
    const icon = document.createElement('span'); icon.className = 'icon'; icon.textContent = def.icon;
    const name = document.createElement('span'); name.className = 'name'; name.textContent = def.name;
    const badge = document.createElement('span'); badge.className = 'badge';
    if (!def.calibratable) { badge.classList.add('auto'); badge.textContent = 'auto'; }
    else if (isSet(def.id)) { badge.classList.add('set'); badge.textContent = 'set ✓'; }
    else { badge.textContent = 'not set'; }
    top.append(icon, name, badge);

    const desc = document.createElement('div');
    desc.className = 'desc';
    desc.innerHTML = def.desc;

    card.append(top, desc);

    if (def.calibratable) {
      const set = isSet(def.id);
      const row = document.createElement('div');
      row.className = 'row';
      const cal = button(set ? '↻ Recalibrate' : '🎯 Calibrate', () => calibrateEffect(def.id));
      cal.className = 'primary';
      const clr = button('✕', () => clearEffect(def.id));
      clr.className = 'icon-btn';
      clr.title = 'Clear this gesture';
      clr.disabled = !set;
      row.append(cal, clr);
      if (def.extra) row.append(def.extra());
      card.append(row);

      // per-gesture sensitivity
      const sens = document.createElement('div');
      sens.className = 'sens';
      const slider = document.createElement('input');
      slider.type = 'range'; slider.min = '0.2'; slider.max = '1.2'; slider.step = '0.05';
      slider.value = String(sensitivity.get(def.id) ?? DEFAULT_THRESHOLD);
      slider.oninput = () => {
        const v = parseFloat(slider.value);
        sensitivity.set(def.id, v);
        engine.setThreshold(def.id, v);
      };
      sens.append(document.createTextNode('strict'), slider, document.createTextNode('loose'));
      card.append(sens);
    } else if (def.extra) {
      const row = document.createElement('div');
      row.className = 'row';
      row.append(def.extra());
      card.append(row);
    }
  }
}

// ---- actions ----
async function calibrateEffect(effectId: string) {
  if (!running) { setState('press start first'); return; }
  compositor?.stop();
  try {
    for (let n = 3; n >= 1; n--) {
      setState(`calibrating in ${n}…`);
      await countdown(1, () => {});
    }
    setState('hold your symbol…');
    await calibrate(effectId, camera, tracker);
    engine.setTemplates(loadTemplates());
    setState('saved ✓');
  } catch (err) {
    setState((err as Error).message);
  } finally {
    renderCards();
    compositor?.start();
  }
}

function clearEffect(effectId: string) {
  removeTemplate(effectId);
  engine.setTemplates(loadTemplates());
  renderCards();
  setState('cleared');
}

function clearAll() {
  if (loadTemplates().length === 0) { setState('nothing to clear'); return; }
  clearTemplates();
  engine.setTemplates([]);
  renderCards();
  setState('all gestures cleared');
}

function doExport() {
  const blob = new Blob([exportTemplates()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'cammods-gestures.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function doImport(file: File) {
  file.text().then(txt => {
    try {
      importTemplates(txt);
      engine.setTemplates(loadTemplates());
      renderCards();
      setState('gestures imported');
    } catch (err) {
      setState(`import failed: ${(err as Error).message}`);
    }
  });
}

// ---- start / stop ----
let lastFrameTime = 0;
let fpsAvg = 0;

async function start() {
  try {
    setState('starting camera…');
    await camera.start();
    setState('loading hand model…');
    await tracker.init();
    compositor = new Compositor(canvas, camera, tracker, faceTracker, engine, effects, {
      onFrame: (hand, _scores, fired, active) => {
        const now = performance.now();
        if (lastFrameTime) {
          const fps = 1000 / (now - lastFrameTime);
          fpsAvg = fpsAvg ? fpsAvg * 0.9 + fps * 0.1 : fps;
          fpsEl.textContent = `${Math.round(fpsAvg)} fps`;
        }
        lastFrameTime = now;

        for (const id of fired) flashUntil.set(id, now + 450);
        for (const [id, el] of cardEls) {
          const lit =
            active.has(id) ||
            (flashUntil.get(id) ?? 0) > now ||
            (id === 'dim-lights' && dim.isActive());
          el.classList.toggle('active', lit);
        }
        setState(hand ? 'hand detected' : 'show your hand');
      },
    });
    compositor.showLandmarks = showPoints.checked;
    compositor.start();
    running = true;
    idle.classList.add('hidden');
    liveDot.classList.add('live');
    renderGlobals();
    setState('live');
  } catch (err) {
    setState((err as Error).message);
  }
}

function stop() {
  compositor?.stop();
  camera.stop();
  running = false;
  liveDot.classList.remove('live');
  idle.classList.remove('hidden');
  fpsEl.textContent = '';
  for (const el of cardEls.values()) el.classList.remove('active');
  renderGlobals();
  setState('stopped');
}

// ---- globals footer ----
function renderGlobals() {
  globalsEl.innerHTML = '';

  const startBtn = button(running ? '■ Stop' : '▶ Start', () => (running ? stop() : start()));
  startBtn.className = 'start';
  const startWrap = document.createElement('div');
  startWrap.className = 'start';
  startWrap.append(startBtn);

  const clearAllBtn = button('🗑 Clear all', clearAll);
  clearAllBtn.className = 'danger';
  const exportBtn = button('⬇ Export', doExport);
  const importBtn = button('⬆ Import', () => fileInput.click());

  globalsEl.append(startWrap, clearAllBtn, exportBtn, importBtn);
}

// hidden file input for import
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = 'application/json';
fileInput.className = 'hidden';
fileInput.onchange = () => { const f = fileInput.files?.[0]; if (f) doImport(f); };
document.body.append(fileInput);

// live toggle for the tracking overlay (applies immediately + on next start)
showPoints.onchange = () => { if (compositor) compositor.showLandmarks = showPoints.checked; };

// ---- boot ----
hintEl.textContent = 'Tip: give each effect a distinct hand symbol. Pipe into Zoom/Meet via OBS Virtual Camera.';
renderCards();
renderGlobals();
