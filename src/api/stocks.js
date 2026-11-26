// Acciones de EE.UU. a través de nuestro servidor (/api), que a su vez le pide a Yahoo Finanzas.
// VITE_API_URL permite que la versión en GitHub Pages use el servidor publicado en Vercel.
const API = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '') || './api';

async function getJson(path) {
  const res = await fetch(`${API}${path}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

export const fetchStockCandles = (symbol, interval) =>
  getJson(`/candles?symbol=${encodeURIComponent(symbol)}&interval=${interval}`).then((d) => d.bars);

export const fetchStockQuotes = (symbols) =>
  symbols.length ? getJson(`/quotes?symbols=${symbols.map(encodeURIComponent).join(',')}`) : Promise.resolve([]);

export const searchStocks = (q) => getJson(`/search?q=${encodeURIComponent(q)}`);

// Las acciones no tienen WebSocket gratuito: se vuelve a pedir cada tanto ("polling").
export const STOCK_REFRESH_MS = 15_000;
