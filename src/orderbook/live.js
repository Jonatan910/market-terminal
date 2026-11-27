// Mantiene un libro de órdenes de Binance al día (foto + cambios en vivo) y avisa en cada cambio.
import { fetchDepth, openStream } from '../api/binance';
import { OrderBook } from './book';

export function connectOrderBook(ticker, onChange) {
  const book = new OrderBook();
  let buffer = []; // cambios que llegan mientras se pide la foto
  let loading = false;
  let closed = false;

  async function resync() {
    if (loading || closed) return;
    loading = true;
    book.lastId = null;
    try {
      const snap = await fetchDepth(ticker);
      if (closed) return;
      book.loadSnapshot(snap);
      for (const ev of buffer) if (book.apply(ev) === 'gap') throw new Error('salto');
      buffer = [];
      onChange(book);
    } catch {
      // Se reintenta en unos segundos (por ejemplo, si se perdió la conexión).
      if (!closed) setTimeout(() => ((loading = false), resync()), 3000);
      return;
    }
    loading = false;
  }

  let started = false;
  const close = openStream([`${ticker.toLowerCase()}@depth@100ms`], (ev) => {
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
      buffer = [ev];
      resync();
    }
  });

  return () => {
    closed = true;
    close();
  };
}
