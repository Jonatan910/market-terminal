import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, CrosshairMode, TickMarkType, LineStyle } from 'lightweight-charts';
import { fetchCandles, fetchOlderCandles, isBinance, pairLabel, parseId, sourceLabel, subscribeCandles, venueOf } from '../api/market';
import { KLINES_LIMIT } from '../api/binance';
import { formatPrice, priceDecimals } from '../format';
import { createIndicatorLayer } from '../indicators/layer';
import { createDrawingController } from '../drawings/controller';
import { createDepthPrimitive } from '../orderbook/depthPrimitive';
import { connectOrderBook } from '../orderbook/live';
import { createHeatmapPrimitive } from '../orderbook/heatmapPrimitive';
import { getRecorder, SAMPLE_MS } from '../orderbook/heatmap';
import { createVolumeProfilePrimitive } from '../indicators/volumeProfilePrimitive';
import DrawingToolbar from './DrawingToolbar';
import DrawingEditBar from './DrawingEditBar';
import FavoritesBar from './FavoritesBar';
import { DEFAULT_FAVORITES } from '../drawings/tools';
import { useLocalStorage } from '../hooks/useLocalStorage';

const UP = '#26a69a';
const VOLUME_COLOR = 'rgba(76, 141, 255, 0.45)'; // volumen: un solo color azul, semitransparente
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

const VISIBLE_BARS = 150; // velas que se ven al abrir un gráfico (el resto, desplazando a la izquierda)
const LOAD_MORE_AT = 50; // si quedan menos de 50 velas a la izquierda, se carga más historia

const MARKET_LABEL = { crypto: 'Cripto', perp: 'Perpetuo', stock: 'Acción', forex: 'Forex' };

const TOOL_HINT = {
  hline: 'Hacé clic en el precio donde va la línea',
  hray: 'Hacé clic donde empieza el rayo',
  vline: 'Hacé clic en la fecha donde va la línea',
  crossline: 'Hacé clic donde va la cruz',
  text: 'Hacé clic donde va el texto',
  long: 'Hacé clic en el precio de entrada',
  short: 'Hacé clic en el precio de entrada',
  channel: 'Marcá 2 puntos de la línea y un 3.º para el ancho del canal',
  gann: 'Marcá 2 esquinas opuestas de la cuadrícula',
  path: 'Hacé clic en cada punto · doble clic o Enter para terminar',
  brush: 'Apretá y arrastrá para dibujar',
  xabcd: 'Marcá los 5 puntos: X, A, B, C y D',
  elliott: 'Marcá 6 puntos: el inicio y las ondas 1 a 5',
  elliottabc: 'Marcá 4 puntos: el inicio y las ondas A, B y C',
  triangle: 'Marcá 6 puntos: el inicio y A, B, C, D y E',
};

function tickMark(time, type) {
  const d = toDate(time);
  if (type === TickMarkType.Year) return F.year.format(d);
  if (type === TickMarkType.Month) return F.month.format(d);
  if (type === TickMarkType.DayOfMonth) return F.day.format(d);
  return F.time.format(d);
}

