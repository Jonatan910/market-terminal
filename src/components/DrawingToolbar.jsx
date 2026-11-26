import { useEffect, useRef, useState } from 'react';
import { TOOLS, TOOL_GROUPS } from '../drawings/tools';

// Íconos simples en SVG (24x24). Cada uno es una lista de trazos.
const dot = (x, y) => `M${x} ${y}m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0`;
const ICONS = {
  cursor: 'M5 3l14 8-6 1.5L10 19z',
  trend: `M5 19L19 5${dot(5, 19)}${dot(19, 5)}`,
  ray: `M5 18L21 6${dot(5, 18)}`,
  extended: `M2 20L22 4${dot(12, 12)}`,
  arrow: 'M5 19L19 5M19 5h-7M19 5v7',
  hline: `M2 12h20${dot(12, 12)}`,
  hray: `M6 12h16${dot(6, 12)}`,
  vline: `M12 2v20${dot(12, 12)}`,
  crossline: `M2 12h20M12 2v20`,
  channel: 'M3 15L17 5M7 19L21 9M5 17l14-10',
  fib: 'M3 4h18M3 9h18M3 13h18M3 17h18M3 21h18M5 21L19 4',
  rect: 'M4 6h16v12H4z',
  ellipse: 'M12 6c5 0 9 2.7 9 6s-4 6-9 6-9-2.7-9-6 4-6 9-6z',
  path: 'M3 18l5-7 5 4 5-8M18 7h-4M18 7v4',
  brush: 'M4 18c3 0 3-3 5-5s5-1 6-4 2-4 5-5M4 18c0 1.5 1 2 2 2',
  xabcd: 'M2 17L7 5l4 9 5-6 5 11M2 17l9-3M11 14l10 5',
  elliott: 'M2 18l4-8 3 4 5-11 3 7 5-4',
  elliottabc: 'M3 6l6 12 5-7 6 9',
  triangle: 'M2 5l4 14 4-11 4 8 4-5 4 3',
  long: 'M4 4h16v8H4zM4 12h16v6H4zM8 8l2-2 2 2',
  short: 'M4 6h16v6H4zM4 12h16v8H4zM8 15l2 2 2-2',
  range: 'M12 3v18M8 7l4-4 4 4M5 3h14M5 21h14',
  text: 'M5 5h14M12 5v14M9 19h6',
  magnet: 'M6 3v8a6 6 0 0 0 12 0V3h-4v8a2 2 0 0 1-4 0V3zM6 7h4M14 7h4',
  eye: `M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z${dot(12, 12)}`,
  eyeOff: 'M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.7M6.6 6.6C3.9 8.3 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 4.4-1.1',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  extLeft: 'M20 12H4M8 8l-4 4 4 4M20 6v12',
  extRight: 'M4 12h16M16 8l4 4-4 4M4 6v12',
};

export function Icon({ name, size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

// Barra de herramientas: cada grupo es un botón con la última herramienta usada
// y una flechita que abre el menú con todas las del grupo.
export default function DrawingToolbar({ tool, onTool, magnet, onMagnet, hidden, onHidden, count, onClear }) {
  const [current, setCurrent] = useState(() => Object.fromEntries(TOOL_GROUPS.map((g) => [g.id, g.tools[0]])));
  const [openGroup, setOpenGroup] = useState(null);
  const [menuTop, setMenuTop] = useState(null); // en el celular el menú va fijo debajo del botón
  const barRef = useRef(null);

  // Si se elige una herramienta, su grupo la recuerda como "la del botón".
  useEffect(() => {
    const g = TOOL_GROUPS.find((x) => x.tools.includes(tool));
    if (g) setCurrent((c) => (c[g.id] === tool ? c : { ...c, [g.id]: tool }));
  }, [tool]);

  // Cerrar el menú al hacer clic afuera o con Escape.
  useEffect(() => {
    if (!openGroup) return;
    const onDoc = (e) => !barRef.current?.contains(e.target) && setOpenGroup(null);
    const onKey = (e) => e.key === 'Escape' && setOpenGroup(null);
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [openGroup]);

  const choose = (id) => {
    onTool(tool === id ? 'cursor' : id);
    setOpenGroup(null);
  };

  return (
    <div className="draw-toolbar" role="toolbar" aria-label="Herramientas de dibujo" ref={barRef}>
      <div className="draw-group">
        <button className={tool === 'cursor' ? 'active' : ''} onClick={() => onTool('cursor')} title="Cursor (Esc)" aria-label="Cursor" aria-pressed={tool === 'cursor'}>
          <Icon name="cursor" />
        </button>
      </div>

      <div className="draw-group">
        {TOOL_GROUPS.map((g) => {
          const id = current[g.id];
          const many = g.tools.length > 1;
          return (
            <div className="draw-split" key={g.id}>
              <button className={g.tools.includes(tool) ? 'active' : ''} onClick={() => choose(id)} title={TOOLS[id].name} aria-label={TOOLS[id].name} aria-pressed={tool === id}>
                <Icon name={id} />
              </button>
              {many && (
                <button
                  className={`more ${openGroup === g.id ? 'open' : ''}`}
                  onClick={(e) => {
                    const r = e.currentTarget.parentElement.getBoundingClientRect();
                    setMenuTop(window.innerWidth <= 760 ? r.bottom + 6 : null);
                    setOpenGroup(openGroup === g.id ? null : g.id);
                  }}
                  aria-label={`Más herramientas: ${g.label}`}
                  aria-expanded={openGroup === g.id}
                  title={g.label}
                >
                  <svg viewBox="0 0 6 10" width="5" height="8" aria-hidden="true">
                    <path d="M1 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  </svg>
                </button>
              )}
              {openGroup === g.id && (
                <div className="draw-menu" role="menu" aria-label={g.label} style={menuTop != null ? { top: menuTop } : undefined}>
                  <div className="draw-menu-title">{g.label}</div>
                  {g.tools.map((t) => (
                    <button key={t} role="menuitem" className={tool === t ? 'active' : ''} onClick={() => choose(t)}>
                      <Icon name={t} />
                      <span>{TOOLS[t].name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="draw-group">
        <button className={magnet ? 'active' : ''} onClick={() => onMagnet(!magnet)} title="Imán: pegar a los precios de las velas" aria-label="Imán" aria-pressed={magnet}>
          <Icon name="magnet" />
        </button>
        <button className={hidden ? 'active' : ''} onClick={() => onHidden(!hidden)} title={hidden ? 'Mostrar dibujos' : 'Ocultar dibujos'} aria-label={hidden ? 'Mostrar dibujos' : 'Ocultar dibujos'} aria-pressed={hidden}>
          <Icon name={hidden ? 'eyeOff' : 'eye'} />
        </button>
        <button
          onClick={() => count && window.confirm(`¿Borrar los ${count} dibujos de este símbolo?`) && onClear()}
          disabled={!count}
          title="Borrar todos los dibujos de este símbolo"
          aria-label="Borrar todos los dibujos"
        >
          <Icon name="trash" />
        </button>
      </div>
    </div>
  );
}
