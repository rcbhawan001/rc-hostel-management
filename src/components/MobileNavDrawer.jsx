import { NavLink } from "react-router-dom";

export function MobileNavDrawer({ open, title, links, onClose }) {
  if (!open) return null;

  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title || "Menu"}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="drawer-header">
          <strong>{title || "Menu"}</strong>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>
        <nav className="drawer-links">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => `drawer-link ${isActive ? "active" : ""}`}
              onClick={onClose}
            >
              <span>{link.label}</span>
              {link.badge ? <span className="drawer-badge">{link.badge}</span> : null}
            </NavLink>
          ))}
        </nav>
      </aside>
    </div>
  );
}

