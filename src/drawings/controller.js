// Controlador de dibujos: escucha el mouse/dedo sobre el gráfico, crea, selecciona,
// mueve y borra dibujos, y los pinta con una "primitiva" de lightweight-charts
// (así se desplazan y hacen zoom junto con el gráfico).
import { TOOLS, DEFAULT_STYLE, applyStroke } from './tools';
import { createTimeMap } from './timeMap';

const HANDLE_R = 5; // radio de los puntitos para arrastrar las puntas

let idSeq = 0;
const newId = () => `d${Date.now().toString(36)}${(idSeq++).toString(36)}`;

export function createDrawingController({ chart, series, container, onChange, onSelect, onToolDone }) {
  let drawings = [];
  let bars = [];
  let map = createTimeMap([]);
  let tool = 'cursor';
  let magnet = false;
  let hidden = false;
  let selectedId = null;
  let draft = null; // dibujo que se está creando
  let drag = null; // arrastre en curso
  let down = null; // dónde se apretó (para distinguir clic de arrastre)
  let requestUpdate = () => {};

  // ---------- conversión fecha/precio <-> píxeles ----------
  const ts = () => chart.timeScale();
  const priceToY = (p) => series.priceToCoordinate(p);
  const timeToLogical = (t) => map.toLogical(t);

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

  function unproject(x, y) {
    let logical = ts().coordinateToLogical(x);
    let price = series.coordinateToPrice(y);
    if (logical == null || price == null) return null;
    if (magnet && bars.length) {
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

  // ---------- pintar ----------
  const env = () => {
    const size = chart.paneSize(0);
    return {
      width: ts().width(),
      height: size.height,
      priceToY,
      timeToLogical,
      measureText: (text, px) => {
        measureCtx.font = `${px}px system-ui, sans-serif`;
        return measureCtx.measureText(text).width;
      },
    };
  };
  const measureCtx = document.createElement('canvas').getContext('2d');

  function render(ctx) {
    if (hidden) return;
    const e = env();
    const list = draft ? [...drawings, draft] : drawings;
    for (const d of list) {
      const P = d.points.map(project);
      if (P.some((p) => !p)) continue;
      const selected = d.id === selectedId || d === draft;
      ctx.save();
      applyStroke(ctx, d.style, selected);
      TOOLS[d.type].draw(ctx, d, P, e);
      ctx.restore();
      if (selected) {
        for (const p of P) {
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
  }

  const primitive = {
    attached: (p) => (requestUpdate = p.requestUpdate),
    detached: () => (requestUpdate = () => {}),
    updateAllViews: () => {},
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
      const P = sel.points.map(project);
      const i = P.findIndex((p) => p && Math.hypot(p.x - x, p.y - y) <= HANDLE_R + 3);
      if (i >= 0) return { drawing: sel, handle: i };
    }
    for (let k = drawings.length - 1; k >= 0; k--) {
      const d = drawings[k];
      const P = d.points.map(project);
      if (P.some((p) => !p)) continue;
      if (TOOLS[d.type].hit(d, P, x, y, e)) return { drawing: d, handle: null };
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

  function commit() {
    onChange(drawings);
  }

  function finishDraft() {
    const d = draft;
    draft = null;
    drawings = [...drawings, d];
    lockChart(false);
    commit();
    select(d.id);
    tool = 'cursor';
    onToolDone();
  }

  function onPointerDown(ev) {
    if (ev.button > 0) return;
    const pos = local(ev);
    if (!insidePane(pos)) return;
    down = { ...pos, moved: false };

    if (tool !== 'cursor') {
      const pt = unproject(pos.x, pos.y);
      if (!pt) return;
      lockChart(true);
      ev.preventDefault();
      if (!draft) {
        const def = TOOLS[tool];
        draft = {
          id: newId(),
          type: tool,
          points: def.points === 1 ? [pt] : [pt, { ...pt }],
          style: { ...DEFAULT_STYLE, ...(tool === 'text' && { width: 2 }) },
          ...(tool === 'text' && { text: 'Texto' }),
        };
        if (def.points === 1) finishDraft();
      } else {
        draft.points[draft.points.length - 1] = pt; // segundo clic
        finishDraft();
      }
      requestUpdate();
      return;
    }

    const hit = hitTest(pos.x, pos.y);
    if (!hit) {
      if (selectedId) select(null);
      return;
    }
    select(hit.drawing.id);
    lockChart(true);
    drag = {
      id: hit.drawing.id,
      handle: hit.handle,
      start: unproject(pos.x, pos.y),
      startLogical: ts().coordinateToLogical(pos.x),
      original: hit.drawing.points.map((p) => ({ ...p })),
    };
  }

  function onPointerMove(ev) {
    const pos = local(ev);
    if (down && Math.hypot(pos.x - down.x, pos.y - down.y) > 4) down.moved = true;

    if (draft) {
      const pt = unproject(pos.x, pos.y);
      if (pt) {
        draft.points[draft.points.length - 1] = pt;
        requestUpdate();
      }
      return;
    }

    if (drag) {
      const d = drawings.find((x) => x.id === drag.id);
      if (!d) return;
      let points;
      if (drag.handle != null) {
        const pt = unproject(pos.x, pos.y);
        if (!pt) return;
        points = drag.original.map((p, i) => (i === drag.handle ? pt : p));
      } else {
        // Mover todo el dibujo: mismo desplazamiento en velas y en precio para cada punto.
        const logical = ts().coordinateToLogical(pos.x);
        const price = series.coordinateToPrice(pos.y);
        if (logical == null || price == null) return;
        const dL = logical - drag.startLogical;
        const dP = price - drag.start.price;
        points = drag.original.map((p) => ({ time: map.toTime(map.toLogical(p.time) + dL), price: p.price + dP }));
      }
      drawings = drawings.map((x) => (x.id === d.id ? { ...x, points } : x));
      requestUpdate();
      return;
    }

    // Cursor: manito sobre los dibujos.
    if (tool === 'cursor' && insidePane(pos)) {
      const hit = hitTest(pos.x, pos.y);
      container.style.cursor = hit ? (hit.handle != null ? 'grab' : 'pointer') : '';
    } else {
      container.style.cursor = tool !== 'cursor' ? 'crosshair' : '';
    }
  }

  function onPointerUp() {
    // Dibujo hecho arrastrando (apretar, mover y soltar) en vez de dos clics.
    if (draft && down?.moved) finishDraft();
    if (drag) {
      drag = null;
      lockChart(false);
      commit();
    }
    down = null;
  }

  function onKeyDown(ev) {
    if (ev.target.closest?.('input, textarea, select')) return; // escribiendo en un campo
    if (ev.key === 'Escape') {
      if (draft) {
        draft = null;
        lockChart(false);
        requestUpdate();
      }
      if (tool !== 'cursor') {
        tool = 'cursor';
        onToolDone();
      } else if (selectedId) select(null);
    }
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && selectedId) {
      api.remove(selectedId);
      ev.preventDefault();
    }
  }

  // Captura: nos enteramos antes que el gráfico (para poder frenar su desplazamiento).
  container.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKeyDown);

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
      draft = null;
      lockChart(false);
      if (t !== 'cursor' && selectedId) select(null);
      container.style.cursor = t !== 'cursor' ? 'crosshair' : '';
      requestUpdate();
    },
    setMagnet: (on) => (magnet = on),
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
    destroy() {
      container.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
    },
  };
  return api;
}
