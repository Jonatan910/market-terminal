// Dibuja los indicadores sobre un gráfico de lightweight-charts.
// Chart.jsx le pasa la lista de indicadores activos y las velas; esta capa
// crea las series (líneas / histogramas), los paneles y mantiene los datos al día.
import { LineSeries, HistogramSeries, LineStyle } from 'lightweight-charts';
import { INDICATORS, instanceLabel } from './catalog';

const UP = '#26a69a99';
const DOWN = '#ef535099';

export function createIndicatorLayer(chart) {
  let instances = [];
  let bars = [];
  let entries = []; // [{ inst, def, series: { key: api }, data: { key: number[] } }]
  let priceFormat = null; // decimales del precio (para las líneas dibujadas sobre el precio)

  function clear() {
    for (const e of entries) for (const s of Object.values(e.series)) chart.removeSeries(s);
    entries = [];
    // Quita los paneles de abajo que quedaron vacíos (el 0 es el del precio).
    for (let i = chart.panes().length - 1; i > 0; i--) chart.removePane(i);
  }

  function build() {
    clear();
    let pane = 0;
    for (const inst of instances) {
      const def = INDICATORS[inst.type];
      if (!def) continue;
      const paneIndex = def.pane === 'overlay' ? 0 : ++pane;
      const series = {};
      for (const out of def.outputs) {
        series[out.key] =
          out.type === 'histogram'
            ? chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, paneIndex)
            : chart.addSeries(
                LineSeries,
                {
                  color: out.color === 'main' ? inst.color : out.color,
                  lineWidth: out.width || 2,
                  lineStyle: out.dashed ? LineStyle.Dashed : LineStyle.Solid,
                  priceLineVisible: false,
                  lastValueVisible: !out.dashed,
                  crosshairMarkerVisible: false,
                  ...(def.range && {
                    autoscaleInfoProvider: () => ({ priceRange: { minValue: def.range[0], maxValue: def.range[1] } }),
                  }),
                },
                paneIndex,
              );
      }
      // Líneas de referencia (70/30 en RSI, 0 en MACD).
      const firstLine = series[(def.outputs.find((o) => o.type === 'line') || def.outputs[0]).key];
      for (const level of def.levels || []) {
        firstLine.createPriceLine({ price: level, color: '#5d6678', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false });
      }
      if (def.pane === 'overlay' && priceFormat) Object.values(series).forEach((s) => s.applyOptions({ priceFormat }));
      entries.push({ inst, def, series, data: {} });
    }
    // El panel del precio ocupa 3 partes; cada panel de indicador, 1.
    chart.panes().forEach((p, i) => p.setStretchFactor(i === 0 ? 3 : 1));
    fill();
  }

  const point = (out, time, v) =>
    v == null ? { time } : out.type === 'histogram' ? { time, value: v, color: v >= 0 ? UP : DOWN } : { time, value: v };

  // Calcula todos los indicadores con las velas actuales y los dibuja.
  function fill() {
    if (!bars.length) return;
    for (const e of entries) {
      e.data = e.def.compute(bars, e.inst.params);
      for (const out of e.def.outputs) {
        const values = e.data[out.key];
        e.series[out.key].setData(bars.map((b, i) => point(out, b.time, values[i]))); // null = "hueco"
      }
    }
  }

  // En vivo: recalcula, pero solo redibuja la última vela (y la anterior si recién empezó una nueva).
  // Redibujar miles de puntos por segundo sería muy pesado.
  function updateLast(newBars) {
    const appended = newBars.length === bars.length + 1;
    bars = newBars;
    if (!bars.length) return;
    const n = bars.length;
    for (const e of entries) {
      e.data = e.def.compute(bars, e.inst.params);
      for (const out of e.def.outputs) {
        const values = e.data[out.key];
        const s = e.series[out.key];
        if (appended && n > 1) s.update(point(out, bars[n - 2].time, values[n - 2]));
        s.update(point(out, bars[n - 1].time, values[n - 1]));
      }
    }
  }

  return {
    setInstances(list) {
      instances = list;
      build();
    },
    setPriceFormat(pf) {
      priceFormat = pf;
      for (const e of entries) if (e.def.pane === 'overlay') Object.values(e.series).forEach((s) => s.applyOptions({ priceFormat: pf }));
    },
    setBars(list) {
      bars = list;
      fill();
    },
    updateLast,
    // Valores para la leyenda: los de la vela bajo el cursor (seriesData) o los últimos.
    legend(seriesData) {
      return entries.map(({ inst, def, series, data }) => ({
        uid: inst.uid,
        label: instanceLabel(inst) + (def.onlyCrypto && bars.length && bars.at(-1).buyVolume == null ? ' (solo cripto)' : ''),
        overlay: def.pane === 'overlay',
        color: inst.color,
        // Se muestran las líneas; si el indicador solo tiene barras (Delta), las barras.
        values: def.outputs
          .filter((o) => o.type === 'line' || !def.outputs.some((x) => x.type === 'line'))
          .map((o) => {
            const v = seriesData ? seriesData.get(series[o.key])?.value : lastValue(data[o.key]);
            return { label: o.label, value: v, color: o.color === 'main' ? inst.color : o.color };
          }),
      }));
    },
  };
}

function lastValue(arr) {
  for (let i = (arr?.length || 0) - 1; i >= 0; i--) if (arr[i] != null) return arr[i];
  return undefined;
}
