/** Local calendar month `YYYY-MM`. */
export function currentMonthKeyLocal() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

/** Month key from an ISO date string or timestamp. */
export function recordMonthKey(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || !Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
