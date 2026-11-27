// Detector de órdenes grandes (modo liquidez):
//   - Operaciones grandes: "burbujas" (compras o ventas a mercado agrupadas cada medio segundo)
//     mucho más grandes que lo habitual.
//   - Paredes grandes en el libro y qué pasa con ellas:
//       nueva     -> apareció una orden grande esperando
//       ejecutada -> desapareció porque se operó contra ella (el precio llegó y la "comió")
//       retirada  -> desapareció sin operarse (la sacaron: posible orden falsa / "spoofing")
//
// Umbral automático: operaciones, el 1 % más grande; paredes, el 0,5 % más grande del libro
// (suavizado en el tiempo para que no salte de una foto a otra). Se puede fijar a mano.
// Una pared tiene que durar al menos 3 s para contar: así se ignoran las órdenes que los
// creadores de mercado mueven constantemente cerca del precio (si no, sería puro ruido).
import { LIQ_SAMPLE_MS } from './recorder.js';

const MAX_EVENTS = 300;
const GONE_RATIO = 0.3; // una pared "desaparece" si queda por debajo del 30 % del umbral
const FILLED_RATIO = 0.5; // ejecutada si se operó al menos la mitad de su tamaño en ese precio
export const CONFIRM_MS = 3000; // una pared cuenta recién después de 3 s
const SMOOTH = 0.05; // suavizado del umbral automático de paredes

export function percentile(values, p) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
}

export function createDetector() {
  const walls = new Map(); // índice de franja -> { idx, price, qty, side, since, volStart }
  const events = []; // más nuevos primero: { id, type, side, qty, price, t }
  let seq = 0;
  const auto = { trade: null, wall: null }; // umbrales automáticos calculados

  const traded = (rec, idx) => {
    const v = rec.volAt.get(idx);
    return v ? v.buy + v.sell : 0;
  };
  function push(e) {
    events.unshift({ id: ++seq, ...e });
    if (events.length > MAX_EVENTS) events.pop();
    return events[0];
  }

  return {
    walls,
    events,
    auto,

    // Llamar después de cada foto. `fixed` = umbrales fijados por el usuario (null = automático).
    // Devuelve los eventos nuevos de esta vuelta.
    update(rec, fixed = {}) {
      const out = [];
      const col = rec.columns.at(-1);
      if (!col) return out;
      const mid = (col.bid + col.ask) / 2;

      // ----- operaciones grandes (solo burbujas ya cerradas) -----
      const recent = rec.bubbles.slice(-1500).map((b) => b.qty);
      auto.trade = recent.length >= 50 ? percentile(recent, 0.99) : null;
      const tTh = fixed.trade ?? auto.trade;
      for (let i = rec.bubbles.length - 1; i >= 0; i--) {
        const b = rec.bubbles[i];
        if (b.checked) break;
        if (b.t + LIQ_SAMPLE_MS > col.t) continue; // todavía se está armando
        b.checked = true;
        if (tTh != null && b.qty >= tTh) {
          b.big = true;
          out.push(push({ type: 'trade', side: b.side, qty: b.qty, price: b.price, t: b.t }));
        }
      }

      // ----- paredes en el libro -----
      const levels = [];
      for (const q of col.data) if (q > 0) levels.push(q);
      const p = levels.length >= 50 ? percentile(levels, 0.995) : null;
      if (p != null) auto.wall = auto.wall == null ? p : auto.wall + (p - auto.wall) * SMOOTH;
      const wTh = fixed.wall ?? auto.wall;
      if (wTh == null) return out;
      const seen = new Set();
      for (let j = 0; j < col.data.length; j++) {
        const q = col.data[j];
        if (q < wTh) continue;
        const idx = col.base + j;
        seen.add(idx);
        const w = walls.get(idx);
        if (w) {
          w.qty = q;
          // Recién después de 3 s se confirma (y se avisa) como pared.
          if (!w.confirmed && col.t - w.since >= CONFIRM_MS) {
            w.confirmed = true;
            out.push(push({ type: 'wall-new', side: w.side, qty: q, price: w.price, t: col.t }));
          }
          continue;
        }
        const price = idx * rec.step;
        walls.set(idx, { idx, price, qty: q, side: price < mid ? 'bid' : 'ask', since: col.t, volStart: traded(rec, idx), confirmed: false });
      }
      for (const [idx, w] of walls) {
        if (seen.has(idx)) continue;
        const j = idx - col.base;
        const q = j >= 0 && j < col.data.length ? col.data[j] : null;
        if (q == null) {
          walls.delete(idx); // quedó fuera del rango grabado (el precio se alejó): sin evento
          continue;
        }
        if (q >= wTh * GONE_RATIO) continue; // achicada pero sigue ahí
        walls.delete(idx);
        if (!w.confirmed) continue; // duró menos de 3 s: no era una pared, solo ruido
        const filled = traded(rec, idx) - w.volStart >= w.qty * FILLED_RATIO;
        out.push(push({ type: filled ? 'wall-filled' : 'wall-pulled', side: w.side, qty: w.qty, price: w.price, t: col.t, since: w.since }));
      }
      return out;
    },
  };
}

const detectors = new Map();
export function getDetector(symbol) {
  if (!detectors.has(symbol)) detectors.set(symbol, createDetector());
  return detectors.get(symbol);
}
