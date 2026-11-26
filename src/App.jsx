import { useCallback, useMemo } from 'react';
import Chart from './components/Chart';
import Watchlist from './components/Watchlist';
import SymbolSearch from './components/SymbolSearch';
import IndicatorsPanel from './components/IndicatorsPanel';
import { defaultIndicators, INDICATORS } from './indicators/catalog';
import { TIMEFRAMES } from './api/binance';
import { useLocalStorage } from './hooks/useLocalStorage';

// Cada símbolo es "mercado:ticker".
const DEFAULT_WATCHLIST = [
  'crypto:BTCUSDT',
  'crypto:ETHUSDT',
  'crypto:SOLUSDT',
  'stock:QQQ',
  'stock:AAPL',
  'stock:NVDA',
  'stock:MSFT',
  'stock:TSLA',
];

// Listas guardadas con la versión anterior ("BTCUSDT") pasan a "crypto:BTCUSDT".
const normalize = (id) => (id.includes(':') ? id : `crypto:${id}`);

export default function App() {
  // Todo se recuerda en el navegador: al volver a entrar, está como lo dejaste.
  const [savedSymbol, setSymbol] = useLocalStorage('mt.symbol', 'crypto:BTCUSDT');
  const [interval, setTimeframe] = useLocalStorage('mt.interval', '4h');
  const [savedList, setWatchlist] = useLocalStorage('mt.watchlist', DEFAULT_WATCHLIST);
  const [savedIndicators, setIndicators] = useLocalStorage('mt.indicators', defaultIndicators);

  const symbol = normalize(savedSymbol);
  const watchlist = useMemo(() => savedList.map(normalize), [savedList]);
  // Descarta indicadores guardados que ya no existan en el catálogo.
  const indicators = useMemo(() => savedIndicators.filter((i) => INDICATORS[i.type]), [savedIndicators]);

  // Elegir en el buscador: abre el gráfico y lo suma a la lista si no estaba.
  const pick = useCallback(
    (id) => {
      setSymbol(id);
      setWatchlist((w) => {
        const list = w.map(normalize);
        return list.includes(id) ? list : [...list, id];
      });
    },
    [setSymbol, setWatchlist],
  );

  const remove = useCallback((id) => setWatchlist((w) => w.map(normalize).filter((x) => x !== id)), [setWatchlist]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true" />
          Market Terminal
        </div>
        <SymbolSearch onPick={pick} />
        <nav className="timeframes" aria-label="Temporalidad">
          {TIMEFRAMES.map((tf) => (
            <button key={tf.value} className={tf.value === interval ? 'active' : ''} onClick={() => setTimeframe(tf.value)}>
              {tf.label}
            </button>
          ))}
        </nav>
        <IndicatorsPanel value={indicators} onChange={setIndicators} />
      </header>

      <main className="layout">
        <section className="main-chart">
          <Chart symbol={symbol} interval={interval} indicators={indicators} />
        </section>
        <aside className="side">
          <h2>Lista de seguimiento</h2>
          <Watchlist symbols={watchlist} active={symbol} onSelect={setSymbol} onRemove={remove} />
        </aside>
      </main>

      <footer className="footer">
        Cripto: Binance, en vivo · Acciones: Yahoo Finanzas, cada 15 s · No es asesoramiento financiero
      </footer>
    </div>
  );
}
