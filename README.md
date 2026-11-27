# Market Terminal

**Demo en vivo:** https://market-terminal-orpin.vercel.app/

Terminal de mercados hecha con **React**, **Vite** y **Lightweight Charts**.
Muestra gráficos de velas en vivo con datos públicos, sin cuentas ni claves.

- **Cripto:** Binance, en vivo por WebSocket.
- **Acciones y ETF de EE.UU. (Nasdaq, NYSE):** Yahoo Finanzas a través de un servidor propio, se actualizan cada 15 s.
- **Forex:** pares mayores y latinoamericanos (EUR/USD, USD/JPY, USD/ARS…), también por Yahoo Finanzas.
- **Perpetuos de Binance Futuros** (BTCUSDT.P, ETHUSDT.P…): velas, libro de órdenes, mapa de calor y CVD.
  El navegador los pide directo; si no puede (permisos o bloqueo por país), usa el servidor `/api/fapi`
  (Edge Function de Vercel, corre en la región más cercana al usuario).

## Qué hace

- Gráfico de velas con volumen, actualizado en tiempo real por WebSocket.
- **Toda la historia disponible:** en cripto se carga más a medida que desplazás el gráfico hacia la
  izquierda (BTC desde 2017); en acciones y forex se pide todo lo que permite Yahoo
  (diario y semanal completo, por ejemplo AAPL desde 1980; 1h: 2 años; 5m/15m: 60 días; 1m: 7 días).
- Buscador de cripto, acciones y forex (BTC, AAPL, QQQ, EURUSD, "peso"…), navegable con el teclado.
- Temporalidades: 1m, 5m, 15m, 1h, 4h, 1D y 1S.
- Lista de seguimiento con pestañas **Cripto / Acciones / Forex**: par, fuente de datos (Binance, Nasdaq, NYSE…),
  precio con los decimales de cada mercado, variación y aviso de mercado cerrado.
- **Libro de órdenes en vivo** (cripto, Binance) a la derecha del gráfico: compras en verde, ventas en rojo,
  con la "pared" más grande de cada lado marcada. Se arma con la foto de 5000 precios por lado y los
  cambios en vivo cada 100 ms (como recomienda Binance). Se agrega o quita desde ƒx Indicadores.
- **Mapa de calor de liquidez** (cripto): cada 2 s se guarda una foto del libro y se dibuja detrás de las
  velas; azul/celeste = poca liquidez, amarillo/naranja = órdenes grandes esperando. Binance no da la
  historia del libro, así que se arma desde que abrís la página (guarda hasta 3 horas por símbolo).
  Además marca las **paredes de liquidez** (los precios con más órdenes en los últimos 30 s) con líneas
  a lo ancho de todo el gráfico, y extiende la foto actual a la derecha de la última vela.
- **Perfil de volumen** (lo visible en pantalla): cuánto se operó en cada precio, compras en verde y
  ventas en rojo, con el **POC** (precio con más volumen) y el **área de valor** (70 % del volumen).
  Se recalcula al desplazar o hacer zoom. Se agrega desde ƒx Indicadores (filas y % del área de valor configurables). En cripto usa el volumen comprado a mercado de Binance;
  en acciones lo estima por dónde cerró cada vela. Forex no tiene volumen.
- Indicadores configurables: SMA, EMA y Bandas de Bollinger sobre el precio; RSI, MACD, **CVD** y
  **Delta de volumen** (compras − ventas agresivas, solo cripto) en paneles propios.
  Se pueden agregar varias veces (por ejemplo EMA 20 y EMA 50), cambiar sus valores y su color.
- 24 herramientas de dibujo, agrupadas en menús:
  - **Líneas:** tendencia, rayo, línea extendida, flecha, horizontal, rayo horizontal, vertical y cruz.
  - **Canales, Fibonacci y Gann:** canal paralelo, retroceso de Fibonacci y cuadrícula de Gann.
  - **Formas:** rectángulo, elipse, camino y pincel.
  - **Patrones:** XABCD (con proporciones), ondas de Elliott 1-5 y ABC, triángulo ABCDE.
  - **Posiciones y medición:** posición larga y corta (objetivo, stop y R/R) y medir precio.
  - **Texto.**
