// Dibujo del "modo liquidez" (estilo Bookmap) en un canvas común:
//   mapa de calor del libro (fondo) · línea de mejor compra/venta · burbujas de operaciones · ejes.
// `view` es el estado de la cámara (zoom, desplazamiento) y lo maneja LiquidityView.jsx.
import { LIQ_SAMPLE_MS } from './recorder.js';
import { niceStep } from '../orderbook/heatmap.js';

export const AXIS_W = 78; // ancho del eje de precios (derecha)
export const AXIS_H = 22; // alto del eje de tiempo (abajo)
const BG = '#05070c';

// Paleta tipo Bookmap: negro → azul → celeste → amarillo → naranja → rojo.
const STOPS = [
  [0, 5, 7, 12],
  [0.1, 10, 30, 90],
  [0.3, 20, 90, 200],
  [0.5, 0, 200, 220],
  [0.7, 245, 220, 40],
  [0.85, 255, 140, 30],
  [1, 255, 50, 40],
];
const LUT = (() => {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    let k = 0;
    while (k < STOPS.length - 2 && v > STOPS[k + 1][0]) k++;
    const [p0, r0, g0, b0] = STOPS[k];
    const [p1, r1, g1, b1] = STOPS[k + 1];
    const t = (v - p0) / (p1 - p0 || 1);
    lut.set([r0 + (r1 - r0) * t, g0 + (g1 - g0) * t, b0 + (b1 - b0) * t], i * 3);
  }
  return lut;
})();

// Primer índice cuyo tiempo es >= t (búsqueda binaria).
function firstAtOrAfter(list, t) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (list[m].t < t) lo = m + 1;
    else hi = m;
  }
  return lo;
}

const pad = (n) => String(n).padStart(2, '0');
const hms = (ms) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const compact = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 });

