// Datos públicos de mercado de Binance. No necesitan cuenta ni clave.
// Dos "mercados" (venues):
//   spot    -> data-api.binance.vision: espejo oficial "solo datos de mercado" (funciona en más países)
//   futures -> fapi.binance.com: futuros perpetuos USDT (BTCUSDT.P). Binance los bloquea en algunos
//              países (por ejemplo EE.UU.); si el navegador no llega, se usa nuestro servidor /api/fapi.

export const VENUES = {
  spot: {
    rest: ['https://data-api.binance.vision', 'https://api.binance.com'],
    // Direcciones en vivo, en orden de preferencia: si una no manda nada, se prueba la siguiente.
    ws: ['wss://data-stream.binance.vision/stream', 'wss://stream.binance.com:9443/stream'],
    klines: '/api/v3/klines',
    depth: '/api/v3/depth',
    depthLimit: 5000,
  },
  futures: {
    rest: ['https://fapi.binance.com'],
    proxy: './api/fapi', // plan B: mismo pedido, a través de Vercel
    // Binance reorganizó las conexiones de futuros ("/market" para operaciones y velas, "/public" para el libro):
    // se prueban en orden hasta que una mande datos.
    ws: ['wss://fstream.binance.com/stream', 'wss://fstream.binance.com/market/stream', 'wss://fstream.binance.com/public/stream'],
    klines: '/fapi/v1/klines',
    depth: '/fapi/v1/depth',
    depthLimit: 1000, // futuros: máximo 1000 precios por lado
  },
};

async function getJson(path, venue = 'spot') {
  const v = VENUES[venue];
  let lastError;
  for (const host of v.rest) {
    let res;
    try {
      res = await fetch(host + path);
    } catch (e) {
      lastError = e; // sin conexión, host bloqueado o sin permiso CORS: probamos el siguiente
      continue;
    }
    if (res.ok) return res.json();
    const body = await res.json().catch(() => ({}));
    lastError = new Error(body.msg || `HTTP ${res.status}`);
    // 400 = pedido inválido (por ejemplo, un símbolo que no existe): otro host diría lo mismo.
    if (res.status === 400) throw lastError;
  }
  if (v.proxy) {
    const res = await fetch(`${v.proxy}?path=${encodeURIComponent(path)}`);
    const body = await res.json().catch(() => ({}));
    if (res.ok) return body;
    throw new Error(body.msg || body.error || `HTTP ${res.status}`);
  }
  throw lastError;
}

// Velas (OHLCV). Binance devuelve arrays: [openTime, open, high, low, close, volume, ...]
// Máximo 1000 por pedido. Con `before` (segundos) trae las velas anteriores a esa fecha:
// así se va cargando más historia a medida que desplazás el gráfico hacia la izquierda.
export const KLINES_LIMIT = 1000;
export async function fetchKlines(symbol, interval, { limit = KLINES_LIMIT, before, venue = 'spot' } = {}) {
  const end = before ? `&endTime=${before * 1000 - 1}` : '';
  const rows = await getJson(`${VENUES[venue].klines}?symbol=${symbol}&interval=${interval}&limit=${limit}${end}`, venue);
  return rows.map(toCandle);
}

// Fila de Binance: [apertura, open, high, low, close, volumen, cierre, volumen en USDT,
//                   cantidad de operaciones, volumen comprado por "takers", ...]
export function toCandle(k) {
  return {
    time: Math.floor(k[0] / 1000), // lightweight-charts usa segundos
    open: +k[1],
    high: +k[2],
    low: +k[3],
    close: +k[4],
    volume: +k[5],
    // Volumen de las compras "agresivas" (a precio de mercado): sirve para el CVD.
    buyVolume: k[9] != null ? +k[9] : undefined,
  };
}

// Libro de órdenes: foto completa (spot hasta 5000 precios por lado, futuros hasta 1000).
export const fetchDepth = (symbol, venue = 'spot') =>
  getJson(`${VENUES[venue].depth}?symbol=${symbol}&limit=${VENUES[venue].depthLimit}`, venue);

// Precio y variación de 24 h de varios símbolos.
export async function fetch24h(symbols, venue = 'spot') {
  if (!symbols.length) return [];
  if (venue === 'futures') {
    // Futuros no acepta una lista: se piden todos y se filtran.
    const all = await getJson('/fapi/v1/ticker/24hr', venue);
    const wanted = new Set(symbols);
    return all.filter((r) => wanted.has(r.symbol));
  }
  const list = encodeURIComponent(JSON.stringify(symbols));
  return getJson(`/api/v3/ticker/24hr?symbols=${list}&type=MINI`);
}

// Lista de pares contra USDT (para el buscador). En futuros, solo los perpetuos.
export async function fetchUsdtSymbols(venue = 'spot') {
  if (venue === 'futures') {
    const data = await getJson('/fapi/v1/exchangeInfo', venue);
    return data.symbols
      .filter((s) => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING')
      .map((s) => ({ symbol: s.symbol, base: s.baseAsset }));
  }
  const data = await getJson('/api/v3/exchangeInfo?permissions=SPOT&symbolStatus=TRADING');
  return data.symbols.filter((s) => s.quoteAsset === 'USDT').map((s) => ({ symbol: s.symbol, base: s.baseAsset }));
}

// Abre un WebSocket combinado (varios "streams" en una conexión) y se reconecta solo.
// Si una dirección se conecta pero no manda ningún mensaje en `silenceMs`, prueba la siguiente
// (Binance a veces cambia qué datos sirve cada dirección). `onUrl` avisa cuál se está usando.
// Devuelve una función para cerrarlo.
export function openStream(streams, onMessage, venue = 'spot', { silenceMs = 30000, onUrl } = {}) {
  let urls = VENUES[venue].ws;
  // Futuros: el libro anda en /stream; las operaciones, velas y precios, en /market (comprobado).
  if (venue === 'futures' && !streams.every((s) => /@depth|@bookTicker/.test(s))) {
    urls = ['wss://fstream.binance.com/market/stream', ...urls.filter((u) => !u.includes('/market/'))];
  }
  let ws;
  let closed = false;
  let retry = 0;
  let urlIdx = 0;
  let working = false; // una vez que una dirección mandó datos, nos quedamos con ella

  function connect() {
    const url = urls[urlIdx % urls.length];
    onUrl?.(url);
    ws = new WebSocket(`${url}?streams=${streams.join('/')}`);
    let got = false;
    const silence = setTimeout(() => {
      if (!got && !working && !closed) {
        urlIdx++; // nada en 30 s: probar la próxima dirección
        retry = 0;
        ws.close();
      }
    }, silenceMs);
    ws.onopen = () => (retry = 0);
    ws.onmessage = (e) => {
      got = true;
      working = true;
      const msg = JSON.parse(e.data);
      if (msg.data) onMessage(msg.data);
    };
    ws.onclose = () => {
      clearTimeout(silence);
      if (closed) return;
      retry = Math.min(retry + 1, 6);
      setTimeout(connect, 500 * 2 ** retry); // espera cada vez más entre intentos
    };
  }

  if (streams.length) connect();
  return () => {
    closed = true;
    if (!ws) return;
    // Cerrar una conexión que todavía se está abriendo genera un error en la consola: esperamos a que abra.
    if (ws.readyState === WebSocket.CONNECTING) ws.onopen = () => ws.close();
    else ws.close();
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
