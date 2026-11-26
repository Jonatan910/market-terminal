// Capa común: el resto de la app no necesita saber si un símbolo es cripto o acción.
// Cada símbolo se guarda como "mercado:ticker", por ejemplo "crypto:BTCUSDT" o "stock:AAPL".
import { fetchKlines, openStream, toCandle } from './binance';
import { fetchStockCandles, STOCK_REFRESH_MS } from './stocks';

export function parseId(id) {
  const [market, ticker] = id.includes(':') ? id.split(':') : ['crypto', id]; // compatibilidad con listas viejas
  return { market, ticker };
}

export function displayName(id) {
  const { market, ticker } = parseId(id);
  return market === 'crypto' ? ticker.replace(/USDT$/, '') : ticker;
}

export function pairLabel(id) {
  const { market, ticker } = parseId(id);
  return market === 'crypto' ? `${ticker.replace(/USDT$/, '')}/USDT` : ticker;
}

// De dónde vienen los datos de cada símbolo (para mostrarlo en la lista y en el gráfico).
export function sourceLabel(id, exchange) {
  return parseId(id).market === 'crypto' ? 'Binance' : exchange || 'EE.UU.';
}

// Devuelve { bars, exchange?, name? }
export async function fetchCandles(id, interval) {
  const { market, ticker } = parseId(id);
  if (market === 'crypto') return { bars: await fetchKlines(ticker, interval) };
  const d = await fetchStockCandles(ticker, interval);
  return { bars: d.bars, exchange: d.exchange, name: d.name };
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
  // Acciones: cada 15 s pedimos las velas otra vez y pasamos las 2 últimas
  // (por si se cerró una vela y empezó otra entre medio).
  let stop = false;
  const timer = setInterval(async () => {
    if (document.hidden) return; // pestaña en segundo plano: no gastar pedidos
    try {
      const { bars } = await fetchStockCandles(ticker, interval);
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
