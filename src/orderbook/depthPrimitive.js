// Dibuja el libro de órdenes sobre el lado derecho del gráfico: a cada altura (precio),
// una barra verde (compras) o roja (ventas), más larga cuanto más órdenes hay esperando.
// Es una "primitiva" de lightweight-charts: se mueve con el zoom y el desplazamiento del precio.

const ROW = 3; // alto de cada franja en píxeles (se suman los precios que caen en la misma franja)
const MAX_WIDTH = 0.22; // la barra más larga ocupa el 22 % del ancho del gráfico
const BID = 'rgba(38, 166, 154, 0.55)';
const ASK = 'rgba(239, 83, 80, 0.55)';

const compact = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 });

export function createDepthPrimitive(series) {
  let book = null;
  let requestUpdate = () => {};
  let pending = false;
  let disposed = false;

  // Junta las cantidades por franja de píxeles, solo para los precios visibles.
  function bucketize(side, height) {
    const rows = new Map();
    for (const [price, qty] of side) {
      const y = series.priceToCoordinate(price);
      if (y == null || y < 0 || y > height) continue;
      const r = Math.floor(y / ROW);
      rows.set(r, (rows.get(r) || 0) + qty);
    }
    return rows;
  }

  function draw(ctx, { width, height }) {
    if (!book?.ready) return;
    const bids = bucketize(book.bids, height);
    const asks = bucketize(book.asks, height);
    // Escala: según las franjas "normales" (percentil 95), no la más grande. Si no, una sola
    // pared gigante achica todo lo demás. Las que se pasan quedan al ancho máximo.
    const all = [...bids.values(), ...asks.values()].sort((a, b) => a - b);
    if (!all.length) return;
    const ref = all[Math.min(all.length - 1, Math.floor(all.length * 0.95))] || all.at(-1);
    const maxW = width * MAX_WIDTH;
    const scale = maxW / ref;
    const barW = (q) => Math.min(maxW, Math.max(1, q * scale));

    const paint = (rows, color) => {
      ctx.fillStyle = color;
      let top = null;
      for (const [r, q] of rows) {
        const w = barW(q);
        ctx.fillRect(width - w, r * ROW, w, ROW - 0.5);
        if (!top || q > top.q) top = { r, q };
      }
      return top;
    };
    const topBid = paint(bids, BID);
    const topAsk = paint(asks, ASK);

    // La "pared" más grande de cada lado, con su cantidad.
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const [top, color] of [[topBid, '#26a69a'], [topAsk, '#ef5350']]) {
      if (!top) continue;
      ctx.fillStyle = color;
      ctx.fillText(compact.format(top.q), width - barW(top.q) - 4, top.r * ROW + ROW / 2);
    }
  }

  const primitive = {
    attached: (p) => (requestUpdate = p.requestUpdate),
    detached: () => (requestUpdate = () => {}),
    updateAllViews: () => {},
    paneViews: () => [
      {
        zOrder: () => 'bottom', // detrás de las velas
        renderer: () => ({
          draw: (target) => target.useMediaCoordinateSpace(({ context, mediaSize }) => draw(context, mediaSize)),
        }),
      },
    ],
  };
  series.attachPrimitive(primitive);

  return {
    // Se llama en cada cambio del libro (10 por segundo): se redibuja como mucho 5 veces por segundo.
    destroy() {
      disposed = true;
    },
    setBook(b) {
      book = b;
      if (pending || disposed) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        if (!disposed) requestUpdate();
      }, 200);
    },
  };
}
