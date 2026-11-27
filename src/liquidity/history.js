// Historia del modo liquidez desde el servidor que graba todo el día (server/recorder.js).
// Al abrir se piden las últimas 2 horas; si desplazás hacia atrás se va pidiendo más (hasta 7 días).
import { RECORDER_URL } from '../config.js';

export const historyEnabled = () => Boolean(RECORDER_URL);
const INITIAL_MS = 2 * 3600 * 1000;
const MAX_AGE_MS = 7 * 86400 * 1000;

export async function fetchHistory(symbol, from, to, maxCols = 1500) {
  const url = `${RECORDER_URL}/history?symbol=${encodeURIComponent(symbol)}&from=${Math.round(from)}&to=${Math.round(to)}&maxCols=${maxCols}`;
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return decode(body);
}

// Formato compacto del servidor -> columnas como las del grabador en vivo (data densa desde base).
export function decode(d) {
  const columns = d.columns.map(([t, bid, ask, base, lv]) => {
    let max = 0;
    for (let i = 0; i < lv.length; i += 2) max = Math.max(max, lv[i]);
    const data = new Float32Array(max + 1);
    for (let i = 0; i < lv.length; i += 2) data[lv[i]] = lv[i + 1];
    return { t, bid, ask, base, data, step: d.step };
  });
  const bubbles = d.bubbles.map(([t, s, price, qty]) => ({ t, side: s ? 'sell' : 'buy', price, qty, checked: true }));
  return { step: d.step, columns, bubbles };
}

// Historia por símbolo (se conserva mientras la página esté abierta).
const stores = new Map();
export function getHistory(symbol) {
  if (!stores.has(symbol)) stores.set(symbol, { symbol, columns: [], bubbles: [], from: null, step: null, loading: false, error: null, done: false });
  return stores.get(symbol);
}

async function load(store, from, to, maxCols) {
  store.loading = true;
  try {
    const h = await fetchHistory(store.symbol, from, to, maxCols);
    store.step ??= h.step;
    // Se agrega adelante lo más viejo, sin repetir lo que ya estaba.
    const firstT = store.columns[0]?.t ?? Infinity;
    const firstB = store.bubbles[0]?.t ?? Infinity;
    store.columns = [...h.columns.filter((c) => c.t < firstT), ...store.columns];
    store.bubbles = [...h.bubbles.filter((b) => b.t < firstB), ...store.bubbles];
    store.from = from;
    store.error = null;
    if (from <= Date.now() - MAX_AGE_MS) store.done = true;
  } catch (e) {
    store.error = e.message;
  } finally {
    store.loading = false;
  }
}

// Primera carga: las últimas 2 horas con todo el detalle (una foto cada 2 s).
export function loadInitial(store) {
  if (store.from != null || store.loading || !historyEnabled()) return;
  const now = Date.now();
  return load(store, now - INITIAL_MS, now, 3600);
}

// Si la vista llega más atrás de lo cargado, pide el tramo anterior (con menos detalle si es largo).
export function loadOlderIfNeeded(store, left) {
  if (!historyEnabled() || store.loading || store.done || store.from == null || left >= store.from) return;
  const span = store.from - left;
  const from = Math.max(Date.now() - MAX_AGE_MS, left - span); // pide el doble de lo que falta
  return load(store, from, store.from, 1500);
}
