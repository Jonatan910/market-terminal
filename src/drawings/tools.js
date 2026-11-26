// Herramientas de dibujo. Cada una define:
//   name:   nombre que se ve en la barra
//   points: cuántos clics necesita (1, 2, 3...), 'multi' (camino: doble clic o Enter para terminar)
//           o 'free' (pincel: se dibuja arrastrando)
//   create(pt, env): opcional, arma el dibujo completo con un solo clic (posición larga/corta)
//   draw(ctx, d, P, env): dibuja en el canvas. P = puntos en píxeles [{x, y}] (durante la creación
//           puede tener menos puntos que el total)
//   hit(d, P, x, y, env): ¿el punto (x, y) está sobre el dibujo?
//   handles(d) / moveHandle(d, i, pt): opcionales, puntas para arrastrar si no son los puntos tal cual
//   options: opciones extra en la barra de edición ('extend' = extender a izquierda/derecha)
// `d` es el dibujo guardado: { id, type, points: [{ time, price }], style, text }

const TOL = 6; // tolerancia en píxeles para "tocar" una línea

// ---------- geometría ----------
function distToSegment(px, py, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2)) : 0;
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

function distToPolyline(px, py, P) {
  let best = Infinity;
  for (let i = 1; i < P.length; i++) best = Math.min(best, distToSegment(px, py, P[i - 1], P[i]));
  return P.length === 1 ? Math.hypot(px - P[0].x, py - P[0].y) : best;
}

// Extiende la recta a→b hasta los bordes del gráfico, hacia la izquierda y/o la derecha.
function extendLine(a, b, env, left, right) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if ((!left && !right) || (!dx && !dy)) return [a, b];
  const big = (env.width + env.height) * 4;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  // "derecha" es la dirección en la que crece x
  const sign = ux >= 0 ? 1 : -1;
  let s = a;
  let e = b;
  if (right) (sign > 0 ? (e = { x: a.x + ux * big, y: a.y + uy * big }) : (s = { x: b.x - ux * big, y: b.y - uy * big }));
  if (left) (sign > 0 ? (s = { x: b.x - ux * big, y: b.y - uy * big }) : (e = { x: a.x + ux * big, y: a.y + uy * big }));
  return [s, e];
}

function line(ctx, a, b) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function polyline(ctx, P) {
  if (P.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(P[0].x, P[0].y);
  for (let i = 1; i < P.length; i++) ctx.lineTo(P[i].x, P[i].y);
  ctx.stroke();
}

function arrowHead(ctx, a, b, size = 10) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.save();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - size * Math.cos(ang - 0.45), b.y - size * Math.sin(ang - 0.45));
  ctx.lineTo(b.x - size * Math.cos(ang + 0.45), b.y - size * Math.sin(ang + 0.45));
  ctx.closePath();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fill();
  ctx.restore();
}

export function applyStroke(ctx, style, selected) {
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width + (selected ? 0.5 : 0);
  ctx.setLineDash(style.lineStyle === 'dashed' ? [6, 4] : style.lineStyle === 'dotted' ? [1.5, 3] : []);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

// Etiqueta con fondo de color (como el precio en el eje).
// `maxX`: si se pasa, la etiqueta se corre para no salirse del gráfico.
function label(ctx, text, x, y, bg, align = 'left', maxX = Infinity) {
  ctx.save();
  ctx.setLineDash([]);
  ctx.font = '11px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 8;
  let left = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  left = Math.max(0, Math.min(left, maxX - w));
  ctx.fillStyle = bg;
  ctx.fillRect(left, y - 8, w, 16);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + 4, y);
  ctx.restore();
}

