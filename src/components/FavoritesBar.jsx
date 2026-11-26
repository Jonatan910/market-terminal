import { useRef } from 'react';
import { TOOLS } from '../drawings/tools';
import { Icon } from './DrawingToolbar';

// Barra flotante con las herramientas favoritas. Se arrastra desde el agarre (⠿) y
// recuerda su posición. Las favoritas se eligen con la estrellita en los menús de herramientas.
export default function FavoritesBar({ favorites, tool, onTool, position, onMove }) {
  const barRef = useRef(null);

  function startDrag(ev) {
    ev.preventDefault();
    const bar = barRef.current;
    const area = bar.parentElement.getBoundingClientRect();
    const start = bar.getBoundingClientRect();
    const offX = ev.clientX - start.left;
    const offY = ev.clientY - start.top;
    const move = (e) => {
      // Que no se salga del gráfico.
      const x = Math.max(0, Math.min(e.clientX - offX - area.left, area.width - start.width));
      const y = Math.max(0, Math.min(e.clientY - offY - area.top, area.height - start.height));
      bar.style.left = `${x}px`;
      bar.style.top = `${y}px`;
      bar.style.bottom = 'auto';
    };
    const up = (e) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      move(e);
      onMove({ x: parseFloat(bar.style.left), y: parseFloat(bar.style.top) });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // Si la ventana se achicó y la posición guardada quedó afuera, vuelve a la posición inicial.
  const fits = position && position.x < window.innerWidth - 120 && position.y < window.innerHeight - 160;
  const style = fits ? { left: position.x, top: position.y, bottom: 'auto' } : undefined;
  const list = favorites.filter((id) => TOOLS[id]);

  return (
    <div className="fav-bar" ref={barRef} style={style} role="toolbar" aria-label="Herramientas favoritas">
      <button className="fav-grip" onPointerDown={startDrag} title="Arrastrar para mover la barra" aria-label="Mover la barra de favoritos">
        <svg viewBox="0 0 8 16" width="8" height="16" aria-hidden="true">
          {[3, 8, 13].map((y) => [2, 6].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.2" fill="currentColor" />))}
        </svg>
      </button>
      {list.map((id) => (
        <button key={id} className={tool === id ? 'active' : ''} onClick={() => onTool(tool === id ? 'cursor' : id)} title={TOOLS[id].name} aria-label={TOOLS[id].name} aria-pressed={tool === id}>
          <Icon name={id} />
        </button>
      ))}
      {!list.length && <span className="fav-empty">Marcá herramientas con ☆ en los menús de la izquierda</span>}
    </div>
  );
}
