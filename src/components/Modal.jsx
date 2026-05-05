import { createPortal } from "react-dom";

export function Modal({ open, title, children, actions, onBackdropClick }) {
  if (!open) {
    return null;
  }

  const content = (
    <div className="modal-backdrop" onClick={onBackdropClick}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <h3>{title}</h3>
        <div className="modal-body">{children}</div>
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  );

  // Render at document root so we escape ancestors like `.main-shell { z-index: 1 }`, which traps
  // `position: fixed` overlays under `.topbar { z-index: 50 }`.
  if (typeof document !== "undefined" && document.body) {
    return createPortal(content, document.body);
  }

  return content;
}

