// Ayudas comunes para las funciones de /api (funcionan en Vercel y en el servidor de desarrollo).

export function query(req) {
  return Object.fromEntries(new URL(req.url, 'http://x').searchParams);
}

export function send(res, status, body, cacheSeconds = 0) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // Datos públicos: cualquier página puede leerlos (por ejemplo la versión en GitHub Pages).
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (cacheSeconds && status === 200) {
    // s-maxage: la red de Vercel guarda la respuesta unos segundos y responde sin llamar a Yahoo.
    res.setHeader('Cache-Control', `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 4}`);
  }
  res.end(JSON.stringify(body));
}

// Envuelve una función para que cualquier error responda JSON prolijo en vez de romperse.
export function handler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      send(res, e.status || 500, { error: e.message || 'Error interno' });
    }
  };
}