export function render(ctx, { w, h }, rec, view, opts) {
  const pw = Math.max(1, Math.floor(w - AXIS_W));
  const ph = Math.max(1, Math.floor(h - AXIS_H));
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  const cols = rec.columns;
  if (!cols.length || !rec.step) {
    ctx.fillStyle = '#8b95a7';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(opts.message || 'Conectando con el libro de órdenes…', w / 2, h / 2);
    return null;
  }

  // ---------- cámara ----------
  const last = cols.at(-1);
  const mid = (last.bid + last.ask) / 2;
  const right = view.live ? Date.now() : view.endTime; // tiempo en el borde derecho
  const msPerPx = LIQ_SAMPLE_MS / view.pxPerCol;
  const left = right - pw * msPerPx;
  view.priceSpan ??= mid * 0.004; // al empezar: ±0,2 % del precio
  if (view.followPrice) view.priceCenter = view.priceCenter == null ? mid : view.priceCenter + (mid - view.priceCenter) * 0.15;
  const top = view.priceCenter + view.priceSpan / 2;
  const ppp = view.priceSpan / ph; // precio por píxel
  const tToX = (t) => pw - (right - t) / msPerPx;
  const pToY = (p) => (top - p) / ppp;
  const yToP = (y) => top - y * ppp;
  const step = rec.step;

  // ---------- mapa de calor ----------
  const i0 = Math.max(0, firstAtOrAfter(cols, left) - 1);
  // Referencia de color: percentil 97 de lo visible (para que una pared gigante no apague todo).
  const sample = [];
  const stride = Math.max(1, Math.ceil((cols.length - i0) / 150));
  const pLo = yToP(ph);
  const pHi = top;
  for (let i = i0; i < cols.length; i += stride) {
    const { base, data } = cols[i];
    const j0 = Math.max(0, Math.floor(pLo / step) - base);
    const j1 = Math.min(data.length - 1, Math.ceil(pHi / step) - base);
    for (let j = j0; j <= j1; j++) if (data[j] > 0) sample.push(data[j]);
  }
  sample.sort((a, b) => a - b);
  const ref = (sample[Math.floor(sample.length * 0.98)] || 1) / (opts.contrast || 1);
  // Curva de brillo: las cantidades chicas quedan oscuras y solo "encienden" las paredes grandes.
  const GAMMA = 1.8;

  view.img = view.img?.width === pw && view.img?.height === ph ? view.img : new ImageData(pw, ph);
  const px = view.img.data;
  px.fill(0);
  const colMax = new Float32Array(ph);
  for (let i = i0; i < cols.length; i++) {
    const c = cols[i];
    const xa = Math.max(0, Math.floor(tToX(c.t)));
    const xb = Math.min(pw, i + 1 < cols.length ? Math.floor(tToX(cols[i + 1].t)) : pw); // la última llega hasta "ahora"
    if (xb <= 0 || xa >= pw || xb <= xa) continue;
    colMax.fill(0);
    const j0 = Math.max(0, Math.floor(pLo / step) - c.base - 1);
    const j1 = Math.min(c.data.length - 1, Math.ceil(pHi / step) - c.base + 1);
    for (let j = j0; j <= j1; j++) {
      const q = c.data[j];
      if (!q) continue;
      const price = (c.base + j) * step;
      const ya = Math.max(0, Math.floor(pToY(price + step / 2)));
      const yb = Math.min(ph, Math.max(ya + 1, Math.ceil(pToY(price - step / 2))));
      for (let y = ya; y < yb; y++) if (q > colMax[y]) colMax[y] = q;
    }
    for (let y = 0; y < ph; y++) {
      const q = colMax[y];
      if (!q) continue;
      const k = Math.round(Math.min(1, q / ref) ** GAMMA * 255) * 3;
      let o = (y * pw + xa) * 4;
      for (let x = xa; x < xb; x++, o += 4) {
        px[o] = LUT[k];
        px[o + 1] = LUT[k + 1];
        px[o + 2] = LUT[k + 2];
        px[o + 3] = 255;
      }
    }
  }
  view.off ||= document.createElement('canvas');
  if (view.off.width !== pw || view.off.height !== ph) {
    view.off.width = pw;
    view.off.height = ph;
  }
  view.off.getContext('2d').putImageData(view.img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(view.off, 0, 0, pw, ph);
  ctx.restore();

  // ---------- mejor compra / mejor venta ----------
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, pw, ph);
  ctx.clip();
  for (const [key, color] of [
    ['bid', '#3ddc97'],
    ['ask', '#ff5a5f'],
  ]) {
    ctx.beginPath();
    let started = false;
    for (let i = i0; i < cols.length; i++) {
      const x = tToX(cols[i].t);
      const xn = i + 1 < cols.length ? tToX(cols[i + 1].t) : pw;
      const y = pToY(cols[i][key]);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
      ctx.lineTo(xn, y); // escalón: el precio se mantiene hasta la foto siguiente
    }
    // Borde oscuro debajo para que la línea se vea sobre cualquier color del mapa.
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // ---------- burbujas de operaciones ----------
  const bubbles = rec.bubbles;
  // Tamaño de referencia: percentil 90 de las últimas 400 burbujas.
  const recent = bubbles.slice(-400).map((b) => b.qty).sort((a, b) => a - b);
  const bRef = recent[Math.floor(recent.length * 0.9)] || 1;
  const minQty = bRef * (opts.minBubble ?? 0);
  ctx.font = '600 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = firstAtOrAfter(bubbles, left - LIQ_SAMPLE_MS); i < bubbles.length; i++) {
    const b = bubbles[i];
    if (b.qty < minQty) continue;
    const x = tToX(b.t + LIQ_SAMPLE_MS / 2);
    const y = pToY(b.price);
    if (y < -40 || y > ph + 40) continue;
    const r = Math.min(34, 2.5 + 11 * Math.sqrt(b.qty / bRef));
    const buy = b.side === 'buy';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = buy ? 'rgba(38, 166, 154, 0.55)' : 'rgba(239, 83, 80, 0.55)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = buy ? 'rgba(120, 230, 210, 0.9)' : 'rgba(255, 150, 140, 0.9)';
    ctx.stroke();
    if (r >= 14) {
      ctx.fillStyle = '#fff';
      ctx.fillText(compact.format(b.qty), x, y);
    }
  }
  ctx.restore();

  // ---------- eje de precios ----------
  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(pw, 0, AXIS_W, h);
  ctx.fillRect(0, ph, w, AXIS_H);
  ctx.strokeStyle = '#232a3a';
  ctx.beginPath();
  ctx.moveTo(pw + 0.5, 0);
  ctx.lineTo(pw + 0.5, ph);
  ctx.moveTo(0, ph + 0.5);
  ctx.lineTo(pw, ph + 0.5);
  ctx.stroke();
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#8b95a7';
  const pStep = niceStep(view.priceSpan / Math.max(2, ph / 45));
  for (let p = Math.ceil(yToP(ph) / pStep) * pStep; p <= top; p += pStep) {
    ctx.fillText(opts.formatPrice(p), pw + 6, pToY(p));
  }
  // Precio actual (punto medio entre bid y ask)
  const yMid = pToY(mid);
  if (yMid >= 0 && yMid <= ph) {
    ctx.fillStyle = '#4c8dff';
    ctx.fillRect(pw, yMid - 9, AXIS_W, 18);
    ctx.fillStyle = '#fff';
    ctx.fillText(opts.formatPrice(mid), pw + 6, yMid);
  }

  // ---------- eje de tiempo ----------
  const spans = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800].map((s) => s * 1000);
  const tStep = spans.find((s) => s / msPerPx >= 80) || spans.at(-1);
  ctx.fillStyle = '#8b95a7';
  ctx.textAlign = 'center';
  for (let t = Math.ceil(left / tStep) * tStep; t <= right; t += tStep) {
    const x = tToX(t);
    if (x < 30 || x > pw - 30) continue;
    ctx.fillText(hms(t), x, ph + AXIS_H / 2);
  }

  // ---------- cruz del cursor ----------
  const hv = view.hover;
  if (hv && hv.x < pw && hv.y < ph) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(0, hv.y + 0.5);
    ctx.lineTo(pw, hv.y + 0.5);
    ctx.moveTo(hv.x + 0.5, 0);
    ctx.lineTo(hv.x + 0.5, ph);
    ctx.stroke();
    ctx.restore();
    const price = yToP(hv.y);
    // Órdenes esperando en ese precio, según la foto más reciente.
    const j = Math.round(price / step) - last.base;
    const q = last.data[j] || 0;
    ctx.fillStyle = '#2a3142';
    ctx.fillRect(pw, hv.y - 9, AXIS_W, 18);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(opts.formatPrice(price), pw + 6, hv.y);
    const label = `${compact.format(q)} en el libro`;
    ctx.font = '11px system-ui, sans-serif';
    const tw = ctx.measureText(label).width + 10;
    const lx = Math.min(hv.x + 12, pw - tw - 4);
    ctx.fillStyle = 'rgba(18, 23, 34, 0.9)';
    ctx.fillRect(lx, hv.y - 26, tw, 18);
    ctx.fillStyle = '#e6e9ef';
    ctx.fillText(label, lx + 5, hv.y - 17);
    const tx = right - (pw - hv.x) * msPerPx;
    ctx.fillStyle = '#2a3142';
    ctx.fillRect(hv.x - 34, ph, 68, AXIS_H);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(hms(tx), hv.x, ph + AXIS_H / 2);
  }

  return { pw, ph, msPerPx, ppp, right, mid };
}
