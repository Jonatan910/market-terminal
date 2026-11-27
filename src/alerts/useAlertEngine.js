import { useEffect, useRef } from 'react';
import { openStream } from '../api/binance';
import { fetchStockQuotes, STOCK_REFRESH_MS } from '../api/stocks';
import { fromYahoo, isBinance, parseId, yahooTicker } from '../api/market';
import { shouldTrigger } from './conditions';

// Vigila los precios de los símbolos que tienen alertas activas y llama a onTrigger(alerta, precio)
// cuando se cumple una condición. Funciona mientras la página esté abierta (aunque sea en otra pestaña).
//   Cripto: WebSocket de Binance (un precio por segundo).
//   Acciones y forex: cada 15 s, por nuestro servidor.
export function useAlertEngine(alerts, onTrigger) {
  const alertsRef = useRef(alerts);
  const onTriggerRef = useRef(onTrigger);
  const lastRef = useRef({}); // último precio visto por símbolo
  alertsRef.current = alerts;
  onTriggerRef.current = onTrigger;

  // Solo se reconecta si cambia el conjunto de símbolos vigilados.
  const key = [...new Set(alerts.filter((a) => a.active).map((a) => a.symbol))].sort().join(',');

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    if (!ids.length) return;

    function handle(id, price) {
      const prev = lastRef.current[id];
      lastRef.current[id] = price;
      for (const a of alertsRef.current) {
        if (a.symbol === id && shouldTrigger(a, prev ?? null, price)) onTriggerRef.current(a, price);
      }
    }

    const spot = ids.filter((id) => parseId(id).market === 'crypto');
    const perp = ids.filter((id) => parseId(id).market === 'perp');
    const others = ids.filter((id) => !isBinance(id));

    // Un WebSocket por venue de Binance (spot y futuros).
    const stream = (list, market, venue) =>
      list.length
        ? openStream(list.map((id) => `${parseId(id).ticker.toLowerCase()}@miniTicker`), (t) => handle(`${market}:${t.s}`, +t.c), venue)
        : () => {};
    const closeSpot = stream(spot, 'crypto', 'spot');
    const closePerp = stream(perp, 'perp', 'futures');
    const close = () => {
      closeSpot();
      closePerp();
    };

    let timer;
    if (others.length) {
      // En segundo plano también se consulta (las alertas tienen que avisar igual).
      const poll = () =>
        fetchStockQuotes(others.map(yahooTicker))
          .then((rows) => rows.forEach((r) => handle(fromYahoo(r.symbol), r.price)))
          .catch(() => {});
      poll();
      timer = setInterval(poll, STOCK_REFRESH_MS);
    }

    return () => {
      close();
      clearInterval(timer);
    };
  }, [key]);

  // Último precio conocido (para proponerlo al crear una alerta).
  return lastRef;
}
