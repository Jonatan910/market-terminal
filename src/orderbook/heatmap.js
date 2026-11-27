// Mapa de calor de liquidez: cada SAMPLE_MS se guarda una "foto" del libro de órdenes
// (cuánto hay esperando en cada franja de precio) y se dibuja como una columna detrás de las velas.
// Binance no da historia del libro: el mapa se arma desde que abrís la página.

export const SAMPLE_MS = 2000; // una foto cada 2 segundos
const MAX_COLUMNS = 5400; // 3 horas de fotos (después se descartan las más viejas)
const RANGE = 0.05; // se guarda solo ±5 % alrededor del precio
const BUCKET_FRACTION = 0.0002; // franja de precio ≈ 0,02 % del precio (BTC 60.000 → 10 USDT)

// Redondea a un número "lindo": 1, 2 o 5 por una potencia de 10.
export function niceStep(x) {
  const p = 10 ** Math.floor(Math.log10(x));
  const m = x / p;
  // toPrecision limpia errores de punto flotante (0.0000099999… → 0.00001)
  return parseFloat(((m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p).toPrecision(12));
}

// Suma las órdenes (compras y ventas juntas) por franja de precio alrededor de `mid`.
// Devuelve { base, data }: data[i] es la cantidad en la franja (base + i).
export function bucketizeBook(bids, asks, mid, step, range = RANGE) {
  const lo = Math.floor((mid * (1 - range)) / step);
  const hi = Math.ceil((mid * (1 + range)) / step);
  const data = new Float32Array(hi - lo + 1);
  for (const side of [bids, asks]) {
    for (const [price, qty] of side) {
      const i = Math.round(price / step) - lo;
      if (i >= 0 && i < data.length) data[i] += qty;
    }
  }
  return { base: lo, data };
}

// Graba fotos del libro de un símbolo. Se guarda una por símbolo mientras la página esté abierta,
// así si vas a otro símbolo y volvés, lo grabado sigue ahí (con un hueco mientras no estabas).
const recorders = new Map();
export function getRecorder(symbol) {
  if (!recorders.has(symbol)) recorders.set(symbol, createRecorder());
  return recorders.get(symbol);
}

export function createRecorder() {
  const columns = []; // [{ t: segundos, base, data }]
  let step = null;
  return {
    columns,
    get step() {
      return step;
    },
    get since() {
      return columns[0]?.t ?? null;
    },
    sample(book, now = Date.now()) {
      if (!book?.ready) return false;
      const bid = book.bestBid();
      const ask = book.bestAsk();
      if (bid == null || ask == null) return false;
      const mid = (bid + ask) / 2;
      step ??= niceStep(mid * BUCKET_FRACTION);
      columns.push({ t: Math.floor(now / 1000), ...bucketizeBook(book.bids, book.asks, mid, step) });
      if (columns.length > MAX_COLUMNS) columns.shift();
      return true;
    },
  };
}
