import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchUsdtSymbols } from '../api/binance';

// Buscador: escribís "sol" y te sugiere SOLUSDT. Enter abre el primero.
export default function SymbolSearch({ onPick }) {
  const [all, setAll] = useState([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef(null);

  // La lista de pares se pide una sola vez, la primera vez que tocás el buscador.
  function loadOnce() {
    if (!all.length) fetchUsdtSymbols().then(setAll).catch(() => {});
  }

  const results = useMemo(() => {
    const q = query.trim().toUpperCase().replace(/[\/\s-]/g, '').replace(/USDT$/, '');
    if (!q) return [];
    // Primero los que empiezan con lo escrito, después los que lo contienen.
    const starts = all.filter((s) => s.base.startsWith(q));
    const contains = all.filter((s) => !s.base.startsWith(q) && s.base.includes(q));
    return [...starts.sort((a, b) => a.base.length - b.base.length), ...contains].slice(0, 8);
  }, [all, query]);

  // Cerrar la lista al hacer clic afuera.
  useEffect(() => {
    const onDoc = (e) => !boxRef.current?.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, []);

  function pick(symbol) {
    onPick(symbol);
    setQuery('');
    setOpen(false);
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') setHighlight((h) => Math.min(h + 1, results.length - 1));
    else if (e.key === 'ArrowUp') setHighlight((h) => Math.max(h - 1, 0));
    else if (e.key === 'Enter' && results[highlight]) pick(results[highlight].symbol);
    else if (e.key === 'Escape') setOpen(false);
    else return;
    e.preventDefault();
  }

  return (
    <div className="search" ref={boxRef}>
      <input
        type="search"
        placeholder="Buscar: BTC, ETH, SOL…"
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
            <li key={r.symbol}>
              <button className={i === highlight ? 'hl' : ''} onMouseEnter={() => setHighlight(i)} onClick={() => pick(r.symbol)}>
                <strong>{r.base}</strong>
                <span className="muted">/USDT</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query && !results.length && all.length > 0 && <div className="results none">Sin resultados</div>}
    </div>
  );
}
