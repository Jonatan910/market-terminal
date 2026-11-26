import { useEffect, useRef, useState } from 'react';
import { CONDITIONS } from '../alerts/conditions';
import { askNotificationPermission, notificationsGranted, notificationsSupported, playChime, unlockAudio } from '../alerts/notify';
import { pairLabel, parseId } from '../api/market';
import { formatPrice } from '../format';

// Texto de una alerta: "BTC/USDT cruza hacia arriba 65.000,00"
export function alertText(a) {
  return `${pairLabel(a.symbol)} ${CONDITIONS[a.condition].label.toLowerCase()} ${formatPrice(a.price, parseId(a.symbol).market)}`;
}

const timeFmt = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Botón 🔔 Alertas + panel: crear, pausar, reactivar y borrar alertas, y ver el historial.
export default function AlertsPanel({ alerts, log, symbols, currentSymbol, getPrice, onCreate, onUpdate, onRemove, onClearLog, onGoTo }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [perm, setPerm] = useState(notificationsGranted() ? 'granted' : 'default');
  const boxRef = useRef(null);

  // Al abrir: formulario con el símbolo y el precio actuales.
  function newForm(symbol = currentSymbol) {
    const price = getPrice(symbol);
    setForm({ symbol, condition: 'crossing', price: price != null ? String(round(price, symbol)) : '', repeat: 'once', message: '' });
  }

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

  async function create(e) {
    e.preventDefault();
    const price = Number(String(form.price).replace(',', '.'));
    if (!Number.isFinite(price) || price <= 0) return;
    unlockAudio();
    onCreate({ symbol: form.symbol, condition: form.condition, price, repeat: form.repeat, message: form.message.trim() });
    newForm(form.symbol);
    if (notificationsSupported() && perm !== 'granted') setPerm(await askNotificationPermission());
  }

  const active = alerts.filter((a) => a.active);
  const inactive = alerts.filter((a) => !a.active);
  const options = [...new Set([currentSymbol, ...symbols])];

  return (
    <div className="alerts-panel" ref={boxRef}>
      <button
        className={`alerts-toggle ${open ? 'active' : ''}`}
        onClick={() => {
          if (!open) newForm();
          setOpen(!open);
        }}
        aria-expanded={open}
        title="Alertas de precio (Alt+A crea una en el precio del cursor)"
      >
        <span aria-hidden="true">🔔</span> Alertas{active.length > 0 && <span className="count">{active.length}</span>}
      </button>

      {open && form && (
        <div className="alerts-dropdown" role="dialog" aria-label="Alertas de precio">
          <h3>Nueva alerta</h3>
          <form className="alert-form" onSubmit={create}>
            <label>
              Símbolo
              <select value={form.symbol} onChange={(e) => newForm(e.target.value)}>
                {options.map((id) => (
                  <option key={id} value={id}>
                    {pairLabel(id)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Condición
              <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}>
                {Object.entries(CONDITIONS).map(([k, c]) => (
                  <option key={k} value={k}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Precio
              <input inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required aria-label="Precio de la alerta" />
            </label>
            <label>
              Se activa
              <select value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value })}>
                <option value="once">Una sola vez</option>
                <option value="every">Cada vez que se cumpla</option>
              </select>
            </label>
            <label className="wide">
              Mensaje (opcional)
              <input value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Ej.: posible entrada en soporte" maxLength={120} />
            </label>
            <button type="submit" className="primary wide">
              Crear alerta
            </button>
          </form>

          {notificationsSupported() && perm !== 'granted' && (
            <p className="alert-note">
              {perm === 'denied'
                ? 'Las notificaciones del sistema están bloqueadas para esta página: habilitalas en el candado de la barra de direcciones. Igual vas a ver el aviso y escuchar el sonido.'
                : 'Al crear la alerta, el navegador te va a pedir permiso para mostrar notificaciones: aceptalo para enterarte aunque estés en otra pestaña.'}
            </p>
          )}

          <h3>Activas ({active.length})</h3>
          {!active.length && <p className="muted empty">No hay alertas activas.</p>}
          <ul className="alert-list">
            {active.map((a) => (
              <AlertRow key={a.id} a={a} onUpdate={onUpdate} onRemove={onRemove} onGoTo={onGoTo} />
            ))}
          </ul>

          {inactive.length > 0 && (
            <>
              <h3>Disparadas o pausadas ({inactive.length})</h3>
              <ul className="alert-list">
                {inactive.map((a) => (
                  <AlertRow key={a.id} a={a} onUpdate={onUpdate} onRemove={onRemove} onGoTo={onGoTo} />
                ))}
              </ul>
            </>
          )}

          <div className="alert-log-head">
            <h3>Historial</h3>
            {log.length > 0 && (
              <button className="link" onClick={onClearLog}>
                Borrar
              </button>
            )}
          </div>
          {!log.length && <p className="muted empty">Todavía no se disparó ninguna alerta.</p>}
          <ul className="alert-log">
            {log.slice(0, 20).map((e) => (
              <li key={e.id}>
                <span className="muted">{timeFmt.format(e.at)}</span> {e.text} <strong>({formatPrice(e.price, parseId(e.symbol).market)})</strong>
                {e.message && <em> — {e.message}</em>}
              </li>
            ))}
          </ul>

          <p className="alert-note">
            Las alertas funcionan mientras esta página esté abierta (puede estar en otra pestaña o minimizada).{' '}
            <button
              type="button"
              className="link"
              onClick={() => {
                unlockAudio();
                playChime();
              }}
            >
              Probar sonido
            </button>
          </p>
        </div>
      )}
    </div>
  );
}

function AlertRow({ a, onUpdate, onRemove, onGoTo }) {
  return (
    <li className={a.active ? '' : 'off'}>
      <button className="alert-main" onClick={() => onGoTo(a.symbol)} title="Ver el gráfico">
        <span>{alertText(a)}</span>
        <span className="muted">
          {a.repeat === 'every' ? 'Cada vez' : 'Una vez'}
          {a.triggeredAt ? ` · disparada ${timeFmt.format(a.triggeredAt)}` : ''}
          {a.message ? ` · ${a.message}` : ''}
        </span>
      </button>
      <button className="icon" onClick={() => onUpdate(a.id, { active: !a.active })} title={a.active ? 'Pausar' : 'Reactivar'} aria-label={a.active ? 'Pausar alerta' : 'Reactivar alerta'}>
        {a.active ? '⏸' : '▶'}
      </button>
      <button className="icon danger" onClick={() => onRemove(a.id)} title="Borrar" aria-label="Borrar alerta">
        ×
      </button>
    </li>
  );
}

// Redondea el precio propuesto a los decimales del mercado (1.09730, 60.512,35…).
function round(price, symbol) {
  const market = parseId(symbol).market;
  const abs = Math.abs(price);
  const d = market === 'forex' ? (abs >= 10 ? 3 : 5) : abs >= 1000 ? 2 : abs >= 1 ? 3 : 6;
  return Number(price.toFixed(d));
}
