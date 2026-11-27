// Controlador de dibujos: escucha el mouse/dedo sobre el gráfico, crea, selecciona,
// mueve, copia y borra dibujos, y los pinta con una "primitiva" de lightweight-charts
// (así se desplazan y hacen zoom junto con el gráfico).
import { TOOLS, DEFAULT_STYLE, applyStroke } from './tools';
import { createTimeMap } from './timeMap';
import { formatPrice } from '../format';

const HANDLE_R = 5; // radio de los puntitos para arrastrar las puntas
const PASTE_SHIFT = 5; // al pegar, la copia se corre unas velas a la derecha para que se vea

let idSeq = 0;
const newId = () => `d${Date.now().toString(36)}${(idSeq++).toString(36)}`;

// El "portapapeles" de dibujos: se comparte entre símbolos (copiás en BTC y pegás en ETH).
let clipboard = null;

export function createDrawingController({ chart, series, container, onChange, onSelect, onToolDone }) {
  let drawings = [];
  let bars = [];
  let map = createTimeMap([]);
  let tool = 'cursor';
  let magnet = false;
  let market = 'crypto'; // para mostrar los precios con los decimales correctos
  let hidden = false;
  let selectedId = null;
  let hoverId = null; // dibujo bajo el cursor (algunos muestran sus datos solo así o seleccionados)
  let draft = null; // dibujo que se está creando
  let freehand = false; // pincel: dibujando mientras el botón está apretado
  let drag = null; // arrastre en curso
  let down = null; // dónde se apretó (para distinguir clic de arrastre)
  let lastClick = { t: 0, x: 0, y: 0 }; // para detectar doble clic
  let snapMarker = null; // punto donde se está pegando el imán (se marca con un circulito)
  let requestUpdate = () => {};

  // ---------- conversión fecha/precio <-> píxeles ----------
  const ts = () => chart.timeScale();
  const priceToY = (p) => series.priceToCoordinate(p);

  // La librería solo convierte índices enteros a píxeles: entre dos velas, interpolamos.
  function logicalToX(logical) {
    const i = Math.floor(logical);
    const x1 = ts().logicalToCoordinate(i);
    if (x1 == null || logical === i) return x1;
    const x2 = ts().logicalToCoordinate(i + 1);
    return x2 == null ? x1 : x1 + (x2 - x1) * (logical - i);
  }

  function project(pt) {
    const logical = map.toLogical(pt.time);
    const x = logical == null ? null : logicalToX(logical);
    const y = series.priceToCoordinate(pt.price);
    return x == null || y == null ? null : { x, y };
  }

  function unproject(x, y, useMagnet = magnet) {
    let logical = ts().coordinateToLogical(x);
    let price = series.coordinateToPrice(y);
    if (logical == null || price == null) return null;
    if (useMagnet && bars.length) {
      // Imán: se pega a la apertura, máximo, mínimo o cierre de la vela más cercana.
      const i = Math.max(0, Math.min(bars.length - 1, Math.round(logical)));
      const b = bars[i];
      logical = i;
      price = [b.open, b.high, b.low, b.close].reduce((best, p) =>
        Math.abs(priceToY(p) - y) < Math.abs(priceToY(best) - y) ? p : best,
      );
    }
    return { time: map.toTime(logical), price };
  }

  // ¿Se pega a las velas ahora? El botón Imán lo deja fijo; mantener Ctrl (Cmd en Mac)
  // lo activa mientras está apretado (o lo desactiva, si el imán ya estaba prendido).
  const snapping = (ev) => magnet !== Boolean(ev.ctrlKey || ev.metaKey);

  // Punto bajo el cursor (con imán si corresponde); marca el circulito del imán.
  function pointAt(ev, pos) {
    const snap = snapping(ev);
    const pt = unproject(pos.x, pos.y, snap);
    snapMarker = snap && pt ? pt : null;
    return pt;
  }

  // Corre todos los puntos de un dibujo dL velas y dP de precio.
  const shiftPoints = (points, dL, dP) => points.map((p) => ({ time: map.toTime(map.toLogical(p.time) + dL), price: p.price + dP }));

  // ---------- pintar ----------
  const measureCtx = document.createElement('canvas').getContext('2d');
  const env = () => ({
    width: ts().width(),
    height: chart.paneSize(0).height,
    priceToY,
    yToPrice: (y) => series.coordinateToPrice(y),
    logicalOf: (t) => map.toLogical(t),
    timeAt: (l) => map.toTime(l),
    formatPrice: (n) => formatPrice(n, market),
    measureText: (text, px) => {
      measureCtx.font = `${px}px system-ui, sans-serif`;
      return measureCtx.measureText(text).width;
    },
  });

  const handlesOf = (d) => (TOOLS[d.type].handles ? TOOLS[d.type].handles(d) : d.points);

  function render(ctx) {
    if (hidden) return;
    const e = env();
    const list = draft ? [...drawings, draft] : drawings;
    for (const d of list) {
      const def = TOOLS[d.type];
      if (!def) continue;
      const P = d.points.map(project);
      if (P.some((p) => !p)) continue;
      const selected = d.id === selectedId || d === draft;
      ctx.save();
      applyStroke(ctx, d.style, selected);
      def.draw(ctx, d, P, { ...e, selected, hovered: d.id === hoverId });
      ctx.restore();
      if (selected && d !== draft) {
        for (const p of handlesOf(d).map(project)) {
          if (!p) continue;
          ctx.beginPath();
          ctx.arc(p.x, p.y, HANDLE_R, 0, Math.PI * 2);
          ctx.fillStyle = '#0b0e14';
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.setLineDash([]);
          ctx.strokeStyle = d.style.color;
          ctx.stroke();
        }
      }
    }
    // Imán: circulito en el precio de la vela donde se va a pegar el punto.
    const m = snapMarker && project(snapMarker);
    if (m) {
      ctx.save();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(m.x, m.y, 4.5, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---------- etiquetas en los ejes (como en otras plataformas) ----------
  // Precio en el eje de la derecha y fecha en el de abajo, del color del dibujo:
  //   - siempre: líneas y rayos horizontales, cruz (precio) y líneas verticales, cruz (fecha);
  //   - el dibujo seleccionado (o el que se está creando): todas sus puntas.
  const ALWAYS_PRICE = new Set(['hline', 'hray', 'crossline']);
  const ALWAYS_TIME = new Set(['vline', 'crossline']);
  const dateFmt = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  let priceViews = [];
  let timeViews = [];

  function textOn(hex) {
    const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16);
    const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
    return lum > 160 ? '#000' : '#fff'; // texto negro sobre colores claros (amarillo, blanco)
  }
  const axisView = (coord, text, color) => ({
    coordinate: () => coord,
    text: () => text,
    textColor: () => textOn(color),
    backColor: () => color,
    visible: () => true,
    tickVisible: () => true,
  });

  function updateAxisViews() {
    priceViews = [];
    timeViews = [];
    if (hidden) return;
    const list = draft ? [...drawings, draft] : drawings;
    for (const d of list) {
      if (!TOOLS[d.type]) continue;
      const active = d.id === selectedId || d === draft;
      const color = d.style.color;
      const pts = active ? handlesOf(d) : [];
      const prices = new Set(pts.map((p) => p.price));
      const times = new Set(pts.map((p) => p.time));
      if (ALWAYS_PRICE.has(d.type)) prices.add(d.points[0].price);
      if (ALWAYS_TIME.has(d.type)) times.add(d.points[0].time);
      if (d.type === 'text') prices.clear(), times.clear(); // el texto no necesita etiquetas
      for (const price of prices) {
        const y = series.priceToCoordinate(price);
        if (y != null) priceViews.push(axisView(y, formatPrice(price, market), color));
      }
      for (const time of times) {
        const p = project({ time, price: d.points[0].price });
        if (p) timeViews.push(axisView(p.x, dateFmt.format(new Date(time * 1000)), color));
      }
    }
  }

  const primitive = {
    attached: (p) => (requestUpdate = p.requestUpdate),
    detached: () => (requestUpdate = () => {}),
    updateAllViews: updateAxisViews,
    priceAxisViews: () => priceViews,
    timeAxisViews: () => timeViews,
    paneViews: () => [
      {
        zOrder: () => 'top',
        renderer: () => ({
          draw: (target) => target.useMediaCoordinateSpace(({ context }) => render(context)),
        }),
      },
    ],
  };
  series.attachPrimitive(primitive);

  // ---------- búsqueda de lo que hay bajo el cursor ----------
  function hitTest(x, y) {
    if (hidden) return null;
    const e = env();
    const sel = drawings.find((d) => d.id === selectedId);
    if (sel) {
      const H = handlesOf(sel).map(project);
      const i = H.findIndex((p) => p && Math.hypot(p.x - x, p.y - y) <= HANDLE_R + 3);
      if (i >= 0) return { drawing: sel, handle: i };
    }
    for (let k = drawings.length - 1; k >= 0; k--) {
      const d = drawings[k];
      const def = TOOLS[d.type];
      if (!def) continue;
      const P = d.points.map(project);
      if (P.some((p) => !p)) continue;
      if (def.hit(d, P, x, y, e)) return { drawing: d, handle: null };
    }
    return null;
  }

  // ---------- eventos ----------
  function local(ev) {
    const r = container.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }
  const insidePane = ({ x, y }) => x >= 0 && x <= ts().width() && y >= 0 && y <= chart.paneSize(0).height;

  // Mientras se dibuja o arrastra, el gráfico no se debe desplazar.
  const lockChart = (lock) => chart.applyOptions({ handleScroll: !lock, handleScale: !lock });

  function select(id) {
    selectedId = id;
    onSelect(id);
    requestUpdate();
  }

  const commit = () => onChange(drawings);

  function finishDraft() {
    const d = draft;
    draft = null;
    freehand = false;
    snapMarker = null;
    lockChart(false);
    if (!d) return;
    // Un camino necesita al menos 2 puntos distintos; el pincel, al menos 2 puntos.
    if (d.points.length < 2 && TOOLS[d.type].points !== 1 && !TOOLS[d.type].create) {
      requestUpdate();
      return;
    }
    drawings = [...drawings, d];
    commit();
    select(d.id);
    tool = 'cursor';
    onToolDone();
  }

  function newDrawing(type, points) {
    return {
      id: newId(),
      type,
      points,
      style: { ...DEFAULT_STYLE },
      ...(type === 'text' && { text: 'Texto' }),
    };
  }

  function onPointerDown(ev) {
    if (ev.button > 0) return;
    const pos = local(ev);
    if (!insidePane(pos)) return;
    down = { ...pos, moved: false };
    const now = Date.now();
    const isDouble = now - lastClick.t < 350 && Math.hypot(pos.x - lastClick.x, pos.y - lastClick.y) < 8;
    lastClick = { t: now, ...pos };

    if (tool !== 'cursor') {
      const pt = pointAt(ev, pos);
      if (!pt) return;
      lockChart(true);
      ev.preventDefault();
      const def = TOOLS[tool];

      if (!draft) {
        if (def.create) {
          draft = newDrawing(tool, def.create(pt, env()));
          finishDraft();
        } else if (def.points === 1) {
          draft = newDrawing(tool, [pt]);
          finishDraft();
        } else if (def.points === 'free') {
          draft = newDrawing(tool, [unproject(pos.x, pos.y, false)]);
          freehand = true;
        } else {
          draft = newDrawing(tool, [pt, { ...pt }]); // el segundo punto sigue al cursor
        }
      } else {
        // Clic siguiente: fija el punto que seguía al cursor.
        draft.points[draft.points.length - 1] = pt;
        if (def.points === 'multi') {
          if (isDouble) {
            draft.points.pop(); // el doble clic agregó un punto repetido
            finishDraft();
          } else draft.points.push({ ...pt });
        } else if (draft.points.length >= def.points) finishDraft();
        else draft.points.push({ ...pt });
      }
      requestUpdate();
      return;
    }

    const hit = hitTest(pos.x, pos.y);
    if (!hit) {
      if (selectedId) select(null);
      return;
    }
    let target = hit.drawing;
    // Alt + arrastrar: duplica el dibujo y arrastra la copia (como en otras plataformas).
    if (ev.altKey && hit.handle == null) {
      target = { ...structuredClone(target), id: newId() };
      drawings = [...drawings, target];
    }
    select(target.id);
    lockChart(true);
    drag = {
      id: target.id,
      handle: hit.handle,
      start: unproject(pos.x, pos.y, false),
      startLogical: ts().coordinateToLogical(pos.x),
      original: structuredClone(target),
    };
  }

  function onPointerMove(ev) {
    if (ev.type === 'pointermove') lastMove = { clientX: ev.clientX, clientY: ev.clientY };
    const pos = local(ev);
    if (down && Math.hypot(pos.x - down.x, pos.y - down.y) > 4) down.moved = true;

    if (draft) {
      if (freehand) {
        const last = project(draft.points[draft.points.length - 1]);
        if (!last || Math.hypot(last.x - pos.x, last.y - pos.y) > 3) {
          const pt = unproject(pos.x, pos.y, false);
          if (pt) draft.points.push(pt);
        }
      } else {
        const pt = pointAt(ev, pos);
        if (pt) draft.points[draft.points.length - 1] = pt;
      }
      requestUpdate();
      return;
    }

    if (drag) {
      const def = TOOLS[drag.original.type];
      let points;
      if (drag.handle != null) {
        const pt = pointAt(ev, pos);
        if (!pt) return;
        points = def.moveHandle
          ? def.moveHandle(drag.original, drag.handle, pt)
          : drag.original.points.map((p, i) => (i === drag.handle ? pt : p));
      } else {
        // Mover todo el dibujo: mismo desplazamiento en velas y en precio para cada punto.
        const logical = ts().coordinateToLogical(pos.x);
        const price = series.coordinateToPrice(pos.y);
        if (logical == null || price == null) return;
        points = shiftPoints(drag.original.points, logical - drag.startLogical, price - drag.start.price);
      }
      drawings = drawings.map((x) => (x.id === drag.id ? { ...x, points } : x));
      requestUpdate();
      return;
    }

    // Con una herramienta elegida (antes del primer clic), mostrar dónde pegaría el imán.
    if (tool !== 'cursor') {
      const had = snapMarker;
      if (insidePane(pos)) pointAt(ev, pos);
      else snapMarker = null;
      if (had || snapMarker) requestUpdate();
    }

    // Cursor: manito sobre los dibujos.
    if (tool === 'cursor' && insidePane(pos)) {
      const hit = hitTest(pos.x, pos.y);
      container.style.cursor = hit ? (hit.handle != null ? 'grab' : ev.altKey ? 'copy' : 'pointer') : '';
      const id = hit ? hit.drawing.id : null;
      if (id !== hoverId) {
        hoverId = id;
        requestUpdate();
      }
    } else {
      container.style.cursor = tool !== 'cursor' ? 'crosshair' : '';
    }
  }

  function onPointerUp() {
    if (draft) {
      const def = TOOLS[draft.type];
      if (freehand) finishDraft();
      // Dibujo hecho arrastrando (apretar, mover y soltar) en vez de clics:
      else if (down?.moved && draft.points.length === 2) {
        if (def.points === 2) finishDraft();
        else draft.points.push({ ...draft.points[1] }); // herramientas de 3+ puntos: sigue con el próximo
      }
    }
    if (drag) {
      drag = null;
      snapMarker = null;
      lockChart(false);
      commit();
      requestUpdate();
    }
    down = null;
  }

  function cancelDraft() {
    draft = null;
    freehand = false;
    snapMarker = null;
    lockChart(false);
    requestUpdate();
  }

  // Apretar o soltar Ctrl sin mover el mouse también prende/apaga el imán en el momento.
  let lastMove = null;
  function onModifier(ev) {
    if ((ev.key === 'Control' || ev.key === 'Meta') && lastMove && (tool !== 'cursor' || draft || drag)) {
      onPointerMove({ clientX: lastMove.clientX, clientY: lastMove.clientY, ctrlKey: ev.type === 'keydown', metaKey: false, altKey: false });
    }
  }

  function onKeyDown(ev) {
    onModifier(ev);
    if (ev.target.closest?.('input, textarea, select')) return; // escribiendo en un campo
    const mod = ev.ctrlKey || ev.metaKey;

    if (ev.key === 'Enter' && draft && TOOLS[draft.type].points === 'multi') {
      draft.points.pop(); // el último punto es el que sigue al cursor
      finishDraft();
      return;
    }
    if (ev.key === 'Escape') {
      if (draft) cancelDraft();
      if (tool !== 'cursor') {
        tool = 'cursor';
        onToolDone();
      } else if (selectedId) select(null);
      return;
    }
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && selectedId) {
      api.remove(selectedId);
      ev.preventDefault();
      return;
    }
    if (mod && ev.key.toLowerCase() === 'c' && selectedId && !window.getSelection()?.toString()) {
      api.copy(selectedId);
      ev.preventDefault();
      return;
    }
    if (mod && ev.key.toLowerCase() === 'v' && clipboard) {
      api.paste();
      ev.preventDefault();
    }
  }

  // Captura: nos enteramos antes que el gráfico (para poder frenar su desplazamiento).
  container.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onModifier);

  const api = {
    setDrawings(list) {
      drawings = list;
      if (selectedId && !list.some((d) => d.id === selectedId)) select(null);
      requestUpdate();
    },
    setBars(list) {
      bars = list;
      map = createTimeMap(list);
      requestUpdate();
    },
    setTool(t) {
      tool = t;
      if (draft) cancelDraft();
      if (t !== 'cursor' && selectedId) select(null);
      snapMarker = null;
      container.style.cursor = t !== 'cursor' ? 'crosshair' : '';
      requestUpdate();
    },
    setMagnet: (on) => (magnet = on),
    setMarket(m) {
      market = m;
      requestUpdate();
    },
    setHidden(on) {
      hidden = on;
      if (on) select(null);
      requestUpdate();
    },
    select,
    remove(id) {
      drawings = drawings.filter((d) => d.id !== id);
      if (selectedId === id) select(null);
      commit();
      requestUpdate();
    },
    copy(id) {
      const d = drawings.find((x) => x.id === id);
      if (d) clipboard = structuredClone(d);
    },
    // Pega la copia corrida unas velas a la derecha, y la deja seleccionada.
    paste() {
      if (!clipboard || !bars.length) return;
      const d = { ...structuredClone(clipboard), id: newId() };
      d.points = shiftPoints(d.points, PASTE_SHIFT, 0);
      clipboard = structuredClone(d); // pegar otra vez corre la siguiente copia un poco más
      drawings = [...drawings, d];
      commit();
      select(d.id);
    },
    duplicate(id) {
      api.copy(id);
      api.paste();
    },
    hasClipboard: () => Boolean(clipboard),
    destroy() {
      container.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onModifier);
    },
  };
  return api;
}
