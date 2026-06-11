import { Camera } from './camera';
import { HandTracker } from './handTracker';
import { FaceTracker } from './faceTracker';
import { GestureEngine, type GestureBinding } from './gesture/gestureEngine';
import { presetBinding, customBinding } from './gesture/bindings';
import { GESTURE_PRESETS, GESTURE_IDS, type GestureId } from './gesture/handGestures';
import { saveChoice, getChoice, type GestureChoice } from './gesture/bindingStore';
import { isEnabled, setEnabled } from './gesture/enabledStore';
import {
  loadTemplates, saveTemplate, removeTemplate, clearTemplates, exportTemplates, importTemplates,
} from './gesture/templateStore';
import { PixiCompositor } from './pixiCompositor';
import { RecorderWizard, singlePoseFlow, gunFlow, beamFlow, domainFlow, type RecordFlow } from './recorder';
import { FingertipLightning } from './effects/fingertipLightning';
import { DimLights } from './effects/dimLights';
import { PalmBlast } from './effects/palmBlast';
import { PinchDraw } from './effects/pinchDraw';
import { FireBreath } from './effects/fireBreath';
import { LightningEyes } from './effects/lightningEyes';
import { GunShot } from './effects/gunShot';
import { EnergyShield } from './effects/energyShield';
import { EnergyBeam } from './effects/energyBeam';
import { WebShot } from './effects/webShot';
import { DomainExpansion } from './effects/domainExpansion';
import { PersonSegmenter } from './segmenter';
import type { Effect, StagedTemplate, TwoHandTemplate } from './types';
import { SCREEN_FILTERS, type ScreenFilter } from './filters';

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
const screenFxSelect = document.getElementById('screenfx') as HTMLSelectElement;

// ---- engine + effects ----
const camera = new Camera();
const tracker = new HandTracker();
const faceTracker = new FaceTracker();
const pinch = new PinchDraw();
const dim = new DimLights();
const lightning = new FingertipLightning();
const blast = new PalmBlast();
const fire = new FireBreath();
const eyes = new LightningEyes();
const gun = new GunShot();
const shield = new EnergyShield();
const beam = new EnergyBeam();
const web = new WebShot();
const segmenter = new PersonSegmenter(camera);
const domain = new DomainExpansion(segmenter);
let faceReady = false;

// Face-tracked effects default off (a second ML model is heavy); the rest default on.
const FACE_EFFECTS = new Set(['fire-breath', 'lightning-eyes']);
function effectDefaultEnabled(id: string): boolean { return !FACE_EFFECTS.has(id); }

// self-driven effects toggled directly via their .enabled flag
const selfDriven: Record<string, { enabled: boolean }> = {
  'dim-lights': dim, 'fire-breath': fire, 'lightning-eyes': eyes, 'gun-shot': gun,
  'energy-beam': beam, 'domain-expansion': domain,
};
for (const [id, fx] of Object.entries(selfDriven)) fx.enabled = isEnabled(id, effectDefaultEnabled(id));

// Render order (back to front): dim darkens first, glowing effects layer on top.
const effects: Effect[] = [dim, lightning, blast, fire, eyes, gun, shield, beam, web, domain, pinch];
const engine = new GestureEngine([], { cooldownMs: 800, exclusive: true });
let compositor: PixiCompositor | null = null;
let running = false;

const recorder = new RecorderWizard();

function flowFor(def: CardDef): RecordFlow {
  if (def.id === 'gun-shot') return gunFlow();
  if (def.id === 'energy-beam') return beamFlow();
  if (def.id === 'domain-expansion') return domainFlow();
  return singlePoseFlow(def.id, def.name);
}

// Push current custom triggers (or their absence) into the two self-driven effects.
function pushCustomTriggers() {
  const templates = loadTemplates();
  const gunTpl = templates.find(t => t.effectId === 'gun-shot' && t.kind === 'stages') as StagedTemplate | undefined;
  const gunOn = getChoice('gun-shot', 'default') === 'custom' && gunTpl;
  gun.setCustomTrigger(gunOn ? gunTpl : null, () => sensitivity.get('gun-shot') ?? DEFAULT_THRESHOLD);

  const beamTpl = templates.find(t => t.effectId === 'energy-beam' && t.kind === 'two-hand') as TwoHandTemplate | undefined;
  const beamOn = getChoice('energy-beam', 'default') === 'custom' && beamTpl;
  beam.setCustomCharge(beamOn ? beamTpl : null, () => sensitivity.get('energy-beam') ?? DEFAULT_THRESHOLD);

  const domainTpl = templates.find(t => t.effectId === 'domain-expansion' && t.kind === 'two-hand') as TwoHandTemplate | undefined;
  const domainOn = getChoice('domain-expansion', 'default') === 'custom' && domainTpl;
  domain.setCustomSign(domainOn ? domainTpl : null, () => sensitivity.get('domain-expansion') ?? DEFAULT_THRESHOLD);
}

