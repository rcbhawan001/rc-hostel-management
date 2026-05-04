export function Modal({ open, title, children, actions, onBackdropClick }) {
  if (!open) {
    return null;
  }

  return (
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
}

