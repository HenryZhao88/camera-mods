import { Camera } from './camera';
import { HandTracker } from './handTracker';
import { FaceTracker } from './faceTracker';
import { GestureEngine, type GestureBinding } from './gesture/gestureEngine';
import { presetBinding, customBinding } from './gesture/bindings';
import { GESTURE_PRESETS, GESTURE_IDS, type GestureId } from './gesture/handGestures';
import { saveChoice, getChoice, type GestureChoice } from './gesture/bindingStore';
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
const handEl = document.getElementById('hand') as HTMLSpanElement;
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
fire.enabled = false; // off by default — face tracking is heavy and the effect is rough
let faceReady = false;

// Render order (back to front): dim darkens first, glowing effects layer on top.
const effects: Effect[] = [dim, lightning, blast, fire, pinch];
const engine = new GestureEngine([], { cooldownMs: 800 });
let compositor: Compositor | null = null;
let running = false;

interface CardDef {
  id: string;
  icon: string;
  name: string;
  color: string;
  desc: string;
  bindable: boolean;             // has an activation-gesture dropdown
  defaultGesture?: GestureId;    // initial preset for bindable effects
  extra?: () => HTMLElement;     // optional extra control (clear lines / enable toggle)
}

const CARDS: CardDef[] = [
  {
    id: 'fingertip-lightning', icon: '⚡', name: 'Lightning', color: '#7df9ff',
    desc: 'Sparks stream from your fingertips <b>while you hold</b> the gesture.',
    bindable: true, defaultGesture: 'peace',
  },
  {
    id: 'palm-blast', icon: '💥', name: 'Blast', color: '#ffd27d',
    desc: 'A shockwave + flash <b>fires once</b> each time you make the gesture.',
    bindable: true, defaultGesture: 'point',
  },
  {
    id: 'pinch-draw', icon: '✏️', name: 'Draw', color: '#39ff14',
    desc: 'Hold the gesture to <b>draw neon lines</b> that follow your finger.',
    bindable: true, defaultGesture: 'pinch',
    extra: () => button('🧽 Clear lines', () => pinch.clear()),
  },
  {
    id: 'dim-lights', icon: '🌙', name: 'Dim', color: '#8aa0ff',
    desc: 'Automatic — close into a <b>fist</b> to slowly dim the room, open your <b>hand</b> to fade it back up.',
    bindable: false,
    extra: dimToggle,
  },
  {
    id: 'fire-breath', icon: '🔥', name: 'Fire Breath', color: '#ff7a18',
    desc: 'Automatic — <b>open your mouth wide</b> and breathe fire. Uses face tracking (slower). Off by default.',
    bindable: false,
    extra: fireToggle,
  },
];

const BINDABLE = CARDS.filter(c => c.bindable);

const cardEls = new Map<string, HTMLDivElement>();
const flashUntil = new Map<string, number>(); // effectId -> ms, for one-shot highlight
const sensitivity = new Map<string, number>(); // effectId -> custom threshold, survives re-renders
const DEFAULT_THRESHOLD = 0.6;

// ---- helpers ----
function setState(text: string) { stateEl.textContent = text; }

function hasTemplate(effectId: string): boolean {
  return loadTemplates().some(t => t.effectId === effectId);
}

function choiceFor(def: CardDef): GestureChoice {
  return getChoice(def.id, def.defaultGesture ?? 'open');
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
      if (compositor) compositor.trackFace = ok && input.checked;
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
    return true;
  } catch {
    setState('face model failed to load');
    return false;
  }
}

// ---- bindings ----
// Rebuild the engine's bindings from each bindable effect's saved choice.
function rebuildBindings() {
  const bindings: GestureBinding[] = [];
  for (const def of BINDABLE) {
    const choice = choiceFor(def);
    if (choice === 'custom') {
      const t = loadTemplates().find(x => x.effectId === def.id);
      if (t) {
        bindings.push(customBinding(def.id, t.landmarks, () => sensitivity.get(def.id) ?? DEFAULT_THRESHOLD));
      }
    } else {
      bindings.push(presetBinding(def.id, choice));
    }
  }
  engine.setBindings(bindings);
}

