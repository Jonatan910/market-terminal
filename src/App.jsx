import { useCallback, useMemo } from 'react';
import Chart from './components/Chart';
import Watchlist from './components/Watchlist';
import SymbolSearch from './components/SymbolSearch';
import IndicatorsPanel from './components/IndicatorsPanel';
import { defaultIndicators, INDICATORS } from './indicators/catalog';
import { TIMEFRAMES } from './api/binance';
import { parseId } from './api/market';
import { useLocalStorage } from './hooks/useLocalStorage';

// Una lista por pestaña. Cada símbolo es "mercado:ticker".
const DEFAULT_LISTS = {
  crypto: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT', 'DOGEUSDT'].map((t) => `crypto:${t}`),
  stock: ['QQQ', 'SPY', 'AAPL', 'NVDA', 'MSFT', 'TSLA', 'AMZN', 'META'].map((t) => `stock:${t}`),
  forex: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'USDARS'].map((t) => `forex:${t}`),
};

const NO_DRAWINGS = [];

// Listas guardadas con la versión anterior ("BTCUSDT") pasan a "crypto:BTCUSDT".
const normalize = (id) => (id.includes(':') ? id : `crypto:${id}`);

// La primera vez: si había una lista única de una versión anterior, se reparte en pestañas
// (y forex arranca con la lista por defecto).
function initialLists() {
  try {
    const old = JSON.parse(localStorage.getItem('mt.watchlist'));
    if (Array.isArray(old)) {
      const lists = { crypto: [], stock: [], forex: [] };
      for (const id of old.map(normalize)) lists[parseId(id).market]?.push(id);
      if (!lists.forex.length) lists.forex = DEFAULT_LISTS.forex;
      return lists;
    }
  } catch {
    /* sin almacenamiento o dato roto: se usan las listas por defecto */
  }
  return DEFAULT_LISTS;
}

export default function App() {
  // Todo se recuerda en el navegador: al volver a entrar, está como lo dejaste.
  const [savedSymbol, setSymbol] = useLocalStorage('mt.symbol', 'crypto:BTCUSDT');
  const [interval, setTimeframe] = useLocalStorage('mt.interval', '4h');
  const [savedLists, setLists] = useLocalStorage('mt.watchlists', initialLists);
  const [tab, setTab] = useLocalStorage('mt.tab', 'crypto');
  const [savedIndicators, setIndicators] = useLocalStorage('mt.indicators', defaultIndicators);
  const [allDrawings, setAllDrawings] = useLocalStorage('mt.drawings', {}); // { 'crypto:BTCUSDT': [dibujos] }

  const symbol = normalize(savedSymbol);
  const lists = useMemo(() => ({ ...DEFAULT_LISTS, ...savedLists }), [savedLists]);
  // Descarta indicadores guardados que ya no existan en el catálogo.
  const indicators = useMemo(() => savedIndicators.filter((i) => INDICATORS[i.type]), [savedIndicators]);

  // Dibujos del símbolo actual (cada símbolo tiene los suyos, en todas las temporalidades).
  const drawings = allDrawings[symbol] || NO_DRAWINGS;
  const setDrawings = useCallback(
    (list) => setAllDrawings((all) => ({ ...all, [symbol]: list })),
    [symbol, setAllDrawings],
  );

  // Elegir en el buscador: abre el gráfico, lo suma a la lista de su mercado y muestra esa pestaña.
  const pick = useCallback(
    (id) => {
      const { market } = parseId(id);
      setSymbol(id);
      setTab(market);
      setLists((all) => {
        const list = all[market] || [];
        return list.includes(id) ? all : { ...all, [market]: [...list, id] };
      });
    },
    [setSymbol, setTab, setLists],
  );

  const remove = useCallback(
    (id) => {
      const { market } = parseId(id);
      setLists((all) => ({ ...all, [market]: (all[market] || []).filter((x) => x !== id) }));
    },
    [setLists],
  );

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
          <Chart symbol={symbol} interval={interval} indicators={indicators} drawings={drawings} onDrawingsChange={setDrawings} />
        </section>
        <aside className="side">
          <h2>Lista de seguimiento</h2>
          <Watchlist lists={lists} tab={tab} onTab={setTab} active={symbol} onSelect={setSymbol} onRemove={remove} />
        </aside>
      </main>

      <footer className="footer">
        Cripto: Binance, en vivo · Acciones y forex: Yahoo Finanzas, cada 15 s · No es asesoramiento financiero
      </footer>
    </div>
  );
}
