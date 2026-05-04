import { useEffect } from "react";

export function ToastHost({ toasts, onDismiss }) {
  useEffect(() => {
    if (!toasts.length) return undefined;

    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        onDismiss(toast.id);
      }, toast.timeoutMs ?? 3500),
    );

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [toasts, onDismiss]);

  if (!toasts.length) return null;

  return (
    <div className="toast-viewport" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone || "neutral"}`}>
          <div className="toast-copy">
            <strong>{toast.title}</strong>
            {toast.body ? <p>{toast.body}</p> : null}
          </div>
          <button
            type="button"
            className="toast-close"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

