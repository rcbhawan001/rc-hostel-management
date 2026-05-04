import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";

import { formatBadgeCount } from "../lib/formatBadgeCount.js";
import { formatCurrency, formatDate, formatShortDate } from "../lib/formatters";
import {
  paymentHasBalanceDue,
  paymentHistoryCardRows,
  paymentInvoiceStatusKey,
  paymentInvoiceStatusLabel,
  paymentMonthKey,
  paymentOutstandingAmount,
  pendingSubmittedAmount,
  proofStatusDisplayLabel,
  verifiedPaidCredit,
} from "../lib/paymentMath.js";
import { currentMonthKeyLocal, recordMonthKey } from "../lib/monthKey.js";
import { assertClientUploadSize, maxClientUploadLabel, MAX_CLIENT_UPLOAD_BYTES } from "../lib/uploadLimits.js";
import { MobileNavDrawer } from "./MobileNavDrawer";
import { PaymentDetailsCard } from "./PaymentDetailsCard";
import { EmptyState, MoneyLine, PageHeader, SectionCard, StatCard, StatusPill } from "./ui";

const studentPages = [
  { id: "dashboard", label: "Dashboard" },
  { id: "profile", label: "Profile" },
  { id: "payments", label: "Payments" },
  { id: "complaints", label: "Complaints" },
  { id: "leaves", label: "Leaves" },
  { id: "documents", label: "Documents" },
  { id: "notices", label: "Notices" },
];

const isValidSection = (section) => studentPages.some((page) => page.id === section);

function studentProfileInitials(name) {
  if (!name || typeof name !== "string") return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0] || "";
    const b = parts[parts.length - 1][0] || "";
    const pair = `${a}${b}`.toUpperCase();
    return pair || "?";
  }
  const slice = name.trim().slice(0, 2).toUpperCase();
  return slice || "?";
}

const maintenanceCategories = [
  { value: "electrical", label: "Electrical" },
  { value: "water", label: "Water" },
  { value: "repair", label: "Repair" },
  { value: "cleaning", label: "Cleaning" },
  { value: "wifi", label: "Wi-Fi" },
];

const disciplineCategories = [
  { value: "noise", label: "Noise" },
  { value: "misconduct", label: "Misconduct" },
  { value: "damage", label: "Damage" },
  { value: "rule-violation", label: "Rule violation" },
];

const defaultComplaintForm = {
  targetType: "maintenance",
  category: "electrical",
  title: "",
  description: "",
  againstStudentName: "",
};

const defaultLeaveForm = {
  fromDate: "",
  toDate: "",
  reason: "",
};

const defaultPaymentForm = {
  submittedAmount: "",
  paymentReference: "",
  paymentScreenshot: null,
  paymentScreenshotName: "",
  paymentNote: "",
};

const defaultDocumentForm = {
  label: "Aadhaar card",
  files: [],
};

// With VITE_API_URL (e.g. http://localhost:5000/api), strip /api for static files.
// Without it, Vite proxies /api and /uploads to :5000 — use same-origin relative /uploads/... URLs.
const mediaOrigin = String(import.meta.env.VITE_API_URL || "")
  .replace(/\/api\/?$/i, "")
  .trim();
