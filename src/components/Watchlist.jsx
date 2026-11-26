import { useEffect, useState } from 'react';
import { fetch24h, openStream } from '../api/binance';
import { formatPercent, formatPrice } from '../format';

// Lista de seguimiento: precio y variación de 24 h de cada símbolo, en vivo.
export default function Watchlist({ symbols, active, onSelect, onRemove }) {
  const [tickers, setTickers] = useState({}); // { BTCUSDT: { price, change } }
  const [flash, setFlash] = useState({}); // { BTCUSDT: 'up' | 'down' } para el destello al cambiar

  useEffect(() => {
    let cancelled = false;

    // Foto inicial con una sola llamada.
    fetch24h(symbols)
      .then((rows) => {
        if (cancelled) return;
        const next = {};
        for (const r of rows) next[r.symbol] = fromTicker(r.lastPrice, r.openPrice);
        setTickers(next);
      })
      .catch(() => {});

    // Después, actualizaciones en vivo con el stream "miniTicker" (una por segundo).
    const close = openStream(
      symbols.map((s) => `${s.toLowerCase()}@miniTicker`),
      (t) => {
        setTickers((prev) => {
          const old = prev[t.s];
          const now = fromTicker(t.c, t.o);
          if (old && old.price !== now.price) {
            setFlash((f) => ({ ...f, [t.s]: now.price > old.price ? 'up' : 'down' }));
          }
          return { ...prev, [t.s]: now };
        });
      },
    );

    return () => {
      cancelled = true;
      close();
    };
  }, [symbols]);

  // Apaga el destello un instante después.
  useEffect(() => {
    if (!Object.keys(flash).length) return;
    const id = setTimeout(() => setFlash({}), 400);
    return () => clearTimeout(id);
  }, [flash]);

  return (
    <ul className="watchlist">
      {symbols.map((s) => {
        const t = tickers[s];
        return (
          <li key={s} className={s === active ? 'active' : ''}>
            <button className="row" onClick={() => onSelect(s)}>
              <span className="sym">{s.replace(/USDT$/, '')}</span>
              <span className={`price ${flash[s] || ''}`}>{t ? formatPrice(t.price) : '…'}</span>
              <span className={`chg ${t && t.change >= 0 ? 'up' : 'down'}`}>{t ? formatPercent(t.change) : ''}</span>
            </button>
            <button className="remove" title={`Quitar ${s}`} aria-label={`Quitar ${s}`} onClick={() => onRemove(s)}>
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
