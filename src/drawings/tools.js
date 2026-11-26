// Herramientas de dibujo. Cada una define:
//   points: cuántos clics necesita (1 o 2)
//   draw(ctx, d, P, env): dibuja en el canvas. P = puntos en píxeles [{x, y}]
//   hit(d, P, x, y, env): ¿el punto (x, y) está sobre el dibujo?
// `d` es el dibujo guardado: { id, type, points: [{ time, price }], style, text }
import { formatPrice } from '../format';

const TOL = 6; // tolerancia en píxeles para "tocar" una línea

// ---------- geometría ----------
function distToSegment(px, py, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2)) : 0;
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

// Extiende la recta a→b hasta los bordes del gráfico (hacia adelante, o hacia ambos lados).
function extend(a, b, env, both) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (!dx && !dy) return [a, b];
  const big = (env.width + env.height) * 4;
  const len = Math.hypot(dx, dy);
  const far = { x: a.x + (dx / len) * big, y: a.y + (dy / len) * big };
  const start = both ? { x: a.x - (dx / len) * big, y: a.y - (dy / len) * big } : a;
  return [start, far];
}

function line(ctx, a, b) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

export function applyStroke(ctx, style, selected) {
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width + (selected ? 0.5 : 0);
  ctx.setLineDash(style.lineStyle === 'dashed' ? [6, 4] : style.lineStyle === 'dotted' ? [1.5, 3] : []);
  ctx.lineCap = 'round';
}

// Etiqueta con fondo de color (como el precio en el eje).
function label(ctx, text, x, y, bg, align = 'left') {
  ctx.save();
  ctx.setLineDash([]);
  ctx.font = '11px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 8;
  const left = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  ctx.fillStyle = bg;
  ctx.fillRect(left, y - 8, w, 16);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + 4, y);
  ctx.restore();
}

export function withAlpha(hex, alpha) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

