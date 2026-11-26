import { DRAW_COLORS, TOOLS } from '../drawings/tools';
import { Icon } from './DrawingToolbar';

// Barra flotante para editar el dibujo seleccionado: color, grosor, tipo de línea, texto y borrar.
export default function DrawingEditBar({ drawing, onUpdate, onDelete }) {
  const { style } = drawing;
  const setStyle = (patch) => onUpdate({ style: { ...style, ...patch } });
  const isText = drawing.type === 'text';

  return (
    <div className="draw-edit" role="toolbar" aria-label={`Editar ${TOOLS[drawing.type].name}`}>
      <span className="draw-edit-name">{TOOLS[drawing.type].name}</span>

      <div className="draw-colors">
        {DRAW_COLORS.map((c) => (
          <button
            key={c}
            className={`dot ${style.color === c ? 'active' : ''}`}
            style={{ background: c }}
            onClick={() => setStyle({ color: c })}
            aria-label={`Color ${c}`}
            title={c}
          />
        ))}
        <label className="dot custom" title="Otro color" style={{ background: DRAW_COLORS.includes(style.color) ? undefined : style.color }}>
          <input type="color" value={style.color} onChange={(e) => setStyle({ color: e.target.value })} aria-label="Elegir otro color" />
        </label>
      </div>

      <select value={style.width} onChange={(e) => setStyle({ width: Number(e.target.value) })} aria-label={isText ? 'Tamaño' : 'Grosor'} title={isText ? 'Tamaño' : 'Grosor'}>
        {[1, 2, 3, 4].map((w) => (
          <option key={w} value={w}>
            {isText ? `Tamaño ${w}` : `${w} px`}
          </option>
        ))}
      </select>

      {!isText && (
        <select value={style.lineStyle} onChange={(e) => setStyle({ lineStyle: e.target.value })} aria-label="Tipo de línea" title="Tipo de línea">
          <option value="solid">Continua</option>
          <option value="dashed">Guiones</option>
          <option value="dotted">Puntos</option>
        </select>
      )}

      {isText && (
        <input className="draw-text" value={drawing.text || ''} onChange={(e) => onUpdate({ text: e.target.value })} placeholder="Escribí el texto" aria-label="Texto" autoFocus />
      )}

      <button className="draw-delete" onClick={onDelete} title="Borrar (Supr)" aria-label="Borrar dibujo">
        <Icon name="trash" />
      </button>
    </div>
  );
}
