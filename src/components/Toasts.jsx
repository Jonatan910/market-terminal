import { useEffect } from 'react';

// Carteles que aparecen abajo a la derecha cuando se dispara una alerta.
// Se cierran solos a los 15 segundos o con la ×.
export default function Toasts({ items, onClose, onGoTo }) {
  return (
    <div className="toasts" aria-live="assertive">
      {items.map((t) => (
        <Toast key={t.id} t={t} onClose={onClose} onGoTo={onGoTo} />
      ))}
    </div>
  );
}

function Toast({ t, onClose, onGoTo }) {
  useEffect(() => {
    const id = setTimeout(() => onClose(t.id), 15000);
    return () => clearTimeout(id);
  }, [t.id, onClose]);

  return (
    <div className="toast" role="alert">
      <div className="toast-icon" aria-hidden="true">
        🔔
      </div>
      <div className="toast-body">
        <strong>{t.title}</strong>
        <span>{t.body}</span>
        {t.symbol && (
          <button className="link" onClick={() => (onGoTo(t.symbol), onClose(t.id))}>
            Ver gráfico
          </button>
        )}
      </div>
      <button className="toast-close" onClick={() => onClose(t.id)} aria-label="Cerrar">
        ×
      </button>
    </div>
  );
}
