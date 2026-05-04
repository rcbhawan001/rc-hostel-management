/** Compact badge text for nav / notification icons (common app pattern: cap at 99+). */
export function formatBadgeCount(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n > 99) return "99+";
  return String(n);
}
