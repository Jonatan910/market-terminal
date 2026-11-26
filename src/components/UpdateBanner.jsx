import { useEffect, useState } from 'react';

const CHECK_EVERY_MS = 3 * 60 * 1000; // cada 3 minutos (y cada vez que volvés a la pestaña)

// Avisa cuando se publicó una versión nueva de la app.
// Cada publicación genera un archivo de código con otro nombre (index-XXXX.js): si la página
// publicada ya no usa el mismo que tenemos cargado, hay versión nueva.
export default function UpdateBanner() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const current = document.querySelector('script[type="module"][src*="assets/index-"]')?.getAttribute('src');
    if (!current) return; // en desarrollo (npm run dev) no hay archivo con nombre fijo
    const name = current.split('/').pop();

    async function check() {
      if (document.hidden) return;
      try {
        const html = await (await fetch('./', { cache: 'no-store' })).text();
        if (html.includes('assets/index-') && !html.includes(name)) setAvailable(true);
      } catch {
        /* sin conexión: se vuelve a probar más tarde */
      }
    }

    const timer = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  if (!available) return null;
  return (
    <div className="update-banner" role="status">
      Hay una versión nueva de Market Terminal.
      <button onClick={() => window.location.reload()}>Actualizar</button>
      <button className="later" onClick={() => setAvailable(false)} aria-label="Más tarde">
        ×
      </button>
    </div>
  );
}
