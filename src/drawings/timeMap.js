// Los dibujos se guardan con fecha (time) y precio, para que sigan en su lugar
// aunque cambies de temporalidad. El gráfico, en cambio, ubica todo por "índice de vela"
// (logical: 0 = primera vela, 1 = segunda... con decimales entre velas).
// Este módulo convierte de uno a otro, incluso antes de la primera vela o después de la última.

export function createTimeMap(bars) {
  const times = bars.map((b) => b.time);
  const n = times.length;
  const step = typicalStep(times); // segundos entre velas, para extrapolar hacia el futuro/pasado

  function toLogical(time) {
    if (!n) return null;
    if (time <= times[0]) return (time - times[0]) / step;
    if (time >= times[n - 1]) return n - 1 + (time - times[n - 1]) / step;
    // búsqueda binaria: la vela i tal que times[i] <= time < times[i+1]
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= time) lo = mid;
      else hi = mid;
    }
    return lo + (time - times[lo]) / (times[hi] - times[lo]);
  }

  function toTime(logical) {
    if (!n || logical == null) return null;
    if (logical <= 0) return Math.round(times[0] + logical * step);
    if (logical >= n - 1) return Math.round(times[n - 1] + (logical - (n - 1)) * step);
    const i = Math.floor(logical);
    return Math.round(times[i] + (logical - i) * (times[i + 1] - times[i]));
  }

  return { toLogical, toTime };
}

// La distancia más común entre velas consecutivas (ignora fines de semana y noches).
function typicalStep(times) {
  const diffs = [];
  for (let i = Math.max(1, times.length - 60); i < times.length; i++) diffs.push(times[i] - times[i - 1]);
  if (!diffs.length) return 60;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)] || 60;
}
