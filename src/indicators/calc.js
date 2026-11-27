// Cálculos de indicadores. Funciones "puras": reciben números y devuelven números,
// sin tocar el gráfico ni React. Así se pueden probar solas (ver calc.test.js).
// Todas devuelven un array del mismo largo que la entrada; donde todavía no hay
// suficientes datos el valor es null.

export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

// Media móvil exponencial: da más peso a los precios recientes.
// Arranca con la SMA de los primeros `period` valores (como TradingView).
export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev = null;
  let start = values.findIndex((v) => v != null);
  if (start < 0) return out;
  for (let i = start; i < values.length; i++) {
    const v = values[i];
    if (i < start + period - 1) continue;
    if (prev == null) {
      let s = 0;
      for (let j = i - period + 1; j <= i; j++) s += values[j];
      prev = s / period;
    } else {
      prev = v * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}

// Bandas de Bollinger: media ± `mult` desvíos estándar.
export function bollinger(values, period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper = new Array(values.length).fill(null);
  const lower = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) sq += (values[j] - mid[i]) ** 2;
    const sd = Math.sqrt(sq / period);
    upper[i] = mid[i] + mult * sd;
    lower[i] = mid[i] - mult * sd;
  }
  return { mid, upper, lower };
}

// RSI de Wilder (0 a 100). Por encima de 70 suele leerse como "sobrecompra", debajo de 30 "sobreventa".
export function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

// MACD: diferencia entre una EMA rápida y una lenta, su "señal" (EMA del MACD) y el histograma.
export function macd(values, fast = 12, slow = 26, signal = 9) {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line = values.map((_, i) => (f[i] != null && s[i] != null ? f[i] - s[i] : null));
  const sig = ema(line, signal);
  const hist = line.map((v, i) => (v != null && sig[i] != null ? v - sig[i] : null));
  return { line, signal: sig, hist };
}

// Delta de volumen por vela: compras agresivas − ventas agresivas.
// (Binance da cuánto del volumen fue comprado a mercado; el resto fue vendido a mercado.)
// Devuelve null en las velas sin ese dato (acciones y forex).
export function volumeDelta(bars) {
  return bars.map((b) => (b.buyVolume == null ? null : 2 * b.buyVolume - b.volume));
}

// CVD (Cumulative Volume Delta): suma acumulada del delta. Si sube, dominan los compradores;
// si baja, los vendedores. Arranca en 0 en la primera vela cargada.
export function cvd(bars) {
  let sum = 0;
  return volumeDelta(bars).map((d) => (d == null ? null : (sum += d)));
}
