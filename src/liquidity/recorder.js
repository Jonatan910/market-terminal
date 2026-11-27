// Grabadora del "modo liquidez" (estilo Bookmap): más resolución que el mapa de calor del gráfico.
//   - Cada medio segundo, una foto del libro en franjas finas (±1 % alrededor del precio),
//     con la mejor compra (bid) y la mejor venta (ask).
//   - Las operaciones reales (aggTrades de Binance) agrupadas cada medio segundo y por lado:
//     compras a mercado y ventas a mercado, con su precio promedio. Son las "burbujas".
// Se guardan los últimos 30 minutos por símbolo mientras la página esté abierta.
import { bucketizeBook, niceStep } from '../orderbook/heatmap.js';

export const LIQ_SAMPLE_MS = 500;
const MAX_COLUMNS = 3600; // 30 minutos de fotos
const MAX_BUBBLES = 30000;
const RANGE = 0.01; // ±1 % del precio
const STEP_FRACTION = 0.00004; // franjas de ≈0,004 % (BTC 60.000 → 2 USDT)

export function createLiqRecorder() {
  const columns = []; // [{ t: ms, bid, ask, base, data }]
  const bubbles = []; // [{ t: ms (inicio del medio segundo), side: 'buy'|'sell', qty, price }]
  const open = { buy: null, sell: null }; // burbuja que se está armando de cada lado
  // Volumen operado por precio desde que empezó la grabación: índice de franja -> { buy, sell }.
  const volAt = new Map();
  let step = null;

  return {
    columns,
    bubbles,
    volAt,
    get step() {
      return step;
    },
    get since() {
      return columns[0]?.t ?? null;
    },

    // Foto del libro. Devuelve false si el libro todavía no está listo.
    sample(book, now = Date.now()) {
      if (!book?.ready) return false;
      const bid = book.bestBid();
      const ask = book.bestAsk();
      if (bid == null || ask == null) return false;
      const mid = (bid + ask) / 2;
      step ??= niceStep(mid * STEP_FRACTION);
      columns.push({ t: now, bid, ask, ...bucketizeBook(book.bids, book.asks, mid, step, RANGE) });
      if (columns.length > MAX_COLUMNS) columns.shift();
      return true;
    },

    // Una operación: { price, qty, time (ms), isSell (el que inició fue un vendedor) }.
    trade({ price, qty, time, isSell }) {
      const t = Math.floor(time / LIQ_SAMPLE_MS) * LIQ_SAMPLE_MS;
      const side = isSell ? 'sell' : 'buy';
      if (step) {
        const idx = Math.round(price / step);
        const v = volAt.get(idx) || { buy: 0, sell: 0 };
        v[side] += qty;
        volAt.set(idx, v);
      }
      const b = open[side];
      if (b && b.t === t) {
        b.notional += price * qty;
        b.qty += qty;
        b.price = b.notional / b.qty; // precio promedio ponderado por volumen
        return;
      }
      const nb = { t, side, qty, notional: price * qty, price };
      bubbles.push(nb);
      open[side] = nb;
      if (bubbles.length > MAX_BUBBLES) bubbles.shift();
    },
  };
}

const recorders = new Map();
export function getLiqRecorder(symbol) {
  if (!recorders.has(symbol)) recorders.set(symbol, createLiqRecorder());
  return recorders.get(symbol);
}
