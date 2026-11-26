// Condiciones de las alertas de precio. Funciones puras (se prueban en conditions.test.js).
//
// prev = precio anterior (null si es el primero que llega), curr = precio actual, level = precio de la alerta.
export const CONDITIONS = {
  crossing: {
    label: 'Cruza',
    // Pasó de un lado al otro del nivel (en cualquier dirección).
    check: (prev, curr, level) => prev != null && ((prev < level && curr >= level) || (prev > level && curr <= level)),
  },
  crossing_up: {
    label: 'Cruza hacia arriba',
    check: (prev, curr, level) => prev != null && prev < level && curr >= level,
  },
  crossing_down: {
    label: 'Cruza hacia abajo',
    check: (prev, curr, level) => prev != null && prev > level && curr <= level,
  },
  above: {
    label: 'Mayor que',
    // Se dispara al quedar por encima (también enseguida si ya lo estaba al crearla).
    // Para volver a dispararse tiene que bajar y subir otra vez.
    check: (prev, curr, level) => curr > level && (prev == null || prev <= level),
  },
  below: {
    label: 'Menor que',
    check: (prev, curr, level) => curr < level && (prev == null || prev >= level),
  },
};

export function shouldTrigger(alert, prev, curr) {
  const c = CONDITIONS[alert.condition];
  return Boolean(alert.active && c && Number.isFinite(curr) && c.check(prev, curr, alert.price));
}