export default function Chart({ symbol, interval, indicators, drawings, onDrawingsChange, alerts = [], onCreateAlert, onLastPrice }) {
  const market = parseId(symbol).market;
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
  const cursorPriceRef = useRef(null); // precio bajo el cursor (para Alt+A)
  const callbacksRef = useRef({});
  callbacksRef.current = { onCreateAlert, onLastPrice };
  const [tool, setTool] = useState('cursor');
  const [magnet, setMagnet] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  // Barra de favoritos: qué herramientas tiene, si se ve y dónde está (se recuerda).
  const [favorites, setFavorites] = useLocalStorage('mt.favTools', DEFAULT_FAVORITES);
  // En el celular arranca oculta (tapa mucho gráfico); se muestra con la ★ de la barra izquierda.
  const [favBar, setFavBar] = useLocalStorage('mt.favBar', () => window.innerWidth > 760);
  const [favPos, setFavPos] = useLocalStorage('mt.favPos', null);
  const depthRef = useRef(null);
  const heatRef = useRef(null);
  const [heatSince, setHeatSince] = useState(null); // desde qué hora se está grabando
  // Herramientas de mercado: se prenden agregándolas como indicadores (panel ƒx Indicadores).
  const vpInst = indicators.find((i) => i.type === 'vprofile');
  const showVP = Boolean(vpInst);
  const showBook = indicators.some((i) => i.type === 'orderbook');
  const showHeat = indicators.some((i) => i.type === 'heatmap');
  const [hasVolume, setHasVolume] = useState(true); // forex no tiene volumen
  const vpRef = useRef(null);
  const toggleFavorite = (id) => setFavorites((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  // Herramientas nuevas: se suman una sola vez a los favoritos ya guardados (al lado de su vecina).
  useEffect(() => {
    try {
      if (localStorage.getItem('mt.favAdded.gann')) return;
      localStorage.setItem('mt.favAdded.gann', '1');
    } catch {
      return;
    }
    setFavorites((f) => {
      if (f.includes('gann')) return f;
      const i = f.indexOf('rect');
      return i >= 0 ? [...f.slice(0, i + 1), 'gann', ...f.slice(i + 1)] : [...f, 'gann'];
    });
  }, [setFavorites]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');
  const [legend, setLegend] = useState(null); // vela bajo el cursor
  const [last, setLast] = useState(null); // última vela (en vivo)
  const [indLegend, setIndLegend] = useState([]); // valores de los indicadores
  const [meta, setMeta] = useState({}); // { exchange, name } de la acción
  const [loadingOlder, setLoadingOlder] = useState(false); // cargando historia más vieja
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
      grid: { vertLines: { visible: false }, horzLines: { visible: false } }, // fondo limpio, sin cuadrícula
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
      color: VOLUME_COLOR,
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    candlesRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.25 } });

    layerRef.current = createIndicatorLayer(chart);
    // Orden de dibujo: primero el mapa de calor (fondo), después el libro, después las velas.
    heatRef.current = createHeatmapPrimitive(chart, candlesRef.current);
    depthRef.current = createDepthPrimitive(candlesRef.current);
    vpRef.current = createVolumeProfilePrimitive(chart, candlesRef.current);
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
      cursorPriceRef.current = param.point && (param.paneIndex ?? 0) === 0 ? candlesRef.current.coordinateToPrice(param.point.y) : null;
      setLegend(c ? { ...c } : null);
      setIndLegend(layerRef.current.legend(c ? param.seriesData : null));
    });

    chartRef.current = chart;
    return () => {
      // Al cerrar el gráfico (por ejemplo al pasar al modo liquidez): primero se frenan las partes
      // que tienen temporizadores, y el gráfico se elimina después de que React termine de limpiar
      // los demás efectos (que todavía lo usan, por ejemplo para quitar las líneas de alerta).
      drawRef.current.destroy();
      vpRef.current.destroy();
      depthRef.current.destroy();
      drawRef.current = null;
      layerRef.current = null;
      setTimeout(() => chart.remove(), 0);
    };
  }, []);

  // 2) Cada vez que cambia la lista de indicadores: volver a armarlos.
  useEffect(() => {
    layerRef.current.setInstances(indicators);
    setIndLegend(layerRef.current.legend(null));
  }, [indicators]);

  // Libro de órdenes en vivo (solo cripto, Binance) y mapa de calor que se graba a partir de él.
  useEffect(() => {
    const depth = depthRef.current;
    const heat = heatRef.current;
    setHeatSince(null);
    if (!isBinance(symbol) || (!showBook && !showHeat)) {
      depth.setBook(null);
      heat.setRecorder(null);
      return;
    }
    let latest = null;
    const close = connectOrderBook(
      parseId(symbol).ticker,
      (book) => {
        latest = book;
        if (showBook) depth.setBook(book);
      },
      venueOf(symbol),
    );
    // Mapa de calor: una foto del libro cada 2 s (se graba aunque esté oculto, si el libro está prendido).
    const recorder = getRecorder(symbol);
    heat.setRecorder(showHeat ? recorder : null);
    setHeatSince(recorder.since);
    const timer = setInterval(() => {
      if (recorder.sample(latest)) {
        if (showHeat) heat.refresh();
        setHeatSince(recorder.since);
      }
    }, SAMPLE_MS);
    return () => {
      close();
      clearInterval(timer);
      depth.setBook(null);
      heat.setRecorder(null);
    };
  }, [symbol, market, showBook, showHeat]);

  // Perfil de volumen: solo si el mercado tiene volumen (forex no).
  useEffect(() => {
    vpRef.current.setOptions({ rows: vpInst?.params.rows ?? 60, valueArea: (vpInst?.params.va ?? 70) / 100 });
    vpRef.current.setVisible(showVP && hasVolume);
  }, [showVP, hasVolume, vpInst?.params.rows, vpInst?.params.va]);

  // Alertas del símbolo: línea naranja punteada con 🔔 en el precio de cada una.
  useEffect(() => {
    const series = candlesRef.current;
    const lines = alerts.map((a) =>
      series.createPriceLine({ price: a.price, color: '#ff9800', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '🔔' }),
    );
    return () => lines.forEach((l) => series.removePriceLine(l));
  }, [alerts]);

  // Alt+A: alerta en el precio donde está el cursor (o en el último precio).
  useEffect(() => {
    const onKey = (e) => {
      if (!e.altKey || e.code !== 'KeyA' || e.target.closest?.('input, textarea, select')) return;
      const price = cursorPriceRef.current ?? barsRef.current.at(-1)?.close;
      if (price != null) callbacksRef.current.onCreateAlert?.(price);
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Último precio -> App (para proponerlo al crear una alerta).
  useEffect(() => {
    if (last) callbacksRef.current.onLastPrice?.(last.close);
  }, [last]);

  // Dibujos y opciones de dibujo -> controlador.
  // Ojo: con llaves, para que el efecto no devuelva nada (React toma lo que devuelve como "limpieza").
  useEffect(() => {
    drawRef.current.setDrawings(drawings);
  }, [drawings]);
  useEffect(() => {
    drawRef.current.setTool(tool);
  }, [tool]);
  useEffect(() => {
    drawRef.current.setMagnet(magnet);
  }, [magnet]);
  useEffect(() => {
    drawRef.current.setHidden(hidden);
  }, [hidden]);

  // 3) Cada vez que cambia el símbolo o la temporalidad: cargar historial y escuchar en vivo.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    let unsubscribeRange = () => {};
    setStatus('loading');
    setLegend(null);

    const volBar = (c) => ({ time: c.time, value: c.volume });

    // Dibuja todas las velas de barsRef (al cargar y al sumar historia vieja).
    function setAll() {
      const bars = barsRef.current;
      candlesRef.current.setData(bars);
      volumeRef.current.setData(bars.map(volBar));
      layerRef.current.setBars(bars);
      drawRef.current.setBars(bars);
      heatRef.current.setBars(bars);
      vpRef.current.setBars(bars);
    }

    // Historia hacia atrás: al acercarse al borde izquierdo, pide las velas anteriores
    // y las agrega adelante sin que el gráfico "salte".
    let loading = false;
    let noMore = !isBinance(symbol); // acciones y forex ya vienen con todo lo disponible
    async function loadOlder(range) {
      if (!range || loading || noMore || cancelled || range.from > LOAD_MORE_AT) return;
      loading = true;
      setLoadingOlder(true);
      try {
        const first = barsRef.current[0];
        const older = (await fetchOlderCandles(symbol, interval, first.time)).filter((b) => b.time < first.time);
        if (cancelled) return;
        if (older.length < KLINES_LIMIT) noMore = true; // llegamos al inicio del par
        if (!older.length) return;
        const ts = chartRef.current.timeScale();
        const visible = ts.getVisibleLogicalRange();
        barsRef.current = [...older, ...barsRef.current];
        setAll();
        if (visible) ts.setVisibleLogicalRange({ from: visible.from + older.length, to: visible.to + older.length });
      } catch {
        /* se reintenta al volver a desplazar */
      } finally {
        loading = false;
        if (!cancelled) setLoadingOlder(false);
      }
    }

    setMeta({});
    setLoadingOlder(false);
    fetchCandles(symbol, interval)
      .then(({ bars: candles, ...info }) => {
        if (cancelled) return;
        setMeta(info);
        if (!candles.length) throw new Error('Sin datos para esta temporalidad');
        barsRef.current = candles;
        // Decimales del eje según el precio y el mercado (EUR/USD 1.09730, DOGE 0.05697…).
        const precision = priceDecimals(candles.at(-1).close, market);
        const priceFormat = { type: 'price', precision, minMove: 1 / 10 ** precision };
        candlesRef.current.applyOptions({ priceFormat });
        // El forex no tiene volumen: se oculta y el precio usa ese espacio.
        const hasVolume = candles.some((c) => c.volume > 0);
        setHasVolume(hasVolume);
        vpRef.current.setFormatter((n) => formatPrice(n, market));
        volumeRef.current.applyOptions({ visible: hasVolume });
        candlesRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: hasVolume ? 0.25 : 0.08 } });
        layerRef.current.setPriceFormat(priceFormat);
        drawRef.current.setMarket(market);
        setAll();
        setIndLegend(layerRef.current.legend(null));
        // Símbolo o temporalidad nuevos: la escala de precios vuelve a ser automática en todos
        // los paneles. Si antes arrastraste el eje, la librería la deja apagada y el gráfico
        // nuevo quedaría con la escala del anterior (por ejemplo DOT con la escala de BTC).
        chartRef.current.panes().forEach((_, i) => chartRef.current.priceScale('right', i).applyOptions({ autoScale: true }));
        // Se muestran las últimas velas (como en otras plataformas); el resto, desplazando.
        const n = candles.length;
        chartRef.current.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - VISIBLE_BARS), to: n + 5 });
        const ts = chartRef.current.timeScale();
        ts.subscribeVisibleLogicalRangeChange(loadOlder);
        unsubscribeRange = () => ts.unsubscribeVisibleLogicalRangeChange(loadOlder);
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
          // Si cambió la última vela (o empezó una nueva) alcanza con actualizar el final;
          // si cambió una anterior (pasa con acciones), se recalcula todo.
          if (i < 0 || i === bars.length - 1) layerRef.current.updateLast(barsRef.current);
          else layerRef.current.setBars(barsRef.current);
          vpRef.current.setBars(barsRef.current, { live: true });
          if (bars.length !== barsRef.current.length) {
            // vela nueva
            drawRef.current.setBars(barsRef.current);
            heatRef.current.setBars(barsRef.current);
          }
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
      unsubscribeRange();
    };
  }, [symbol, interval, market]);

  const selected = drawings.find((d) => d.id === selectedId);
  const shown = legend || last;
  const change = shown ? ((shown.close - shown.open) / shown.open) * 100 : 0;


  return (
    <div className="chart-wrap">
      <div className="legend">
        <strong>{pairLabel(symbol)}</strong>
        {meta.name && <span className="muted name">{meta.name}</span>}
        <span className="badge">
          {MARKET_LABEL[market]} · {sourceLabel(symbol, meta.exchange)}
        </span>
        <span className="muted">{interval}</span>
        {shown && (
          <span className={change >= 0 ? 'up' : 'down'}>
            Ap {formatPrice(shown.open, market)} · Máx {formatPrice(shown.high, market)} · Mín {formatPrice(shown.low, market)} · Cie {formatPrice(shown.close, market)} (
            {change >= 0 ? '+' : ''}
            {change.toFixed(2)}%)
          </span>
        )}
      </div>
      {(indLegend.length > 0 || showVP || showBook || showHeat) && (
        <div className="ind-legend">
          {/* Herramientas de mercado: nombre y estado (o por qué no aplican a este símbolo) */}
          {showVP && <span className="muted">Perfil de volumen{hasVolume ? ` ${vpInst.params.rows} · ${vpInst.params.va}%` : ' (sin volumen)'}</span>}
          {showBook && <span className="muted">Libro de órdenes{isBinance(symbol) ? '' : ' (solo cripto)'}</span>}
          {showHeat && (
            <span className="muted">
              Mapa de calor
              {!isBinance(symbol) ? ' (solo cripto)' : heatSince ? ` · desde ${F.time.format(toDate(heatSince))}` : ' · grabando…'}
            </span>
          )}
          {indLegend.map((ind) => (
            <span key={ind.uid}>
              <span style={{ color: ind.color }}>{ind.label}</span>{' '}
              {ind.values.map((v) => (
                <span key={v.label} style={{ color: v.color }}>
                  {v.value == null ? '—' : formatPrice(v.value, ind.overlay ? market : undefined)}{' '}
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
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          favBar={favBar}
          onFavBar={setFavBar}
        />
        <div className="chart-area">
          <div ref={containerRef} className="chart" />
          {favBar && <FavoritesBar favorites={favorites} tool={tool} onTool={setTool} position={favPos} onMove={setFavPos} />}
          {selected && (
            <DrawingEditBar
              drawing={selected}
              onUpdate={(patch) => onDrawingsChange(drawings.map((d) => (d.id === selected.id ? { ...d, ...patch } : d)))}
              onDuplicate={() => drawRef.current.duplicate(selected.id)}
              onAlert={['hline', 'hray', 'crossline'].includes(selected.type) ? () => onCreateAlert?.(selected.points[0].price) : null}
              onDelete={() => drawRef.current.remove(selected.id)}
            />
          )}
          {tool !== 'cursor' && <div className="draw-hint">{TOOL_HINT[tool] || 'Hacé clic en el gráfico'} · Esc para cancelar</div>}
          {loadingOlder && <div className="loading-older">Cargando historia…</div>}
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
