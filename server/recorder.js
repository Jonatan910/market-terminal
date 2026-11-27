// Servidor que graba Binance las 24 horas para el "modo liquidez".
//
//   - Por cada símbolo: libro de órdenes en vivo (foto + cambios) y operaciones (aggTrade).
//   - Cada 2 s guarda una foto del libro con las 80 franjas más grandes (±1 % del precio).
//   - Las operaciones se agrupan por segundo y por lado (compras / ventas a mercado).
//   - Cada minuto comprime lo grabado y lo guarda (Supabase o archivos). Borra lo de más de 7 días.
//   - Responde:
//       GET /health   -> estado (lo usa el "ping" que lo mantiene despierto en Render)
//       GET /history?symbol=crypto:BTCUSDT&from=ms&to=ms&maxCols=1500 -> historia para la terminal
//
// Variables de entorno:
//   DATABASE_URL    conexión a Postgres (Supabase). Sin ella guarda en ./data-recorder
//   SYMBOLS         símbolos a grabar (por defecto "crypto:BTCUSDT,perp:BTCUSDT")
//   RETENTION_DAYS  días a guardar (por defecto 7)
//   PORT            puerto HTTP (Render lo define solo)
import http from 'node:http';
import { gzipSync } from 'node:zlib';
import { connectOrderBook } from '../src/orderbook/live.js';
import { openStream } from '../src/api/binance.js';
import { bucketizeBook, niceStep } from '../src/orderbook/heatmap.js';
import { encodeMinute, decodeMinute } from './codec.js';
import { createStore } from './store.js';

const SAMPLE_MS = 2000;
const TOP_LEVELS = 80;
const RANGE = 0.01;
const STEP_FRACTION = 0.00004; // igual que la terminal (BTC 60.000 → franjas de 2 USDT)
const SYMBOLS = (process.env.SYMBOLS || 'crypto:BTCUSDT,perp:BTCUSDT').split(',').map((s) => s.trim()).filter(Boolean);
const RETENTION_DAYS = Number(process.env.RETENTION_DAYS) || 7;
const PORT = Number(process.env.PORT) || 8787;
const startedAt = Date.now();

// Si la base de datos rechaza la conexión, se explica en castellano qué revisar (en vez del error técnico).
let store;
try {
  store = await createStore();
} catch (e) {
  const hints = {
    '28P01': 'La contraseña de DATABASE_URL es incorrecta. Revisá que no quede [YOUR-PASSWORD] ni corchetes, y que sea la contraseña de la base de datos (Project Settings → Database). Si tiene símbolos como @ # / ? %, cambiala por una con solo letras y números.',
    ENOTFOUND: 'No se encuentra el servidor de la base de datos: revisá la dirección (host) en DATABASE_URL.',
    ECONNREFUSED: 'La base de datos rechazó la conexión: revisá el puerto (5432 para Session pooler).',
    XX000: 'Supabase no reconoce el usuario: en DATABASE_URL tiene que ser postgres.<código-del-proyecto> (conexión "Session pooler").',
  };
  console.error(`No se pudo conectar a la base de datos (${e.code || 'sin código'}): ${e.message}`);
  console.error(hints[e.code] || 'Revisá la variable DATABASE_URL en Render (Environment).');
  process.exit(1);
}
const log = (...a) => console.log(new Date().toISOString(), ...a);
log(`Grabando ${SYMBOLS.join(', ')} · ${RETENTION_DAYS} días · guardado en ${store.kind}`);

// ---------- grabación por símbolo ----------
const recorders = new Map();

for (const id of SYMBOLS) {
  const [market, ticker] = id.split(':');
  const venue = market === 'perp' ? 'futures' : 'spot';
  const r = { id, step: null, book: null, columns: [], bubbles: new Map(), lastSample: null, saved: 0, errors: 0 };
  recorders.set(id, r);

  connectOrderBook(ticker, (book) => (r.book = book), venue);
  openStream(
    [`${ticker.toLowerCase()}@aggTrade`],
    (t) => {
      // Operaciones agrupadas por segundo y lado: precio promedio ponderado.
      const sec = Math.floor(t.T / 1000) * 1000;
      const side = t.m ? 'sell' : 'buy';
      const key = `${sec}|${side}`;
      const b = r.bubbles.get(key) || { t: sec, side, qty: 0, notional: 0 };
      b.qty += +t.q;
      b.notional += +t.q * +t.p;
      r.bubbles.set(key, b);
    },
    venue,
  );
}

function sample() {
  const now = Date.now();
  for (const r of recorders.values()) {
    const book = r.book;
    if (!book?.ready) continue;
    const bid = book.bestBid();
    const ask = book.bestAsk();
    if (bid == null || ask == null) continue;
    const mid = (bid + ask) / 2;
    r.step ??= niceStep(mid * STEP_FRACTION);
    const { base, data } = bucketizeBook(book.bids, book.asks, mid, r.step, RANGE);
    // Solo las 80 franjas con más órdenes (lo demás casi no se ve en el mapa).
    const idx = [];
    for (let j = 0; j < data.length; j++) if (data[j] > 0) idx.push(j);
    idx.sort((a, b) => data[b] - data[a]);
    const top = idx.slice(0, TOP_LEVELS).sort((a, b) => a - b);
    r.columns.push({ t: now, bid, ask, base, levels: top.map((j) => [j, data[j]]) });
    r.lastSample = now;
  }
}
setInterval(sample, SAMPLE_MS);

