import { useEffect, useRef, useState } from 'react';
import { openStream } from '../api/binance';
import { isBinance, pairLabel, parseId, venueOf } from '../api/market';
import { connectOrderBook } from '../orderbook/live';
import { getLiqRecorder, LIQ_SAMPLE_MS } from '../liquidity/recorder';
import { render, AXIS_W, AXIS_H } from '../liquidity/render';
import { formatPrice } from '../format';
import { useLocalStorage } from '../hooks/useLocalStorage';

const FPS_MS = 66; // se redibuja unas 15 veces por segundo
const timeFmt = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

// "Modo liquidez" (estilo Bookmap): mapa de calor del libro segundo a segundo, línea de mejor
// compra/venta y burbujas de operaciones. Solo cripto y perpetuos de Binance.
//   Rueda: zoom en el tiempo · Shift + rueda (o rueda sobre el eje de precios): zoom en el precio
//   Arrastrar: mover · Doble clic: volver a "en vivo"
export default function LiquidityView({ symbol }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const recRef = useRef(null);
  const viewRef = useRef(newView());
  const [contrast, setContrast] = useLocalStorage('mt.liq.contrast', 1);
  const [minBubble, setMinBubble] = useLocalStorage('mt.liq.minBubble', 0.3);
  const [live, setLive] = useState(true);
  const [since, setSince] = useState(null);
  const optsRef = useRef({});
  optsRef.current = { contrast, minBubble, formatPrice: (n) => formatPrice(n, 'crypto') };
  const supported = isBinance(symbol);

  // ---------- datos: libro + operaciones ----------
  useEffect(() => {
    // Cámara nueva para el símbolo nuevo (conservando el tamaño del canvas, que solo se mide al redimensionar).
    viewRef.current = { ...newView(), size: viewRef.current.size };
    setLive(true);
    if (!supported) return;
    const { ticker } = parseId(symbol);
    const venue = venueOf(symbol);
    const rec = getLiqRecorder(symbol);
    recRef.current = rec;
    setSince(rec.since);
    let latest = null;
    const closeBook = connectOrderBook(ticker, (book) => (latest = book), venue);
    const closeTrades = openStream(
      [`${ticker.toLowerCase()}@aggTrade`],
      // m = true: el comprador era el que esperaba → la operación la inició un vendedor.
      (t) => rec.trade({ price: +t.p, qty: +t.q, time: t.T, isSell: t.m }),
      venue,
    );
    const timer = setInterval(() => {
      if (rec.sample(latest)) setSince(rec.since);
    }, LIQ_SAMPLE_MS);
    return () => {
      closeBook();
      closeTrades();
      clearInterval(timer);
      recRef.current = null;
    };
  }, [symbol, supported]);

  // ---------- tamaño del canvas (nítido en pantallas de alta densidad) ----------
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ro = new ResizeObserver(() => {
      const { width, height } = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      viewRef.current.size = { w: width, h: height, dpr };
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // ---------- bucle de dibujo ----------
  useEffect(() => {
    let raf;
    let lastDraw = 0;
    const loop = (ts) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || ts - lastDraw < FPS_MS) return;
      lastDraw = ts;
      const canvas = canvasRef.current;
      const view = viewRef.current;
      if (!canvas || !view.size) return;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(view.size.dpr, 0, 0, view.size.dpr, 0, 0);
      const rec = recRef.current || { columns: [], bubbles: [], step: null };
      view.frame = render(ctx, view.size, rec, view, {
        ...optsRef.current,
        message: supported ? null : 'El modo liquidez está disponible para cripto y perpetuos de Binance.',
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [supported]);

  // ---------- mouse: zoom, desplazamiento, cruz ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    let drag = null;
    const local = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    function onWheel(e) {
      const view = viewRef.current;
      const f = view.frame;
      if (!f) return;
      e.preventDefault();
      const { x, y } = local(e);
      const factor = Math.exp(-e.deltaY * 0.0015);
      if (e.shiftKey || x > f.pw) {
        // Zoom de precio alrededor del cursor.
        const price = view.priceCenter + view.priceSpan / 2 - y * f.ppp;
        const span = Math.min(view.priceCenter * 0.05, Math.max(view.priceCenter * 0.0002, view.priceSpan / factor));
        view.priceCenter = price + (view.priceCenter - price) * (span / view.priceSpan);
        view.priceSpan = span;
        view.followPrice = false;
      } else {
        // Zoom de tiempo alrededor del cursor.
        const t = f.right - (f.pw - x) * f.msPerPx;
        view.pxPerCol = Math.min(24, Math.max(0.25, view.pxPerCol * factor));
        if (!view.live) view.endTime = t + (f.pw - x) * (LIQ_SAMPLE_MS / view.pxPerCol);
      }
    }

    function onDown(e) {
      if (e.button > 0) return;
      const f = viewRef.current.frame;
      if (!f) return;
      drag = { ...local(e), right: f.right, center: viewRef.current.priceCenter, f };
      canvas.setPointerCapture(e.pointerId);
    }

    function onMove(e) {
      const view = viewRef.current;
      const p = local(e);
      view.hover = p;
      if (!drag) return;
      const dx = p.x - drag.x;
      const dy = p.y - drag.y;
      if (Math.abs(dx) > 2) {
        view.live = false;
        view.endTime = Math.min(Date.now(), drag.right - dx * drag.f.msPerPx);
        setLive(false);
      }
      if (Math.abs(dy) > 2) {
        view.followPrice = false;
        view.priceCenter = drag.center + dy * drag.f.ppp;
      }
    }

    const onUp = () => (drag = null);
    const onLeave = () => (viewRef.current.hover = null);
    const onDbl = () => goLive();

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('dblclick', onDbl);
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('dblclick', onDbl);
    };
  }, []);

  function goLive() {
    const view = viewRef.current;
    view.live = true;
    view.endTime = null;
    view.followPrice = true;
    setLive(true);
  }

  return (
    <div className="liq-view">
      <div className="liq-bar">
        <strong>{pairLabel(symbol)}</strong>
        <span className="badge">Modo liquidez</span>
        {supported && <span className="muted">{since ? `grabando desde ${timeFmt.format(since)}` : 'conectando…'}</span>}
        <label className="liq-ctl" title="Más contraste: se destacan órdenes más chicas">
          Contraste
          <input type="range" min="0.5" max="4" step="0.1" value={contrast} onChange={(e) => setContrast(Number(e.target.value))} />
        </label>
        <label className="liq-ctl" title="Oculta las burbujas más chicas (operaciones de poco volumen)">
          Burbujas
          <input type="range" min="0" max="3" step="0.1" value={minBubble} onChange={(e) => setMinBubble(Number(e.target.value))} />
        </label>
        <span className="liq-legend">
          <i className="dot buy" /> compras a mercado <i className="dot sell" /> ventas a mercado
        </span>
        {!live && (
          <button className="liq-live" onClick={goLive} title="Volver al presente (o doble clic en el gráfico)">
            ● En vivo
          </button>
        )}
      </div>
      <div className="liq-canvas" ref={wrapRef}>
        <canvas ref={canvasRef} />
      </div>
      <div className="liq-help muted">
        Rueda: zoom en el tiempo · Shift + rueda o rueda sobre los precios: zoom en el precio · Arrastrar: mover · Doble clic: en vivo
      </div>
    </div>
  );
}

function newView() {
  return { pxPerCol: 3, live: true, endTime: null, followPrice: true, priceCenter: null, priceSpan: null, hover: null };
}

// Exportado para el layout (por si otro componente necesita el ancho del eje).
export const LIQ_AXIS = { w: AXIS_W, h: AXIS_H };
