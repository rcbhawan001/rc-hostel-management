const legacyVerifiedPortion = (p) => {
  if (!p || p.proofStatus !== "verified") return 0;
  const total = Number(p.totalAmount || 0);
  const sub = Number(p.submittedAmount || 0);
  return Math.max(0, Math.min(total, sub));
};

/** Rupees admin has approved toward this invoice (cumulative; survives new proof uploads). */
export function verifiedPaidCredit(payment) {
  const p = payment || {};
  const total = Number(p.totalAmount || 0);
  const acc = Number(p.amountVerifiedTotal);
  if (Number.isFinite(acc) && acc >= 0) return Math.min(total, acc);
  return legacyVerifiedPortion(p);
}

/** Rupees still owed on one invoice. */
export function paymentOutstandingAmount(payment) {
  const p = payment || {};
  const total = Number(p.totalAmount || 0);
  const sub = Number(p.submittedAmount || 0);
  if (p.status === "paid") {
    if (p.proofStatus === "verified" && sub > 0 && sub < total && !Number.isFinite(Number(p.amountVerifiedTotal))) {
      return Math.max(0, total - sub);
    }
    return 0;
  }
  return Math.max(0, total - verifiedPaidCredit(p));
}

/** Amount student claimed in a proof that is still awaiting admin review. */
export function pendingSubmittedAmount(payment) {
  if (!payment || payment.proofStatus !== "pending-verification") return 0;
  return Math.max(0, Number(payment.submittedAmount || 0));
}

/** Tone key for `StatusPill` — proof queue before settlement labels. */
export function paymentInvoiceStatusKey(payment) {
  if (!payment) return "due";
  if (paymentOutstandingAmount(payment) <= 0) return "paid";
  if (payment.proofStatus === "pending-verification") return "pending-verification";
  if (payment.status === "paid") return "paid";
  if (payment.status === "partial") return "partial";
  if (payment.status === "overdue") return "overdue";
  return "due";
}

export function paymentInvoiceStatusLabel(payment) {
  if (!payment) return "";
  if (paymentOutstandingAmount(payment) <= 0) return "Fully paid";
  if (payment.proofStatus === "pending-verification") return "Verification pending";
  if (payment.status === "paid") return "Fully paid";
  if (payment.status === "partial") return "Partial paid";
  if (payment.status === "overdue") return "Overdue";
  return "Due";
}

export function proofStatusDisplayLabel(proofStatus) {
  switch (proofStatus) {
    case "pending-verification":
      return "Verification pending";
    case "verified":
      return "Proof verified";
    case "rejected":
      return "Proof rejected";
    case "not-submitted":
    default:
      return "No proof submitted";
  }
}

/** True if this row still has money owed (includes partial and legacy short-paid). */
export function paymentHasBalanceDue(payment) {
  return paymentOutstandingAmount(payment) > 0;
}

/** Stable `YYYY-MM` for filters (uses `monthKey` or derives from `dueDate`). */
export function paymentMonthKey(payment) {
  const p = payment || {};
  const mk = String(p.monthKey || "").trim();
  if (/^\d{4}-\d{2}$/.test(mk)) return mk;
  const due = p.dueDate ? new Date(p.dueDate) : null;
  if (!due || !Number.isFinite(due.getTime())) return "";
  return `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}`;
}

/** Reconstruct a payment-shaped object from an archived proof snapshot (read-only history row). */
export function paymentFromArchiveSnapshot(basePayment, archive) {
  const total = Number(archive.totalAmountSnapshot || 0);
  const av = Number(archive.amountVerifiedTotalSnapshot || 0);
  const sub = Number(archive.submittedAmount || 0);
  const verified = Math.min(total, Math.max(0, av));
  const outstanding = Math.max(0, total - verified);
  let status = "due";
  if (outstanding <= 0 && total > 0) status = "paid";
  else if (verified > 0 || sub > 0) status = "partial";
  return {
    ...basePayment,
    totalAmount: total,
    submittedAmount: sub,
    amountVerifiedTotal: av,
    paymentReference: String(archive.paymentReference || ""),
    paymentScreenshot: String(archive.paymentScreenshot || ""),
    paymentScreenshotName: String(archive.paymentScreenshotName || ""),
    proofStatus: String(archive.proofStatus || "not-submitted"),
    status,
    paidOn: outstanding <= 0 ? archive.verifiedAt || archive.archivedAt || null : null,
  };
}

/**
 * One invoice may show multiple history cards: each archived proof, then the live row.
 * Archives are oldest-first; current row is last.
 */
export function paymentHistoryCardRows(payment) {
  const base = payment || {};
  const archives = [...(base.proofArchives || [])].sort((a, b) =>
    String(a.archivedAt || "").localeCompare(String(b.archivedAt || "")),
  );
  const rows = archives.map((arch, idx) => ({
    key: `${base.invoiceId}-arch-${idx}-${String(arch.archivedAt || idx)}`,
    variant: "archive",
    archivedAt: arch.archivedAt || null,
    displayPayment: paymentFromArchiveSnapshot(base, arch),
  }));
  rows.push({
    key: `${base.invoiceId}-current`,
    variant: "current",
    archivedAt: null,
    displayPayment: base,
  });
  return rows;
}
