// Cuántos decimales mostrar según el precio y el mercado.
//   Cripto/acciones: BTC 97.000,12 · SOL 71,180 · PEPE 0,00001234
//   Forex: siempre fijo, EUR/USD 1,09730 · USD/JPY 159,262 · USD/ARS 1.601,00
export function priceDecimals(price, market) {
  const a = Math.abs(price);
  if (market === 'forex') return a >= 1000 ? 2 : a >= 10 ? 3 : 5;
  return a >= 1000 ? 2 : a >= 1 ? 3 : a >= 0.01 ? 5 : 8;
}

export function formatPrice(n, market) {
  if (n == null || Number.isNaN(n)) return '—';
  const decimals = priceDecimals(n, market);
  const min = market === 'forex' ? decimals : Math.min(2, decimals);
  return n.toLocaleString('es-AR', { minimumFractionDigits: min, maximumFractionDigits: decimals });
}

export function formatPercent(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}
