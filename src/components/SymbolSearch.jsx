import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchUsdtSymbols } from '../api/binance';
import { searchStocks } from '../api/stocks';
import { searchForex } from '../api/forex';

// Buscador de cripto, acciones y forex: escribís "sol", "apple" o "eur" y sugiere de los tres mercados.
export default function SymbolSearch({ onPick }) {
  const [cryptoList, setCryptoList] = useState([]);
  const [perpList, setPerpList] = useState([]); // perpetuos de Binance Futuros
  const [stockResults, setStockResults] = useState([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef(null);

  // La lista de pares cripto se pide una sola vez, la primera vez que tocás el buscador.
  function loadOnce() {
    if (!cryptoList.length) fetchUsdtSymbols().then(setCryptoList).catch(() => {});
    if (!perpList.length) fetchUsdtSymbols('futures').then(setPerpList).catch(() => {});
  }

  // Acciones: se buscan en el servidor, esperando 250 ms a que termines de escribir ("debounce").
  useEffect(() => {
    const q = query.trim();
    if (!q) return setStockResults([]);
    let cancelled = false;
    const id = setTimeout(() => {
      searchStocks(q)
        .then((r) => !cancelled && setStockResults(r))
        .catch(() => !cancelled && setStockResults([]));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query]);

  const results = useMemo(() => {
    const q = query.trim().toUpperCase().replace(/[/\s-]/g, '').replace(/USDT$/, '');
    if (!q) return [];
    // Cripto: primero los que empiezan con lo escrito, después los que lo contienen.
    const starts = cryptoList.filter((s) => s.base.startsWith(q)).sort((a, b) => a.base.length - b.base.length);
    const contains = cryptoList.filter((s) => !s.base.startsWith(q) && s.base.includes(q));
    const crypto = [...starts, ...contains].slice(0, 5).map((s) => ({
      id: `crypto:${s.symbol}`,
      title: s.base,
      subtitle: `${s.base}/USDT`,
      tag: 'Cripto',
      exact: s.base === q,
    }));
    const stocks = stockResults.slice(0, 6).map((s) => ({
      id: `stock:${s.symbol}`,
      title: s.symbol,
      subtitle: `${s.name} · ${s.exchange}`,
      tag: s.type === 'ETF' ? 'ETF' : 'Acción',
      exact: s.symbol === q,
    }));
    // Perpetuos: los que coinciden con el código (BTC, BTCUSDT.P o BTCPERP → BTCUSDT.P).
    const wantsPerp = /(\.P|PERP)$/.test(q);
    const qp = q.replace(/(\.P|PERP)$/, '').replace(/USDT$/, '');
    const perps = perpList
      .filter((s) => s.base.startsWith(qp))
      .sort((a, b) => a.base.length - b.base.length)
      .slice(0, 3)
      .map((s) => ({
        id: `perp:${s.symbol}`,
        title: `${s.symbol}.P`,
        subtitle: `${s.base}/USDT perpetuo · Binance Futuros`,
        tag: 'Perpetuo',
        exact: wantsPerp && s.base === qp,
      }));
    const forex = searchForex(query)
      .slice(0, 4)
      .map((p) => ({
        id: `forex:${p.ticker}`,
        title: `${p.ticker.slice(0, 3)}/${p.ticker.slice(3)}`,
        subtitle: p.name,
        tag: 'Forex',
        exact: p.ticker === q,
      }));
    // Las coincidencias exactas van primero (escribir "AAPL", "BTC" o "EURUSD" y Enter abre ese).
    return [...crypto, ...perps, ...stocks, ...forex].sort((a, b) => b.exact - a.exact);
  }, [cryptoList, perpList, stockResults, query]);

  // Cerrar la lista al hacer clic afuera.
  useEffect(() => {
    const onDoc = (e) => !boxRef.current?.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, []);

  function pick(id) {
    onPick(id);
    setQuery('');
    setOpen(false);
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') setHighlight((h) => Math.min(h + 1, results.length - 1));
    else if (e.key === 'ArrowUp') setHighlight((h) => Math.max(h - 1, 0));
    else if (e.key === 'Enter' && results[highlight]) pick(results[highlight].id);
    else if (e.key === 'Escape') setOpen(false);
    else return;
    e.preventDefault();
  }

  return (
    <div className="search" ref={boxRef}>
      <input
        type="search"
        placeholder="Buscar: BTC, AAPL, QQQ, EURUSD…"
        value={query}
        onFocus={() => {
          loadOnce();
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        aria-label="Buscar símbolo"
      />
      {open && results.length > 0 && (
        <ul className="results" role="listbox">
          {results.map((r, i) => (
            <li key={r.id}>
              <button className={i === highlight ? 'hl' : ''} onMouseEnter={() => setHighlight(i)} onClick={() => pick(r.id)}>
                <span className="r-main">
                  <strong>{r.title}</strong>
                  <span className="muted r-sub">{r.subtitle}</span>
                </span>
                <span className="tag">{r.tag}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
