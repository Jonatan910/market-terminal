// Dibuja el perfil de volumen de lo que se ve en pantalla ("visible range") sobre el lado
// izquierdo del gráfico: compras en verde, ventas en rojo, el POC en amarillo y el área de
// valor más marcada. Se recalcula al desplazar, hacer zoom o cuando llega una vela nueva.
import { computeProfile } from './volumeProfile';

const MAX_WIDTH = 0.25; // la fila con más volumen ocupa el 25 % del ancho del gráfico
const COLORS = {
  buy: 'rgba(38, 166, 154, 0.5)',
  sell: 'rgba(239, 83, 80, 0.5)',
  buyOut: 'rgba(38, 166, 154, 0.22)', // fuera del área de valor
  sellOut: 'rgba(239, 83, 80, 0.22)',
  poc: '#f5c518',
};

export function createVolumeProfilePrimitive(chart, series) {
  let bars = [];
  let visible = false;
  let profile = null;
  let formatPrice = (n) => String(n);
  let requestUpdate = () => {};
  let timer = null;
  let options = { rows: 60, valueArea: 0.7 };

  // Recalcula con las velas que se ven (con un pequeño retraso para no hacerlo en cada píxel de arrastre).
  function schedule(delay = 80) {
    if (!visible || timer) return;
    timer = setTimeout(() => {
      timer = null;
      const r = chart.timeScale().getVisibleLogicalRange();
      if (!r || !bars.length) {
        profile = null;
      } else {
        const from = Math.max(0, Math.floor(r.from));
        const to = Math.min(bars.length - 1, Math.ceil(r.to));
        profile = to >= from ? computeProfile(bars.slice(from, to + 1), options) : null;
      }
      requestUpdate();
    }, delay);
  }
  chart.timeScale().subscribeVisibleLogicalRangeChange(() => schedule());

  function draw(ctx, { width }) {
    if (!visible || !profile) return;
    const rows = profile.rows;
    let max = 0;
    for (const r of rows) max = Math.max(max, r.buy + r.sell);
    if (!max) return;
    const scale = (width * MAX_WIDTH) / max;

    rows.forEach((row, i) => {
      const yTop = series.priceToCoordinate(row.high);
      const yBot = series.priceToCoordinate(row.low);
      if (yTop == null || yBot == null) return;
      const y = Math.min(yTop, yBot);
      const h = Math.max(1, Math.abs(yBot - yTop) - 1); // 1 px de separación entre filas
      const inVa = i >= profile.vaLow && i <= profile.vaHigh;
      const wBuy = row.buy * scale;
      const wSell = row.sell * scale;
      if (i === profile.poc) {
        ctx.fillStyle = COLORS.poc;
        ctx.globalAlpha = 0.75;
        ctx.fillRect(0, y, wBuy + wSell, h);
        ctx.globalAlpha = 1;
        return;
      }
      ctx.fillStyle = inVa ? COLORS.buy : COLORS.buyOut;
      ctx.fillRect(0, y, wBuy, h);
      ctx.fillStyle = inVa ? COLORS.sell : COLORS.sellOut;
      ctx.fillRect(wBuy, y, wSell, h);
    });

    // Línea del POC a lo ancho del gráfico, con su precio.
    const poc = rows[profile.poc];
    const yPoc = series.priceToCoordinate((poc.low + poc.high) / 2);
    if (yPoc == null) return;
    ctx.save();
    ctx.strokeStyle = COLORS.poc;
    ctx.globalAlpha = 0.7;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(yPoc) + 0.5);
    ctx.lineTo(width, Math.round(yPoc) + 0.5);
    ctx.stroke();
    ctx.restore();
  }

  // La etiqueta del POC va en otra capa, por encima de las velas, para que siempre se lea.
  function drawLabel(ctx, { width }) {
    if (!visible || !profile) return;
    let max = 0;
    for (const r of profile.rows) max = Math.max(max, r.buy + r.sell);
    if (!max) return;
    const scale = (width * MAX_WIDTH) / max;
    const poc = profile.rows[profile.poc];
    const yPoc = series.priceToCoordinate((poc.low + poc.high) / 2);
    if (yPoc == null) return;
    const text = `POC ${formatPrice((poc.low + poc.high) / 2)}`;
    ctx.font = '10px system-ui, sans-serif';
    const tw = ctx.measureText(text).width + 8;
    const x = (poc.buy + poc.sell) * scale + 4;
    ctx.fillStyle = 'rgba(245, 197, 24, 0.9)';
    ctx.fillRect(x, yPoc - 8, tw, 16);
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 4, yPoc);
  }

  series.attachPrimitive({
    attached: (p) => (requestUpdate = p.requestUpdate),
    detached: () => (requestUpdate = () => {}),
    updateAllViews: () => {},
    paneViews: () => [
      {
        zOrder: () => 'bottom', // barras: detrás de las velas
        renderer: () => ({
          draw: (target) => target.useMediaCoordinateSpace(({ context, mediaSize }) => draw(context, mediaSize)),
        }),
      },
      {
        zOrder: () => 'top', // etiqueta del POC: encima
        renderer: () => ({
          draw: (target) => target.useMediaCoordinateSpace(({ context, mediaSize }) => drawLabel(context, mediaSize)),
        }),
      },
    ],
  });

  return {
    setVisible(on) {
      visible = on;
      if (on) schedule(0);
      else {
        profile = null;
        requestUpdate();
      }
    },
    // Velas nuevas: si es una carga completa se recalcula enseguida; en vivo, como mucho una vez por segundo.
    setBars(list, { live = false } = {}) {
      bars = list;
      schedule(live ? 1000 : 0);
    },
    setOptions(o) {
      if (o.rows === options.rows && o.valueArea === options.valueArea) return;
      options = o;
      schedule(0);
    },
    setFormatter(fn) {
      formatPrice = fn;
    },
  };
}
