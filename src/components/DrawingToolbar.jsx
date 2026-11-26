import { TOOLS } from '../drawings/tools';

// Íconos simples en SVG (24x24). `d` = trazos.
const ICONS = {
  cursor: 'M5 3l14 8-6 1.5L10 19z',
  trend: 'M4 20L20 4M4 20m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M20 4m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  ray: 'M4 18L21 6M4 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  extended: 'M2 20L22 4M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  hline: 'M2 12h20M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  hray: 'M6 12h16M6 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  vline: 'M12 2v20M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  rect: 'M4 6h16v12H4z',
  fib: 'M3 4h18M3 9h18M3 13h18M3 17h18M3 21h18M5 21L19 4',
  range: 'M12 3v18M8 7l4-4 4 4M5 3h14M5 21h14',
  text: 'M5 5h14M12 5v14M9 19h6',
  magnet: 'M6 3v8a6 6 0 0 0 12 0V3h-4v8a2 2 0 0 1-4 0V3zM6 7h4M14 7h4',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  eyeOff: 'M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.7M6.6 6.6C3.9 8.3 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 4.4-1.1',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
};

export function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

// Grupos de herramientas, como en las plataformas de trading.
const GROUPS = [['cursor'], ['trend', 'ray', 'extended'], ['hline', 'hray', 'vline'], ['rect', 'fib', 'range'], ['text']];

export default function DrawingToolbar({ tool, onTool, magnet, onMagnet, hidden, onHidden, count, onClear }) {
  return (
    <div className="draw-toolbar" role="toolbar" aria-label="Herramientas de dibujo">
      {GROUPS.map((group, gi) => (
        <div className="draw-group" key={gi}>
          {group.map((id) => {
            const name = id === 'cursor' ? 'Cursor (Esc)' : TOOLS[id].name;
            return (
              <button key={id} className={tool === id ? 'active' : ''} onClick={() => onTool(tool === id ? 'cursor' : id)} title={name} aria-label={name} aria-pressed={tool === id}>
                <Icon name={id} />
              </button>
            );
          })}
        </div>
      ))}
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
