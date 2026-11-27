// Dirección del servidor que graba Binance las 24 horas (Render).
// Vacía = el modo liquidez funciona solo con lo que graba mientras la página está abierta.
// También se puede definir al publicar con la variable VITE_RECORDER_URL.
export const RECORDER_URL = (import.meta.env?.VITE_RECORDER_URL || 'https://market-terminal-recorder.onrender.com').replace(/\/+$/, '');
