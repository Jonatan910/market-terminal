// Datos de acciones de EE.UU. desde Yahoo Finanzas (endpoints públicos, sin clave).
// Corre en el servidor (Vercel), no en el navegador: Yahoo no permite pedidos directos
// desde otras páginas (CORS), así que el servidor hace de intermediario.

const HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (market-terminal)', Accept: 'application/json' };

// ---------- caché en memoria ----------
// Mientras la función siga "caliente", reutiliza respuestas recientes en vez de volver a pedirlas.
const cache = new Map();
async function cached(key, ttlMs, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value); // que no crezca sin límite
  return value;
}

async function getJson(path) {
  let lastError;
  for (const host of HOSTS) {
    try {
      const res = await fetch(host + path, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
      if (res.ok) return await res.json();
      lastError = res.status === 404 ? new HttpError(404, 'No se encontró ese símbolo') : new HttpError(502, `Yahoo respondió ${res.status}`);
      if (res.status === 404) break;
    } catch (e) {
      lastError = new HttpError(502, `No se pudo conectar con Yahoo (${e.message})`);
    }
  }
  throw lastError;
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Símbolos válidos: AAPL, BRK-B, ^GSPC… (evita que se pase cualquier cosa a la URL).
export function cleanSymbol(s) {
  const sym = String(s || '').trim().toUpperCase();
  if (!/^\^?[A-Z0-9.\-=]{1,15}$/.test(sym)) throw new HttpError(400, 'Símbolo inválido');
  return sym;
}

// ---------- velas ----------
// Temporalidad de la app -> qué pedirle a Yahoo. Yahoo limita cuánta historia da por intervalo
// (1m: 7 días, 5m/15m: 60 días, 60m: 730 días). 4h no existe en Yahoo: se arma juntando velas de 1h.
const INTERVALS = {
  '1m': { yahoo: '1m', range: '5d', ttl: 10_000 },
  '5m': { yahoo: '5m', range: '1mo', ttl: 15_000 },
  '15m': { yahoo: '15m', range: '1mo', ttl: 15_000 },
  '1h': { yahoo: '60m', range: '6mo', ttl: 30_000 },
  '4h': { yahoo: '60m', range: '2y', ttl: 60_000, group: 4 },
  '1d': { yahoo: '1d', range: '5y', ttl: 60_000 },
  '1w': { yahoo: '1wk', range: '10y', ttl: 300_000 },
};

export async function candles(symbol, interval) {
  const cfg = INTERVALS[interval];
  if (!cfg) throw new HttpError(400, 'Temporalidad inválida');
  return cached(`c:${symbol}:${interval}`, cfg.ttl, async () => {
    const data = await getJson(
      `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${cfg.yahoo}&range=${cfg.range}&includePrePost=false`,
    );
    const r = data?.chart?.result?.[0];
    if (!r?.timestamp) throw new HttpError(404, `No hay datos para ${symbol}`);
    const q = r.indicators.quote[0];
    let bars = [];
    for (let i = 0; i < r.timestamp.length; i++) {
      if (q.open[i] == null || q.close[i] == null) continue; // Yahoo a veces deja huecos
      // En intradiario, Yahoo agrega una vela "vacía" a las 16:00 (sin volumen y sin movimiento): se descarta.
      const intraday = cfg.yahoo !== '1d' && cfg.yahoo !== '1wk';
      if (intraday && !q.volume[i] && q.high[i] === q.low[i]) continue;
      bars.push({ time: r.timestamp[i], open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] || 0 });
    }
    if (cfg.group) bars = groupBars(bars, cfg.group, r.meta.gmtoffset || 0);
    return { symbol: r.meta.symbol, name: r.meta.longName || r.meta.shortName || r.meta.symbol, currency: r.meta.currency, exchange: r.meta.exchangeName, bars };
  });
}

// Junta N velas consecutivas del mismo día de mercado en una sola (por ejemplo 4 de 1h = 1 de 4h).
export function groupBars(bars, n, gmtoffset) {
  const out = [];
  let cur = null;
  let count = 0;
  let day = null;
  for (const b of bars) {
    const d = Math.floor((b.time + gmtoffset) / 86400); // día en la hora de Nueva York
    if (!cur || count === n || d !== day) {
      if (cur) out.push(cur);
      cur = { ...b };
      count = 0;
      day = d;
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume;
    }
    count++;
  }
  if (cur) out.push(cur);
  return out;
}

// ---------- cotizaciones (lista de seguimiento) ----------
export async function quote(symbol) {
  return cached(`q:${symbol}`, 10_000, async () => {
    // Con range=1d, chartPreviousClose es el cierre de la rueda anterior.
    const data = await getJson(`/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`);
    const m = data?.chart?.result?.[0]?.meta;
    if (!m || m.regularMarketPrice == null) throw new HttpError(404, `No hay datos para ${symbol}`);
    const yesterday = m.chartPreviousClose ?? m.previousClose;
    const price = m.regularMarketPrice;
    const t = m.currentTradingPeriod?.regular;
    const now = Date.now() / 1000;
    return {
      symbol: m.symbol,
      price,
      change: yesterday ? ((price - yesterday) / yesterday) * 100 : 0,
      open: t ? now >= t.start && now < t.end : null, // ¿el mercado está abierto ahora?
    };
  });
}

// ---------- búsqueda ----------
const US_EXCHANGES = new Set(['NMS', 'NGM', 'NCM', 'NYQ', 'ASE', 'PCX', 'BTS', 'NAS', 'NYS']);

export async function search(q) {
  const term = String(q || '').trim().slice(0, 30);
  if (!term) return [];
  return cached(`s:${term.toLowerCase()}`, 300_000, async () => {
    const data = await getJson(`/v1/finance/search?q=${encodeURIComponent(term)}&quotesCount=10&newsCount=0&listsCount=0`);
    return (data.quotes || [])
      .filter((x) => (x.quoteType === 'EQUITY' || x.quoteType === 'ETF') && US_EXCHANGES.has(x.exchange))
      .slice(0, 8)
      .map((x) => ({ symbol: x.symbol, name: x.shortname || x.longname || x.symbol, exchange: x.exchDisp || x.exchange, type: x.quoteType }));
  });
}