- Editar el dibujo seleccionado: color, grosor, tipo de línea, **opacidad de línea y de relleno**, **extender a izquierda/derecha**
  (un rectángulo con las dos cruza todo el gráfico), texto, **duplicar** y borrar.
- **Copiar y pegar** con Ctrl+C / Ctrl+V (también entre símbolos) y **Alt + arrastrar** para duplicar.
- **Barra de favoritos** flotante y movible: se arma con la ☆ de cada herramienta en los menús.
- **Imán**: pega los puntos al máximo, mínimo, apertura o cierre de la vela. Se activa con el botón
  o manteniendo **Ctrl** (Cmd en Mac) mientras dibujás; un circulito muestra dónde se pega.
- Ocultar y borrar todos. Cada símbolo guarda sus dibujos y se ven en todas las temporalidades.
- **Alertas de precio** para cripto, acciones y forex: cruza, cruza hacia arriba/abajo, mayor que, menor que;
  una sola vez o cada vez que se cumpla, con mensaje opcional. Avisan con cartel, sonido, notificación del
  sistema y el título de la pestaña. Se ven en el gráfico como línea naranja 🔔. Atajos: **Alt+A** (alerta en
  el precio del cursor) y el botón 🔔 de la línea horizontal. Historial de las disparadas.
  Funcionan mientras la página esté abierta (aunque sea en otra pestaña).
- Aviso de versión nueva con botón para actualizar.
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
| `/api/fapi?path=/fapi/v1/klines?...` | Plan B para Binance Futuros (solo rutas de datos públicos) |

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
  api/market.js            capa común cripto / acciones / forex
  api/forex.js             lista de pares de divisas y su búsqueda
  components/Chart.jsx     gráfico de velas + volumen
  components/Watchlist.jsx lista de seguimiento en vivo
  components/SymbolSearch.jsx buscador de símbolos
  components/IndicatorsPanel.jsx panel para agregar y configurar indicadores
  components/DrawingToolbar.jsx barra de herramientas de dibujo
  components/DrawingEditBar.jsx barra para editar el dibujo seleccionado
  components/FavoritesBar.jsx barra flotante de herramientas favoritas
  components/AlertsPanel.jsx panel de alertas: crear, pausar, borrar, historial
  components/Toasts.jsx    carteles de aviso
  alerts/conditions.js     cuándo se dispara cada tipo de alerta (con pruebas)
  alerts/useAlertEngine.js vigila los precios de los símbolos con alertas
  alerts/notify.js         sonido, notificación del sistema y título de la pestaña
  drawings/tools.js        cada herramienta: cómo se dibuja y cómo se selecciona
  drawings/controller.js   mouse/dedo: crear, seleccionar, mover y borrar dibujos
  drawings/timeMap.js      convierte fecha <-> posición de vela (con pruebas)
  indicators/calc.js       cálculos (SMA, EMA, Bollinger, RSI, MACD, CVD, delta)
  orderbook/book.js        libro de órdenes local: foto + cambios (con pruebas)
  orderbook/live.js        conexión en vivo con Binance y resincronización
  orderbook/depthPrimitive.js dibujo del libro a la derecha del gráfico
  orderbook/heatmap.js     grabación del mapa de calor (con pruebas)
  orderbook/heatmapPrimitive.js dibujo del mapa de calor detrás de las velas
  indicators/calc.test.js  pruebas de los cálculos (npm test)
  indicators/catalog.js    lista de indicadores: parámetros y cómo se dibujan
  indicators/volumeProfile.js cálculo del perfil de volumen, POC y área de valor (con pruebas)
  indicators/volumeProfilePrimitive.js dibujo del perfil a la izquierda del gráfico
  indicators/layer.js      dibuja los indicadores sobre el gráfico
  hooks/useLocalStorage.js estado que se guarda en el navegador
  format.js                formato de precios y porcentajes
  App.jsx                  arma la pantalla
```

## Próximos pasos

- Grabar el mapa de calor en un servidor para tener historia aunque la página esté cerrada.
- Más indicadores: VWAP, Estocástico, ATR, Ichimoku.
- Alertas que avisen con la página cerrada (servidor + Telegram).
- Más herramientas de dibujo: abanico de Gann, zonas de tiempo de Fibonacci.

Los datos son de Binance y Yahoo Finanzas y pueden tener demoras. No es asesoramiento financiero.
