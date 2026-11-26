import { useEffect, useState } from 'react';

// Como useState, pero recuerda el valor en el navegador entre visitas.
// try/catch porque en modo incógnito o con el almacenamiento bloqueado puede fallar.
export function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved !== null ? JSON.parse(saved) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* sin almacenamiento: la app sigue funcionando, solo no recuerda */
    }
  }, [key, value]);

  return [value, setValue];
}
