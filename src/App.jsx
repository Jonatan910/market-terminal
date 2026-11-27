import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Chart from './components/Chart';
import Watchlist from './components/Watchlist';
import SymbolSearch from './components/SymbolSearch';
import IndicatorsPanel from './components/IndicatorsPanel';
import UpdateBanner from './components/UpdateBanner';
import LiquidityView from './components/LiquidityView';
import AlertsPanel, { alertText } from './components/AlertsPanel';
import Toasts from './components/Toasts';
import { useAlertEngine } from './alerts/useAlertEngine';
import { blinkTitle, playChime, systemNotification } from './alerts/notify';
import { formatPrice, priceDecimals } from './format';
import { defaultIndicators, INDICATORS, newInstance } from './indicators/catalog';
import { TIMEFRAMES } from './api/binance';
import { pairLabel, parseId, tabOf } from './api/market';
import { useLocalStorage } from './hooks/useLocalStorage';

// Una lista por pestaña. Cada símbolo es "mercado:ticker".
const DEFAULT_LISTS = {
  crypto: ['crypto:BTCUSDT', 'perp:BTCUSDT', 'crypto:ETHUSDT', 'crypto:SOLUSDT', 'crypto:XRPUSDT', 'crypto:BNBUSDT', 'crypto:DOGEUSDT'],
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
      for (const id of old.map(normalize)) lists[tabOf(id)]?.push(id);
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
  const [view, setView] = useLocalStorage('mt.view', 'candles'); // 'candles' (velas) o 'liquidity' (modo liquidez)
  const [savedIndicators, setIndicators] = useLocalStorage('mt.indicators', defaultIndicators);
  const [allDrawings, setAllDrawings] = useLocalStorage('mt.drawings', {}); // { 'crypto:BTCUSDT': [dibujos] }
  const [alerts, setAlerts] = useLocalStorage('mt.alerts', []); // alertas de precio
  const [alertLog, setAlertLog] = useLocalStorage('mt.alertLog', []); // historial de alertas disparadas
  const [toasts, setToasts] = useState([]);
  const chartPriceRef = useRef(null); // último precio del gráfico abierto

  const symbol = normalize(savedSymbol);
  const lists = useMemo(() => ({ ...DEFAULT_LISTS, ...savedLists }), [savedLists]);

  // Una sola vez: el perfil de volumen, el libro y el mapa de calor antes eran botones (prendidos por
  // defecto). Ahora son indicadores: si estaban prendidos, se suman a la lista para no perderlos.
  useEffect(() => {
    let old;
    try {
      if (localStorage.getItem('mt.added.marketInds')) return;
      localStorage.setItem('mt.added.marketInds', '1');
      old = { vprofile: localStorage.getItem('mt.vprofile'), orderbook: localStorage.getItem('mt.orderbook'), heatmap: localStorage.getItem('mt.heatmap') };
    } catch {
      return;
    }
    setIndicators((list) => {
      let next = list;
      for (const [type, saved] of Object.entries(old)) {
        if (saved !== 'false' && !next.some((i) => i.type === type)) next = [...next, newInstance(type, next)];
      }
      return next;
    });
  }, [setIndicators]);

  // Una sola vez: suma el perpetuo de BTC a la lista de cripto ya guardada, al lado de BTC.
  useEffect(() => {
    try {
      if (localStorage.getItem('mt.added.perpBTC')) return;
      localStorage.setItem('mt.added.perpBTC', '1');
    } catch {
      return;
    }
    setLists((all) => {
      const list = all.crypto || DEFAULT_LISTS.crypto;
      if (list.includes('perp:BTCUSDT')) return all;
      const i = list.indexOf('crypto:BTCUSDT');
      return { ...all, crypto: i >= 0 ? [...list.slice(0, i + 1), 'perp:BTCUSDT', ...list.slice(i + 1)] : ['perp:BTCUSDT', ...list] };
    });
  }, [setLists]);
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
      const tab = tabOf(id);
      setSymbol(id);
      setTab(tab);
      setLists((all) => {
        const list = all[tab] || [];
        return list.includes(id) ? all : { ...all, [tab]: [...list, id] };
      });
    },
    [setSymbol, setTab, setLists],
  );

  const remove = useCallback(
    (id) => {
      const tab = tabOf(id);
      setLists((all) => ({ ...all, [tab]: (all[tab] || []).filter((x) => x !== id) }));
    },
    [setLists],
  );

  // ---------- alertas ----------
  const toast = useCallback((t) => setToasts((list) => [...list.slice(-3), { id: `${Date.now()}${Math.random()}`, ...t }]), []);
  const closeToast = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const goTo = useCallback(
    (id) => {
      setSymbol(id);
      setTab(tabOf(id));
    },
    [setSymbol, setTab],
  );

  // Se cumplió una alerta: avisar de todas las formas y anotarla en el historial.
  const onTrigger = useCallback(
    (a, price) => {
      const text = alertText(a);
      const at = Date.now();
      setAlerts((list) => list.map((x) => (x.id === a.id ? { ...x, triggeredAt: at, ...(x.repeat === 'once' && { active: false }) } : x)));
      setAlertLog((log) => [{ id: `${at}${a.id}`, at, symbol: a.symbol, text, price, message: a.message }, ...log].slice(0, 50));
      const body = `Precio: ${formatPrice(price, parseId(a.symbol).market)}${a.message ? ` — ${a.message}` : ''}`;
      toast({ title: text, body, symbol: a.symbol });
      playChime();
      systemNotification(`🔔 ${text}`, body, () => goTo(a.symbol));
      blinkTitle(pairLabel(a.symbol));
    },
    [setAlerts, setAlertLog, toast, goTo],
  );

  const engineRef = useAlertEngine(alerts, onTrigger);
  const getPrice = (id) => (id === symbol ? chartPriceRef.current : engineRef.current[id]) ?? null;

  const createAlert = useCallback(
    (a, { fromChart = false } = {}) => {
      // El precio se redondea a los decimales del mercado (Alt+A da el precio exacto del cursor).
      const price = Number(a.price.toFixed(priceDecimals(a.price, parseId(a.symbol).market)));
      const alert = { id: `a${Date.now().toString(36)}`, active: true, createdAt: Date.now(), repeat: 'once', condition: 'crossing', message: '', ...a, price };
      setAlerts((list) => [...list, alert]);
      if (fromChart) toast({ title: 'Alerta creada', body: alertText(alert), kind: 'info' });
    },
    [setAlerts, toast],
  );
  const updateAlert = useCallback((id, patch) => setAlerts((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a))), [setAlerts]);
  const removeAlert = useCallback((id) => setAlerts((list) => list.filter((a) => a.id !== id)), [setAlerts]);
  const chartAlerts = useMemo(() => alerts.filter((a) => a.active && a.symbol === symbol), [alerts, symbol]);

  return (
    <div className="app">
      <UpdateBanner />
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true" />
          Market Terminal
        </div>
        <SymbolSearch onPick={pick} />
        <div className="view-switch" role="tablist" aria-label="Vista">
          <button role="tab" aria-selected={view === 'candles'} className={view === 'candles' ? 'active' : ''} onClick={() => setView('candles')}>
            Velas
          </button>
          <button
            role="tab"
            aria-selected={view === 'liquidity'}
            className={view === 'liquidity' ? 'active' : ''}
            onClick={() => setView('liquidity')}
            title="Modo liquidez: libro de órdenes segundo a segundo, línea de precio y burbujas de operaciones (cripto)"
          >
            Liquidez
          </button>
        </div>
        {view === 'candles' && (
        <nav className="timeframes" aria-label="Temporalidad">
          {TIMEFRAMES.map((tf) => (
            <button key={tf.value} className={tf.value === interval ? 'active' : ''} onClick={() => setTimeframe(tf.value)}>
              {tf.label}
            </button>
          ))}
        </nav>
        )}
        <IndicatorsPanel value={indicators} onChange={setIndicators} />
        <AlertsPanel
          alerts={alerts}
          log={alertLog}
          symbols={Object.values(lists).flat()}
          currentSymbol={symbol}
          getPrice={getPrice}
          onCreate={createAlert}
          onUpdate={updateAlert}
          onRemove={removeAlert}
          onClearLog={() => setAlertLog([])}
          onGoTo={goTo}
        />
      </header>

      <main className="layout">
        <section className="main-chart">
          {view === 'liquidity' ? (
            <LiquidityView symbol={symbol} />
          ) : (
          <Chart
            symbol={symbol}
            interval={interval}
            indicators={indicators}
            drawings={drawings}
            onDrawingsChange={setDrawings}
            alerts={chartAlerts}
            onCreateAlert={(price) => createAlert({ symbol, price }, { fromChart: true })}
            onLastPrice={(p) => (chartPriceRef.current = p)}
          />
          )}
        </section>
        <aside className="side">
          <h2>Lista de seguimiento</h2>
          <Watchlist lists={lists} tab={tab} onTab={setTab} active={symbol} onSelect={setSymbol} onRemove={remove} />
        </aside>
      </main>

      <Toasts items={toasts} onClose={closeToast} onGoTo={goTo} />

      <footer className="footer">
        Cripto: Binance, en vivo · Acciones y forex: Yahoo Finanzas, cada 15 s · No es asesoramiento financiero
      </footer>
    </div>
  );
}