// Texto suelto, centrado en (x, y).
function tag(ctx, text, x, y, color, size = 12) {
  ctx.save();
  ctx.setLineDash([]);
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function withAlpha(hex, alpha) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const inBox = (a, b, x, y) =>
  x >= Math.min(a.x, b.x) - TOL && x <= Math.max(a.x, b.x) + TOL && y >= Math.min(a.y, b.y) - TOL && y <= Math.max(a.y, b.y) + TOL;

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const UP = '#26a69a';
const DOWN = '#ef5350';

// Patrones de ondas/puntos: línea quebrada con una etiqueta en cada punto.
// La etiqueta va arriba si el punto es un máximo local y abajo si es un mínimo.
function waveLabels(ctx, P, labels, color) {
  P.forEach((p, i) => {
    if (!labels[i]) return;
    const neighbors = [P[i - 1], P[i + 1]].filter(Boolean);
    const isHigh = neighbors.every((n) => p.y <= n.y); // en pantalla, "arriba" es y más chico
    tag(ctx, labels[i], p.x, p.y + (isHigh ? -12 : 12), color);
  });
}

function wavePattern(name, labels) {
  return {
    name,
    points: labels.length,
    draw(ctx, d, P) {
      polyline(ctx, P);
      waveLabels(ctx, P, labels, d.style.color);
    },
    hit: (d, P, x, y) => distToPolyline(x, y, P) < TOL,
  };
}

// Posición larga (compra) o corta (venta): entrada, objetivo (take profit) y stop loss.
// points: [entrada, {fin, precio objetivo}, {fin, precio stop}]
function position(isLong) {
  return {
    name: isLong ? 'Posición larga' : 'Posición corta',
    points: 1,
    create(pt, env) {
      const y = env.priceToY(pt.price);
      const target = env.yToPrice(y + (isLong ? -60 : 60));
      const stop = env.yToPrice(y + (isLong ? 30 : -30));
      const end = env.timeAt(env.logicalOf(pt.time) + 20);
      return [pt, { time: end, price: target }, { time: end, price: stop }];
    },
    handles: (d) => [d.points[0], d.points[1], { time: d.points[1].time, price: d.points[2].price }],
    moveHandle(d, i, pt) {
      const [e, t, s] = d.points;
      if (i === 0) return [pt, t, s];
      if (i === 1) return [e, pt, { time: pt.time, price: s.price }];
      return [e, { time: pt.time, price: t.price }, pt];
    },
    draw(ctx, d, P, env) {
      if (P.length < 3) return;
      const [e, t, s] = d.points;
      const x0 = Math.min(P[0].x, P[1].x);
      const w = Math.abs(P[1].x - P[0].x);
      const yE = P[0].y;
      const yT = P[1].y;
      const yS = env.priceToY(s.price);
      ctx.save();
      ctx.setLineDash([]);
      ctx.fillStyle = withAlpha(UP, 0.18);
      ctx.fillRect(x0, Math.min(yE, yT), w, Math.abs(yT - yE));
      ctx.fillStyle = withAlpha(DOWN, 0.18);
      ctx.fillRect(x0, Math.min(yE, yS), w, Math.abs(yS - yE));
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#9aa4b2';
      line(ctx, { x: x0, y: yE }, { x: x0 + w, y: yE });
      ctx.restore();
      const pct = (a, b) => `${b >= a ? '+' : ''}${(((b - a) / a) * 100).toFixed(2)}%`;
      const rr = Math.abs(t.price - e.price) / (Math.abs(e.price - s.price) || 1);
      const mid = x0 + w / 2;
      label(ctx, `Objetivo ${env.formatPrice(t.price)} (${pct(e.price, t.price)})`, mid, yT + (yT < yE ? -10 : 10), UP, 'center', env.width);
      label(ctx, `Stop ${env.formatPrice(s.price)} (${pct(e.price, s.price)})`, mid, yS + (yS > yE ? 10 : -10), DOWN, 'center', env.width);
      // La entrada va a la derecha de la caja, para no quedar tapada por la punta de arrastre.
      label(ctx, `Entrada ${env.formatPrice(e.price)} · R/R ${rr.toFixed(2)}`, x0 + w + 6, yE, '#5d6678', 'left', env.width);
    },
    hit: (d, P, x, y, env) => {
      if (P.length < 3) return false;
      const yS = env.priceToY(d.points[2].price);
      return inBox(P[0], { x: P[1].x, y: P[1].y }, x, y) || inBox(P[0], { x: P[1].x, y: yS }, x, y);
    },
  };
}

// ---------- herramientas ----------
export const TOOLS = {
  // --- líneas ---
  trend: {
    name: 'Línea de tendencia',
    points: 2,
    options: ['extend'],
    draw(ctx, d, [a, b], env) {
      if (!b) return;
      const [s, e] = extendLine(a, b, env, d.style.extendLeft, d.style.extendRight);
      line(ctx, s, e);
    },
    hit: (d, [a, b], x, y, env) => {
      const [s, e] = extendLine(a, b, env, d.style.extendLeft, d.style.extendRight);
      return distToSegment(x, y, s, e) < TOL;
    },
  },

  ray: {
    name: 'Rayo',
    points: 2,
    draw(ctx, d, [a, b], env) {
      if (!b) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const big = (env.width + env.height) * 4;
      line(ctx, a, { x: a.x + (dx / len) * big, y: a.y + (dy / len) * big });
    },
    hit: (d, [a, b], x, y, env) => {
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const big = (env.width + env.height) * 4;
      return distToSegment(x, y, a, { x: a.x + ((b.x - a.x) / len) * big, y: a.y + ((b.y - a.y) / len) * big }) < TOL;
    },
  },

  extended: {
    name: 'Línea extendida',
    points: 2,
    draw(ctx, d, [a, b], env) {
      if (!b) return;
      const [s, e] = extendLine(a, b, env, true, true);
      line(ctx, s, e);
    },
    hit: (d, [a, b], x, y, env) => {
      const [s, e] = extendLine(a, b, env, true, true);
      return distToSegment(x, y, s, e) < TOL;
    },
  },

  arrow: {
    name: 'Flecha',
    points: 2,
    draw(ctx, d, [a, b]) {
      if (!b) return;
      line(ctx, a, b);
      arrowHead(ctx, a, b, 8 + d.style.width * 2);
    },
    hit: (d, [a, b], x, y) => distToSegment(x, y, a, b) < TOL,
  },

  hline: {
    name: 'Línea horizontal',
    points: 1,
    draw(ctx, d, [a], env) {
      line(ctx, { x: 0, y: a.y }, { x: env.width, y: a.y });
      label(ctx, env.formatPrice(d.points[0].price), env.width - 2, a.y, d.style.color, 'right');
    },
    hit: (d, [a], x, y) => Math.abs(y - a.y) < TOL,
  },

  hray: {
    name: 'Rayo horizontal',
    points: 1,
    draw(ctx, d, [a], env) {
      line(ctx, a, { x: env.width, y: a.y });
      label(ctx, env.formatPrice(d.points[0].price), env.width - 2, a.y, d.style.color, 'right');
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

  crossline: {
    name: 'Cruz',
    points: 1,
    draw(ctx, d, [a], env) {
      line(ctx, { x: 0, y: a.y }, { x: env.width, y: a.y });
      line(ctx, { x: a.x, y: 0 }, { x: a.x, y: env.height });
      label(ctx, env.formatPrice(d.points[0].price), env.width - 2, a.y, d.style.color, 'right');
    },
    hit: (d, [a], x, y) => Math.abs(y - a.y) < TOL || Math.abs(x - a.x) < TOL,
  },

  // --- canales y Fibonacci ---
  channel: {
    name: 'Canal paralelo',
    points: 3,
    options: ['extend'],
    draw(ctx, d, P, env) {
      const [a, b, c] = P;
      if (!b) return;
      const L = (p, q) => extendLine(p, q, env, d.style.extendLeft, d.style.extendRight);
      const [s, e] = L(a, b);
      if (!c) return line(ctx, s, e);
      const off = channelOffset(a, b, c);
      const s2 = { x: s.x, y: s.y + off };
      const e2 = { x: e.x, y: e.y + off };
      ctx.fillStyle = withAlpha(d.style.color, 0.12);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(e.x, e.y);
      ctx.lineTo(e2.x, e2.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.closePath();
      ctx.fill();
      line(ctx, s, e);
      line(ctx, s2, e2);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      line(ctx, { x: s.x, y: s.y + off / 2 }, { x: e.x, y: e.y + off / 2 });
      ctx.restore();
    },
    hit: (d, P, x, y, env) => {
      const [a, b, c] = P;
      const [s, e] = extendLine(a, b, env, d.style.extendLeft, d.style.extendRight);
      const off = channelOffset(a, b, c);
      if (distToSegment(x, y, s, e) < TOL || distToSegment(x, y, { x: s.x, y: s.y + off }, { x: e.x, y: e.y + off }) < TOL) return true;
      // adentro del canal
      const t = (x - s.x) / ((e.x - s.x) || 1);
      if (t < 0 || t > 1) return false;
      const yLine = s.y + t * (e.y - s.y);
      return (y - yLine) * (y - yLine - off) <= 0;
    },
  },

  fib: {
    name: 'Retroceso de Fibonacci',
    points: 2,
    draw(ctx, d, [a, b], env) {
      if (!b) return;
      const [p0, p1] = [d.points[0].price, d.points[1].price];
      const left = Math.min(a.x, b.x);
      const right = d.style.extendRight ? env.width : Math.max(a.x, b.x);
      // Nivel 0 en el segundo punto (fin del movimiento), 1 en el primero (inicio), como es habitual.
      const levels = FIB_LEVELS.map((lv) => {
        const price = p1 + (p0 - p1) * lv;
        return { lv, price, y: env.priceToY(price) };
      });
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
        ctx.fillText(`${L.lv} (${env.formatPrice(L.price)})`, left + 4, L.y - 2);
        ctx.restore();
      }
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      line(ctx, a, b);
      ctx.restore();
    },
    hit: (d, [a, b], x, y, env) => {
      const right = d.style.extendRight ? env.width : Math.max(a.x, b.x);
      if (x < Math.min(a.x, b.x) - TOL || x > right + TOL) return false;
      const [p0, p1] = [d.points[0].price, d.points[1].price];
      return FIB_LEVELS.some((lv) => Math.abs(env.priceToY(p1 + (p0 - p1) * lv) - y) < TOL) || distToSegment(x, y, a, b) < TOL;
    },
  },

  // --- formas ---
  rect: {
    name: 'Rectángulo',
    points: 2,
    options: ['extend'],
    draw(ctx, d, [a, b], env) {
      if (!b) return;
      const [x1, x2] = rectX(a, b, d, env);
      const y = Math.min(a.y, b.y);
      const h = Math.abs(b.y - a.y);
      ctx.fillStyle = withAlpha(d.style.color, 0.15);
      ctx.fillRect(x1, y, x2 - x1, h);
      ctx.strokeRect(x1, y, x2 - x1, h);
    },
    hit: (d, [a, b], x, y, env) => {
      const [x1, x2] = rectX(a, b, d, env);
      return inBox({ x: x1, y: a.y }, { x: x2, y: b.y }, x, y);
    },
  },

  ellipse: {
    name: 'Elipse',
    points: 2,
    draw(ctx, d, [a, b]) {
      if (!b) return;
      ctx.beginPath();
      ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2 || 1, Math.abs(b.y - a.y) / 2 || 1, 0, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(d.style.color, 0.15);
      ctx.fill();
      ctx.stroke();
    },
    hit: (d, [a, b], x, y) => {
      const rx = Math.abs(b.x - a.x) / 2 + TOL;
      const ry = Math.abs(b.y - a.y) / 2 + TOL;
      const nx = (x - (a.x + b.x) / 2) / rx;
      const ny = (y - (a.y + b.y) / 2) / ry;
      return nx * nx + ny * ny <= 1;
    },
  },

  path: {
    name: 'Camino',
    points: 'multi',
    draw(ctx, d, P) {
      polyline(ctx, P);
      if (P.length >= 2) arrowHead(ctx, P[P.length - 2], P[P.length - 1], 8 + d.style.width * 2);
    },
    hit: (d, P, x, y) => distToPolyline(x, y, P) < TOL,
  },

  brush: {
    name: 'Pincel',
    points: 'free',
    handles: () => [], // se mueve entero, no tiene puntas
    draw(ctx, d, P) {
      if (P.length < 2) return;
      // Curva suave pasando por el medio de cada tramo.
      ctx.beginPath();
      ctx.moveTo(P[0].x, P[0].y);
      for (let i = 1; i < P.length - 1; i++) {
        ctx.quadraticCurveTo(P[i].x, P[i].y, (P[i].x + P[i + 1].x) / 2, (P[i].y + P[i + 1].y) / 2);
      }
      ctx.lineTo(P[P.length - 1].x, P[P.length - 1].y);
      ctx.stroke();
    },
    hit: (d, P, x, y) => distToPolyline(x, y, P) < TOL,
  },

  // --- patrones ---
  xabcd: {
    name: 'Patrón XABCD',
    points: 5,
    draw(ctx, d, P) {
      const pr = d.points.map((p) => p.price);
      // Triángulos X-A-B y B-C-D rellenos
      ctx.fillStyle = withAlpha(d.style.color, 0.15);
      for (const [i, j, k] of [[0, 1, 2], [2, 3, 4]]) {
        if (!P[k]) continue;
        ctx.beginPath();
        ctx.moveTo(P[i].x, P[i].y);
        ctx.lineTo(P[j].x, P[j].y);
        ctx.lineTo(P[k].x, P[k].y);
        ctx.closePath();
        ctx.fill();
      }
      polyline(ctx, P);
      // Diagonales punteadas con las proporciones de Fibonacci entre tramos
      const ratio = (a, b) => (Math.abs(b) ? Math.abs(a / b).toFixed(3) : '—');
      const diag = [
        [0, 2, () => ratio(pr[2] - pr[1], pr[1] - pr[0])], // AB / XA
        [1, 3, () => ratio(pr[3] - pr[2], pr[2] - pr[1])], // BC / AB
        [2, 4, () => ratio(pr[4] - pr[3], pr[3] - pr[2])], // CD / BC
        [0, 4, () => ratio(pr[4] - pr[1], pr[1] - pr[0])], // AD / XA
      ];
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      for (const [i, j, text] of diag) {
        if (!P[j]) continue;
        line(ctx, P[i], P[j]);
        label(ctx, text(), (P[i].x + P[j].x) / 2, (P[i].y + P[j].y) / 2, d.style.color, 'center');
      }
      ctx.restore();
      waveLabels(ctx, P, ['X', 'A', 'B', 'C', 'D'], d.style.color);
    },
    hit: (d, P, x, y) => distToPolyline(x, y, P) < TOL,
  },

  elliott: wavePattern('Onda de impulso de Elliott (1-5)', ['(0)', '(1)', '(2)', '(3)', '(4)', '(5)']),
  elliottabc: wavePattern('Onda correctiva de Elliott (ABC)', ['(0)', '(A)', '(B)', '(C)']),
  triangle: wavePattern('Triángulo ABCDE', ['', 'A', 'B', 'C', 'D', 'E']),

  // --- medición y posiciones ---
  long: position(true),
  short: position(false),

  range: {
    name: 'Medir precio',
    points: 2,
    draw(ctx, d, [a, b], env) {
      if (!b) return;
      const [p0, p1] = [d.points[0].price, d.points[1].price];
      const up = p1 >= p0;
      const color = up ? UP : DOWN;
      const x = Math.min(a.x, b.x);
      const w = Math.abs(b.x - a.x);
      ctx.fillStyle = withAlpha(color, 0.15);
      ctx.fillRect(x, Math.min(a.y, b.y), w, Math.abs(b.y - a.y));
      ctx.strokeStyle = color;
      const mid = x + w / 2;
      line(ctx, { x: mid, y: a.y }, { x: mid, y: b.y });
      arrowHead(ctx, { x: mid, y: a.y }, { x: mid, y: b.y }, 8);
      const diff = p1 - p0;
      const pct = (diff / p0) * 100;
      const bars = Math.round(Math.abs(env.logicalOf(d.points[1].time) - env.logicalOf(d.points[0].time)));
      const text = `${diff >= 0 ? '+' : ''}${env.formatPrice(diff)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%) · ${bars} velas`;
      label(ctx, text, mid, b.y + (up ? -14 : 14), color, 'center', env.width);
    },
    hit: (d, [a, b], x, y) => inBox(a, b, x, y),
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

// Distancia vertical (en píxeles) entre la línea a→b y la paralela que pasa por c.
function channelOffset(a, b, c) {
  if (!c) return 0;
  const dx = b.x - a.x;
  const yOnLine = dx ? a.y + ((c.x - a.x) * (b.y - a.y)) / dx : a.y;
  return c.y - yOnLine;
}

// Bordes izquierdo y derecho de un rectángulo, con las opciones de extender.
function rectX(a, b, d, env) {
  return [d.style.extendLeft ? 0 : Math.min(a.x, b.x), d.style.extendRight ? env.width : Math.max(a.x, b.x)];
}

// Grupos de la barra de herramientas (cada grupo es un botón con menú desplegable).
export const TOOL_GROUPS = [
  { id: 'lines', label: 'Líneas', tools: ['trend', 'ray', 'extended', 'arrow', 'hline', 'hray', 'vline', 'crossline'] },
  { id: 'fib', label: 'Canales y Fibonacci', tools: ['channel', 'fib'] },
  { id: 'shapes', label: 'Formas', tools: ['rect', 'ellipse', 'path', 'brush'] },
  { id: 'patterns', label: 'Patrones', tools: ['xabcd', 'elliott', 'elliottabc', 'triangle'] },
  { id: 'measure', label: 'Posiciones y medición', tools: ['long', 'short', 'range'] },
  { id: 'text', label: 'Texto', tools: ['text'] },
];

// Favoritas por defecto (las de la barra de favoritos al empezar).
export const DEFAULT_FAVORITES = [
  'hray', 'brush', 'crossline', 'ray', 'vline', 'trend', 'rect', 'hline', 'short', 'long',
  'range', 'path', 'arrow', 'fib', 'ellipse', 'elliott', 'triangle', 'xabcd', 'elliottabc', 'channel',
];

export const DEFAULT_STYLE = { color: '#4c8dff', width: 2, lineStyle: 'solid' };
export const DRAW_COLORS = ['#4c8dff', '#26a69a', '#ef5350', '#f5c518', '#ff9800', '#e040fb', '#00bcd4', '#ffffff'];
