import { useId } from "react";

/** Full-viewport loading scene — animation only; screen readers get a short status. */
export function LoaderScreen() {
  const rawId = useId().replace(/:/g, "");
  const gradId = `loader-grad-${rawId}`;

  return (
    <div className="loader-screen" role="status" aria-live="polite">
      <span className="visually-hidden">Loading</span>
      <div className="loader-screen__inner">
        <div className="loader-screen__glow" aria-hidden />
        <div className="loader-screen__mark" aria-hidden>
          <svg className="loader-screen__svg" viewBox="0 0 128 76" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#15803d" />
                <stop offset="100%" stopColor="#14532d" />
              </linearGradient>
            </defs>
            <path
              className="loader-screen__roof"
              pathLength="100"
              d="M6 60 L38 14 L64 38 L90 14 L122 60"
              fill="none"
              stroke={`url(#${gradId})`}
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="loader-screen__dots">
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Compact error + retry — only when something actually failed. */
export function LoaderErrorPanel({ message, onRetry }) {
  return (
    <div className="loader-error-panel" role="alert">
      <div className="loader-error-panel__icon" aria-hidden>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6" opacity="0.35" />
          <path
            d="M12 7v6M12 16h.01"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <p className="loader-error-panel__message">{message}</p>
      {onRetry ? (
        <button type="button" className="button button-primary" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
