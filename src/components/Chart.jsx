import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, CrosshairMode, TickMarkType } from 'lightweight-charts';
import { fetchCandles, pairLabel, parseId, sourceLabel, subscribeCandles } from '../api/market';
import { formatPrice } from '../format';
import { createIndicatorLayer } from '../indicators/layer';
import { createDrawingController } from '../drawings/controller';
import DrawingToolbar from './DrawingToolbar';
import DrawingEditBar from './DrawingEditBar';

const UP = '#26a69a';
const DOWN = '#ef5350';
const INTRADAY = new Set(['1m', '5m', '15m', '1h', '4h']);

// lightweight-charts muestra la hora en UTC. Estas funciones la pasan a la hora de tu compu.
const fmt = (opts) => new Intl.DateTimeFormat('es-AR', opts);
const F = {
  year: fmt({ year: 'numeric' }),
  month: fmt({ month: 'short' }),
  day: fmt({ day: 'numeric', month: 'short' }),
  time: fmt({ hour: '2-digit', minute: '2-digit', hour12: false }),
  full: fmt({ weekday: 'short', day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }),
  date: fmt({ weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' }),
};
const toDate = (t) => new Date(t * 1000);

const TOOL_HINT = {
  hline: 'Hacé clic en el precio donde va la línea',
  hray: 'Hacé clic donde empieza el rayo',
  vline: 'Hacé clic en la fecha donde va la línea',
  text: 'Hacé clic donde va el texto',
};

function tickMark(time, type) {
  const d = toDate(time);
  if (type === TickMarkType.Year) return F.year.format(d);
  if (type === TickMarkType.Month) return F.month.format(d);
  if (type === TickMarkType.DayOfMonth) return F.day.format(d);
  return F.time.format(d);
}

export default function Chart({ symbol, interval, indicators, drawings, onDrawingsChange }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const candlesRef = useRef(null);
  const volumeRef = useRef(null);
  const intervalRef = useRef(interval);
  const layerRef = useRef(null); // capa de indicadores
  const barsRef = useRef([]); // todas las velas cargadas (para calcular indicadores)
  const hoverRef = useRef(false); // ¿el cursor está sobre el gráfico?
  const drawRef = useRef(null); // controlador de dibujos
  const onDrawingsChangeRef = useRef(onDrawingsChange);
  onDrawingsChangeRef.current = onDrawingsChange;
  const [tool, setTool] = useState('cursor');
  const [magnet, setMagnet] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');
  const [legend, setLegend] = useState(null); // vela bajo el cursor
  const [last, setLast] = useState(null); // última vela (en vivo)
  const [indLegend, setIndLegend] = useState([]); // valores de los indicadores
  const [meta, setMeta] = useState({}); // { exchange, name } de la acción
  intervalRef.current = interval;

  // 1) Crear el gráfico una sola vez.
  useEffect(() => {
    const chart = createChart(containerRef.current, {
      autoSize: true, // se adapta solo al tamaño del contenedor
      layout: {
        background: { color: 'transparent' },
        textColor: '#9aa4b2',
        fontFamily: 'inherit',
        // Separador entre el panel del precio y los de indicadores (se puede arrastrar para cambiar alturas).
        panes: { separatorColor: '#2a3142', separatorHoverColor: '#4c8dff33', enableResize: true },
      },
      grid: { vertLines: { color: '#1c2230' }, horzLines: { color: '#1c2230' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#2a3142' },
      timeScale: { borderColor: '#2a3142', timeVisible: true, secondsVisible: false, tickMarkFormatter: tickMark },
      localization: {
        locale: 'es-AR',
        // Texto de la fecha bajo el cursor: con hora solo en temporalidades intradiarias.
        timeFormatter: (t) => (INTRADAY.has(intervalRef.current) ? F.full : F.date).format(toDate(t)),
      },
    });

    candlesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderVisible: false,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });

    // El volumen va en su propia escala, ocupando el 20 % inferior.
    volumeRef.current = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    candlesRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.25 } });

    layerRef.current = createIndicatorLayer(chart);
    drawRef.current = createDrawingController({
      chart,
      series: candlesRef.current,
      container: containerRef.current,
      onChange: (list) => onDrawingsChangeRef.current(list),
      onSelect: setSelectedId,
      onToolDone: () => setTool('cursor'),
    });

    // Leyenda: muestra los valores de la vela (y de los indicadores) bajo el cursor.
    chart.subscribeCrosshairMove((param) => {
      const c = param.seriesData?.get(candlesRef.current);
      hoverRef.current = Boolean(c);
      setLegend(c ? { ...c } : null);
      setIndLegend(layerRef.current.legend(c ? param.seriesData : null));
    });

    chartRef.current = chart;
    return () => {
      drawRef.current.destroy();
      drawRef.current = null;
      layerRef.current = null;
      chart.remove();
    };
  }, []);

  // 2) Cada vez que cambia la lista de indicadores: volver a armarlos.
  useEffect(() => {
    layerRef.current.setInstances(indicators);
    setIndLegend(layerRef.current.legend(null));
  }, [indicators]);

  // Dibujos y opciones de dibujo -> controlador.
  useEffect(() => drawRef.current.setDrawings(drawings), [drawings]);
  useEffect(() => drawRef.current.setTool(tool), [tool]);
  useEffect(() => drawRef.current.setMagnet(magnet), [magnet]);
  useEffect(() => drawRef.current.setHidden(hidden), [hidden]);

  // 3) Cada vez que cambia el símbolo o la temporalidad: cargar historial y escuchar en vivo.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    setStatus('loading');
    setLegend(null);

    const volBar = (c) => ({ time: c.time, value: c.volume, color: c.close >= c.open ? UP + '66' : DOWN + '66' });

    setMeta({});
    fetchCandles(symbol, interval)
      .then(({ bars: candles, ...info }) => {
        if (cancelled) return;
        setMeta(info);
        if (!candles.length) throw new Error('Sin datos para esta temporalidad');
        barsRef.current = candles;
        candlesRef.current.setData(candles);
        volumeRef.current.setData(candles.map(volBar));
        layerRef.current.setBars(candles);
        drawRef.current.setBars(candles);
        setIndLegend(layerRef.current.legend(null));
        chartRef.current.timeScale().fitContent();
        setLast(candles.at(-1));
        setStatus('ready');

        unsubscribe = subscribeCandles(symbol, interval, (c) => {
          if (cancelled) return;
          try {
            candlesRef.current.update(c);
            volumeRef.current.update(volBar(c));
          } catch {
            return; // una vela más vieja que la última: se ignora
          }
          // Actualiza la lista de velas: reemplaza la actual o agrega una nueva.
          const bars = barsRef.current;
          const i = bars.findLastIndex((b) => b.time === c.time);
          barsRef.current = i >= 0 ? [...bars.slice(0, i), c, ...bars.slice(i + 1)] : [...bars, c];
          layerRef.current.setBars(barsRef.current);
          if (bars.length !== barsRef.current.length) drawRef.current.setBars(barsRef.current); // vela nueva
          if (!hoverRef.current) setIndLegend(layerRef.current.legend(null));
          setLast(c);
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
        setStatus('error');
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [symbol, interval]);

  const selected = drawings.find((d) => d.id === selectedId);
  const shown = legend || last;
  const change = shown ? ((shown.close - shown.open) / shown.open) * 100 : 0;
  const isStock = parseId(symbol).market === 'stock';

  return (
    <div className="chart-wrap">
      <div className="legend">
        <strong>{pairLabel(symbol)}</strong>
        {meta.name && <span className="muted name">{meta.name}</span>}
        <span className="badge">
          {isStock ? 'Acción' : 'Cripto'} · {sourceLabel(symbol, meta.exchange)}
        </span>
        <span className="muted">{interval}</span>
        {shown && (
          <span className={change >= 0 ? 'up' : 'down'}>
            Ap {formatPrice(shown.open)} · Máx {formatPrice(shown.high)} · Mín {formatPrice(shown.low)} · Cie {formatPrice(shown.close)} (
            {change >= 0 ? '+' : ''}
            {change.toFixed(2)}%)
          </span>
        )}
      </div>
      {indLegend.length > 0 && (
        <div className="ind-legend">
          {indLegend.map((ind) => (
            <span key={ind.uid}>
              <span style={{ color: ind.color }}>{ind.label}</span>{' '}
              {ind.values.map((v) => (
                <span key={v.label} style={{ color: v.color }}>
                  {v.value == null ? '—' : formatPrice(v.value)}{' '}
                </span>
              ))}
            </span>
          ))}
        </div>
      )}
      <div className="chart-body">
        <DrawingToolbar
          tool={tool}
          onTool={setTool}
          magnet={magnet}
          onMagnet={setMagnet}
          hidden={hidden}
          onHidden={setHidden}
          count={drawings.length}
          onClear={() => onDrawingsChange([])}
        />
        <div className="chart-area">
          <div ref={containerRef} className="chart" />
          {selected && (
            <DrawingEditBar
              drawing={selected}
              onUpdate={(patch) => onDrawingsChange(drawings.map((d) => (d.id === selected.id ? { ...d, ...patch } : d)))}
              onDelete={() => drawRef.current.remove(selected.id)}
            />
          )}
          {tool !== 'cursor' && <div className="draw-hint">{TOOL_HINT[tool] || 'Hacé clic en el gráfico'} · Esc para cancelar</div>}
          {status === 'loading' && <div className="overlay">Cargando {pairLabel(symbol)}…</div>}
          {status === 'error' && (
            <div className="overlay error">
              No se pudieron cargar los datos de {pairLabel(symbol)}.<br />
              <small>{error}</small>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
