# Cripto Terminal

Terminal de trading cripto hecha con **React**, **Vite** y **Lightweight Charts**.
Muestra gráficos de velas en vivo con datos públicos de Binance (sin cuentas ni claves).

## Qué hace

- Gráfico de velas con volumen, actualizado en tiempo real por WebSocket.
- Buscador de pares contra USDT (BTC, ETH, SOL…), navegable con el teclado.
- Temporalidades: 1m, 5m, 15m, 1h, 4h, 1D y 1S.
- Lista de seguimiento con precio y variación de 24 h en vivo.
- Recuerda el símbolo, la temporalidad y la lista en el navegador.
- Se adapta al celular.

## Correrlo en tu compu

Necesitás Node.js 18 o más nuevo.

```bash
npm install
npm run dev
```

Abrí la dirección que aparece (normalmente http://localhost:5173).

## Publicarlo en GitHub Pages

1. Subí el proyecto a un repositorio de GitHub (rama `main`).
2. En el repositorio: **Settings → Pages → Source: GitHub Actions**.
3. Cada vez que subas cambios, se publica solo en `https://TU-USUARIO.github.io/cripto-terminal/`.

## Estructura

```
src/
  api/binance.js           pedidos REST y WebSocket a Binance
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

Los datos son de Binance y pueden tener demoras. No es asesoramiento financiero.