// ---------- herramientas ----------
export const TOOLS = {
  trend: {
    name: 'Línea de tendencia',
    points: 2,
    draw(ctx, d, [a, b]) {
      line(ctx, a, b);
    },
    hit: (d, [a, b], x, y) => distToSegment(x, y, a, b) < TOL,
  },

  ray: {
    name: 'Rayo',
    points: 2,
    draw(ctx, d, [a, b], env) {
      const [s, e] = extend(a, b, env, false);
      line(ctx, s, e);
    },
    hit: (d, [a, b], x, y, env) => {
      const [s, e] = extend(a, b, env, false);
      return distToSegment(x, y, s, e) < TOL;
    },
  },

  extended: {
    name: 'Línea extendida',
    points: 2,
    draw(ctx, d, [a, b], env) {
      const [s, e] = extend(a, b, env, true);
      line(ctx, s, e);
    },
    hit: (d, [a, b], x, y, env) => {
      const [s, e] = extend(a, b, env, true);
      return distToSegment(x, y, s, e) < TOL;
    },
  },

  hline: {
    name: 'Línea horizontal',
    points: 1,
    draw(ctx, d, [a], env) {
      line(ctx, { x: 0, y: a.y }, { x: env.width, y: a.y });
      label(ctx, formatPrice(d.points[0].price), env.width - 2, a.y, d.style.color, 'right');
    },
    hit: (d, [a], x, y) => Math.abs(y - a.y) < TOL,
  },

  hray: {
    name: 'Rayo horizontal',
    points: 1,
    draw(ctx, d, [a], env) {
      line(ctx, a, { x: env.width, y: a.y });
      label(ctx, formatPrice(d.points[0].price), env.width - 2, a.y, d.style.color, 'right');
    },
    hit: (d, [a], x, y) => x >= a.x - TOL && Math.abs(y - a.y) < TOL,
  },

  vline: {
    name: 'Línea vertical',
    points: 1,
    draw(ctx, d, [a], env) {
      line(ctx, { x: a.x, y: 0 }, { x: a.x, y: env.height });
    },
    hit: (d, [a], x) => Math.abs(x - a.x) < TOL,
  },

  rect: {
    name: 'Rectángulo',
    points: 2,
    draw(ctx, d, [a, b]) {
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(b.x - a.x);
      const h = Math.abs(b.y - a.y);
      ctx.fillStyle = withAlpha(d.style.color, 0.15);
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    },
    hit: (d, [a, b], x, y) =>
      x >= Math.min(a.x, b.x) - TOL && x <= Math.max(a.x, b.x) + TOL && y >= Math.min(a.y, b.y) - TOL && y <= Math.max(a.y, b.y) + TOL,
  },

  fib: {
    name: 'Retroceso de Fibonacci',
    points: 2,
    draw(ctx, d, [a, b], env) {
      const [p0, p1] = [d.points[0].price, d.points[1].price];
      const left = Math.min(a.x, b.x);
      const right = Math.max(a.x, b.x);
      // Nivel 0 en el segundo punto (fin del movimiento), 1 en el primero (inicio), como es habitual.
      const levels = FIB_LEVELS.map((lv) => {
        const price = p1 + (p0 - p1) * lv;
        return { lv, price, y: env.priceToY(price) };
      });
      // Bandas de fondo alternadas
      for (let i = 0; i < levels.length - 1; i++) {
        ctx.fillStyle = withAlpha(d.style.color, i % 2 ? 0.06 : 0.12);
        ctx.fillRect(left, levels[i].y, right - left, levels[i + 1].y - levels[i].y);
      }
      for (const L of levels) {
        line(ctx, { x: left, y: L.y }, { x: right, y: L.y });
        ctx.save();
        ctx.setLineDash([]);
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = d.style.color;
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${L.lv} (${formatPrice(L.price)})`, left + 4, L.y - 2);
        ctx.restore();
      }
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      line(ctx, a, b);
      ctx.restore();
    },
    hit: (d, [a, b], x, y, env) => {
      if (x < Math.min(a.x, b.x) - TOL || x > Math.max(a.x, b.x) + TOL) return false;
      const [p0, p1] = [d.points[0].price, d.points[1].price];
      return FIB_LEVELS.some((lv) => Math.abs(env.priceToY(p1 + (p0 - p1) * lv) - y) < TOL) || distToSegment(x, y, a, b) < TOL;
    },
  },

  range: {
    name: 'Medir precio',
    points: 2,
    draw(ctx, d, [a, b], env) {
      const [p0, p1] = [d.points[0].price, d.points[1].price];
      const up = p1 >= p0;
      const color = up ? '#26a69a' : '#ef5350';
      const x = Math.min(a.x, b.x);
      const w = Math.abs(b.x - a.x);
      ctx.fillStyle = withAlpha(color, 0.15);
      ctx.fillRect(x, Math.min(a.y, b.y), w, Math.abs(b.y - a.y));
      ctx.strokeStyle = color;
      const mid = x + w / 2;
      line(ctx, { x: mid, y: a.y }, { x: mid, y: b.y });
      // Flecha
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(mid - 5, b.y + (up ? 7 : -7));
      ctx.lineTo(mid, b.y);
      ctx.lineTo(mid + 5, b.y + (up ? 7 : -7));
      ctx.stroke();
      const diff = p1 - p0;
      const pct = (diff / p0) * 100;
      const bars = Math.round(Math.abs(env.timeToLogical(d.points[1].time) - env.timeToLogical(d.points[0].time)));
      const text = `${diff >= 0 ? '+' : ''}${formatPrice(diff)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%) · ${bars} velas`;
      label(ctx, text, mid, b.y + (up ? -14 : 14), color, 'center');
    },
    hit: (d, [a, b], x, y) =>
      x >= Math.min(a.x, b.x) - TOL && x <= Math.max(a.x, b.x) + TOL && y >= Math.min(a.y, b.y) - TOL && y <= Math.max(a.y, b.y) + TOL,
  },

  text: {
    name: 'Texto',
    points: 1,
    draw(ctx, d, [a]) {
      ctx.save();
      ctx.font = `${12 + d.style.width * 2}px system-ui, sans-serif`;
      ctx.fillStyle = d.style.color;
      ctx.textBaseline = 'middle';
      ctx.fillText(d.text || 'Texto', a.x, a.y);
      ctx.restore();
    },
    hit: (d, [a], x, y, env) => {
      const w = env.measureText(d.text || 'Texto', 12 + d.style.width * 2);
      return x >= a.x - TOL && x <= a.x + w + TOL && Math.abs(y - a.y) < 10 + d.style.width;
    },
  },
};

export const DEFAULT_STYLE = { color: '#4c8dff', width: 2, lineStyle: 'solid' };
export const DRAW_COLORS = ['#4c8dff', '#26a69a', '#ef5350', '#f5c518', '#ff9800', '#e040fb', '#00bcd4', '#ffffff'];
