// Datos públicos de mercado de Binance. No necesitan cuenta ni clave.
// data-api.binance.vision es el espejo oficial "solo datos de mercado" de Binance:
// funciona desde el navegador (permite CORS) y en más países que api.binance.com.

const REST_HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'];
const WS_HOST = 'wss://data-stream.binance.vision/stream';

async function getJson(path) {
  let lastError;
  for (const host of REST_HOSTS) {
    let res;
    try {
      res = await fetch(host + path);
    } catch (e) {
      lastError = e; // sin conexión o host bloqueado: probamos el siguiente
      continue;
    }
    if (res.ok) return res.json();
    const body = await res.json().catch(() => ({}));
    lastError = new Error(body.msg || `HTTP ${res.status}`);
    // 400 = pedido inválido (por ejemplo, un símbolo que no existe): otro host diría lo mismo.
    if (res.status === 400) break;
  }
  throw lastError;
}

// Velas (OHLCV). Binance devuelve arrays: [openTime, open, high, low, close, volume, ...]
export async function fetchKlines(symbol, interval, limit = 500) {
  const rows = await getJson(`/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  return rows.map(toCandle);
}

export function toCandle(k) {
  return {
    time: Math.floor(k[0] / 1000), // lightweight-charts usa segundos
    open: +k[1],
    high: +k[2],
    low: +k[3],
    close: +k[4],
    volume: +k[5],
  };
}

// Precio y variación de 24 h de varios símbolos en una sola llamada.
export async function fetch24h(symbols) {
  if (!symbols.length) return [];
  const list = encodeURIComponent(JSON.stringify(symbols));
  return getJson(`/api/v3/ticker/24hr?symbols=${list}&type=MINI`);
}

// Lista de pares que cotizan contra USDT (para el buscador).
export async function fetchUsdtSymbols() {
  const data = await getJson('/api/v3/exchangeInfo?permissions=SPOT&symbolStatus=TRADING');
  return data.symbols
    .filter((s) => s.quoteAsset === 'USDT')
    .map((s) => ({ symbol: s.symbol, base: s.baseAsset }));
}

// Abre un WebSocket combinado (varios "streams" en una conexión) y se reconecta solo.
// Devuelve una función para cerrarlo.
export function openStream(streams, onMessage) {
  let ws;
  let closed = false;
  let retry = 0;

  function connect() {
    ws = new WebSocket(`${WS_HOST}?streams=${streams.join('/')}`);
    ws.onopen = () => (retry = 0);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.data) onMessage(msg.data);
    };
    ws.onclose = () => {
      if (closed) return;
      retry = Math.min(retry + 1, 6);
      setTimeout(connect, 500 * 2 ** retry); // espera cada vez más entre intentos
    };
  }

  if (streams.length) connect();
  return () => {
    closed = true;
    ws?.close();
  };
}

// Temporalidades que ofrece la app: etiqueta visible -> código de Binance.
export const TIMEFRAMES = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1h', value: '1h' },
  { label: '4h', value: '4h' },
  { label: '1D', value: '1d' },
  { label: '1S', value: '1w' },
];
