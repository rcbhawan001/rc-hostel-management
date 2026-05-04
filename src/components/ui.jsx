import { formatCurrency } from "../lib/formatters";

const toneMap = {
  paid: "success",
  approved: "success",
  resolved: "success",
  complete: "success",
  verified: "success",
  due: "warning",
  open: "warning",
  pending: "warning",
  "pending-verification": "warning",
  "not-submitted": "neutral",
  overdue: "danger",
  rejected: "danger",
  partial: "info",
  "in-progress": "info",
  maintenance: "info",
  discipline: "danger",
};

export function PageHeader({ eyebrow, title, body, meta }) {
  return (
    <div className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="lead-copy">{body}</p>
      </div>
      {meta ? <div className="page-header-meta">{meta}</div> : null}
    </div>
  );
}

export function StatCard({ label, value, helper, tone = "warm" }) {
  return (
    <article className={`stat-card stat-card-${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{helper}</span>
    </article>
  );
}

export function SectionCard({ eyebrow, title, action, className = "", children }) {
  return (
    <section className={`section-card ${className}`.trim()}>
      <header className="section-card-header">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
        </div>
        {action ? <div className="section-card-action">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function StatusPill({ status, children }) {
  const tone = toneMap[status] || "neutral";
  return <span className={`status-pill status-pill-${tone}`}>{children || status}</span>;
}

export function MetricRing({ label, value, subtext }) {
  return (
    <div className="metric-ring">
      <div className="metric-ring-visual" style={{ "--fill": `${Math.min(value, 100)}%` }}>
        <div>
          <strong>{value}%</strong>
          <span>occupied</span>
        </div>
      </div>
      <div className="metric-ring-copy">
        <h3>{label}</h3>
        <p>{subtext}</p>
      </div>
    </div>
  );
}

export function EmptyState({ title, body }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

export function MoneyLine({ label, value, emphasis = false }) {
  return (
    <div className={`money-line ${emphasis ? "money-line-strong" : ""}`}>
      <span>{label}</span>
      <strong>{formatCurrency(value)}</strong>
    </div>
  );
}
