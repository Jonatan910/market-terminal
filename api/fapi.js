// Plan B para los futuros de Binance: si el navegador no puede pedirlos directo
// (sin permiso CORS o bloqueo por país), los pide este servidor.
// Corre como "Edge Function": Vercel la ejecuta en la región más cercana a quien la usa
// (desde Argentina, São Paulo), donde Binance Futuros no está bloqueado.
export const config = { runtime: 'edge' };

// Solo se permiten estas rutas de datos públicos (no es un proxy abierto).
const ALLOWED = /^\/fapi\/v1\/(klines|depth|ticker\/24hr|exchangeInfo)(\?[\w=&%.-]*)?$/;

export default async function handler(req) {
  const path = new URL(req.url).searchParams.get('path') || '';
  if (!ALLOWED.test(path)) return json({ error: 'Ruta no permitida' }, 400);
  try {
    const res = await fetch(`https://fapi.binance.com${path}`, { headers: { Accept: 'application/json' } });
    return new Response(res.body, {
      status: res.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, s-maxage=2',
      },
    });
  } catch (e) {
    return json({ error: `No se pudo conectar con Binance Futuros (${e.message})` }, 502);
  }
}

const json = (body, status) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
