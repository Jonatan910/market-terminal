# Market Terminal

Terminal de mercados hecha con **React**, **Vite** y **Lightweight Charts**.
Muestra gráficos de velas en vivo con datos públicos, sin cuentas ni claves.

- **Cripto:** Binance, en vivo por WebSocket.
- **Acciones y ETF de EE.UU. (Nasdaq, NYSE):** Yahoo Finanzas a través de un servidor propio, se actualizan cada 15 s.

## Qué hace

- Gráfico de velas con volumen, actualizado en tiempo real por WebSocket.
- Buscador de cripto y acciones (BTC, AAPL, NVDA, QQQ…), navegable con el teclado.
- Temporalidades: 1m, 5m, 15m, 1h, 4h, 1D y 1S.
- Lista de seguimiento mixta: precio y variación (24 h en cripto, del día en acciones) y aviso de mercado cerrado.
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

## Publicarlo en Vercel (recomendado: página + servidor)

1. Entrá a https://vercel.com con tu cuenta de GitHub.
2. **Add New → Project**, elegí `market-terminal` y tocá **Deploy** (detecta Vite solo).
3. Queda en `https://market-terminal-XXXX.vercel.app`. Cada cambio en `main` se publica solo.

## Publicarlo en GitHub Pages (solo la página)

1. Subí el proyecto a un repositorio de GitHub (rama `main`).
2. En el repositorio: **Settings → Pages → Source: GitHub Actions**.
3. Para que las acciones funcionen, en **Settings → Secrets and variables → Actions → Variables** creá `API_URL` con la dirección de Vercel terminada en `/api`.
4. Cada vez que subas cambios, se publica solo en `https://TU-USUARIO.github.io/market-terminal/`.

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
  hooks/useLocalStorage.js estado que se guarda en el navegador
  format.js                formato de precios y porcentajes
  App.jsx                  arma la pantalla
.github/workflows/deploy.yml publicación automática en GitHub Pages
```

## Próximos pasos

- Indicadores: medias móviles, RSI, MACD, Bandas de Bollinger.
- Herramientas de dibujo y alertas de precio.

Los datos son de Binance y Yahoo Finanzas y pueden tener demoras. No es asesoramiento financiero.
