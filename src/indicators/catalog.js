// Catálogo de indicadores: qué parámetros tiene cada uno, cómo se calcula y cómo se dibuja.
// Para sumar un indicador nuevo alcanza con agregar una entrada acá (y su cálculo en calc.js).
//
//  pane: 'overlay'  -> se dibuja encima del precio
//        'separate' -> se dibuja en su propio panel debajo del gráfico
//  outputs: cada línea/histograma que dibuja. `color: 'main'` usa el color elegido por el usuario.
import { sma, ema, bollinger, rsi, macd } from './calc';

const closes = (bars) => bars.map((b) => b.close);

export const INDICATORS = {
  sma: {
    name: 'Media móvil simple',
    short: 'SMA',
    pane: 'overlay',
    params: [{ key: 'period', label: 'Período', default: 50, min: 1, max: 500 }],
    outputs: [{ key: 'value', label: 'SMA', type: 'line', color: 'main', width: 2 }],
    compute: (bars, p) => ({ value: sma(closes(bars), p.period) }),
  },
  ema: {
    name: 'Media móvil exponencial',
    short: 'EMA',
    pane: 'overlay',
    params: [{ key: 'period', label: 'Período', default: 20, min: 1, max: 500 }],
    outputs: [{ key: 'value', label: 'EMA', type: 'line', color: 'main', width: 2 }],
    compute: (bars, p) => ({ value: ema(closes(bars), p.period) }),
  },
  bb: {
    name: 'Bandas de Bollinger',
    short: 'BB',
    pane: 'overlay',
    params: [
      { key: 'period', label: 'Período', default: 20, min: 2, max: 500 },
      { key: 'mult', label: 'Desvíos', default: 2, min: 0.1, max: 10, step: 0.1 },
    ],
    outputs: [
      { key: 'upper', label: 'Sup', type: 'line', color: 'main', width: 1 },
      { key: 'mid', label: 'Media', type: 'line', color: 'main', width: 1, dashed: true },
      { key: 'lower', label: 'Inf', type: 'line', color: 'main', width: 1 },
    ],
    compute: (bars, p) => bollinger(closes(bars), p.period, p.mult),
  },
  rsi: {
    name: 'RSI (fuerza relativa)',
    short: 'RSI',
    pane: 'separate',
    params: [{ key: 'period', label: 'Período', default: 14, min: 2, max: 200 }],
    outputs: [{ key: 'value', label: 'RSI', type: 'line', color: 'main', width: 2 }],
    levels: [70, 30], // líneas de sobrecompra / sobreventa
    range: [0, 100], // el panel siempre va de 0 a 100
    compute: (bars, p) => ({ value: rsi(closes(bars), p.period) }),
  },
  macd: {
    name: 'MACD',
    short: 'MACD',
    pane: 'separate',
    params: [
      { key: 'fast', label: 'Rápida', default: 12, min: 1, max: 200 },
      { key: 'slow', label: 'Lenta', default: 26, min: 2, max: 400 },
      { key: 'signal', label: 'Señal', default: 9, min: 1, max: 200 },
    ],
    outputs: [
      { key: 'hist', label: 'Hist', type: 'histogram' },
      { key: 'line', label: 'MACD', type: 'line', color: 'main', width: 2 },
      { key: 'signal', label: 'Señal', type: 'line', color: '#ff9800', width: 1 },
    ],
    levels: [0],
    compute: (bars, p) => macd(closes(bars), p.fast, p.slow, p.signal),
  },
};

// Colores que se van asignando a cada indicador nuevo.
export const PALETTE = ['#f5c518', '#4c8dff', '#e040fb', '#00bcd4', '#ff7043', '#8bc34a', '#ffffff'];

let seq = 0;
export function newInstance(type, existing = []) {
  const def = INDICATORS[type];
  const used = new Set(existing.map((i) => i.color));
  return {
    uid: `${type}-${Date.now().toString(36)}-${seq++}`,
    type,
    params: Object.fromEntries(def.params.map((p) => [p.key, p.default])),
    color: PALETTE.find((c) => !used.has(c)) || PALETTE[existing.length % PALETTE.length],
  };
}

// "EMA 20", "BB 20 2", "MACD 12 26 9"
export function instanceLabel(inst) {
  const def = INDICATORS[inst.type];
  return `${def.short} ${def.params.map((p) => inst.params[p.key]).join(' ')}`;
}

// Indicadores con los que arranca la app la primera vez.
export function defaultIndicators() {
  const list = [];
  list.push({ ...newInstance('ema', list), color: '#f5c518' });
  list.push({ ...newInstance('ema', list), params: { period: 50 }, color: '#4c8dff' });
  list.push({ ...newInstance('rsi', list), color: '#e040fb' });
  return list;
}
