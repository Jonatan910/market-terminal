// GET /api/candles?symbol=AAPL&interval=1h  ->  { symbol, name, currency, exchange, bars: [...] }
import { candles, cleanSymbol } from './_lib/yahoo.js';
import { handler, query, send } from './_lib/http.js';

export default handler(async (req, res) => {
  const { symbol, interval = '1d' } = query(req);
  const data = await candles(cleanSymbol(symbol), interval);
  send(res, 200, data, interval === '1m' ? 10 : 30);
});
