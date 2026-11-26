import { useEffect, useRef, useState } from 'react';
import { INDICATORS, instanceLabel, newInstance } from '../indicators/catalog';

// Botón "Indicadores" + panel desplegable para agregar, configurar y quitar indicadores.
export default function IndicatorsPanel({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  // Cerrar al hacer clic afuera o con Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => !boxRef.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const add = (type) => onChange([...value, newInstance(type, value)]);
  const remove = (uid) => onChange(value.filter((i) => i.uid !== uid));
  const update = (uid, patch) => onChange(value.map((i) => (i.uid === uid ? { ...i, ...patch } : i)));

  return (
    <div className="ind-panel" ref={boxRef}>
      <button className={`ind-toggle ${open ? 'active' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span aria-hidden="true">ƒx</span> Indicadores{value.length > 0 && <span className="count">{value.length}</span>}
      </button>

      {open && (
        <div className="ind-dropdown" role="dialog" aria-label="Indicadores">
          <h3>Agregar</h3>
          <div className="ind-add">
            {Object.entries(INDICATORS).map(([type, def]) => (
              <button key={type} onClick={() => add(type)} title={def.name}>
                <strong>{def.short}</strong>
                <span className="muted">{def.name}</span>
              </button>
            ))}
          </div>

          <h3>En el gráfico</h3>
          {!value.length && <p className="muted empty">Todavía no agregaste indicadores.</p>}
          <ul className="ind-active">
            {value.map((inst) => {
              const def = INDICATORS[inst.type];
              return (
                <li key={inst.uid}>
                  <div className="ind-head">
                    <label className="swatch" style={{ background: inst.color }} title="Cambiar color">
                      <input type="color" value={inst.color} onChange={(e) => update(inst.uid, { color: e.target.value })} aria-label={`Color de ${instanceLabel(inst)}`} />
                    </label>
                    <strong>{instanceLabel(inst)}</strong>
                    <button className="remove" onClick={() => remove(inst.uid)} aria-label={`Quitar ${instanceLabel(inst)}`} title="Quitar">
                      ×
                    </button>
                  </div>
                  <div className="ind-params">
                    {def.params.map((p) => (
                      <label key={p.key}>
                        {p.label}
                        <NumberInput
                          value={inst.params[p.key]}
                          min={p.min}
                          max={p.max}
                          step={p.step || 1}
                          onCommit={(n) => update(inst.uid, { params: { ...inst.params, [p.key]: n } })}
                        />
                      </label>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// Campo numérico que solo aplica el valor cuando es válido (no rompe el gráfico mientras escribís).
function NumberInput({ value, min, max, step, onCommit }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  function commit(raw) {
    const n = Number(raw);
    if (raw === '' || Number.isNaN(n)) return;
    const clamped = Math.min(max, Math.max(min, step < 1 ? n : Math.round(n)));
    if (clamped !== value) onCommit(clamped);
  }

  return (
    <input
      type="number"
      inputMode="decimal"
      value={text}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== '' && n >= min && n <= max) commit(e.target.value);
      }}
      onBlur={() => {
        commit(text);
        setText(String(value));
      }}
    />
  );
}
