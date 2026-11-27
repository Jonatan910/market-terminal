// Dibuja el mapa de calor detrás de las velas. Cada columna grabada (una foto del libro)
// ocupa desde su momento hasta la foto siguiente; cada franja de precio se pinta con un color
// según cuánto había esperando: azul (poco) → celeste → amarillo → naranja (paredes grandes).
//
// Para que sea rápido se pinta píxel a píxel en una imagen aparte, y solo se recalcula cuando
// cambia algo (foto nueva, zoom o desplazamiento); al mover el mouse se reutiliza la imagen.
import { createTimeMap } from '../drawings/timeMap';

// Paleta: [posición 0..1, r, g, b, alfa 0..1]
const STOPS = [
  [0, 20, 60, 160, 0],
  [0.12, 30, 90, 200, 0.3],
  [0.35, 0, 188, 212, 0.5],
  [0.65, 245, 197, 24, 0.7],
  [1, 255, 112, 67, 0.9],
];
const LUT = buildLut(); // 256 colores RGBA ya calculados
const MIN_INTENSITY = 0.05; // por debajo no se pinta (deja ver el fondo)

function buildLut() {
  const lut = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    let k = 0;
    while (k < STOPS.length - 2 && v > STOPS[k + 1][0]) k++;
    const [p0, r0, g0, b0, a0] = STOPS[k];
    const [p1, r1, g1, b1, a1] = STOPS[k + 1];
    const t = (v - p0) / (p1 - p0 || 1);
    lut.set([r0 + (r1 - r0) * t, g0 + (g1 - g0) * t, b0 + (b1 - b0) * t, (a0 + (a1 - a0) * t) * 255], i * 4);
  }
  return lut;
}

export function createHeatmapPrimitive(chart, series) {
  let recorder = null;
  let map = createTimeMap([]);
  let requestUpdate = () => {};
  let cacheKey = '';
  const off = document.createElement('canvas');
  const offCtx = off.getContext('2d');

  const ts = () => chart.timeScale();
  function timeToX(t) {
    const l = map.toLogical(t);
    if (l == null) return null;
    const i = Math.floor(l);
    const x1 = ts().logicalToCoordinate(i);
    const x2 = ts().logicalToCoordinate(i + 1);
    return x1 == null || x2 == null ? x1 : x1 + (x2 - x1) * (l - i);
  }

  function rebuild(W, H) {
    off.width = W;
    off.height = H;
    const cols = recorder.columns;
    const step = recorder.step;
    // Escala de precio lineal: y = a * precio + b (con dos puntos alcanza).
    const p0 = cols.at(-1).base * step;
    const p1 = p0 * 1.01;
    const y0 = series.priceToCoordinate(p0);
    const y1 = series.priceToCoordinate(p1);
    if (y0 == null || y1 == null) return;
    const a = (y1 - y0) / (p1 - p0);
    const b = y0 - a * p0;

    // Posición x de cada columna; solo las visibles, y una por píxel (la más reciente).
    const xs = cols.map((c) => timeToX(c.t));
    const plan = [];
    for (let i = 0; i < cols.length; i++) {
      const x = xs[i];
      if (x == null) continue;
      const next = i + 1 < cols.length ? xs[i + 1] : x + 3;
      const xa = Math.max(0, Math.floor(x));
      const xb = Math.min(W, Math.max(xa + 1, Math.floor(next ?? x + 1)));
      if (xb <= 0 || xa >= W) continue;
      if (plan.length && plan.at(-1).xa === xa) plan[plan.length - 1] = { i, xa, xb };
      else plan.push({ i, xa, xb });
    }
    if (!plan.length) return;

    // Referencia de color: percentil 97 de lo visible (así una pared gigante no apaga todo).
    const sample = [];
    for (let k = 0; k < plan.length; k += Math.ceil(plan.length / 200)) {
      for (const q of cols[plan[k].i].data) if (q > 0) sample.push(q);
    }
    sample.sort((u, v) => u - v);
    const ref = sample[Math.floor(sample.length * 0.97)] || 1;

    const img = offCtx.createImageData(W, H);
    const px = img.data;
    for (const { i, xa, xb } of plan) {
      const { base, data } = cols[i];
      for (let j = 0; j < data.length; j++) {
        const q = data[j];
        if (!q) continue;
        const v = Math.min(1, q / ref);
        if (v < MIN_INTENSITY) continue;
        const price = (base + j) * step;
        let ya = Math.round(a * (price + step / 2) + b);
        let yb = Math.round(a * (price - step / 2) + b);
        if (ya > yb) [ya, yb] = [yb, ya];
        if (yb === ya) yb++;
        ya = Math.max(0, ya);
        yb = Math.min(H, yb);
        if (yb <= 0 || ya >= H) continue;
        const c = Math.round(v * 255) * 4;
        for (let y = ya; y < yb; y++) {
          let o = (y * W + xa) * 4;
          for (let x = xa; x < xb; x++, o += 4) {
            px[o] = LUT[c];
            px[o + 1] = LUT[c + 1];
            px[o + 2] = LUT[c + 2];
            px[o + 3] = LUT[c + 3];
          }
        }
      }
    }
    offCtx.putImageData(img, 0, 0);
  }

  function draw(ctx, { width, height }) {
    if (!recorder?.columns.length || !recorder.step) return;
    const W = Math.ceil(width);
    const H = Math.ceil(height);
    const r = ts().getVisibleLogicalRange();
    const last = recorder.columns.at(-1);
    // Clave de lo que se ve: si no cambió, se reutiliza la imagen anterior.
    const key = [W, H, r?.from, r?.to, series.priceToCoordinate(last.base * recorder.step), recorder.columns.length, last.t].join('|');
    if (key !== cacheKey) {
      cacheKey = key;
      rebuild(W, H);
    }
    if (off.width && off.height) ctx.drawImage(off, 0, 0, W, H);
  }

  series.attachPrimitive({
    attached: (p) => (requestUpdate = p.requestUpdate),
    detached: () => (requestUpdate = () => {}),
    updateAllViews: () => {},
    paneViews: () => [
      {
        zOrder: () => 'bottom', // detrás de las velas
        renderer: () => ({
          draw: (target) => target.useMediaCoordinateSpace(({ context, mediaSize }) => draw(context, mediaSize)),
        }),
      },
    ],
  });

  return {
    setRecorder(r) {
      recorder = r;
      cacheKey = '';
      requestUpdate();
    },
    setBars(bars) {
      map = createTimeMap(bars);
      cacheKey = '';
      requestUpdate();
    },
    // Llamar después de cada foto nueva.
    refresh() {
      requestUpdate();
    },
  };
}
