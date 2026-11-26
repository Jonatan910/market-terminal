import { useEffect, useState } from 'react';
import { fetch24h, openStream } from '../api/binance';
import { fetchStockQuotes, STOCK_REFRESH_MS } from '../api/stocks';
import { displayName, parseId } from '../api/market';
import { formatPercent, formatPrice } from '../format';

// Lista de seguimiento: precio y variación de cada símbolo, en vivo.
// Cripto: variación de 24 h por WebSocket. Acciones: variación del día, cada 15 s.
export default function Watchlist({ symbols, active, onSelect, onRemove }) {
  const [quotes, setQuotes] = useState({}); // { 'crypto:BTCUSDT': { price, change, open? } }
  const [flash, setFlash] = useState({}); // { id: 'up' | 'down' } para el destello al cambiar

  // Guarda una cotización nueva y marca el destello si el precio cambió.
  function apply(id, q) {
    setQuotes((prev) => {
      const old = prev[id];
      if (old && old.price !== q.price) setFlash((f) => ({ ...f, [id]: q.price > old.price ? 'up' : 'down' }));
      return { ...prev, [id]: q };
    });
  }

  const key = symbols.join(','); // para que el efecto solo se repita si cambia la lista

  // ---------- cripto ----------
  useEffect(() => {
    const tickers = symbols.map(parseId).filter((s) => s.market === 'crypto').map((s) => s.ticker);
    if (!tickers.length) return;
    let cancelled = false;

    fetch24h(tickers)
      .then((rows) => !cancelled && rows.forEach((r) => apply(`crypto:${r.symbol}`, fromTicker(r.lastPrice, r.openPrice))))
      .catch(() => {});

    const close = openStream(
      tickers.map((t) => `${t.toLowerCase()}@miniTicker`),
      (t) => apply(`crypto:${t.s}`, fromTicker(t.c, t.o)),
    );
    return () => {
      cancelled = true;
      close();
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- acciones ----------
  useEffect(() => {
    const tickers = symbols.map(parseId).filter((s) => s.market === 'stock').map((s) => s.ticker);
    if (!tickers.length) return;
    let cancelled = false;

    const load = () =>
      fetchStockQuotes(tickers)
        .then((rows) => !cancelled && rows.forEach((r) => apply(`stock:${r.symbol}`, r)))
        .catch(() => {});
    load();
    const timer = setInterval(() => !document.hidden && load(), STOCK_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apaga el destello un instante después.
  useEffect(() => {
    if (!Object.keys(flash).length) return;
    const id = setTimeout(() => setFlash({}), 400);
    return () => clearTimeout(id);
  }, [flash]);

  return (
    <ul className="watchlist">
      {symbols.map((id) => {
        const q = quotes[id];
        const isStock = parseId(id).market === 'stock';
        return (
          <li key={id} className={id === active ? 'active' : ''}>
            <button className="row" onClick={() => onSelect(id)}>
              <span className="sym">
                {displayName(id)}
                {isStock && q && q.open === false && (
                  <span className="closed" title="Mercado cerrado">
                    cerrado
                  </span>
                )}
              </span>
              <span className={`price ${flash[id] || ''}`}>{q ? formatPrice(q.price) : '…'}</span>
              <span className={`chg ${q && q.change >= 0 ? 'up' : 'down'}`}>{q ? formatPercent(q.change) : ''}</span>
            </button>
            <button className="remove" title={`Quitar ${displayName(id)}`} aria-label={`Quitar ${displayName(id)}`} onClick={() => onRemove(id)}>
              ×
            </button>
          </li>
        );
      })}
      {!symbols.length && <li className="empty">Agregá un símbolo con el buscador.</li>}
    </ul>
  );
}

function fromTicker(last, open) {
  const price = +last;
  const o = +open;
  return { price, change: o ? ((price - o) / o) * 100 : 0 };
}
