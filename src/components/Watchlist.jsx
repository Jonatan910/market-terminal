import { useEffect, useState } from 'react';
import { fetch24h, openStream } from '../api/binance';
import { fetchStockQuotes, STOCK_REFRESH_MS } from '../api/stocks';
import { MARKETS, displayName, fromYahoo, longName, pairLabel, parseId, sourceLabel, yahooTicker } from '../api/market';
import { formatPercent, formatPrice } from '../format';

// Lista de seguimiento con pestañas: Cripto, Acciones y Forex.
// Solo se actualiza la pestaña visible (así no se hacen pedidos de más).
//   Cripto: variación de 24 h por WebSocket (Binance).
//   Acciones y forex: variación del día, cada 15 s (Yahoo, a través de /api).
export default function Watchlist({ lists, tab, onTab, active, onSelect, onRemove }) {
  const symbols = lists[tab] || [];
  const [quotes, setQuotes] = useState({}); // { 'crypto:BTCUSDT': { price, change, open?, exchange?, name? } }
  const [flash, setFlash] = useState({}); // { id: 'up' | 'down' } para el destello al cambiar

  // Guarda una cotización nueva y marca el destello si el precio cambió.
  function apply(id, q) {
    setQuotes((prev) => {
      const old = prev[id];
      if (old && old.price !== q.price) setFlash((f) => ({ ...f, [id]: q.price > old.price ? 'up' : 'down' }));
      return { ...prev, [id]: q };
    });
  }

  const key = `${tab}|${symbols.join(',')}`; // para que el efecto solo se repita si cambia la lista

  useEffect(() => {
    if (!symbols.length) return;
    let cancelled = false;

    if (tab === 'crypto') {
      const tickers = symbols.map((id) => parseId(id).ticker);
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
    }

    // Acciones y forex: el mismo servidor, con tickers de Yahoo ("AAPL", "EURUSD=X").
    const load = () =>
      fetchStockQuotes(symbols.map(yahooTicker))
        .then((rows) => !cancelled && rows.forEach((r) => apply(fromYahoo(r.symbol), r)))
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
    <>
      <div className="wl-tabs" role="tablist" aria-label="Mercados">
        {MARKETS.map((m) => (
          <button key={m.id} role="tab" aria-selected={tab === m.id} className={tab === m.id ? 'active' : ''} onClick={() => onTab(m.id)}>
            {m.label}
            <span className="count">{(lists[m.id] || []).length}</span>
          </button>
        ))}
      </div>

      <ul className="watchlist" role="tabpanel">
        {symbols.map((id) => {
          const q = quotes[id];
          const { market } = parseId(id);
          // Segundo renglón: "BTC/USDT · Binance", "Nasdaq · cerrado" o "Yahoo Finanzas".
          const sub =
            market === 'crypto'
              ? `${pairLabel(id)} · ${sourceLabel(id)}`
              : [sourceLabel(id, q?.exchange), q?.open === false && 'cerrado'].filter(Boolean).join(' · ');
          return (
            <li key={id} className={id === active ? 'active' : ''}>
              <button className="row" onClick={() => onSelect(id)} title={longName(id) || q?.name || pairLabel(id)}>
                <span className="sym">
                  <strong>{displayName(id)}</strong>
                  <span className="sub">{sub}</span>
                </span>
                <span className={`price ${flash[id] || ''}`}>{q ? formatPrice(q.price, market) : '…'}</span>
                <span className={`chg ${q && q.change >= 0 ? 'up' : 'down'}`}>{q ? formatPercent(q.change) : ''}</span>
              </button>
              <button className="remove" title={`Quitar ${displayName(id)}`} aria-label={`Quitar ${displayName(id)}`} onClick={() => onRemove(id)}>
                ×
              </button>
            </li>
          );
        })}
        {!symbols.length && <li className="empty">Agregá símbolos con el buscador de arriba.</li>}
      </ul>
    </>
  );
}

function fromTicker(last, open) {
  const price = +last;
  const o = +open;
  return { price, change: o ? ((price - o) / o) * 100 : 0 };
}
