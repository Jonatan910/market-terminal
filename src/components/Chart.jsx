import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, CrosshairMode } from 'lightweight-charts';
import { fetchKlines, openStream, toCandle } from '../api/binance';
import { formatPrice } from '../format';

const UP = '#26a69a';
const DOWN = '#ef5350';

export default function Chart({ symbol, interval }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const candlesRef = useRef(null);
  const volumeRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');
  const [legend, setLegend] = useState(null); // vela bajo el cursor
  const [last, setLast] = useState(null); // última vela (en vivo)

  // 1) Crear el gráfico una sola vez.
  useEffect(() => {
    const chart = createChart(containerRef.current, {
      autoSize: true, // se adapta solo al tamaño del contenedor
      layout: { background: { color: 'transparent' }, textColor: '#9aa4b2', fontFamily: 'inherit' },
      grid: { vertLines: { color: '#1c2230' }, horzLines: { color: '#1c2230' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#2a3142' },
      timeScale: { borderColor: '#2a3142', timeVisible: true, secondsVisible: false },
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

    // Leyenda: muestra los valores de la vela bajo el cursor.
    chart.subscribeCrosshairMove((param) => {
      const c = param.seriesData?.get(candlesRef.current);
      setLegend(c ? { ...c } : null);
    });

    chartRef.current = chart;
    return () => chart.remove();
  }, []);

  // 2) Cada vez que cambia el símbolo o la temporalidad: cargar historial y escuchar en vivo.
  useEffect(() => {
    let cancelled = false;
    let close = () => {};
    setStatus('loading');
    setLegend(null);

    const volBar = (c) => ({ time: c.time, value: c.volume, color: c.close >= c.open ? UP + '66' : DOWN + '66' });

    fetchKlines(symbol, interval)
      .then((candles) => {
        if (cancelled) return;
        candlesRef.current.setData(candles);
        volumeRef.current.setData(candles.map(volBar));
        chartRef.current.timeScale().fitContent();
        setLast(candles.at(-1));
        setStatus('ready');

        // Stream de la vela actual: Binance manda una actualización por segundo aprox.
        close = openStream([`${symbol.toLowerCase()}@kline_${interval}`], (msg) => {
          const k = msg.k;
          const c = toCandle([k.t, k.o, k.h, k.l, k.c, k.v]);
          candlesRef.current.update(c);
          volumeRef.current.update(volBar(c));
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
      close();
    };
  }, [symbol, interval]);

  const shown = legend || last;
  const change = shown ? ((shown.close - shown.open) / shown.open) * 100 : 0;

  return (
    <div className="chart-wrap">
      <div className="legend">
        <strong>{symbol.replace(/USDT$/, '')}/USDT</strong>
        <span className="muted">{interval}</span>
        {shown && (
          <span className={change >= 0 ? 'up' : 'down'}>
            Ap {formatPrice(shown.open)} · Máx {formatPrice(shown.high)} · Mín {formatPrice(shown.low)} · Cie {formatPrice(shown.close)}{' '}
            ({change >= 0 ? '+' : ''}
            {change.toFixed(2)}%)
          </span>
        )}
      </div>
      <div ref={containerRef} className="chart" />
      {status === 'loading' && <div className="overlay">Cargando {symbol}…</div>}
      {status === 'error' && (
        <div className="overlay error">
          No se pudieron cargar los datos de {symbol}.<br />
          <small>{error}</small>
        </div>
      )}
    </div>
  );
}
