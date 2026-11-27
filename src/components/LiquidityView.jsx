import { useEffect, useRef, useState } from 'react';
import { openStream } from '../api/binance';
import { isBinance, pairLabel, parseId, venueOf } from '../api/market';
import { connectOrderBook } from '../orderbook/live';
import { getLiqRecorder, LIQ_SAMPLE_MS } from '../liquidity/recorder';
import { render, AXIS_W, AXIS_H } from '../liquidity/render';
import { getDetector } from '../liquidity/detector';
import { getHistory, historyEnabled, loadInitial, loadOlderIfNeeded } from '../liquidity/history';
import { playChime, systemNotification, unlockAudio, askNotificationPermission } from '../alerts/notify';
import { formatPrice } from '../format';
import { useLocalStorage } from '../hooks/useLocalStorage';

const FPS_MS = 66; // se redibuja unas 15 veces por segundo
const timeFmt = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const dayFmt = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

// Une la historia del servidor (lo más viejo) con lo grabado en vivo, sin repetir.
function merged(hist, rec) {
  if (!hist?.columns.length) return rec;
  const t0 = rec.columns[0]?.t ?? Infinity;
  const b0 = rec.bubbles[0]?.t ?? Infinity;
  const cols = hist.columns.filter((c) => c.t < t0);
  const bubs = hist.bubbles.filter((b) => b.t < b0);
  return {
    columns: cols.length ? cols.concat(rec.columns) : rec.columns,
    bubbles: bubs.length ? bubs.concat(rec.bubbles) : rec.bubbles,
    step: rec.step ?? hist.step,
    volAt: rec.volAt,
  };
}
const compact = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 });
const NEAR = 0.003; // "cerca del precio": dentro del 0,3 %

