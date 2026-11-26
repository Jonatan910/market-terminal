// GET /api/quotes?symbols=AAPL,MSFT,NVDA  ->  [{ symbol, price, change, open }]
import { cleanSymbol, quote, HttpError } from './_lib/yahoo.js';
import { handler, query, send } from './_lib/http.js';

export default handler(async (req, res) => {
  const list = String(query(req).symbols || '')
    .split(',')
    .filter(Boolean)
    .map(cleanSymbol);
  if (list.length > 30) throw new HttpError(400, 'Máximo 30 símbolos por pedido');
  // Todas a la vez; si alguna falla, las demás igual se devuelven.
  const results = await Promise.allSettled(list.map(quote));
  send(res, 200, results.filter((r) => r.status === 'fulfilled').map((r) => r.value), 10);
});