interface CardDef {
  id: string;
  icon: string;
  name: string;
  color: string;
  desc: string;
  bindable: boolean;             // has an activation-gesture dropdown
  defaultGesture?: GestureId;    // initial preset for bindable effects
  customTrigger?: string;        // self-driven effects: label of the built-in trigger
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
    id: 'energy-shield', icon: '🛡', name: 'Shield', color: '#66e0ff',
    desc: 'A hex force-field materializes in front of your palm <b>while you hold</b> the gesture.',
    bindable: true, defaultGesture: 'open',
  },
  {
    id: 'web-shot', icon: '🕸', name: 'Web Shot', color: '#e8e8e8',
    desc: 'Shoot a web <b>at the camera</b> — it splats on the lens and peels off after a few seconds.',
    bindable: true, defaultGesture: 'rock',
  },
  {
    id: 'energy-beam', icon: '🌀', name: 'Kamehameha', color: '#7fc8ff',
    desc: 'Automatic — hold your <b>palms together</b> to charge, then <b>push at the camera</b> to fire.',
    bindable: false,
    customTrigger: 'Default (palms together)',
  },
  {
    id: 'domain-expansion', icon: '⛩', name: 'Domain', color: '#ff2d2d',
    desc: 'Hold your <b>two-hand sign</b> ~1s to expand your domain — press <b>X</b> (or Collapse) to end it.',
    bindable: false, customTrigger: 'Default (hands clasped)',
    extra: () => button('⛩ Collapse', () => domain.collapse()),
  },
  {
    id: 'gun-shot', icon: '🔫', name: 'Finger Gun', color: '#ff5a5a',
    desc: 'Make a finger gun (index out, thumb up) and <b>drop your thumb</b> to fire — muzzle flash + bang.',
    bindable: false,
    customTrigger: 'Default (finger gun)',
  },
  {
    id: 'lightning-eyes', icon: '👁️', name: 'Lightning Eyes', color: '#7df9ff',
    desc: 'Electric arcs crackle from your eyes. Uses face tracking (slower).',
    bindable: false,
  },
  {
    id: 'dim-lights', icon: '🌙', name: 'Dim', color: '#8aa0ff',
    desc: 'Automatic — close into a <b>fist</b> to slowly dim the room, open your <b>hand</b> to fade it back up.',
    bindable: false,
  },
  {
    id: 'fire-breath', icon: '🔥', name: 'Fire Breath', color: '#ff7a18',
    desc: 'Automatic — <b>open your mouth wide</b> and breathe fire. Uses face tracking (slower).',
    bindable: false,
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

// A small on/off switch for an effect card.
function enableSwitch(def: CardDef): HTMLElement {
  const on = isEnabled(def.id, effectDefaultEnabled(def.id));
  const label = document.createElement('label');
  label.className = 'switch';
  label.title = on ? 'Effect on' : 'Effect off';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = on;
  const track = document.createElement('span');
  track.className = 'track';
  input.onchange = () => setEffectEnabled(def.id, input.checked);
  label.append(input, track);
  return label;
}

async function setEffectEnabled(effectId: string, on: boolean) {
  setEnabled(effectId, on);
  if (!on) effects.find(e => e.id === effectId)?.reset?.(); // clear lingering output

  const sd = selfDriven[effectId];
  if (sd) {
    sd.enabled = on;
    if (FACE_EFFECTS.has(effectId)) await syncFaceTracking();
  } else {
    rebuildBindings(); // bindable effect: include/exclude its binding
  }
  renderCards();
}

// Face tracking runs only while at least one face effect is enabled.
async function syncFaceTracking() {
  const need = fire.enabled || eyes.enabled;
  if (need && running) {
    const ok = await ensureFace();
    if (compositor) compositor.trackFace = ok;
    if (!ok) {
      fire.enabled = eyes.enabled = false;
      setEnabled('fire-breath', false);
      setEnabled('lightning-eyes', false);
    }
  } else if (compositor) {
    compositor.trackFace = false;
  }
}

// Lazily load the face model the first time a face effect is needed.
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
    if (!isEnabled(def.id, true)) continue; // disabled effects don't match
    const choice = choiceFor(def);
    if (choice === 'custom') {
      const t = loadTemplates().find(x => x.effectId === def.id && x.kind === 'hand') as import('./types').HandTemplate | undefined;
      if (t) {
        bindings.push(customBinding(def.id, t.landmarks, () => sensitivity.get(def.id) ?? DEFAULT_THRESHOLD));
      }
    } else if (choice !== 'default') {
      // guard against a tampered/unknown stored pose falling through to a crash
      const preset = GESTURE_PRESETS[choice] ? choice : (def.defaultGesture ?? 'open');
      bindings.push(presetBinding(def.id, preset));
    }
  }
  engine.setBindings(bindings);
}

