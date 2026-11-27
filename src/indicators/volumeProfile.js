// Perfil de volumen: cuánto se operó en cada precio dentro de un grupo de velas.
//
// Cada vela reparte su volumen en partes iguales entre los precios que recorrió (de su mínimo
// a su máximo). Compras vs. ventas:
//   - Cripto (Binance): se usa el volumen comprado "a mercado" que trae cada vela (exacto).
//   - Acciones: se estima por dónde cerró la vela dentro de su rango (cerca del máximo = más compras).
//
// Devuelve las filas de precio y:
//   poc: la fila con más volumen ("Point of Control")
//   vaLow / vaHigh: el "área de valor", las filas alrededor del POC donde se operó el 70 % del volumen.

export function computeProfile(bars, { rows = 60, valueArea = 0.7 } = {}) {
  const list = bars.filter((b) => b.volume > 0 && Number.isFinite(b.high) && Number.isFinite(b.low));
  if (!list.length) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const b of list) {
    if (b.low < min) min = b.low;
    if (b.high > max) max = b.high;
  }
  if (max === min) max = min * 1.0001 || 1;
  const step = (max - min) / rows;
  const buy = new Float64Array(rows);
  const sell = new Float64Array(rows);
  const rowOf = (price) => Math.min(rows - 1, Math.max(0, Math.floor((price - min) / step)));

  for (const b of list) {
    const buyShare = b.buyVolume != null ? b.buyVolume / b.volume : b.high > b.low ? (b.close - b.low) / (b.high - b.low) : 0.5;
    const r0 = rowOf(b.low);
    const r1 = rowOf(b.high);
    if (r0 === r1 || b.high === b.low) {
      buy[r0] += b.volume * buyShare;
      sell[r0] += b.volume * (1 - buyShare);
      continue;
    }
    const range = b.high - b.low;
    for (let r = r0; r <= r1; r++) {
      // Parte de la vela que cae en esta fila.
      const lo = Math.max(b.low, min + r * step);
      const hi = Math.min(b.high, min + (r + 1) * step);
      const v = (b.volume * Math.max(0, hi - lo)) / range;
      buy[r] += v * buyShare;
      sell[r] += v * (1 - buyShare);
    }
  }

  const total = (r) => buy[r] + sell[r];
  let poc = 0;
  let sum = 0;
  for (let r = 0; r < rows; r++) {
    sum += total(r);
    if (total(r) > total(poc)) poc = r;
  }

  // Área de valor: desde el POC se va sumando la fila vecina con más volumen hasta llegar al 70 %.
  let vaLow = poc;
  let vaHigh = poc;
  let acc = total(poc);
  while (acc < sum * valueArea && (vaLow > 0 || vaHigh < rows - 1)) {
    const down = vaLow > 0 ? total(vaLow - 1) : -1;
    const up = vaHigh < rows - 1 ? total(vaHigh + 1) : -1;
    if (up >= down) acc += total(++vaHigh);
    else acc += total(--vaLow);
  }

  return {
    min,
    step,
    rows: Array.from({ length: rows }, (_, r) => ({ low: min + r * step, high: min + (r + 1) * step, buy: buy[r], sell: sell[r] })),
    poc,
    vaLow,
    vaHigh,
    total: sum,
  };
}