const toMediaUrl = (path) => {
  if (!path) return "";
  if (/^https?:\/\//.test(path) || path.startsWith("data:")) return path;
  const prefix = mediaOrigin;
  return `${prefix}${path.startsWith("/") ? "" : "/"}${path}`;
};
const isImageFile = (fileNameOrPath) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(String(fileNameOrPath || ""));
const isLikelyImageUrl = (value) => /^https?:\/\//i.test(String(value || ""));

export function StudentPortal({
  data,
  activeStudent,
  onCreateComplaint,
  onCreateLeave,
  onSubmitPayment,
  paymentConfig,
  currentUser,
  onUploadDocument,
  onUploadProfilePhoto,
  busyMessage = "",
}) {
  const { section } = useParams();
  const navigate = useNavigate();
  const currentPage = isValidSection(section) ? section : "dashboard";
  const [complaintForm, setComplaintForm] = useState(defaultComplaintForm);
  const [leaveForm, setLeaveForm] = useState(defaultLeaveForm);
  const [paymentForm, setPaymentForm] = useState(defaultPaymentForm);
  const [documentForm, setDocumentForm] = useState(defaultDocumentForm);
  const [profilePhotoUploading, setProfilePhotoUploading] = useState(false);
  const profilePhotoInputRef = useRef(null);
  const [paymentHistoryMonth, setPaymentHistoryMonth] = useState(() => currentMonthKeyLocal());
  const [complaintHistoryMonth, setComplaintHistoryMonth] = useState(() => currentMonthKeyLocal());
  const [leaveHistoryMonth, setLeaveHistoryMonth] = useState(() => currentMonthKeyLocal());
  const [documentHistoryMonth, setDocumentHistoryMonth] = useState(() => currentMonthKeyLocal());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isSaving = Boolean(busyMessage);

  useEffect(() => {
    if (!isValidSection(section)) {
      navigate("/student/dashboard", { replace: true });
    }
  }, [section, navigate]);

  const studentNoticesSorted = useMemo(() => {
    const list = (data?.notices || []).filter((notice) => notice.audience !== "admins");
    return [...list].sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) {
        return a.pinned ? -1 : 1;
      }
      return new Date(b.publishedAt) - new Date(a.publishedAt);
    });
  }, [data?.notices]);

  const documentLabelOptions = data.meta?.requiredDocumentLabels || ["Aadhaar card", "Student ID"];
  const activeDocumentLabelSet = useMemo(
    () =>
      new Set(
        (activeStudent?.documents || [])
          .filter((document) => document.status !== "rejected")
          .map((document) => String(document.label || "").trim().toLowerCase())
          .filter(Boolean),
      ),
    [activeStudent?.documents],
  );
  const uploadableDocumentLabelOptions = useMemo(
    () =>
      documentLabelOptions.filter(
        (label) => !activeDocumentLabelSet.has(String(label || "").trim().toLowerCase()),
      ),
    [activeDocumentLabelSet, documentLabelOptions],
  );

  useEffect(() => {
    if (!uploadableDocumentLabelOptions.length) {
      if (documentForm.label) {
        setDocumentForm((current) => ({ ...current, label: "", files: [] }));
      }
      return;
    }
    if (!uploadableDocumentLabelOptions.includes(documentForm.label)) {
      setDocumentForm((current) => ({ ...current, label: uploadableDocumentLabelOptions[0], files: [] }));
    }
  }, [documentForm.label, uploadableDocumentLabelOptions]);

  if (!activeStudent) {
    return null;
  }

  const complaintCategories =
    complaintForm.targetType === "maintenance" ? maintenanceCategories : disciplineCategories;

  const studentPayments = data.payments.filter((payment) => payment.studentId === activeStudent.studentId);
  const filteredStudentPayments = studentPayments.filter(
    (payment) => paymentMonthKey(payment) === paymentHistoryMonth,
  );
  const paymentHistoryRows = filteredStudentPayments.flatMap((payment) =>
    paymentHistoryCardRows(payment).map((row) => ({ payment, ...row })),
  );
  const actionablePayment =
    studentPayments.find((p) => paymentHasBalanceDue(p)) ||
    studentPayments.find((p) => p.proofStatus === "pending-verification") ||
    null;
  const studentComplaints = data.complaints.filter(
    (complaint) => complaint.studentId === activeStudent.studentId,
  );
  const studentLeaves = data.leaveRequests.filter(
    (leaveRequest) => leaveRequest.studentId === activeStudent.studentId,
  );
  const studentComplaintsFiltered = studentComplaints.filter(
    (c) => recordMonthKey(c.createdAt) === complaintHistoryMonth,
  );
  const studentLeavesFiltered = studentLeaves.filter(
    (l) => recordMonthKey(l.createdAt) === leaveHistoryMonth,
  );
  const studentDocumentsFiltered = activeStudent.documents.filter(
    (d) => recordMonthKey(d.uploadedAt) === documentHistoryMonth,
  );
  const openComplaintsCount = studentComplaints.filter((c) => c.status !== "resolved").length;
  const pendingLeaveCount = studentLeaves.filter((l) => l.status === "pending").length;
  const pendingDocumentsCount = activeStudent.documents.filter((d) => d.status !== "approved").length;
  const pinnedNoticeCount = studentNoticesSorted.filter((n) => n.pinned).length;

  async function handleProfilePhotoChange(event) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file || !onUploadProfilePhoto) {
      return;
    }
    if (!assertClientUploadSize(file)) {
      window.alert(`Please choose an image under ${maxClientUploadLabel()}.`);
      return;
    }
    setProfilePhotoUploading(true);
    try {
      await onUploadProfilePhoto(file);
    } finally {
      setProfilePhotoUploading(false);
    }
  }

  async function handleComplaintSubmit(event) {
    event.preventDefault();
    const success = await onCreateComplaint(complaintForm);
    if (success) {
      setComplaintForm(defaultComplaintForm);
    }
  }

  async function handleLeaveSubmit(event) {
    event.preventDefault();
    const success = await onCreateLeave(leaveForm);
    if (success) {
      setLeaveForm(defaultLeaveForm);
    }
  }

  async function handlePaymentSubmit(payload) {
    if (!actionablePayment) {
      return false;
    }

    const paidDigits = String(payload.submittedAmount || "").replace(/\D/g, "");
    const paidNum = Number(paidDigits);
    if (!Number.isFinite(paidNum) || paidNum < 1) {
      return false;
    }

    const formData = new FormData();
    formData.append("submittedAmount", String(paidNum));
    formData.append("paymentReference", payload.paymentReference);
    formData.append("paymentNote", payload.paymentNote || "");
    if (payload.paymentScreenshot) {
      if (
        typeof File !== "undefined" &&
        payload.paymentScreenshot instanceof File &&
        !assertClientUploadSize(payload.paymentScreenshot)
      ) {
        window.alert(`Payment screenshot must be ${maxClientUploadLabel()} or smaller.`);
        return false;
      }
      formData.append("paymentScreenshot", payload.paymentScreenshot);
    }

    const success = await onSubmitPayment(actionablePayment.invoiceId, formData);
    if (success) {
      setPaymentForm(defaultPaymentForm);
    }
    return success;
  }

  async function handleDocumentSubmit(event) {
    event.preventDefault();
    if (!documentForm.label || !uploadableDocumentLabelOptions.includes(documentForm.label)) {
      window.alert("This document category is already submitted. You can upload it again only if admin rejects it.");
      return;
    }
    if (!documentForm.files?.length) {
      return;
    }

    const file = documentForm.files[0];
    if (!assertClientUploadSize(file)) {
      window.alert(`Each document must be ${maxClientUploadLabel()} or smaller. Remove oversized files and try again.`);
      return;
    }
    const formData = new FormData();
    formData.append("label", documentForm.label);
    formData.append("document", file);
    const success = await onUploadDocument(formData);
    if (success) {
      setDocumentForm(defaultDocumentForm);
    }
  }

  return (
    <div className="page-stack">
      <div className="portal-toprow">
        <div className="portal-toprow-title">{studentPages.find((p) => p.id === currentPage)?.label || "Student"}</div>
        <div className="portal-toprow-actions">
          <button
            type="button"
            className="mobile-menu-button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open student menu"
          >
            Menu
          </button>
          <div className="student-session-card">
            <span>{currentUser.email}</span>
            <strong>{currentUser.role}</strong>
          </div>
        </div>
      </div>

      <div className="portal-layout">
        <aside className="portal-sidebar">
          {studentPages.map((page) => {
            const counts = {
              payments: studentPayments.filter((payment) => paymentHasBalanceDue(payment)).length,
              complaints: studentComplaints.filter((complaint) => complaint.status !== "resolved").length,
              leaves: studentLeaves.filter((leave) => leave.status === "pending").length,
              documents: activeStudent.documents.filter((doc) => doc.status !== "approved").length,
              notices: studentNoticesSorted.length,
              dashboard: 0,
              profile: 0,
            };
            const badgeCount = counts[page.id] || 0;
            const badgeText = formatBadgeCount(badgeCount);

            return (
            <NavLink
              key={page.id}
              to={`/student/${page.id}`}
              className={({ isActive }) => `portal-sidebar-link ${isActive ? "active" : ""}`}
            >
              <span className="portal-sidebar-link-label">{page.label}</span>
              {badgeText ? <span className="nav-count-badge">{badgeText}</span> : null}
            </NavLink>
            );
          })}
        </aside>

        <div className="portal-content">
          {currentPage === "dashboard" ? (
            <div className="page-stack student-dashboard-page">
              {(() => {
                const dashPhoto = activeStudent.profilePhotoUrl ? toMediaUrl(activeStudent.profilePhotoUrl) : "";
  const dashShowPhoto = dashPhoto && (isImageFile(dashPhoto) || isLikelyImageUrl(dashPhoto));
                return (
                  <section className="student-dashboard-welcome" aria-label="Your account">
                    <div
                      className={`student-profile-avatar student-profile-avatar--dashboard${
                        dashShowPhoto ? " student-profile-avatar--photo" : ""
                      }`}
                    >
                      {dashShowPhoto ? (
                        <img src={dashPhoto} alt="" />
                      ) : (
                        <span className="student-profile-avatar-text">
                          {studentProfileInitials(activeStudent.name)}
                        </span>
                      )}
                    </div>
                    <div className="student-dashboard-welcome-copy">
                      <p className="student-dashboard-welcome-kicker">Welcome back</p>
                      <h2 className="student-dashboard-welcome-title">{activeStudent.name}</h2>
                      <p className="student-dashboard-welcome-meta plain-empty">
                        Room {activeStudent.roomNumber} · Bed {activeStudent.bedLabel} · {activeStudent.course}
                      </p>
                    </div>
                  </section>
                );
              })()}
              <div className="student-dashboard-stats" aria-label="Account summary">
                <StatCard
                  label="Balance due"
                  value={formatCurrency(activeStudent.balanceDue)}
                  helper={actionablePayment ? `Next due ${formatDate(actionablePayment.dueDate)}` : "No active invoice"}
                  tone="rose"
                />
                <StatCard
                  label="Documents"
                  value={activeStudent.documents.length}
                  helper={
                    pendingDocumentsCount
                      ? `${pendingDocumentsCount} not approved yet · ${activeStudent.documentStatus}`
                      : `All set · ${activeStudent.documentStatus}`
                  }
                  tone="warm"
                />
                <StatCard
                  label="Complaints"
                  value={openComplaintsCount}
                  helper={
                    studentComplaints.length
                      ? `${openComplaintsCount} open · ${studentComplaints.length} total filed`
                      : "None filed yet"
                  }
                  tone="ink"
                />
                <StatCard
                  label="Leaves"
                  value={pendingLeaveCount}
                  helper={
                    pendingLeaveCount
                      ? "Awaiting warden approval"
                      : studentLeaves.length
                        ? "No pending requests"
                        : "No requests yet"
                  }
                  tone="sage"
                />
              </div>

              <div className="student-dashboard-layout">
                <div className="student-dashboard-col">
                  <SectionCard eyebrow="Billing" title="Dues & payment">
                    {actionablePayment ? (
                      <div className="dues-snapshot">
                        <div className="dues-snapshot-top dues-snapshot-top--relaxed">
                          <div className="dues-snapshot-headline">
                            <p className="plain-empty dues-snapshot-month">{actionablePayment.monthLabel}</p>
                            <div className="dues-snapshot-badges">
                              <StatusPill status={paymentInvoiceStatusKey(actionablePayment)}>
                                {paymentInvoiceStatusLabel(actionablePayment)}
                              </StatusPill>
                              <StatusPill status={actionablePayment.proofStatus}>
                                {proofStatusDisplayLabel(actionablePayment.proofStatus)}
                              </StatusPill>
                            </div>
                          </div>
                          <div className="dues-snapshot-amounts">
                            <p className="plain-empty">Remaining to pay</p>
                            <strong className="dues-hero-remaining">
                              {formatCurrency(paymentOutstandingAmount(actionablePayment))}
                            </strong>
                            <p className="dues-hero-caption">
                              Bill total {formatCurrency(actionablePayment.totalAmount)} · Due{" "}
                              {formatDate(actionablePayment.dueDate)}
                            </p>
                          </div>
                        </div>

                        <div className="dues-pay-grid">
                          <div className="dues-pay-row">
                            <span>Total bill</span>
                            <strong>{formatCurrency(actionablePayment.totalAmount)}</strong>
                          </div>
                          {verifiedPaidCredit(actionablePayment) > 0 ? (
                            <div className="dues-pay-row">
                              <span>Verified paid</span>
                              <strong>{formatCurrency(verifiedPaidCredit(actionablePayment))}</strong>
                            </div>
                          ) : null}
                          {pendingSubmittedAmount(actionablePayment) > 0 ? (
                            <div className="dues-pay-row">
                              <span>Submitted (under review)</span>
                              <strong>{formatCurrency(pendingSubmittedAmount(actionablePayment))}</strong>
                            </div>
                          ) : null}
                          <div className="dues-pay-row">
                            <span>Remaining</span>
                            <strong>{formatCurrency(paymentOutstandingAmount(actionablePayment))}</strong>
                          </div>
                        </div>

                        {Number(actionablePayment.rentAmount || 0) > 0 ||
                        Number(actionablePayment.electricityAmount || 0) > 0 ||
                        Number(actionablePayment.fineAmount || 0) > 0 ||
                        Number(actionablePayment.lateFee || 0) > 0 ? (
                          <div className="payment-bill-breakdown payment-bill-breakdown--compact">
                            {Number(actionablePayment.rentAmount || 0) > 0 ? (
                              <div className="bill-line">
                                <span>Rent</span>
                                <strong>{formatCurrency(actionablePayment.rentAmount || 0)}</strong>
                              </div>
                            ) : null}
                            {Number(actionablePayment.electricityAmount || 0) > 0 ? (
                              <div className="bill-line">
                                <span>Electricity</span>
                                <strong>{formatCurrency(actionablePayment.electricityAmount || 0)}</strong>
                              </div>
                            ) : null}
                            {Number(actionablePayment.fineAmount || 0) > 0 ? (
                              <div className="bill-line">
                                <span>
                                  Fine{actionablePayment.fineReason ? ` (${actionablePayment.fineReason})` : ""}
                                </span>
                                <strong>{formatCurrency(actionablePayment.fineAmount || 0)}</strong>
                              </div>
                            ) : null}
                            {Number(actionablePayment.lateFee || 0) > 0 ? (
                              <div className="bill-line">
                                <span>Late fee</span>
                                <strong>{formatCurrency(actionablePayment.lateFee || 0)}</strong>
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        <div className="dues-snapshot-actions">
                          <button
                            type="button"
                            className="button button-primary"
                            onClick={() => navigate("/student/payments")}
                          >
                            Pay now
                          </button>
                          <button
                            type="button"
                            className="button button-secondary"
                            onClick={() => navigate("/student/payments")}
                          >
                            View history
                          </button>
                        </div>
                      </div>
                    ) : (
                      <EmptyState title="No current invoice" body="Your next dues will appear here." />
                    )}
                  </SectionCard>

                  <SectionCard eyebrow="Shortcuts" title="Quick actions">
                    <div className="student-dashboard-quick-actions">
                      <button
                        type="button"
                        className="student-dashboard-quick-action student-dashboard-quick-action--complaints"
                        onClick={() => navigate("/student/complaints")}
                      >
                        <span className="student-dashboard-quick-action-label">Raise complaint</span>
                        <span className="student-dashboard-quick-action-hint">Maintenance or discipline issues</span>
                      </button>
                      <button
                        type="button"
                        className="student-dashboard-quick-action student-dashboard-quick-action--leaves"
                        onClick={() => navigate("/student/leaves")}
                      >
                        <span className="student-dashboard-quick-action-label">Request leave</span>
                        <span className="student-dashboard-quick-action-hint">Submit dates for approval</span>
                      </button>
                      <button
                        type="button"
                        className="student-dashboard-quick-action student-dashboard-quick-action--documents"
                        onClick={() => navigate("/student/documents")}
                      >
                        <span className="student-dashboard-quick-action-label">Upload document</span>
                        <span className="student-dashboard-quick-action-hint">ID, Aadhaar, and verifications</span>
                      </button>
                      <button
                        type="button"
                        className="student-dashboard-quick-action student-dashboard-quick-action--notices"
                        onClick={() => navigate("/student/notices")}
                      >
                        <span className="student-dashboard-quick-action-label">Notice board</span>
                        <span className="student-dashboard-quick-action-hint">
                          {pinnedNoticeCount
                            ? `${pinnedNoticeCount} pinned · ${studentNoticesSorted.length} total`
                            : studentNoticesSorted.length
                              ? `${studentNoticesSorted.length} announcement${studentNoticesSorted.length === 1 ? "" : "s"}`
                              : "Hostel announcements"}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="student-dashboard-quick-action student-dashboard-quick-action--payments"
                        onClick={() => navigate("/student/payments")}
                      >
                        <span className="student-dashboard-quick-action-label">Payments</span>
                        <span className="student-dashboard-quick-action-hint">History and proof uploads</span>
                      </button>
                    </div>
                  </SectionCard>
                </div>

                <div className="student-dashboard-col">
                  <SectionCard
                    eyebrow="Updates"
                    title="Recent notices"
                    action={
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => navigate("/student/notices")}
                      >
                        View all
                      </button>
                    }
                  >
                    <div className="stack-list student-dashboard-notice-list">
                      {studentNoticesSorted.slice(0, 5).map((notice) => (
                        <article
                          key={notice.noticeId}
                          className={`mini-card student-dashboard-notice-card${notice.pinned ? " student-dashboard-notice-card--pinned" : ""}`}
                        >
                          <div className="mini-card-top student-dashboard-notice-card__head">
                            <h3 className="student-dashboard-notice-card__title">{notice.title}</h3>
                            {notice.pinned ? <StatusPill status="approved">Pinned</StatusPill> : null}
                          </div>
                          <p className="student-dashboard-notice-card__body">{notice.body}</p>
                          <footer className="student-dashboard-notice-card__footer">
                            <span className="student-dashboard-notice-card__date">{formatDate(notice.publishedAt)}</span>
                          </footer>
                        </article>
                      ))}
                      {!studentNoticesSorted.length ? (
                        <EmptyState title="No notices yet" body="When your hostel posts updates, they will appear here." />
                      ) : null}
                    </div>
                  </SectionCard>
                </div>
              </div>
            </div>
          ) : null}

          {currentPage === "profile" ? (
            <div className="student-profile-page">
              <section className="student-profile-hero" aria-labelledby="student-profile-heading">
                <div className="student-profile-hero-inner">
                  {(() => {
                    const profilePhotoSrc = activeStudent.profilePhotoUrl
                      ? toMediaUrl(activeStudent.profilePhotoUrl)
                      : "";
                    const profileHasPhoto =
                      profilePhotoSrc && (isImageFile(profilePhotoSrc) || isLikelyImageUrl(profilePhotoSrc));
                    const avatar = (
                      <div
                        className={`student-profile-avatar${profileHasPhoto ? " student-profile-avatar--photo" : ""}`}
                        aria-hidden="true"
                      >
                        {profileHasPhoto ? (
                          <img src={profilePhotoSrc} alt="" />
                        ) : (
                          <span className="student-profile-avatar-text">
                            {studentProfileInitials(activeStudent.name)}
                          </span>
                        )}
                      </div>
                    );
                    if (!onUploadProfilePhoto) {
                      return avatar;
                    }
                    const photoBusy = profilePhotoUploading || isSaving;
                    const photoAriaLabel = photoBusy
                      ? "Uploading profile photo, please wait"
                      : activeStudent.profilePhotoUrl
                        ? "Change profile photo"
                        : "Upload profile photo";
                    return (
                      <div className="student-profile-avatar-stack">
                        <input
                          ref={profilePhotoInputRef}
                          id="student-profile-photo-input"
                          type="file"
                          accept="image/*"
                          className="student-profile-photo-input-hidden"
                          tabIndex={-1}
                          onChange={handleProfilePhotoChange}
                          aria-hidden="true"
                        />
                        <div className="student-profile-avatar-wrap">
                          {avatar}
                          <button
                            type="button"
                            className={`student-profile-avatar-edit-btn${
                              photoBusy ? " student-profile-avatar-edit-btn--busy" : ""
                            }`}
                            disabled={photoBusy}
                            aria-busy={photoBusy || undefined}
                            aria-label={photoAriaLabel}
                            aria-describedby="student-profile-photo-hint"
                            onClick={() => profilePhotoInputRef.current?.click()}
                          >
                            {photoBusy ? (
                              <span className="student-profile-avatar-edit-spinner" aria-hidden="true" />
                            ) : (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path
                                  d="M4 7.5h2l1.2-2h9.6l1.2 2H20a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 19H4a1.5 1.5 0 0 1-1.5-1.5V9A1.5 1.5 0 0 1 4 7.5Z"
                                  stroke="currentColor"
                                  strokeWidth="1.75"
                                  strokeLinejoin="round"
                                />
                                <path
                                  d="M12 16a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z"
                                  stroke="currentColor"
                                  strokeWidth="1.75"
                                />
                              </svg>
                            )}
                          </button>
                        </div>
                        <span
                          id="student-profile-photo-hint"
                          className={`plain-empty student-profile-photo-hint${
                            photoBusy ? " student-profile-photo-hint--uploading" : ""
                          }`}
                        >
                          {photoBusy ? "Uploading photo..." : "Size up to 1 MB."}
                        </span>
                      </div>
                    );
                  })()}
                  <div className="student-profile-hero-copy">
                    <p className="student-profile-kicker">Your hostel profile</p>
                    <h1 id="student-profile-heading" className="student-profile-name">
                      {activeStudent.name}
                    </h1>
                    <p className="student-profile-id-line">
                      <span className="student-profile-id-pill">ID {activeStudent.studentId}</span>
                    </p>
                    <div className="student-profile-chip-row" role="list">
                      <span className="student-profile-chip student-profile-chip--lavender" role="listitem">
                        Room {activeStudent.roomNumber} · Bed {activeStudent.bedLabel}
                      </span>
                      <span className="student-profile-chip student-profile-chip--sea" role="listitem">
                        {activeStudent.course}
                      </span>
                      <span className="student-profile-chip student-profile-chip--apricot" role="listitem">
                        {activeStudent.yearLabel}
                      </span>
                    </div>
                    <div className="student-profile-doc-row">
                      <span className="student-profile-doc-label">Documents</span>
                      <StatusPill status={activeStudent.documentStatus}>{activeStudent.documentStatus}</StatusPill>
                    </div>
                  </div>
                </div>
              </section>

              <section className="student-profile-mosaic" aria-label="Profile details">
                <article className="student-profile-tile student-profile-tile--cyan">
                  <div className="student-profile-tile-head">
                    <span className="student-profile-tile-icon" aria-hidden="true">
                      ◎
                    </span>
                    <h2 className="student-profile-tile-title">Contact &amp; college</h2>
                  </div>
                  <dl className="student-profile-dl">
                    <div className="student-profile-field">
                      <dt>Phone</dt>
                      <dd>{activeStudent.phone}</dd>
                    </div>
                    <div className="student-profile-field">
                      <dt>Hometown</dt>
                      <dd>{activeStudent.hometown}</dd>
                    </div>
                    <div className="student-profile-field student-profile-field--wide">
                      <dt>College</dt>
                      <dd>{activeStudent.collegeName || activeStudent.collegeId || "—"}</dd>
                    </div>
                  </dl>
                </article>

                <article className="student-profile-tile student-profile-tile--magenta">
                  <div className="student-profile-tile-head">
                    <span className="student-profile-tile-icon" aria-hidden="true">
                      ✦
                    </span>
                    <h2 className="student-profile-tile-title">Family &amp; ID</h2>
                  </div>
                  <dl className="student-profile-dl">
                    <div className="student-profile-field">
                      <dt>Aadhaar</dt>
                      <dd>{activeStudent.aadhaarNumber || "—"}</dd>
                    </div>
                    <div className="student-profile-field">
                      <dt>Father</dt>
                      <dd>{activeStudent.fatherName || activeStudent.guardianName}</dd>
                    </div>
                    <div className="student-profile-field">
                      <dt>Father&apos;s phone</dt>
                      <dd>{activeStudent.fatherPhone || activeStudent.guardianPhone}</dd>
                    </div>
                    <div className="student-profile-field">
                      <dt>Local guardian</dt>
                      <dd>{activeStudent.localGuardianName || activeStudent.emergencyContactName}</dd>
                    </div>
                    <div className="student-profile-field">
                      <dt>Guardian phone</dt>
                      <dd>{activeStudent.localGuardianPhone || activeStudent.emergencyContactPhone}</dd>
                    </div>
                  </dl>
                </article>

                <article className="student-profile-tile student-profile-tile--amber">
                  <div className="student-profile-tile-head">
                    <span className="student-profile-tile-icon" aria-hidden="true">
                      ◆
                    </span>
                    <h2 className="student-profile-tile-title">Hostel account</h2>
                  </div>
                  <dl className="student-profile-dl student-profile-dl--compact">
                    <div className="student-profile-field">
                      <dt>Joined</dt>
                      <dd>{formatDate(activeStudent.joinedOn)}</dd>
                    </div>
                    <div className="student-profile-field">
                      <dt>Security deposit</dt>
                      <dd>{formatCurrency(activeStudent.securityDeposit)}</dd>
                    </div>
                    <div className="student-profile-field">
                      <dt>Monthly rent</dt>
                      <dd>{formatCurrency(activeStudent.monthlyRent)}</dd>
                    </div>
                    <div className="student-profile-field student-profile-field--pop">
                      <dt>Balance due</dt>
                      <dd>{formatCurrency(activeStudent.balanceDue)}</dd>
                    </div>
                  </dl>
                </article>

                <article className="student-profile-tile student-profile-tile--indigo student-profile-tile--wide">
                  <div className="student-profile-tile-head">
                    <span className="student-profile-tile-icon" aria-hidden="true">
                      ✧
                    </span>
                    <h2 className="student-profile-tile-title">Billing spotlight</h2>
                </div>
                  {actionablePayment ? (
                    <>
                      <p className="student-profile-spotlight-label">Current invoice · {actionablePayment.monthLabel}</p>
                      <div className="student-profile-invoice-card">
                        <div className="dues-pay-grid dues-pay-grid--tight">
                          <div className="dues-pay-row">
                            <span>Total bill</span>
                            <strong>{formatCurrency(actionablePayment.totalAmount)}</strong>
                    </div>
                          {verifiedPaidCredit(actionablePayment) > 0 ? (
                            <div className="dues-pay-row">
                              <span>Verified paid</span>
                              <strong>{formatCurrency(verifiedPaidCredit(actionablePayment))}</strong>
                  </div>
                  ) : null}
                          {pendingSubmittedAmount(actionablePayment) > 0 ? (
                            <div className="dues-pay-row">
                              <span>Under review</span>
                              <strong>{formatCurrency(pendingSubmittedAmount(actionablePayment))}</strong>
                </div>
                          ) : null}
                          <div className="dues-pay-row">
                            <span>Remaining</span>
                            <strong>{formatCurrency(paymentOutstandingAmount(actionablePayment))}</strong>
              </div>
                        </div>
                        <p className="student-profile-invoice-badges">
                          <StatusPill status={paymentInvoiceStatusKey(actionablePayment)}>
                            {paymentInvoiceStatusLabel(actionablePayment)}
                          </StatusPill>{" "}
                          <StatusPill status={actionablePayment.proofStatus}>
                            {proofStatusDisplayLabel(actionablePayment.proofStatus)}
                          </StatusPill>
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="student-profile-spotlight-empty">
                      <p className="student-profile-spotlight-empty-title">All clear on dues</p>
                      <p className="student-profile-spotlight-empty-body">
                        No open invoice right now. When a new bill is issued, a colorful summary will land here.
                      </p>
                    </div>
                  )}
                  <div className="student-profile-actions">
                    <button type="button" className="button button-primary" onClick={() => navigate("/student/payments")}>
                      Open payments
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => navigate("/student/documents")}
                    >
                      Documents
                    </button>
                  </div>
                </article>
              </section>
            </div>
          ) : null}

          {currentPage === "payments" ? (
            <div className="student-payments-page">
              <header className="student-payments-header">
                <p className="student-payments-eyebrow">Payments</p>
                <h2 className="student-payments-title">Pay your dues</h2>
                <p className="student-payments-lead">
                  Scan the QR code or use bank details, then submit your reference and screenshot for admin verification.
                </p>
              </header>
              <div className="student-payments-layout">
                <div className="student-payments-primary">
                  {actionablePayment ? (
              <PaymentDetailsCard
                paymentConfig={paymentConfig}
                payment={actionablePayment}
                paymentForm={paymentForm}
                setPaymentForm={setPaymentForm}
                onSubmit={handlePaymentSubmit}
                      busy={isSaving}
                    />
                  ) : (
                    <div className="payment-workspace payment-workspace--empty">
                      <header className="payment-workspace-header">
                        <p className="payment-workspace-eyebrow">Current invoice</p>
                        <h2 className="payment-workspace-title">No open invoice</h2>
                      </header>
                      <div className="payment-workspace-body">
                        <EmptyState
                          title="You are all caught up"
                          body="There is no invoice with an amount due right now. New monthly bills will appear here when issued."
                        />
                      </div>
                    </div>
                  )}
                </div>
                <aside className="student-payments-sidebar">
                  <div className="student-payments-panel">
                    <header className="student-payments-panel-head">
                      <h3 className="student-payments-panel-title">Payment history</h3>
                      <p className="student-payments-panel-sub">Receipts and proof status by billing month.</p>
                    </header>
                    <div className="student-payments-panel-filters">
                      <label className="student-payments-month-field">
                        <span className="student-payments-month-label">Month</span>
                    <input
                          type="month"
                          className="student-payments-month-input"
                          value={paymentHistoryMonth}
                          onChange={(event) => setPaymentHistoryMonth(event.target.value)}
                    />
                  </label>
                      <p className="payment-history-filter-hint student-payments-filter-hint">
                        Change the month to view another billing period.
                      </p>
                </div>
                    <div className="stack-list student-payments-history-list">
                      {paymentHistoryRows.length ? (
                        paymentHistoryRows.map(({ payment, key, variant, archivedAt, displayPayment }) => (
                          <article key={key} className="mini-card mini-card--payment-history student-history-card">
                            <div className="mini-card-top mini-card-top--payment-history">
                              <h3 className="payment-history-month">
                                {payment.monthLabel}
                                {variant === "archive" ? (
                                  <span className="payment-history-row-tag">
                                    Earlier proof
                                    {archivedAt ? ` · ${formatShortDate(archivedAt)}` : ""}
                                  </span>
                                ) : null}
                              </h3>
                              <div className="payment-history-badges">
                                <StatusPill status={paymentInvoiceStatusKey(displayPayment)}>
                                  {paymentInvoiceStatusLabel(displayPayment)}
                                </StatusPill>
                                <StatusPill status={displayPayment.proofStatus}>
                                  {proofStatusDisplayLabel(displayPayment.proofStatus)}
                                </StatusPill>
                      </div>
                            </div>
                            <div className="dues-pay-grid dues-pay-grid--tight">
                              <div className="dues-pay-row">
                                <span>Total bill</span>
                                <strong>{formatCurrency(displayPayment.totalAmount)}</strong>
                              </div>
                              {verifiedPaidCredit(displayPayment) > 0 ? (
                                <div className="dues-pay-row">
                                  <span>Verified paid</span>
                                  <strong>{formatCurrency(verifiedPaidCredit(displayPayment))}</strong>
                                </div>
                      ) : null}
                              {pendingSubmittedAmount(displayPayment) > 0 ? (
                                <div className="dues-pay-row">
                                  <span>Under review</span>
                                  <strong>{formatCurrency(pendingSubmittedAmount(displayPayment))}</strong>
                      </div>
                              ) : null}
                              <div className="dues-pay-row">
                                <span>Remaining</span>
                                <strong>{formatCurrency(paymentOutstandingAmount(displayPayment))}</strong>
                        </div>
                            </div>
                            {variant === "current" && Number(payment.fineAmount || 0) ? (
                              <p className="payment-history-note">
                                Fine {formatCurrency(payment.fineAmount)}
                                {payment.fineReason ? ` · ${payment.fineReason}` : ""}
                              </p>
                            ) : null}
                            {displayPayment.paymentReference ? (
                              <p className="payment-ref-line">
                                <span className="payment-ref-label">Ref</span>{" "}
                                <span className="payment-ref-value">{displayPayment.paymentReference}</span>
                              </p>
                            ) : null}
                            {displayPayment.paymentScreenshot ? (
                              <button
                                type="button"
                                className="payment-proof-thumb"
                                onClick={() =>
                                  window.open(toMediaUrl(displayPayment.paymentScreenshot), "_blank", "noopener,noreferrer")
                                }
                                aria-label={`View ${payment.monthLabel} payment proof`}
                              >
                                <img
                                  src={toMediaUrl(displayPayment.paymentScreenshot)}
                                  alt={`${payment.monthLabel} payment proof`}
                                />
                                <span className="payment-proof-thumb-label">View proof</span>
                              </button>
                      ) : null}
                    </article>
                        ))
                      ) : (
                        <EmptyState
                          title="No receipts in this range"
                          body="Pick a different month if you expected to see invoices here."
                        />
                      )}
                </div>
                  </div>
                </aside>
              </div>
            </div>
          ) : null}

          {currentPage === "complaints" ? (
            <div className="student-complaints-page">
              <header className="student-complaints-header">
                <p className="student-complaints-eyebrow">Complaints</p>
                <h2 className="student-complaints-title">Report an issue</h2>
                <p className="student-complaints-lead">
                  Maintenance and discipline issues go to the warden desk. Add a clear title and details so staff can act
                  quickly.
                </p>
              </header>
              <div className="student-complaints-layout">
                <div className="student-complaints-primary">
                  <div className="complaints-workspace">
                    <header className="complaints-workspace-header">
                      <p className="complaints-workspace-eyebrow">New complaint</p>
                      <h3 className="complaints-workspace-title">Raise a hostel issue</h3>
                    </header>
                    <div className="complaints-workspace-body">
                <form className="form-grid" onSubmit={handleComplaintSubmit}>
                  <label>
                    Complaint type
                    <select
                      value={complaintForm.targetType}
                      onChange={(event) =>
                        setComplaintForm((current) => ({
                          ...current,
                          targetType: event.target.value,
                          category: event.target.value === "maintenance" ? "electrical" : "noise",
                        }))
                      }
                    >
                      <option value="maintenance">Maintenance issue</option>
                      <option value="discipline">Complaint against student</option>
                    </select>
                  </label>
                  <label>
                    Category
                    <select
                      value={complaintForm.category}
                      onChange={(event) =>
                        setComplaintForm((current) => ({
                          ...current,
                          category: event.target.value,
                        }))
                      }
                    >
                      {complaintCategories.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {complaintForm.targetType === "discipline" ? (
                    <label className="field-span-2">
                      Student name (if known)
                      <input
                        type="text"
                        value={complaintForm.againstStudentName}
                        onChange={(event) =>
                          setComplaintForm((current) => ({
                            ...current,
                            againstStudentName: event.target.value,
                          }))
                        }
                        placeholder="Name or room number"
                      />
                    </label>
                  ) : null}
                  <label className="field-span-2">
                    Title
                    <input
                      type="text"
                      value={complaintForm.title}
                      onChange={(event) =>
                        setComplaintForm((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="field-span-2">
                    Details
                    <textarea
                      rows="4"
                      value={complaintForm.description}
                      onChange={(event) =>
                        setComplaintForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                          &nbsp;
                          <span />
                  </label>
                  <div className="form-actions">
                          <button type="submit" className="button button-primary" disabled={isSaving}>
                            {isSaving ? "Please wait…" : "Submit complaint"}
                    </button>
                  </div>
                </form>
                    </div>
                  </div>
                </div>
                <aside className="student-complaints-sidebar">
                  <div className="student-complaints-panel">
                    <header className="student-complaints-panel-head">
                      <h3 className="student-complaints-panel-title">Your complaints</h3>
                      <p className="student-complaints-panel-sub">Status and admin replies by month.</p>
                    </header>
                    <div className="student-complaints-panel-filters">
                      <label className="student-complaints-month-field">
                        <span className="student-complaints-month-label">Month</span>
                        <input
                          type="month"
                          className="student-complaints-month-input"
                          value={complaintHistoryMonth}
                          onChange={(event) => setComplaintHistoryMonth(event.target.value)}
                        />
                      </label>
                    </div>
                    <div className="stack-list student-complaints-history-list">
                      {studentComplaintsFiltered.length ? (
                        studentComplaintsFiltered.map((complaint) => (
                          <article key={complaint.complaintId} className="mini-card student-complaint-history-card">
                        <div className="mini-card-top">
                          <h3>{complaint.title}</h3>
                          <StatusPill status={complaint.status}>{complaint.status}</StatusPill>
                        </div>
                        <p>{complaint.description}</p>
                            {complaint.adminNote ? (
                              <p className="issue-note">Admin note: {complaint.adminNote}</p>
                            ) : null}
                        <span>
                              {formatShortDate(complaint.createdAt)} · {complaint.category}
                        </span>
                      </article>
                    ))
                  ) : (
                    <EmptyState title="No complaints yet" body="Submit your first complaint from this page." />
                  )}
                </div>
                  </div>
                </aside>
              </div>
            </div>
          ) : null}

          {currentPage === "leaves" ? (
            <div className="student-leaves-page">
              <header className="student-leaves-header">
                <p className="student-leaves-eyebrow">Leaves</p>
                <h2 className="student-leaves-title">Request time away</h2>
                <p className="student-leaves-lead">
                  Choose your dates and explain why you need leave. You will see approval status and any admin notes in
                  your history.
                </p>
              </header>
              <div className="student-leaves-layout">
                <div className="student-leaves-primary">
                  <div className="leaves-workspace">
                    <header className="leaves-workspace-header">
                      <p className="leaves-workspace-eyebrow">New request</p>
                      <h3 className="leaves-workspace-title">Submit leave dates</h3>
                    </header>
                    <div className="leaves-workspace-body">
                      <form className="form-grid student-leaves-form" onSubmit={handleLeaveSubmit}>
                        <label>
                          From date
                          <input
                            type="date"
                            value={leaveForm.fromDate}
                            onChange={(event) =>
                              setLeaveForm((current) => ({
                                ...current,
                                fromDate: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          To date
                          <input
                            type="date"
                            value={leaveForm.toDate}
                            onChange={(event) =>
                              setLeaveForm((current) => ({
                                ...current,
                                toDate: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="field-span-2">
                          Reason
                          <textarea
                            rows="4"
                            value={leaveForm.reason}
                            onChange={(event) =>
                              setLeaveForm((current) => ({
                                ...current,
                                reason: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <div className="form-actions student-leaves-form-actions">
                          <button type="submit" className="button button-primary" disabled={isSaving}>
                            {isSaving ? "Please wait…" : "Send leave request"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                </div>
                <aside className="student-leaves-sidebar">
                  <div className="student-leaves-panel">
                    <header className="student-leaves-panel-head">
                      <h3 className="student-leaves-panel-title">Your requests</h3>
                      <p className="student-leaves-panel-sub">Status and replies by billing month.</p>
                    </header>
                    <div className="student-leaves-panel-filters">
                      <label className="student-leaves-month-field">
                        <span className="student-leaves-month-label">Month</span>
                        <input
                          type="month"
                          className="student-leaves-month-input"
                          value={leaveHistoryMonth}
                          onChange={(event) => setLeaveHistoryMonth(event.target.value)}
                        />
                      </label>
                    </div>
                    <div className="student-leaves-history-body">
                      {studentLeavesFiltered.length ? (
                        <div className="stack-list student-leaves-history-list">
                          {studentLeavesFiltered.map((leaveRequest) => (
                            <article key={leaveRequest.leaveId} className="mini-card student-leave-history-card">
                              <div className="mini-card-top student-leave-history-card__head">
                                <h3 className="student-leave-history-card__dates">
                                  {formatShortDate(leaveRequest.fromDate)} → {formatShortDate(leaveRequest.toDate)}
                                </h3>
                                <StatusPill status={leaveRequest.status}>{leaveRequest.status}</StatusPill>
                              </div>
                              <p className="student-leave-history-card__reason">{leaveRequest.reason}</p>
                              {leaveRequest.adminNote ? (
                                <p className="issue-note student-leave-history-card__admin">Admin note: {leaveRequest.adminNote}</p>
                              ) : null}
                            </article>
                          ))}
                        </div>
                      ) : (
                        <div className="student-leaves-history-empty">
                          <EmptyState title="No leave this month" body="Try another month or send a new request." />
                        </div>
                      )}
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          ) : null}

          {currentPage === "documents" ? (
            <div className="student-documents-page">
              <header className="student-documents-header">
                <p className="student-documents-eyebrow">Documents</p>
                <h2 className="student-documents-title">Uploads &amp; verification</h2>
                <p className="student-documents-lead">
                  Submit PDF documents (max {maxClientUploadLabel()} each; the server compresses PDFs up to 500 KB).
                  Status updates appear here once admin reviews them.
                </p>
              </header>
              <div className="student-documents-layout">
                <div className="student-documents-primary">
                  <div className="documents-workspace">
                    <header className="documents-workspace-header">
                      <p className="documents-workspace-eyebrow">Upload</p>
                      <h3 className="documents-workspace-title">Submit hostel documents</h3>
                    </header>
                    <div className="documents-workspace-body">
                      <form className="form-stack student-documents-upload-form" onSubmit={handleDocumentSubmit}>
                  <label>
                    Document label
                    <select
                      value={documentForm.label}
                      disabled={!uploadableDocumentLabelOptions.length}
                      onChange={(event) =>
                        setDocumentForm((current) => ({
                          ...current,
                          label: event.target.value,
                        }))
                      }
                    >
                      {uploadableDocumentLabelOptions.map((label) => (
                        <option key={label} value={label}>
                          {label}
                        </option>
                      ))}
                    </select>
                    {!uploadableDocumentLabelOptions.length ? (
                      <p className="payment-form-hint">
                        All document categories are already submitted. Upload opens again if admin rejects a category.
                      </p>
                    ) : null}
                  </label>
                  <label>
                    File
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      disabled={!uploadableDocumentLabelOptions.length}
                      onChange={(event) => {
                        const list = event.target.files ? Array.from(event.target.files) : [];
                        const file = list[0] || null;
                        if (file && file.size > MAX_CLIENT_UPLOAD_BYTES) {
                          window.alert(`Each file must be ${maxClientUploadLabel()} or smaller.`);
                        }
                        event.target.value = "";
                        setDocumentForm((current) => ({
                          ...current,
                          files: file && file.size <= MAX_CLIENT_UPLOAD_BYTES ? [file] : [],
                        }));
                      }}
                    />
                  </label>
                  {documentForm.files?.length ? (
                    <p className="plain-empty">{documentForm.files[0]?.name || "1 file selected"}</p>
                  ) : null}
                        <button
                          type="submit"
                          className="button button-primary"
                          disabled={isSaving || !uploadableDocumentLabelOptions.length}
                        >
                          {isSaving ? "Please wait…" : "Upload document"}
                  </button>
                </form>
                    </div>
                  </div>
                </div>
                <aside className="student-documents-sidebar">
                  <div className="student-documents-panel">
                    <header className="student-documents-panel-head">
                      <h3 className="student-documents-panel-title">Your documents</h3>
                      <p className="student-documents-panel-sub">Review status and previews by billing month.</p>
                    </header>
                    <div className="student-documents-panel-filters">
                      <label className="student-documents-month-field">
                        <span className="student-documents-month-label">Month</span>
                        <input
                          type="month"
                          className="student-documents-month-input"
                          value={documentHistoryMonth}
                          onChange={(event) => setDocumentHistoryMonth(event.target.value)}
                        />
                      </label>
                    </div>
                    <div className="student-documents-history-body">
                      {studentDocumentsFiltered.length ? (
                          <div className="stack-list student-documents-history-list">
                            {studentDocumentsFiltered.map((document) => (
                              <article
                                key={document.documentId}
                                className="mini-card student-document-history-card"
                              >
                                <div className="mini-card-top student-document-history-card__head">
                                  <h3 className="student-document-history-card__label">{document.label}</h3>
                        <StatusPill status={document.status}>{document.status}</StatusPill>
                      </div>
                                <p className="student-document-filename">{document.fileName}</p>
                      {document.fileData && isImageFile(document.fileName || document.fileData) ? (
                                  <div className="proof-preview compact-proof-preview student-document-preview">
                          <img src={toMediaUrl(document.fileData)} alt={document.label} />
                        </div>
                      ) : null}
                      {document.fileData && !isImageFile(document.fileName || document.fileData) ? (
                        <a
                                    className="button button-secondary student-document-open-btn"
                          href={toMediaUrl(document.fileData)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open document
                        </a>
                      ) : null}
                    </article>
                  ))}
                </div>
                      ) : (
                        <div className="student-documents-history-empty">
                          <EmptyState
                            title="No uploads this month"
                            body="Try another month or upload a new document."
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          ) : null}

          {currentPage === "notices" ? (
            <div className="student-notices-page">
              <header className="student-notices-header">
                <p className="student-notices-eyebrow">Notice board</p>
                <h2 className="student-notices-title">Latest updates</h2>
                <p className="student-notices-lead">
                  Announcements from your hostel. Pinned notices stay at the top so you do not miss important news.
                </p>
              </header>
              <div className="student-notices-feed">
                {studentNoticesSorted.length ? (
                  <div className="stack-list student-notices-list">
                    {studentNoticesSorted.map((notice) => (
                      <article
                        key={notice.noticeId}
                        className={`mini-card student-notice-card${notice.pinned ? " student-notice-card--pinned" : ""}`}
                      >
                        <div className="mini-card-top student-notice-card__head">
                          <h3 className="student-notice-card__title">{notice.title}</h3>
                          {notice.pinned ? <StatusPill status="approved">Pinned</StatusPill> : null}
                        </div>
                        <p className="student-notice-card__body">{notice.body}</p>
                        <footer className="student-notice-card__footer">
                          <span className="student-notice-card__date">{formatDate(notice.publishedAt)}</span>
                        </footer>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="student-notices-empty">
                    <EmptyState title="No notices yet" body="When the admin publishes updates, they will appear here." />
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <MobileNavDrawer
        open={mobileMenuOpen}
        title="Student menu"
        onClose={() => setMobileMenuOpen(false)}
        links={studentPages.map((page) => {
          const studentPayments = data.payments.filter((payment) => payment.studentId === activeStudent.studentId);
          const studentComplaints = data.complaints.filter((complaint) => complaint.studentId === activeStudent.studentId);
          const studentLeaves = data.leaveRequests.filter((leaveRequest) => leaveRequest.studentId === activeStudent.studentId);
          const counts = {
            payments: studentPayments.filter((payment) => paymentHasBalanceDue(payment)).length,
            complaints: studentComplaints.filter((complaint) => complaint.status !== "resolved").length,
            leaves: studentLeaves.filter((leave) => leave.status === "pending").length,
            documents: activeStudent.documents.filter((doc) => doc.status !== "approved").length,
            notices: studentNoticesSorted.length,
            dashboard: 0,
            profile: 0,
          };
          const badge = formatBadgeCount(counts[page.id] || 0);
          return {
            to: `/student/${page.id}`,
            label: page.label,
            badge,
          };
        })}
      />

    </div>
  );
}
