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
  // Zonas: mapa (pw × ph) · panel del libro (domW) · eje de precios (AXIS_W) · panel de abajo (botH) · eje de tiempo.
  const domW = opts.showDom ? (w < 700 ? 70 : 150) : 0;
  const botH = opts.showBottom ? Math.round(Math.min(140, Math.max(70, h * 0.22))) : 0;
  const pw = Math.max(1, Math.floor(w - AXIS_W - domW));
  const ph = Math.max(1, Math.floor(h - AXIS_H - botH));
  const ax = pw + domW; // x donde empieza el eje de precios
  const ty = ph + botH; // y donde empieza el eje de tiempo
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

  // ---------- panel del libro (derecha): libro actual + volumen operado por precio ----------
  if (domW) {
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(pw, 0, domW, ph);
    const ROW = 3; // franjas de 3 px
    const bookW = w < 700 ? domW : Math.round(domW * 0.55);
    const volW = domW - bookW;
    // Libro actual por franja de pantalla
    const book = new Map();
    for (let j = 0; j < last.data.length; j++) {
      const q = last.data[j];
      if (!q) continue;
      const y = pToY((last.base + j) * step);
      if (y < 0 || y >= ph) continue;
      const r = Math.floor(y / ROW);
      book.set(r, (book.get(r) || 0) + q);
    }
    const bq = [...book.values()].sort((u, v) => u - v);
    const bRef = bq[Math.floor(bq.length * 0.95)] || 1;
    let top1 = null;
    for (const [r, q] of book) {
      const y = r * ROW;
      const wq = Math.min(bookW - 4, Math.max(1, (q / bRef) * (bookW - 4)));
      ctx.fillStyle = yToP(y + ROW / 2) < mid ? 'rgba(61, 220, 151, 0.6)' : 'rgba(255, 90, 95, 0.6)';
      ctx.fillRect(pw + 2, y, wq, ROW - 0.5);
      if (!top1 || q > top1.q) top1 = { y, q };
    }
    // Volumen operado desde que empezó la grabación, por franja (compras verde + ventas rojo).
    if (volW) {
      const vol = new Map();
      for (const [idx, v] of rec.volAt) {
        const y = pToY(idx * step);
        if (y < 0 || y >= ph) continue;
        const r = Math.floor(y / ROW);
        const cur = vol.get(r) || { buy: 0, sell: 0 };
        cur.buy += v.buy;
        cur.sell += v.sell;
        vol.set(r, cur);
      }
      let vMax = 0;
      for (const v of vol.values()) vMax = Math.max(vMax, v.buy + v.sell);
      const x0 = pw + bookW;
      ctx.fillStyle = '#121722';
      ctx.fillRect(x0, 0, 1, ph);
      for (const [r, v] of vol) {
        const y = r * ROW;
        const wb = (v.buy / (vMax || 1)) * (volW - 4);
        const ws = (v.sell / (vMax || 1)) * (volW - 4);
        ctx.fillStyle = 'rgba(61, 220, 151, 0.75)';
        ctx.fillRect(x0 + 2, y, wb, ROW - 0.5);
        ctx.fillStyle = 'rgba(255, 90, 95, 0.75)';
        ctx.fillRect(x0 + 2 + wb, y, ws, ROW - 0.5);
      }
    }
    // Títulos y la pared más grande del libro
    ctx.font = '10px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8b95a7';
    ctx.fillText('Libro', pw + 4, 4);
    if (volW) ctx.fillText('Volumen', pw + bookW + 4, 4);
    if (top1) {
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e6e9ef';
      ctx.fillText(compact.format(top1.q), pw + 4, top1.y + ROW / 2 - 7);
    }
  }

  // ---------- panel de abajo: volumen por medio segundo + CVD ----------
  if (botH) {
    const y0 = ph;
    ctx.fillStyle = '#080b11';
    ctx.fillRect(0, y0, ax, botH);
    ctx.fillStyle = '#232a3a';
    ctx.fillRect(0, y0, ax, 1);
    // Volumen y CVD por medio segundo (el CVD arranca en 0 al empezar la grabación).
    const slots = new Map(); // t -> { buy, sell }
    let cvd = 0;
    const cvdPts = [];
    for (const b of bubbles) {
      cvd += b.side === 'buy' ? b.qty : -b.qty;
      if (b.t < left - LIQ_SAMPLE_MS) continue;
      const v = slots.get(b.t) || { buy: 0, sell: 0 };
      v[b.side] += b.qty;
      slots.set(b.t, v);
      if (cvdPts.length && cvdPts.at(-1).t === b.t) cvdPts.at(-1).v = cvd;
      else cvdPts.push({ t: b.t, v: cvd });
    }
    let vMax = 0;
    for (const v of slots.values()) vMax = Math.max(vMax, v.buy + v.sell);
    const barW = Math.max(1, view.pxPerCol - (view.pxPerCol > 3 ? 1 : 0));
    const vh = botH - 6;
    for (const [t, v] of slots) {
      const x = tToX(t);
      if (x < -barW || x > pw) continue;
      const hb = (v.buy / (vMax || 1)) * vh * 0.9;
      const hs = (v.sell / (vMax || 1)) * vh * 0.9;
      ctx.fillStyle = 'rgba(61, 220, 151, 0.55)';
      ctx.fillRect(x, y0 + botH - hb, barW, hb);
      ctx.fillStyle = 'rgba(255, 90, 95, 0.55)';
      ctx.fillRect(x, y0 + botH - hb - hs, barW, hs);
    }
    // CVD: línea amarilla escalada a lo visible
    const vis = cvdPts.filter((p) => tToX(p.t) >= -5 && tToX(p.t) <= pw + 5);
    if (vis.length > 1) {
      let lo = Infinity;
      let hi = -Infinity;
      for (const p of vis) {
        lo = Math.min(lo, p.v);
        hi = Math.max(hi, p.v);
      }
      if (hi === lo) hi = lo + 1;
      const cy = (v) => y0 + 6 + (1 - (v - lo) / (hi - lo)) * (botH - 14);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y0, pw, botH);
      ctx.clip();
      ctx.beginPath();
      vis.forEach((p, k) => (k ? ctx.lineTo(tToX(p.t), cy(p.v)) : ctx.moveTo(tToX(p.t), cy(p.v))));
      ctx.strokeStyle = '#f5c518';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#f5c518';
    ctx.fillText(`CVD ${cvd >= 0 ? '+' : ''}${compact.format(cvd)}`, 6, y0 + 4);
    ctx.fillStyle = '#8b95a7';
    ctx.fillText('Volumen por ½ segundo', 80, y0 + 4);
  }

  // ---------- eje de precios ----------
  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(ax, 0, AXIS_W, h);
  ctx.fillRect(0, ty, w, AXIS_H);
  ctx.strokeStyle = '#232a3a';
  ctx.beginPath();
  ctx.moveTo(ax + 0.5, 0);
  ctx.lineTo(ax + 0.5, ty);
  ctx.moveTo(pw + 0.5, 0);
  ctx.lineTo(pw + 0.5, ph);
  ctx.moveTo(0, ty + 0.5);
  ctx.lineTo(ax, ty + 0.5);
  ctx.stroke();
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#8b95a7';
  const pStep = niceStep(view.priceSpan / Math.max(2, ph / 45));
  for (let p = Math.ceil(yToP(ph) / pStep) * pStep; p <= top; p += pStep) {
    ctx.fillText(opts.formatPrice(p), ax + 6, pToY(p));
  }
  // Precio actual (punto medio entre bid y ask)
  const yMid = pToY(mid);
  if (yMid >= 0 && yMid <= ph) {
    ctx.fillStyle = '#4c8dff';
    ctx.fillRect(ax, yMid - 9, AXIS_W, 18);
    ctx.fillStyle = '#fff';
    ctx.fillText(opts.formatPrice(mid), ax + 6, yMid);
  }

  // ---------- eje de tiempo ----------
  const spans = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800].map((s) => s * 1000);
  const tStep = spans.find((s) => s / msPerPx >= 80) || spans.at(-1);
  ctx.fillStyle = '#8b95a7';
  ctx.textAlign = 'center';
  for (let t = Math.ceil(left / tStep) * tStep; t <= right; t += tStep) {
    const x = tToX(t);
    if (x < 30 || x > pw - 30) continue;
    ctx.fillText(hms(t), x, ty + AXIS_H / 2);
  }

  // ---------- cruz del cursor ----------
  const hv = view.hover;
  if (hv && hv.x < pw && hv.y < ty) {
    const inHeat = hv.y < ph;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    if (inHeat) {
      ctx.moveTo(0, hv.y + 0.5);
      ctx.lineTo(ax, hv.y + 0.5);
    }
    ctx.moveTo(hv.x + 0.5, 0);
    ctx.lineTo(hv.x + 0.5, ty);
    ctx.stroke();
    ctx.restore();
    if (inHeat) {
      const price = yToP(hv.y);
      // Órdenes esperando en ese precio, según la foto más reciente.
      const j = Math.round(price / step) - last.base;
      const q = last.data[j] || 0;
      ctx.fillStyle = '#2a3142';
      ctx.fillRect(ax, hv.y - 9, AXIS_W, 18);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(opts.formatPrice(price), ax + 6, hv.y);
      const label = `${compact.format(q)} en el libro`;
      ctx.font = '11px system-ui, sans-serif';
      const tw = ctx.measureText(label).width + 10;
      const lx = Math.min(hv.x + 12, pw - tw - 4);
      ctx.fillStyle = 'rgba(18, 23, 34, 0.9)';
      ctx.fillRect(lx, hv.y - 26, tw, 18);
      ctx.fillStyle = '#e6e9ef';
      ctx.fillText(label, lx + 5, hv.y - 17);
    }
    const tx = right - (pw - hv.x) * msPerPx;
    ctx.fillStyle = '#2a3142';
    ctx.fillRect(hv.x - 34, ty, 68, AXIS_H);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(hms(tx), hv.x, ty + AXIS_H / 2);
  }

  return { pw, ph, msPerPx, ppp, right, mid };
}