// ---- card rendering ----

// Re-record / clear / sensitivity controls shown when an effect uses a custom gesture.
function customControlsRow(def: CardDef, card: HTMLDivElement) {
  const set = hasTemplate(def.id);
  const row = document.createElement('div');
  row.className = 'row';
  const rec = button(set ? '↻ Re-record' : '🎯 Record', () => recordCustom(def));
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

function activationBadge(def: CardDef): string {
  const choice = choiceFor(def);
  if (choice === 'custom') return hasTemplate(def.id) ? 'custom' : 'record…';
  if (choice === 'default') return 'auto';
  return GESTURE_PRESETS[choice].emoji;
}

function renderCards() {
  cardsEl.innerHTML = '';
  cardEls.clear();

  for (const def of CARDS) {
    const on = isEnabled(def.id, effectDefaultEnabled(def.id));
    const card = document.createElement('div');
    card.className = on ? 'card' : 'card off';
    card.style.setProperty('--c', def.color);
    cardEls.set(def.id, card);

    const top = document.createElement('div');
    top.className = 'top';
    const icon = document.createElement('span'); icon.className = 'icon'; icon.textContent = def.icon;
    const name = document.createElement('span'); name.className = 'name'; name.textContent = def.name;
    const badge = document.createElement('span'); badge.className = 'badge';
    if (!def.bindable) {
      badge.classList.add('auto');
      badge.textContent =
        def.customTrigger && getChoice(def.id, 'default') === 'custom' && hasTemplate(def.id) ? '✎' : 'auto';
    } else { badge.classList.add('set'); badge.textContent = activationBadge(def); }
    top.append(icon, name, badge, enableSwitch(def));

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
          recordCustom(def); // saves choice on success, reverts the select on failure
        } else if (val !== 'default') {
          saveChoice(def.id, val);
          rebuildBindings();
          renderCards();
          setState(`${def.name}: ${GESTURE_PRESETS[val].label}`);
        }
      };
      actRow.append(label, select);
      card.append(actRow);

      // custom-only controls: re-record, clear, sensitivity
      if (choice === 'custom') customControlsRow(def, card);
    }

    if (def.customTrigger) {
      const choice = getChoice(def.id, 'default');

      const row = document.createElement('div');
      row.className = 'row';
      const label = document.createElement('span');
      label.className = 'field-label';
      label.textContent = 'Trigger';
      const select = document.createElement('select');
      const defOpt = document.createElement('option');
      defOpt.value = 'default';
      defOpt.textContent = def.customTrigger;
      const customOpt = document.createElement('option');
      customOpt.value = 'custom';
      customOpt.textContent = '✎  Custom (record)…';
      select.append(defOpt, customOpt);
      select.value = choice === 'custom' ? 'custom' : 'default';
      select.onchange = () => {
        if (select.value === 'custom') {
          recordCustom(def); // saves choice on success; renderCards reverts on cancel
        } else {
          saveChoice(def.id, 'default');
          pushCustomTriggers();
          renderCards();
          setState(`${def.name}: default trigger`);
        }
      };
      row.append(label, select);
      card.append(row);

      if (choice === 'custom') customControlsRow(def, card);
    }

    if (def.extra) {
      const row = document.createElement('div');
      row.className = 'row';
      row.append(def.extra());
      card.append(row);
    }

    cardsEl.append(card);
  }
}

// ---- actions ----
async function recordCustom(def: CardDef) {
  if (!running) { setState('press start first'); renderCards(); return; }
  if (recorder.isOpen) return;

  const prevShow = compositor ? compositor.showLandmarks : false;
  if (compositor) compositor.showLandmarks = true; // see what's being tracked
  try {
    const template = await recorder.run(flowFor(def));
    if (template) {
      saveTemplate(template);
      saveChoice(def.id, 'custom');
      setState('custom gesture saved ✓');
    } else {
      setState('recording cancelled');
    }
  } finally {
    if (compositor) compositor.showLandmarks = prevShow;
    pushCustomTriggers();
    rebuildBindings();
    renderCards();
  }
}

function clearCustom(effectId: string) {
  removeTemplate(effectId);
  const def = CARDS.find(d => d.id === effectId);
  if (def?.bindable && def.defaultGesture) saveChoice(effectId, def.defaultGesture);
  else if (def?.customTrigger) saveChoice(effectId, 'default');
  pushCustomTriggers();
  rebuildBindings();
  renderCards();
  setState('custom gesture cleared');
}

