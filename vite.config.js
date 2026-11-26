import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

// En Vercel, cada archivo de /api es una función del servidor.
// En tu compu (npm run dev / npm run preview) este plugin hace lo mismo,
// así podés probar todo sin publicar nada.
function localApi() {
  const middleware = async (req, res, next) => {
    const match = /^\/api\/([a-z-]+)(?:\?|$)/.exec(req.url);
    const file = match && path.resolve('api', `${match[1]}.js`);
    if (!file || !fs.existsSync(file)) return next();
    const mod = await import(`${pathToFileURL(file).href}?t=${fs.statSync(file).mtimeMs}`);
    return mod.default(req, res);
  };
  return {
    name: 'local-api',
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  };
}

// base: './' hace que la app funcione aunque se publique dentro de una subcarpeta.
export default defineConfig({
  plugins: [react(), localApi()],
  base: './',
});
