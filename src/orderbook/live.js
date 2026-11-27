// Mantiene un libro de órdenes de Binance al día (foto + cambios en vivo) y avisa en cada cambio.
import { fetchDepth, openStream } from '../api/binance.js';
import { OrderBook } from './book.js';

// onStatus (opcional): recibe { events, snapshots, error } para diagnosticar la conexión.
export function connectOrderBook(ticker, onChange, venue = 'spot', onStatus = () => {}) {
  const status = { events: 0, snapshots: 0, gaps: 0, error: null };
  const book = new OrderBook(venue);
  let buffer = []; // cambios que llegan mientras se pide la foto
  let failures = 0;
  let loading = false;
  let closed = false;

  async function resync() {
    if (loading || closed) return;
    loading = true;
    book.lastId = null;
    try {
      const snap = await fetchDepth(ticker, venue);
      status.snapshots++;
      status.error = null;
      failures = 0;
      onStatus(status);
      if (closed) return;
      book.loadSnapshot(snap);
      for (const ev of buffer) if (book.apply(ev) === 'gap') throw new Error('salto');
      buffer = [];
      onChange(book);
    } catch (e) {
      status.error = e.message;
      onStatus(status);
      // Se reintenta en unos segundos (por ejemplo, si se perdió la conexión).
      // Si Binance bloqueó por exceso de pedidos ("banned until <hora>"), se espera hasta esa hora;
      // si no, cada vez un poco más (5 s, 10 s, 20 s… hasta 5 min) para no empeorar el bloqueo.
      failures++;
      const until = Number(/banned until (\d+)/.exec(e.message)?.[1]);
      const wait = until > Date.now() ? until - Date.now() + 5000 : Math.min(300000, 5000 * 2 ** (failures - 1));
      status.retryAt = Date.now() + wait;
      if (!closed) setTimeout(() => ((loading = false), resync()), wait);
      return;
    }
    loading = false;
  }

  let started = false;
  const close = openStream(
    [`${ticker.toLowerCase()}@depth@100ms`],
    (ev) => {
    status.events++;
    if (!book.ready) {
      buffer.push(ev);
      if (buffer.length > 500) buffer.shift();
      // La foto se pide recién cuando llegó el primer cambio (así nunca es más vieja que los cambios).
      if (!started) {
        started = true;
        resync();
      }
      return;
    }
    const r = book.apply(ev);
    if (r === 'applied') onChange(book);
    else if (r === 'gap') {
      status.gaps++;
      buffer = [ev];
      resync();
    }
    },
    venue,
  );

  return () => {
    closed = true;
    close();
  };
}
