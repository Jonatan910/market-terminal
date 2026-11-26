// Capa común: el resto de la app no necesita saber de qué mercado es un símbolo.
// Cada símbolo se guarda como "mercado:ticker":
//   "crypto:BTCUSDT"  -> Binance
//   "stock:AAPL"      -> Yahoo Finanzas (acciones y ETF de EE.UU.)
//   "forex:EURUSD"    -> Yahoo Finanzas (ticker "EURUSD=X")
import { fetchKlines, openStream, toCandle } from './binance';
import { fetchStockCandles, STOCK_REFRESH_MS } from './stocks';
import { forexName } from './forex';

// Las tres pestañas de la lista de seguimiento, en orden.
export const MARKETS = [
  { id: 'crypto', label: 'Cripto' },
  { id: 'stock', label: 'Acciones' },
  { id: 'forex', label: 'Forex' },
];

export function parseId(id) {
  const [market, ticker] = id.includes(':') ? id.split(':') : ['crypto', id]; // compatibilidad con listas viejas
  return { market, ticker };
}

export function displayName(id) {
  const { market, ticker } = parseId(id);
  if (market === 'crypto') return ticker.replace(/USDT$/, '');
  if (market === 'forex') return `${ticker.slice(0, 3)}/${ticker.slice(3)}`;
  return ticker;
}

export function pairLabel(id) {
  const { market, ticker } = parseId(id);
  return market === 'crypto' ? `${ticker.replace(/USDT$/, '')}/USDT` : displayName(id);
}

// Nombre largo, cuando lo conocemos sin preguntarle al servidor.
export function longName(id) {
  const { market, ticker } = parseId(id);
  return market === 'forex' ? forexName(ticker) : null;
}

// De dónde vienen los datos de cada símbolo (para mostrarlo en la lista y en el gráfico).
export function sourceLabel(id, exchange) {
  const { market } = parseId(id);
  if (market === 'crypto') return 'Binance';
  if (market === 'forex') return 'Yahoo Finanzas';
  return exchange || 'EE.UU.';
}

// Ticker de Yahoo para acciones y forex; null para cripto.
export function yahooTicker(id) {
  const { market, ticker } = parseId(id);
  return market === 'forex' ? `${ticker}=X` : market === 'stock' ? ticker : null;
}

// Al revés: "EURUSD=X" -> "forex:EURUSD", "AAPL" -> "stock:AAPL".
export const fromYahoo = (sym) => (sym.endsWith('=X') ? `forex:${sym.slice(0, -2)}` : `stock:${sym}`);

// Devuelve { bars, exchange?, name? }
export async function fetchCandles(id, interval) {
  const { market, ticker } = parseId(id);
  if (market === 'crypto') return { bars: await fetchKlines(ticker, interval) };
  const d = await fetchStockCandles(yahooTicker(id), interval);
  return { bars: d.bars, exchange: d.exchange, name: longName(id) || d.name };
}

// Velas anteriores a `before` (para ir cargando historia hacia atrás).
// Solo cripto: en acciones y forex ya se pide de entrada todo lo que Yahoo permite.
export async function fetchOlderCandles(id, interval, before) {
  const { market, ticker } = parseId(id);
  if (market !== 'crypto') return [];
  return fetchKlines(ticker, interval, { before });
}

// Escucha la vela actual en vivo. Llama a onCandle(vela) en cada actualización.
// Devuelve una función para dejar de escuchar.
export function subscribeCandles(id, interval, onCandle) {
  const { market, ticker } = parseId(id);
  if (market === 'crypto') {
    return openStream([`${ticker.toLowerCase()}@kline_${interval}`], ({ k }) =>
      onCandle(toCandle([k.t, k.o, k.h, k.l, k.c, k.v])),
    );
  }
  // Acciones y forex: cada 15 s pedimos las velas otra vez y pasamos las 2 últimas
  // (por si se cerró una vela y empezó otra entre medio).
  let stop = false;
  const timer = setInterval(async () => {
    if (document.hidden) return; // pestaña en segundo plano: no gastar pedidos
    try {
      const { bars } = await fetchStockCandles(yahooTicker(id), interval);
      if (!stop) bars.slice(-2).forEach(onCandle);
    } catch {
      /* se reintenta en el próximo ciclo */
    }
  }, STOCK_REFRESH_MS);
  return () => {
    stop = true;
    clearInterval(timer);
  };
}