// ---- card rendering ----
function activationBadge(def: CardDef): string {
  const choice = choiceFor(def);
  if (choice === 'custom') return hasTemplate(def.id) ? 'custom' : 'record…';
  return GESTURE_PRESETS[choice].emoji;
}

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
    if (!def.bindable) { badge.classList.add('auto'); badge.textContent = 'auto'; }
    else { badge.classList.add('set'); badge.textContent = activationBadge(def); }
    top.append(icon, name, badge);

    const desc = document.createElement('div');
    desc.className = 'desc';
    desc.innerHTML = def.desc;

    card.append(top, desc);

    if (def.bindable) {
      const choice = choiceFor(def);

      // activation-gesture dropdown
      const actRow = document.createElement('div');
      actRow.className = 'row';
      const label = document.createElement('span');
      label.className = 'field-label';
      label.textContent = 'Activate';
      const select = document.createElement('select');
      for (const gid of GESTURE_IDS) {
        const opt = document.createElement('option');
        opt.value = gid;
        opt.textContent = `${GESTURE_PRESETS[gid].emoji}  ${GESTURE_PRESETS[gid].label}`;
        select.append(opt);
      }
      const customOpt = document.createElement('option');
      customOpt.value = 'custom';
      customOpt.textContent = '✎  Custom (record)…';
      select.append(customOpt);
      select.value = choice;
      select.onchange = () => {
        const val = select.value as GestureChoice;
        if (val === 'custom') {
          recordCustom(def.id); // saves choice on success, reverts the select on failure
        } else {
          saveChoice(def.id, val);
          rebuildBindings();
          renderCards();
          setState(`${def.name}: ${GESTURE_PRESETS[val].label}`);
        }
      };
      actRow.append(label, select);
      card.append(actRow);

      // custom-only controls: re-record, clear, sensitivity
      if (choice === 'custom') {
        const set = hasTemplate(def.id);
        const row = document.createElement('div');
        row.className = 'row';
        const rec = button(set ? '↻ Re-record' : '🎯 Record', () => recordCustom(def.id));
        rec.className = 'primary';
        const clr = button('✕', () => clearCustom(def.id));
        clr.className = 'icon-btn';
        clr.title = 'Clear custom gesture';
        clr.disabled = !set;
        row.append(rec, clr);
        card.append(row);

        const sens = document.createElement('div');
        sens.className = 'sens';
        const slider = document.createElement('input');
        slider.type = 'range'; slider.min = '0.2'; slider.max = '1.2'; slider.step = '0.05';
        slider.value = String(sensitivity.get(def.id) ?? DEFAULT_THRESHOLD);
        slider.oninput = () => { sensitivity.set(def.id, parseFloat(slider.value)); };
        sens.append(document.createTextNode('strict'), slider, document.createTextNode('loose'));
        card.append(sens);
      }
    }

    if (def.extra) {
      const row = document.createElement('div');
      row.className = 'row';
      row.append(def.extra());
      card.append(row);
    }
  }
}

// ---- actions ----
async function recordCustom(effectId: string) {
  if (!running) { setState('press start first'); renderCards(); return; }
  compositor?.stop();
  try {
    for (let n = 3; n >= 1; n--) {
      setState(`recording in ${n}…`);
      await countdown(1, () => {});
    }
    setState('hold your gesture…');
    await calibrate(effectId, camera, tracker);
    saveChoice(effectId, 'custom');
    setState('custom gesture saved ✓');
  } catch (err) {
    setState((err as Error).message);
  } finally {
    rebuildBindings();
    renderCards();
    compositor?.start();
  }
}

function clearCustom(effectId: string) {
  removeTemplate(effectId);
  // revert to this effect's default preset
  const def = BINDABLE.find(d => d.id === effectId);
  if (def?.defaultGesture) saveChoice(effectId, def.defaultGesture);
  rebuildBindings();
  renderCards();
  setState('custom gesture cleared');
}

function resetAll() {
  clearTemplates();
  localStorage.removeItem('cammods.bindings');
  rebuildBindings();
  renderCards();
  setState('reset to defaults');
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
      rebuildBindings();
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
      onFrame: (hand, fired, active) => {
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
            (id === 'dim-lights' && dim.isActive()) ||
            (id === 'fire-breath' && fire.isActive());
          el.classList.toggle('active', lit);
        }
        handEl.textContent = hand ? '✋ hand' : 'no hand';
      },
    });
    compositor.showLandmarks = showPoints.checked;
    compositor.start();
    running = true;
    idle.classList.add('hidden');
    liveDot.classList.add('live');
    renderGlobals();

    if (fire.enabled) {
      ensureFace().then(ok => { if (compositor) compositor.trackFace = ok && fire.enabled; });
    }
    setState('live');
  } catch (err) {
    setState((err as Error).message);
  }
}

function stop() {
  compositor?.stop();
  if (compositor) compositor.trackFace = false;
  camera.stop();
  running = false;
  liveDot.classList.remove('live');
  idle.classList.remove('hidden');
  fpsEl.textContent = '';
  handEl.textContent = '—';
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

  const resetBtn = button('🗑 Reset all', resetAll);
  resetBtn.className = 'danger';
  const exportBtn = button('⬇ Export', doExport);
  const importBtn = button('⬆ Import', () => fileInput.click());

  globalsEl.append(startWrap, resetBtn, exportBtn, importBtn);
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
hintEl.textContent = 'Pick a distinct activation pose per effect. Pipe into Zoom/Meet via OBS Virtual Camera.';
rebuildBindings();
renderCards();
renderGlobals();