// Texto de un evento del detector.
function eventText(e, base) {
  const qty = `${compact.format(e.qty)} ${base}`;
  const lado = e.side === 'buy' || e.side === 'bid' ? 'compra' : 'venta';
  if (e.type === 'trade') return { title: `${e.side === 'buy' ? 'Compra' : 'Venta'} a mercado ${qty}`, kind: e.side === 'buy' ? 'up' : 'down' };
  if (e.type === 'wall-new') return { title: `Pared de ${lado} nueva: ${qty}`, kind: 'wall' };
  if (e.type === 'wall-filled') return { title: `Pared de ${lado} ejecutada: ${qty}`, kind: 'wall' };
  return { title: `Pared de ${lado} retirada: ${qty}`, kind: 'pulled' };
}

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
  const [showDom, setShowDom] = useLocalStorage('mt.liq.dom', true); // panel del libro a la derecha
  const [showBottom, setShowBottom] = useLocalStorage('mt.liq.bottom', true); // panel de CVD y volumen
  const [showBig, setShowBig] = useLocalStorage('mt.liq.big', true); // detector de órdenes grandes
  const [notifyBig, setNotifyBig] = useLocalStorage('mt.liq.notify', false); // avisar con sonido/notificación
  const [thresholds, setThresholds] = useLocalStorage('mt.liq.thresholds', {}); // { símbolo: { trade, wall } } fijados a mano
  const [events, setEvents] = useState([]);
  const [autoTh, setAutoTh] = useState({ trade: null, wall: null });
  const detRef = useRef(null);
  const settingsRef = useRef({});
  const th = thresholds[symbol] || {};
  settingsRef.current = { th, notifyBig, showBig };
  const base = parseId(symbol).ticker.replace(/USDT$/, '');
  const [live, setLive] = useState(true);
  const [since, setSince] = useState(null);
  const [histInfo, setHistInfo] = useState(null); // { from, loading, error } de la historia del servidor
  const histRef = useRef(null);
  const optsRef = useRef({});
  optsRef.current = { contrast, minBubble, showDom, showBottom, showBig, detector: detRef.current, formatPrice: (n) => formatPrice(n, 'crypto') };
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
    const det = getDetector(symbol);
    detRef.current = det;
    // Historia del servidor (si está configurado): las últimas 2 horas al abrir.
    const hist = historyEnabled() ? getHistory(symbol) : null;
    histRef.current = hist;
    const syncHist = () => hist && setHistInfo({ from: hist.columns[0]?.t ?? null, loading: hist.loading, error: hist.error });
    if (hist) Promise.resolve(loadInitial(hist)).then(syncHist);
    syncHist();
    setEvents(det.events.slice(0, 8));
    setSince(rec.since);
    let lastNotice = 0;
    let latest = null;
    const closeBook = connectOrderBook(ticker, (book) => (latest = book), venue);
    const closeTrades = openStream(
      [`${ticker.toLowerCase()}@aggTrade`],
      // m = true: el comprador era el que esperaba → la operación la inició un vendedor.
      (t) => rec.trade({ price: +t.p, qty: +t.q, time: t.T, isSell: t.m }),
      venue,
    );
    const timer = setInterval(() => {
      if (!rec.sample(latest)) return;
      setSince(rec.since);
      // Detector de órdenes grandes
      const { th, notifyBig, showBig } = settingsRef.current;
      const fresh = det.update(rec, { trade: th.trade ?? null, wall: th.wall ?? null });
      setAutoTh({ ...det.auto });
      if (!fresh.length) return;
      setEvents(det.events.slice(0, 8));
      // Aviso (sonido + notificación) si es algo grande cerca del precio, como mucho cada 4 s.
      const col = rec.columns.at(-1);
      const mid = (col.bid + col.ask) / 2;
      const near = fresh.filter((e) => (e.type === 'trade' || e.type === 'wall-new') && Math.abs(e.price - mid) / mid <= NEAR);
      if (showBig && notifyBig && near.length && Date.now() - lastNotice > 4000) {
        lastNotice = Date.now();
        playChime();
        const e = near[0];
        systemNotification(`🐋 ${pairLabel(symbol)}: ${eventText(e, parseId(symbol).ticker.replace(/USDT$/, '')).title}`, `Precio ${formatPrice(e.price, 'crypto')}`);
      }
    }, LIQ_SAMPLE_MS);
    return () => {
      closeBook();
      closeTrades();
      clearInterval(timer);
      recRef.current = null;
      detRef.current = null;
      histRef.current = null;
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
      const live = recRef.current || { columns: [], bubbles: [], step: null, volAt: new Map() };
      const hist = histRef.current;
      const rec = merged(hist, live);
      // Si la vista llega más atrás de lo cargado, se pide más historia al servidor.
      if (hist && view.frame && !hist.loading) {
        const leftT = view.frame.right - view.frame.pw * view.frame.msPerPx;
        const p = loadOlderIfNeeded(hist, leftT);
        if (p) {
          setHistInfo((h) => ({ ...h, loading: true }));
          p.then(() => setHistInfo({ from: hist.columns[0]?.t ?? null, loading: false, error: hist.error }));
        }
      }
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
      const p = local(e);
      // En el panel de abajo (CVD/volumen) solo se mueve el tiempo, no el precio.
      drag = { ...p, right: f.right, center: viewRef.current.priceCenter, f, timeOnly: p.y > f.ph };
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
      if (Math.abs(dy) > 2 && !drag.timeOnly) {
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

  // Ir a un evento: la vista se mueve a ese momento y ese precio.
  function goTo(e) {
    const view = viewRef.current;
    view.live = false;
    view.endTime = Math.min(Date.now(), e.t + 20000);
    view.followPrice = false;
    view.priceCenter = e.price;
    setLive(false);
  }

  const setTh = (key, value) => {
    const n = Number(String(value).replace(',', '.'));
    const next = { ...th, [key]: value === '' || !(n > 0) ? undefined : n };
    setThresholds({ ...thresholds, [symbol]: next });
  };

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
        {supported && <span className="muted">{since ? `en vivo desde ${timeFmt.format(since)}` : 'conectando…'}</span>}
        {supported && historyEnabled() && (
          <span className="muted" title="Historia grabada por el servidor (hasta 7 días). Desplazá hacia la izquierda para ver más.">
            {histInfo?.error
              ? '· servidor sin conexión'
              : histInfo?.loading
              ? '· cargando historia…'
              : histInfo?.from
              ? `· historia desde ${dayFmt.format(histInfo.from)}`
              : ''}
          </span>
        )}
        <label className="liq-ctl" title="Más contraste: se destacan órdenes más chicas">
          Contraste
          <input type="range" min="0.5" max="4" step="0.1" value={contrast} onChange={(e) => setContrast(Number(e.target.value))} />
        </label>
        <label className="liq-ctl" title="Oculta las burbujas más chicas (operaciones de poco volumen)">
          Burbujas
          <input type="range" min="0" max="3" step="0.1" value={minBubble} onChange={(e) => setMinBubble(Number(e.target.value))} />
        </label>
        <button className={`chip ${showDom ? 'on' : ''}`} onClick={() => setShowDom(!showDom)} aria-pressed={showDom} title="Libro de órdenes actual y volumen operado por precio, a la derecha">
          Libro
        </button>
        <button className={`chip ${showBottom ? 'on' : ''}`} onClick={() => setShowBottom(!showBottom)} aria-pressed={showBottom} title="Panel de abajo: CVD (compras − ventas acumuladas) y volumen por medio segundo">
          CVD y volumen
        </button>
        <button className={`chip ${showBig ? 'on' : ''}`} onClick={() => setShowBig(!showBig)} aria-pressed={showBig} title="Detector de órdenes grandes: operaciones y paredes fuera de lo común">
          Órdenes grandes
        </button>
        {showBig && (
          <>
            <label className="liq-ctl" title="Operaciones a mercado (por medio segundo) de este tamaño o más. Vacío = automático (el 1 % más grande).">
              Operación ≥
              <input
                className="liq-num"
                inputMode="decimal"
                value={th.trade ?? ''}
                placeholder={autoTh.trade != null ? `auto ${compact.format(autoTh.trade)}` : 'auto'}
                onChange={(e) => setTh('trade', e.target.value)}
              />
              {base}
            </label>
            <label className="liq-ctl" title="Paredes del libro de este tamaño o más. Vacío = automático (el 1 % más grande).">
              Pared ≥
              <input
                className="liq-num"
                inputMode="decimal"
                value={th.wall ?? ''}
                placeholder={autoTh.wall != null ? `auto ${compact.format(autoTh.wall)}` : 'auto'}
                onChange={(e) => setTh('wall', e.target.value)}
              />
              {base}
            </label>
            <label className="liq-ctl" title="Sonido y notificación cuando aparece una operación o pared grande cerca del precio (±0,3 %)">
              <input
                type="checkbox"
                checked={notifyBig}
                onChange={async (e) => {
                  setNotifyBig(e.target.checked);
                  if (e.target.checked) {
                    unlockAudio();
                    await askNotificationPermission();
                  }
                }}
              />
              Avisar
            </label>
          </>
        )}
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
        {showBig && supported && (
          <div className="big-list" aria-label="Órdenes grandes">
            <div className="big-head">Órdenes grandes</div>
            {!events.length && <div className="big-empty">Todavía no hubo. Se marcan con aro dorado (operaciones) y recuadro dorado (paredes).</div>}
            {events.map((e) => {
              const { title, kind } = eventText(e, base);
              return (
                <button key={e.id} className={`big-row ${kind}`} onClick={() => goTo(e)} title="Ver en el mapa">
                  <span className="big-time">{timeFmt.format(e.t)}</span>
                  <span className="big-title">{title}</span>
                  <span className="big-price">
                    {formatPrice(e.price, 'crypto')} · ${compact.format(e.qty * e.price)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
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
