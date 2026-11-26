import { DRAW_COLORS, TOOLS } from '../drawings/tools';
import { Icon } from './DrawingToolbar';

// Barra flotante para editar el dibujo seleccionado:
// color, grosor, tipo de línea, extender, texto, duplicar y borrar.
export default function DrawingEditBar({ drawing, onUpdate, onDuplicate, onDelete }) {
  const def = TOOLS[drawing.type];
  const { style } = drawing;
  const setStyle = (patch) => onUpdate({ style: { ...style, ...patch } });
  const isText = drawing.type === 'text';
  const fixedColors = drawing.type === 'long' || drawing.type === 'short' || drawing.type === 'range'; // usan verde/rojo
  const canExtend = def.options?.includes('extend') || drawing.type === 'fib';

  return (
    <div className="draw-edit" role="toolbar" aria-label={`Editar ${def.name}`}>
      <span className="draw-edit-name">{def.name}</span>

      {!fixedColors && (
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
      )}

      {!fixedColors && (
        <select value={style.width} onChange={(e) => setStyle({ width: Number(e.target.value) })} aria-label={isText ? 'Tamaño' : 'Grosor'} title={isText ? 'Tamaño' : 'Grosor'}>
          {[1, 2, 3, 4].map((w) => (
            <option key={w} value={w}>
              {isText ? `Tamaño ${w}` : `${w} px`}
            </option>
          ))}
        </select>
      )}

      {!isText && !fixedColors && (
        <select value={style.lineStyle} onChange={(e) => setStyle({ lineStyle: e.target.value })} aria-label="Tipo de línea" title="Tipo de línea">
          <option value="solid">Continua</option>
          <option value="dashed">Guiones</option>
          <option value="dotted">Puntos</option>
        </select>
      )}

      {canExtend && (
        <div className="draw-toggles">
          {drawing.type !== 'fib' && (
            <button className={style.extendLeft ? 'active' : ''} onClick={() => setStyle({ extendLeft: !style.extendLeft })} aria-pressed={!!style.extendLeft} title="Extender a la izquierda" aria-label="Extender a la izquierda">
              <Icon name="extLeft" size={16} />
            </button>
          )}
          <button className={style.extendRight ? 'active' : ''} onClick={() => setStyle({ extendRight: !style.extendRight })} aria-pressed={!!style.extendRight} title="Extender a la derecha" aria-label="Extender a la derecha">
            <Icon name="extRight" size={16} />
          </button>
        </div>
      )}

      {isText && (
        <input className="draw-text" value={drawing.text || ''} onChange={(e) => onUpdate({ text: e.target.value })} placeholder="Escribí el texto" aria-label="Texto" autoFocus />
      )}

      <button className="draw-action" onClick={onDuplicate} title="Duplicar (Ctrl+C y Ctrl+V, o Alt + arrastrar)" aria-label="Duplicar dibujo">
        <Icon name="copy" size={16} />
      </button>
      <button className="draw-action danger" onClick={onDelete} title="Borrar (Supr)" aria-label="Borrar dibujo">
        <Icon name="trash" size={16} />
      </button>
    </div>
  );
}