function resetAll() {
  clearTemplates();
  localStorage.removeItem('cammods.bindings');
  rebuildBindings();
  pushCustomTriggers();
  renderCards();
  setState('reset to defaults');
}

// Wipe everything currently drawn on screen (drawings, particles, dim, fire).
function clearScreen() {
  for (const e of effects) e.reset?.();
  setState('screen cleared');
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
      pushCustomTriggers();
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
    if (!compositor) {
      const comp = new PixiCompositor(camera, tracker, faceTracker, engine, effects, {
        onHands: hands => { if (recorder.isOpen) recorder.feedHands(hands); },
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
              (id === 'fire-breath' && fire.isActive()) ||
              (id === 'lightning-eyes' && eyes.isActive()) ||
              (id === 'gun-shot' && gun.isActive()) ||
              (id === 'energy-beam' && beam.isActive()) ||
              (id === 'energy-shield' && shield.isActive()) ||
              (id === 'web-shot' && web.isActive()) ||
              (id === 'domain-expansion' && domain.isActive());
            el.classList.toggle('active', lit);
          }
          handEl.textContent = hand ? '✋ hand' : 'no hand';
        },
      });
      setState('starting renderer…');
      await comp.init(canvas);
      compositor = comp;
    }
    compositor.showLandmarks = showPoints.checked;
    compositor.screenFilter = currentScreenFilter;
    compositor.start();
    running = true;
    idle.classList.add('hidden');
    liveDot.classList.add('live');
    renderGlobals();

    syncFaceTracking(); // load face model in the background if a face effect is on
    setState('live');
  } catch (err) {
    setState((err as Error).message);
  }
}

function stop() {
  if (recorder.isOpen) recorder.cancel();
  compositor?.stop();
  if (compositor) compositor.trackFace = false;
  // frames stop, so self-driven effects can never reach their own teardown —
  // reset them all (kills domain rumble / beam charge / shield hum mid-sound)
  for (const e of effects) e.reset?.();
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

  const cleanBtn = button('🖥 Clean view', enterClean);
  const clearBtn = button('🧹 Clear screen', clearScreen);
  const resetBtn = button('🗑 Reset all', resetAll);
  resetBtn.className = 'danger';
  const exportBtn = button('⬇ Export', doExport);
  const importBtn = button('⬆ Import', () => fileInput.click());

  globalsEl.append(startWrap, cleanBtn, clearBtn, resetBtn, exportBtn, importBtn);
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

// screen FX dropdown (persisted; applies live + on next start)
const SCREENFX_KEY = 'cammods.screenfx';
const storedFx = localStorage.getItem(SCREENFX_KEY);
let currentScreenFilter: ScreenFilter =
  SCREEN_FILTERS.some(f => f.id === storedFx) ? (storedFx as ScreenFilter) : 'none';
for (const f of SCREEN_FILTERS) {
  const opt = document.createElement('option');
  opt.value = f.id; opt.textContent = f.label;
  screenFxSelect.append(opt);
}
screenFxSelect.value = currentScreenFilter;
screenFxSelect.onchange = () => {
  currentScreenFilter = screenFxSelect.value as ScreenFilter;
  localStorage.setItem(SCREENFX_KEY, currentScreenFilter);
  if (compositor) compositor.screenFilter = currentScreenFilter;
};

// ---- clean view (hide panel so OBS captures only the camera + effects) ----
const exitCleanBtn = document.getElementById('exitclean') as HTMLButtonElement;
function enterClean() { document.body.classList.add('clean'); }
function exitClean() { document.body.classList.remove('clean'); }
exitCleanBtn.onclick = exitClean;
window.addEventListener('keydown', e => {
  if (document.body.classList.contains('clean') && (e.key === 'Escape' || e.key === 'c')) exitClean();
});
window.addEventListener('keydown', e => {
  // don't hijack typing in form controls (sliders, selects, file input)
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.key === 'x' || e.key === 'X') domain.collapse();
});

// ---- boot ----
hintEl.textContent = 'Pick a distinct activation pose per effect. Capture in OBS → Virtual Camera for Zoom/Meet.';
rebuildBindings();
pushCustomTriggers();
renderCards();
renderGlobals();

// OBS browser sources can deep-link straight into clean view with ?clean=1,
// and auto-start the camera with ?autostart=1 (no Interact-dialog clicking).
const params = new URLSearchParams(location.search);
if (params.get('clean') !== null) enterClean();
const filterParam = params.get('filter') as ScreenFilter | null;
if (filterParam && SCREEN_FILTERS.some(f => f.id === filterParam)) {
  currentScreenFilter = filterParam;
  screenFxSelect.value = filterParam;
}
const boot = params.get('fakecam') !== null
  ? import('./devFakeCam').then(m => m.installFakeCamera())
  : Promise.resolve();
if (params.get('autostart') !== null) void boot.then(() => start());
