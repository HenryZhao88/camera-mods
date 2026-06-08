import { Camera } from './camera';
import { HandTracker } from './handTracker';
import { GestureEngine } from './gesture/gestureEngine';
import { loadTemplates, exportTemplates, importTemplates } from './gesture/templateStore';
import { Compositor } from './compositor';
import { calibrate, countdown } from './calibration';
import { FingertipLightning } from './effects/fingertipLightning';
import { DimLights } from './effects/dimLights';
import { PalmBlast } from './effects/palmBlast';
import { PinchDraw } from './effects/pinchDraw';
import type { Effect } from './types';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLDivElement;
const status = document.createElement('span');
status.id = 'status';

const camera = new Camera();
const tracker = new HandTracker();
const pinch = new PinchDraw();
const effects: Effect[] = [new FingertipLightning(), new DimLights(), new PalmBlast(), pinch];
const labels: Record<string, string> = {
  'fingertip-lightning': 'Lightning', 'dim-lights': 'Dim', 'palm-blast': 'Blast', 'pinch-draw': 'Draw',
};

let engine = new GestureEngine(loadTemplates(), { defaultThreshold: 0.6, cooldownMs: 800 });
let compositor: Compositor | null = null;

function setStatus(text: string) { status.textContent = text; }

function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  b.onclick = onClick;
  return b;
}

async function startApp() {
  try {
    setStatus('Starting camera…');
    await camera.start();
    setStatus('Loading hand model…');
    await tracker.init();
    compositor = new Compositor(canvas, camera, tracker, engine, effects, {
      onFrame: (hand, scores, fired) => {
        const best = Object.entries(scores).sort((a, b) => a[1] - b[1])[0];
        setStatus(
          (hand ? '✋ hand' : '… no hand') +
          (best ? ` · closest ${labels[best[0]] ?? best[0]} ${best[1].toFixed(2)}` : '') +
          (fired.length ? ` · fired ${fired.map(f => labels[f] ?? f).join(',')}` : ''),
        );
      },
    });
    compositor.start();
    setStatus('Running');
  } catch (err) {
    setStatus((err as Error).message);
  }
}

async function calibrateEffect(effectId: string) {
  if (!camera.width) { setStatus('Start the camera first'); return; }
  for (let n = 3; n >= 1; n--) { setStatus(`Calibrating ${labels[effectId]} in ${n}…`); await countdown(1, () => {}); }
  setStatus(`Hold your ${labels[effectId]} symbol…`);
  await calibrate(effectId, camera, tracker);
  engine.setTemplates(loadTemplates());
  setStatus(`Saved ${labels[effectId]} gesture`);
}

function buildUI() {
  ui.appendChild(button('▶ Start', startApp));
  for (const e of effects) {
    ui.appendChild(button(`🎯 ${labels[e.id]}`, () => calibrateEffect(e.id)));
  }
  ui.appendChild(button('🧽 Clear drawing', () => pinch.clear()));

  const slider = document.createElement('input');
  slider.type = 'range'; slider.min = '0.2'; slider.max = '1.2'; slider.step = '0.05'; slider.value = '0.6';
  slider.title = 'Sensitivity (lower = stricter)';
  slider.oninput = () => {
    const v = parseFloat(slider.value);
    for (const e of effects) engine.setThreshold(e.id, v);
  };
  ui.appendChild(slider);

  ui.appendChild(button('⬇ Export', () => {
    const blob = new Blob([exportTemplates()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cammods-gestures.json';
    a.click();
  }));

  const file = document.createElement('input');
  file.type = 'file'; file.accept = 'application/json'; file.style.display = 'none';
  file.onchange = async () => {
    const f = file.files?.[0];
    if (!f) return;
    importTemplates(await f.text());
    engine.setTemplates(loadTemplates());
    setStatus('Imported gestures');
  };
  ui.appendChild(button('⬆ Import', () => file.click()));
  ui.appendChild(file);

  ui.appendChild(status);
}

buildUI();