// Cada minuto: comprime y guarda el minuto anterior de cada símbolo.
async function flush() {
  const minute = Math.floor(Date.now() / 60000) * 60000 - 60000;
  for (const r of recorders.values()) {
    const cols = r.columns.filter((c) => c.t >= minute && c.t < minute + 60000);
    const bubs = [...r.bubbles.values()].filter((b) => b.t >= minute && b.t < minute + 60000);
    // Lo que ya quedó guardado se saca de memoria.
    r.columns = r.columns.filter((c) => c.t >= minute + 60000);
    for (const [k, b] of r.bubbles) if (b.t < minute + 60000) r.bubbles.delete(k);
    if (!cols.length || !r.step) continue;
    try {
      const data = encodeMinute(minute, r.step, cols, bubs.map((b) => ({ t: b.t, side: b.side, price: b.notional / b.qty, qty: b.qty })));
      await store.save(r.id, minute, data);
      r.saved++;
    } catch (e) {
      r.errors++;
      log(`Error guardando ${r.id}:`, e.message);
    }
  }
}
setTimeout(() => {
  flush();
  setInterval(flush, 60000);
}, 60000 - (Date.now() % 60000) + 1000); // un segundo después de cada cambio de minuto

// Cada hora: borra lo de más de RETENTION_DAYS días.
setInterval(async () => {
  try {
    const n = await store.prune(Date.now() - RETENTION_DAYS * 86400000);
    if (n) log(`Borrados ${n} minutos viejos`);
  } catch (e) {
    log('Error borrando:', e.message);
  }
}, 3600000);

// ---------- historia para la terminal ----------
async function history(symbol, from, to, maxCols) {
  const r = recorders.get(symbol);
  if (!r) throw Object.assign(new Error(`No se graba ${symbol}`), { status: 404 });
  const rows = await store.load(symbol, Math.floor(from / 60000) * 60000, to);
  let step = r.step;
  let columns = [];
  let bubbles = [];
  for (const { minute, data } of rows) {
    const d = decodeMinute(minute, data);
    step ??= d.step;
    columns.push(...d.columns);
    bubbles.push(...d.bubbles);
  }
  // Más lo que todavía está en memoria (el minuto en curso).
  columns.push(...r.columns);
  bubbles.push(...[...r.bubbles.values()].map((b) => ({ t: b.t, side: b.side, price: b.notional / b.qty, qty: b.qty })));
  columns = columns.filter((c) => c.t >= from && c.t <= to);
  bubbles = bubbles.filter((b) => b.t >= from && b.t <= to).sort((a, b) => a.t - b.t);

  // Si el rango es largo, se envían menos fotos (una cada k) y operaciones agrupadas en ese intervalo.
  const k = Math.max(1, Math.ceil(columns.length / maxCols));
  if (k > 1) {
    columns = columns.filter((_, i) => i % k === 0);
    const slot = k * SAMPLE_MS;
    const agg = new Map();
    for (const b of bubbles) {
      const t = Math.floor(b.t / slot) * slot;
      const key = `${t}|${b.side}`;
      const a = agg.get(key) || { t, side: b.side, qty: 0, notional: 0 };
      a.qty += b.qty;
      a.notional += b.qty * b.price;
      agg.set(key, a);
    }
    bubbles = [...agg.values()].map((a) => ({ t: a.t, side: a.side, qty: a.qty, price: a.notional / a.qty })).sort((a, b) => a.t - b.t);
  }
  const round = (n) => Math.round(n * 1e4) / 1e4;
  return {
    symbol,
    step,
    from,
    to,
    resolutionMs: k * SAMPLE_MS,
    // Formato compacto: [t, bid, ask, base, [offset, cantidad, offset, cantidad, ...]]
    columns: columns.map((c) => [c.t, round(c.bid), round(c.ask), c.base, c.levels.flatMap(([o, q]) => [o, round(q)])]),
    bubbles: bubbles.map((b) => [b.t, b.side === 'sell' ? 1 : 0, round(b.price), round(b.qty)]),
  };
}

// ---------- servidor HTTP ----------
function send(req, res, status, body) {
  let data = Buffer.from(JSON.stringify(body));
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
  if (data.length > 2048 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    data = gzipSync(data);
    headers['Content-Encoding'] = 'gzip';
  }
  res.writeHead(status, headers);
  res.end(data);
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname === '/' || url.pathname === '/health') {
        const symbols = {};
        for (const r of recorders.values()) {
          symbols[r.id] = { libroListo: Boolean(r.book?.ready), ultimaFoto: r.lastSample, minutosGuardados: r.saved, errores: r.errors };
        }
        return send(req, res, 200, { ok: true, desde: startedAt, guardado: store.kind, almacenamiento: await store.stats().catch(() => null), symbols });
      }
      if (url.pathname === '/history') {
        const symbol = url.searchParams.get('symbol') || '';
        const to = Number(url.searchParams.get('to')) || Date.now();
        const from = Math.max(Number(url.searchParams.get('from')) || to - 7200000, to - RETENTION_DAYS * 86400000);
        const maxCols = Math.min(4000, Math.max(100, Number(url.searchParams.get('maxCols')) || 1500));
        return send(req, res, 200, await history(symbol, from, to, maxCols));
      }
      send(req, res, 404, { error: 'No encontrado' });
    } catch (e) {
      send(req, res, e.status || 500, { error: e.message });
    }
  })
  .listen(PORT, () => log(`Servidor escuchando en el puerto ${PORT}`));
