// Muestra más decimales cuanto más chico es el precio (BTC 97.000,12 · PEPE 0,00001234).
export function formatPrice(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  const decimals = abs >= 1000 ? 2 : abs >= 1 ? 3 : abs >= 0.01 ? 5 : 8;
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: decimals });
}

export function formatPercent(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}
