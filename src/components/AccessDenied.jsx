import { NavLink } from "react-router-dom";

/**
 * Shown when a signed-in user opens a portal route they are not allowed to use.
 */
export function AccessDenied({ title, description, backTo, backLabel }) {
  return (
    <div className="empty-state access-denied-panel">
      <h3>{title}</h3>
      <p className="plain-empty access-denied-panel__desc">{description}</p>
      <NavLink to={backTo} className="button button-primary">
        {backLabel}
      </NavLink>
    </div>
  );
}
