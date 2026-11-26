// Pares de divisas disponibles. Los datos vienen de Yahoo Finanzas (ticker "EURUSD=X")
// a través del mismo servidor /api que usan las acciones.
export const FOREX_PAIRS = [
  { ticker: 'EURUSD', name: 'Euro / Dólar' },
  { ticker: 'GBPUSD', name: 'Libra esterlina / Dólar' },
  { ticker: 'USDJPY', name: 'Dólar / Yen japonés' },
  { ticker: 'USDCHF', name: 'Dólar / Franco suizo' },
  { ticker: 'AUDUSD', name: 'Dólar australiano / Dólar' },
  { ticker: 'USDCAD', name: 'Dólar / Dólar canadiense' },
  { ticker: 'NZDUSD', name: 'Dólar neozelandés / Dólar' },
  { ticker: 'EURGBP', name: 'Euro / Libra esterlina' },
  { ticker: 'EURJPY', name: 'Euro / Yen japonés' },
  { ticker: 'GBPJPY', name: 'Libra esterlina / Yen japonés' },
  { ticker: 'EURCHF', name: 'Euro / Franco suizo' },
  { ticker: 'AUDJPY', name: 'Dólar australiano / Yen japonés' },
  { ticker: 'EURAUD', name: 'Euro / Dólar australiano' },
  { ticker: 'USDMXN', name: 'Dólar / Peso mexicano' },
  { ticker: 'USDBRL', name: 'Dólar / Real brasileño' },
  { ticker: 'USDARS', name: 'Dólar / Peso argentino (oficial)' },
  { ticker: 'USDCLP', name: 'Dólar / Peso chileno' },
  { ticker: 'USDCOP', name: 'Dólar / Peso colombiano' },
  { ticker: 'EURARS', name: 'Euro / Peso argentino (oficial)' },
];

const BY_TICKER = Object.fromEntries(FOREX_PAIRS.map((p) => [p.ticker, p]));
export const forexName = (ticker) => BY_TICKER[ticker]?.name || `${ticker.slice(0, 3)} / ${ticker.slice(3)}`;

// Busca por código ("eur", "usdars") o por nombre ("peso", "yen").
export function searchForex(query) {
  const q = query.trim().toUpperCase().replace(/[\s/=-]/g, '').replace(/X$/, '');
  const words = query.trim().toLowerCase();
  if (!q) return [];
  return FOREX_PAIRS.filter((p) => p.ticker.includes(q) || (words.length >= 3 && p.name.toLowerCase().includes(words))).sort(
    (a, b) => b.ticker.startsWith(q) - a.ticker.startsWith(q),
  );
}
