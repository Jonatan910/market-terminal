import { useCallback } from 'react';
import Chart from './components/Chart';
import Watchlist from './components/Watchlist';
import SymbolSearch from './components/SymbolSearch';
import { TIMEFRAMES } from './api/binance';
import { useLocalStorage } from './hooks/useLocalStorage';

const DEFAULT_WATCHLIST = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT', 'DOGEUSDT', 'LINKUSDT', 'AVAXUSDT'];

export default function App() {
  // Todo se recuerda en el navegador: al volver a entrar, está como lo dejaste.
  const [symbol, setSymbol] = useLocalStorage('ct.symbol', 'BTCUSDT');
  const [interval, setTimeframe] = useLocalStorage('ct.interval', '4h');
  const [watchlist, setWatchlist] = useLocalStorage('ct.watchlist', DEFAULT_WATCHLIST);

  // Elegir en el buscador: abre el gráfico y lo suma a la lista si no estaba.
  const pick = useCallback(
    (s) => {
      setSymbol(s);
      setWatchlist((w) => (w.includes(s) ? w : [...w, s]));
    },
    [setSymbol, setWatchlist],
  );

  const remove = useCallback((s) => setWatchlist((w) => w.filter((x) => x !== s)), [setWatchlist]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true" />
          Cripto Terminal
        </div>
        <SymbolSearch onPick={pick} />
        <nav className="timeframes" aria-label="Temporalidad">
          {TIMEFRAMES.map((tf) => (
            <button key={tf.value} className={tf.value === interval ? 'active' : ''} onClick={() => setTimeframe(tf.value)}>
              {tf.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="layout">
        <section className="main-chart">
          <Chart symbol={symbol} interval={interval} />
        </section>
        <aside className="side">
          <h2>Lista de seguimiento</h2>
          <Watchlist symbols={watchlist} active={symbol} onSelect={setSymbol} onRemove={remove} />
        </aside>
      </main>

      <footer className="footer">Datos públicos de Binance · No es asesoramiento financiero</footer>
    </div>
  );
}
