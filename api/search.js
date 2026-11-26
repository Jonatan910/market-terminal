// GET /api/search?q=apple  ->  [{ symbol, name, exchange, type }]  (solo acciones y ETF de EE.UU.)
import { search } from './_lib/yahoo.js';
import { handler, query, send } from './_lib/http.js';

export default handler(async (req, res) => {
  send(res, 200, await search(query(req).q), 300);
});
