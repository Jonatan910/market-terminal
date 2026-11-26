# Market Terminal

**Demo en vivo:** https://market-terminal-orpin.vercel.app/

Terminal de mercados hecha con **React**, **Vite** y **Lightweight Charts**.
Muestra gráficos de velas en vivo con datos públicos, sin cuentas ni claves.

- **Cripto:** Binance, en vivo por WebSocket.
- **Acciones y ETF de EE.UU. (Nasdaq, NYSE):** Yahoo Finanzas a través de un servidor propio, se actualizan cada 15 s.

## Qué hace

- Gráfico de velas con volumen, actualizado en tiempo real por WebSocket.
- Buscador de cripto y acciones (BTC, AAPL, NVDA, QQQ…), navegable con el teclado.
- Temporalidades: 1m, 5m, 15m, 1h, 4h, 1D y 1S.
- Lista de seguimiento mixta: precio y variación (24 h en cripto, del día en acciones) y aviso de mercado cerrado.
- Indicadores configurables: SMA, EMA y Bandas de Bollinger sobre el precio; RSI y MACD en paneles propios.
  Se pueden agregar varias veces (por ejemplo EMA 20 y EMA 50), cambiar sus valores y su color.
- Fechas y horas en la zona horaria de tu compu.
- Recuerda el símbolo, la temporalidad y la lista en el navegador.
- Se adapta al celular.

## Correrlo en tu compu

Necesitás Node.js 18 o más nuevo.

```bash
npm install
npm run dev
```

Abrí la dirección que aparece (normalmente http://localhost:5173). El servidor de acciones (`/api`) también corre ahí, no hace falta nada más.

## Pruebas

```bash
npm test
```

Verifica los cálculos de los indicadores contra valores conocidos.

## Arquitectura

```
Navegador (React)
 ├── Cripto ──────────────► Binance (REST + WebSocket, directo)
 └── Acciones ──► /api ───► Yahoo Finanzas
                 (funciones en Vercel: evitan el bloqueo CORS y guardan caché)
```

| Ruta | Qué devuelve |
|---|---|
| `/api/candles?symbol=AAPL&interval=1h` | Velas (1m, 5m, 15m, 1h, 4h, 1d, 1w) |
| `/api/quotes?symbols=AAPL,MSFT` | Precio, variación del día y si el mercado está abierto |
| `/api/search?q=apple` | Acciones y ETF de EE.UU. que coinciden |

## Publicarlo en Vercel (página + servidor)

1. Entrá a https://vercel.com con tu cuenta de GitHub.
2. **Add New → Project**, elegí `market-terminal` y tocá **Deploy** (detecta Vite solo).
3. Queda en `https://market-terminal-XXXX.vercel.app`. Cada cambio en `main` se publica solo.


## Estructura

```
api/
  candles.js, quotes.js, search.js  funciones del servidor (Vercel)
  _lib/yahoo.js            pedidos a Yahoo Finanzas + caché
  _lib/http.js             respuestas JSON, CORS y manejo de errores
src/
  api/binance.js           pedidos REST y WebSocket a Binance
  api/stocks.js            pedidos a nuestro servidor /api
  api/market.js            capa común cripto / acciones
  components/Chart.jsx     gráfico de velas + volumen
  components/Watchlist.jsx lista de seguimiento en vivo
  components/SymbolSearch.jsx buscador de símbolos
  components/IndicatorsPanel.jsx panel para agregar y configurar indicadores
  indicators/calc.js       cálculos (SMA, EMA, Bollinger, RSI, MACD)
  indicators/calc.test.js  pruebas de los cálculos (npm test)
  indicators/catalog.js    lista de indicadores: parámetros y cómo se dibujan
  indicators/layer.js      dibuja los indicadores sobre el gráfico
  hooks/useLocalStorage.js estado que se guarda en el navegador
  format.js                formato de precios y porcentajes
  App.jsx                  arma la pantalla
```

## Próximos pasos

- Más indicadores: VWAP, Estocástico, ATR, Ichimoku.
- Herramientas de dibujo y alertas de precio.

Los datos son de Binance y Yahoo Finanzas y pueden tener demoras. No es asesoramiento financiero.
