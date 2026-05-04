import { startTransition, useEffect, useRef, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { AdminPortal } from "./components/AdminPortal";
import { AdminAuthPage } from "./components/AdminAuthPage";
import { AuthPage } from "./components/AuthPage";
import { AccessDenied } from "./components/AccessDenied";
import { LoaderErrorPanel, LoaderScreen } from "./components/LoaderScreen";
import { Modal } from "./components/Modal";
import { StudentPortal } from "./components/StudentPortal";
import { ToastHost } from "./components/ToastHost";
import { formatBadgeCount } from "./lib/formatBadgeCount.js";
import { paymentHasBalanceDue } from "./lib/paymentMath.js";

const apiBase = import.meta.env.VITE_API_URL || "/api";
const BRAND_LOGO_SRC = `${import.meta.env.BASE_URL}branding/logo-rc-bhawan.png`;

/** Long unguessable path only — set at build/deploy time (same value not required on the server). */
const adminRegisterPathRaw = String(import.meta.env.VITE_ADMIN_REGISTER_PATH || "").trim();
const adminRegisterPath =
  adminRegisterPathRaw.startsWith("/") && adminRegisterPathRaw.length >= 16 ? adminRegisterPathRaw : "";

const navLinkClass = ({ isActive }) => `top-nav-link ${isActive ? "active" : ""}`;

async function readResponse(response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || "Request failed.");
  }

  return payload;
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toasts, setToasts] = useState([]);
  const [busyMessage, setBusyMessage] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [logoutSubmitting, setLogoutSubmitting] = useState(false);
  const [topbarHidden, setTopbarHidden] = useState(false);
  const lastScrollY = useRef(0);

  function pushToast({ tone = "neutral", title, body, timeoutMs } = {}) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((current) => [{ id, tone, title: title || "Done", body: body || "", timeoutMs }, ...current].slice(0, 3));
  }

  function dismissToast(id) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  const notificationModel = (() => {
    if (!data || !currentUser) {
      return { count: 0, items: [] };
    }

    if (currentUser.role === "admin") {
      const pendingProofs = Number(data.summary?.paymentProofPending || 0);
      const pendingLeaves = Number(data.summary?.pendingLeaves || 0);
      const complaintsPendingApproval = data.complaints.filter((c) => c.status === "open").length;
      const studentsPendingDocs = data.students
        ? data.students.filter((s) => String(s.documentStatus || "") !== "complete").length
        : 0;
      const pendingDocReviews = data.students
        ? data.students.reduce((sum, s) => {
            const docs = Array.isArray(s.documents) ? s.documents : [];
            return sum + docs.filter((d) => String(d.status || "") === "pending").length;
          }, 0)
        : 0;

      const count =
        pendingProofs + complaintsPendingApproval + pendingLeaves + studentsPendingDocs + pendingDocReviews;
      return {
        count,
        items: [
          { label: `${pendingProofs} payment proofs to verify`, to: "/admin/payments" },
          { label: `${studentsPendingDocs} students with pending documents`, to: "/admin/students" },
          { label: `${pendingDocReviews} documents awaiting review`, to: "/admin/documents" },
          { label: `${complaintsPendingApproval} complaints awaiting review`, to: "/admin/complaints" },
          { label: `${pendingLeaves} leave requests pending`, to: "/admin/leaves" },
        ].filter((item) => !item.label.startsWith("0 ")),
      };
    }

    if (currentUser.role === "student") {
      const studentId = currentUser.studentId;
      const unpaid = data.payments.filter((p) => p.studentId === studentId && paymentHasBalanceDue(p)).length;
      const openComplaints = data.complaints.filter(
        (c) => c.studentId === studentId && c.status !== "resolved",
      ).length;
      const pendingLeaves = data.leaveRequests.filter(
        (l) => l.studentId === studentId && l.status === "pending",
      ).length;
      const pendingDocs = (data.students.find((s) => s.studentId === studentId)?.documents || []).filter(
        (d) => d.status !== "approved",
      ).length;
      const notices = data.notices.filter((n) => n.audience !== "admins").length;

      const count = unpaid + openComplaints + pendingLeaves + pendingDocs + notices;
      return {
        count,
        items: [
          { label: `${unpaid} unpaid invoice(s)`, to: "/student/payments" },
          { label: `${pendingDocs} document(s) need attention`, to: "/student/documents" },
          { label: `${openComplaints} complaint(s) open`, to: "/student/complaints" },
          { label: `${pendingLeaves} leave request(s) pending`, to: "/student/leaves" },
          { label: `${notices} notice(s)`, to: "/student/notices" },
        ].filter((item) => !item.label.startsWith("0 ")),
      };
    }

    return { count: 0, items: [] };
  })();

  const bellBadgeText = formatBadgeCount(notificationModel.count);

  function buildHeaders(extraHeaders = {}, isFormData = false) {
    return {
      ...(!isFormData ? { "Content-Type": "application/json" } : {}),
      ...extraHeaders,
    };
  }

  async function loadBootstrap(options = {}) {
    const shouldShowLoader = options.showLoader ?? !data;
    if (shouldShowLoader) {
      setLoading(true);
    }

    try {
      const response = await fetch(`${apiBase}/bootstrap`, {
        credentials: "include",
        headers: buildHeaders(),
      });
      const payload = await readResponse(response);

      startTransition(() => {
        setData(payload);
      });
      setError("");
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      setLoading(true);
      try {
        const meResponse = await fetch(`${apiBase}/auth/me`, {
          credentials: "include",
          headers: buildHeaders(),
        });
        const user = await readResponse(meResponse);
        if (cancelled) return;
        setCurrentUser(user);
        await loadBootstrap({ showLoader: false });
      } catch (_nextError) {
        if (!cancelled) {
          setCurrentUser(null);
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setAuthResolved(true);
        }
      }
    }

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setTopbarHidden(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!currentUser || !data) return undefined;
    lastScrollY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 16) {
        setTopbarHidden(false);
      } else if (y > lastScrollY.current) {
        setTopbarHidden(true);
      } else {
        setTopbarHidden(false);
      }
      lastScrollY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [currentUser, data]);

  async function runMutation(endpoint, options, successText, isFormData = false) {
    setBusyMessage("Saving changes...");

    try {
      const response = await fetch(`${apiBase}${endpoint}`, {
        credentials: "include",
        headers: buildHeaders({}, isFormData),
        ...options,
      });

      await readResponse(response);
      await loadBootstrap({ showLoader: false });
      pushToast({ tone: "success", title: successText });
      return true;
    } catch (nextError) {
      pushToast({ tone: "error", title: "Action failed", body: nextError.message });
      return false;
    } finally {
      setBusyMessage("");
    }
  }

  async function handleAuth(endpoint, payload, successText) {
    setBusyMessage("Please wait...");

    try {
      const response = await fetch(`${apiBase}/auth/${endpoint}`, {
        method: "POST",
        credentials: "include",
        headers: buildHeaders(),
        body: JSON.stringify(payload),
      });
      const result = await readResponse(response);
      setCurrentUser(result.user);
      await loadBootstrap({ showLoader: false });
      pushToast({ tone: "success", title: successText });
      return true;
    } catch (nextError) {
      pushToast({ tone: "error", title: "Login failed", body: nextError.message });
      return false;
    } finally {
      setBusyMessage("");
      setAuthResolved(true);
    }
  }

  async function handleForgotPassword(email) {
    setBusyMessage("Sending…");
    try {
      const response = await fetch(`${apiBase}/auth/forgot-password`, {
        method: "POST",
        credentials: "include",
        headers: buildHeaders(),
        body: JSON.stringify({ email }),
      });
      const payload = await readResponse(response);
      pushToast({
        tone: "success",
        title: "Check your email",
        body: payload.message || "If an account exists, we sent reset instructions.",
      });
      return true;
    } catch (nextError) {
      pushToast({ tone: "error", title: "Could not send reset email", body: nextError.message });
      return false;
    } finally {
      setBusyMessage("");
    }
  }

  async function handleResetPassword({ token, password }) {
    setBusyMessage("Updating password…");
    try {
      const response = await fetch(`${apiBase}/auth/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: buildHeaders(),
        body: JSON.stringify({ token, password }),
      });
      await readResponse(response);
      try {
        await fetch(`${apiBase}/auth/logout`, {
          method: "POST",
          credentials: "include",
          headers: buildHeaders(),
        });
      } catch (_e) {
        /* ignore */
      }
      setCurrentUser(null);
      setData(null);
      pushToast({
        tone: "success",
        title: "Password updated",
        body: "You can sign in with your new password. Other devices were signed out.",
      });
      return true;
    } catch (nextError) {
      pushToast({ tone: "error", title: "Reset failed", body: nextError.message });
      return false;
    } finally {
      setBusyMessage("");
    }
  }

  async function performLogout() {
    const roleBeforeLogout = currentUser?.role;
    try {
      await fetch(`${apiBase}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: buildHeaders(),
      });
    } catch (_e) {
      /* clear UI even if network fails */
    }
    setCurrentUser(null);
    setData(null);
    pushToast({ tone: "success", title: "Logged out successfully." });
    if (roleBeforeLogout === "admin" && adminRegisterPath) {
      navigate(adminRegisterPath, { replace: true });
    } else {
      navigate("/", { replace: true });
    }
  }

  function openLogoutDialog() {
    setNotificationOpen(false);
    setLogoutDialogOpen(true);
  }

  async function confirmLogoutFromDialog() {
    setLogoutSubmitting(true);
    try {
      await performLogout();
    } finally {
      setLogoutSubmitting(false);
      setLogoutDialogOpen(false);
    }
  }

  useEffect(() => {
    if (!logoutDialogOpen) {
      return undefined;
    }
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setLogoutDialogOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [logoutDialogOpen]);

  if (!authResolved) {
    return <LoaderScreen />;
  }

  if (error && currentUser && !data) {
    return (
      <div className="app-loading app-loading--error">
        <LoaderErrorPanel message={error} onRetry={() => loadBootstrap()} />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="app-auth-viewport">
        <ToastHost toasts={toasts} onDismiss={dismissToast} />
        <Routes>
          {adminRegisterPath ? (
            <Route
              path={adminRegisterPath}
              element={
                <AdminAuthPage
                  apiBase={apiBase}
                  busyMessage={busyMessage}
                  onLogin={(payload) => handleAuth("login", payload, "Logged in successfully.")}
                  onForgotPassword={handleForgotPassword}
                  onErrorToast={(title, body) => pushToast({ tone: "error", title, body })}
                  onRegisterSuccess={async (user) => {
                    setCurrentUser(user);
                    await loadBootstrap({ showLoader: false });
                    pushToast({
                      tone: "success",
                      title: "Admin account ready",
                      body: "You are signed in to the desk portal.",
                    });
                    setAuthResolved(true);
                  }}
                />
              }
            />
          ) : null}
          <Route
            path="*"
            element={
              <AuthPage
                busyMessage={busyMessage}
                onLogin={(payload) => handleAuth("login", payload, "Logged in successfully.")}
                onSignup={(payload) => handleAuth("signup", payload, "Account created and logged in.")}
                onForgotPassword={handleForgotPassword}
                onResetPassword={handleResetPassword}
              />
            }
          />
        </Routes>
      </div>
    );
  }

  if (!data) {
    return (
      <>
        <ToastHost toasts={toasts} onDismiss={dismissToast} />
        <LoaderScreen />
      </>
    );
  }

  const activeStudent =
    currentUser.role === "student"
      ? data?.students.find((student) => student.studentId === currentUser.studentId) || null
      : data?.students[0] || null;

  return (
    <div className="app-shell" data-topbar-hidden={topbarHidden ? "true" : "false"}>
      <div className="backdrop-orb backdrop-orb-left" />
      <div className="backdrop-orb backdrop-orb-right" />

      <header className={`topbar ${topbarHidden ? "topbar--hidden" : ""}`}>
        <div className="brand-lockup">
          <img
            src={BRAND_LOGO_SRC}
            alt="R.C. Bhawan — Feels like home"
            className="brand-logo-img"
            width={280}
            height={112}
            decoding="async"
          />
        </div>

        <nav className="top-nav">
          {currentUser.role === "admin" ? (
            <NavLink to="/admin" className={navLinkClass}>
              Admin
            </NavLink>
          ) : null}
          {currentUser.role === "student" ? (
            <NavLink to="/student" className={navLinkClass}>
              Student
            </NavLink>
          ) : null}
          <div className="notification-wrap">
            <button
              type="button"
              className="notification-button notification-button--icon"
              onClick={() => setNotificationOpen((v) => !v)}
              aria-label="Open notifications"
            >
              <svg
                className="notification-bell-icon"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {bellBadgeText ? (
                <span className="notification-badge notification-badge--float">{bellBadgeText}</span>
              ) : null}
            </button>
            {notificationOpen ? (
              <div className="notification-panel" role="dialog" aria-label="Notifications">
                <div className="notification-panel-top">
                  <strong>Notifications</strong>
                  <button
                    type="button"
                    className="notification-close"
                    onClick={() => setNotificationOpen(false)}
                    aria-label="Close notifications"
                  >
                    ✕
                  </button>
                </div>
                {notificationModel.items.length ? (
                  <div className="notification-list">
                    {notificationModel.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className="notification-item"
                        onClick={() => setNotificationOpen(false)}
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                ) : (
                  <p className="plain-empty">All caught up.</p>
                )}
              </div>
            ) : null}
          </div>
          <button type="button" className="logout-button" onClick={openLogoutDialog}>
            Log out
          </button>
        </nav>
      </header>

      <div className="topbar-spacer" aria-hidden="true" />

      <ToastHost toasts={toasts} onDismiss={dismissToast} />

      <Modal
        open={logoutDialogOpen}
        title="Log out?"
        onBackdropClick={() => {
          if (!logoutSubmitting) {
            setLogoutDialogOpen(false);
          }
        }}
        actions={
          <>
            <button
              type="button"
              className="button button-secondary"
              disabled={logoutSubmitting}
              onClick={() => setLogoutDialogOpen(false)}
            >
              Stay signed in
            </button>
            <button
              type="button"
              className="button button-primary"
              disabled={logoutSubmitting}
              onClick={() => void confirmLogoutFromDialog()}
            >
              {logoutSubmitting ? "Signing out…" : "Log out"}
            </button>
          </>
        }
      >
        <p className="plain-empty">You will need to sign in again on this device.</p>
      </Modal>

      <main className="main-shell">
        <Routes>
          <Route
            path="/"
            element={
              <Navigate
                to={currentUser.role === "admin" ? "/admin/dashboard" : "/student/dashboard"}
                replace
              />
            }
          />
          {adminRegisterPath ? (
            <Route
              path={adminRegisterPath}
              element={
                currentUser.role === "admin" ? (
                  <Navigate to="/admin/dashboard" replace />
                ) : (
                  <AccessDenied
                    title="Access restricted"
                    description="This link is only for hostel desk staff. Your student account cannot use it."
                    backTo="/student/dashboard"
                    backLabel="Back to student portal"
                  />
                )
              }
            />
          ) : null}
          <Route
            path="/admin"
            element={
              currentUser.role === "admin" ? (
                <Navigate to="/admin/dashboard" replace />
              ) : (
                <AccessDenied
                  title="Access restricted"
                  description="This area is for authorised hostel desk staff only."
                  backTo="/student/dashboard"
                  backLabel="Back to student portal"
                />
              )
            }
          />
          <Route
            path="/admin/:section"
            element={
              currentUser.role !== "admin" ? (
                <AccessDenied
                  title="Access restricted"
                  description="This area is for authorised hostel desk staff only."
                  backTo="/student/dashboard"
                  backLabel="Back to student portal"
                />
              ) : (
                <AdminPortal
                  data={data}
                  busyMessage={busyMessage}
                  onCreateStudent={async (payload) => {
                    setBusyMessage("Saving changes...");
                    try {
                      const response = await fetch(`${apiBase}/admin/students`, {
                        method: "POST",
                        credentials: "include",
                        headers: buildHeaders(),
                        body: JSON.stringify(payload),
                      });
                      const student = await readResponse(response);
                      await loadBootstrap({ showLoader: false });
                      pushToast({ tone: "success", title: "Student data submitted." });
                      return student;
                    } catch (nextError) {
                      pushToast({ tone: "error", title: "Action failed", body: nextError.message });
                      return null;
                    } finally {
                      setBusyMessage("");
                    }
                  }}
                  onUpdateStudent={(studentId, payload) =>
                    runMutation(
                      `/admin/students/${studentId}`,
                      {
                        method: "PATCH",
                        body: JSON.stringify(payload),
                      },
                      "Student updated successfully.",
                    )
                  }
                  onDeleteStudent={(studentId) =>
                    runMutation(
                      `/admin/students/${studentId}`,
                      {
                        method: "DELETE",
                      },
                      "Student deleted successfully.",
                    )
                  }
                  onUpdateRoom={(roomNumber, payload) =>
                    runMutation(
                      `/admin/rooms/${encodeURIComponent(roomNumber)}`,
                      {
                        method: "PATCH",
                        body: JSON.stringify(payload),
                      },
                      "Room updated successfully.",
                    )
                  }
                  onDeleteRoomRecord={(roomNumber, confirm) =>
                    runMutation(
                      `/admin/rooms/${encodeURIComponent(roomNumber)}/delete-record`,
                      { method: "POST", body: JSON.stringify({ confirm }) },
                      "Room removed from the building list.",
                    )
                  }
                  onResetRoomAssignments={(roomNumber) =>
                    runMutation(
                      `/admin/rooms/${encodeURIComponent(roomNumber)}/reset-assignments`,
                      { method: "POST", body: JSON.stringify({}) },
                      "Room beds reset and residents unassigned.",
                    )
                  }
                  onDeleteAllRooms={(confirm) =>
                    runMutation(
                      `/admin/rooms/delete-all`,
                      { method: "POST", body: JSON.stringify({ confirm }) },
                      "All rooms removed from the building list.",
                    )
                  }
                  onSetGlobalElectricityRate={(electricityRatePerUnit) =>
                    runMutation(
                      `/admin/rooms/electricity-rate`,
                      {
                        method: "POST",
                        body: JSON.stringify({ electricityRatePerUnit }),
                      },
                      "Electricity unit rate updated.",
                    )
                  }
                  onAddRooms={(roomNumbers, extras = {}) =>
                    runMutation(
                      `/admin/rooms/bulk`,
                      {
                        method: "POST",
                        body: JSON.stringify({
                          roomNumbers,
                          ...(String(extras?.floorLabel ?? "").trim() ? { floorLabel: extras.floorLabel } : {}),
                          ...(String(extras?.electricityMeterId ?? "").trim()
                            ? { electricityMeterId: extras.electricityMeterId }
                            : {}),
                        }),
                      },
                      (Array.isArray(roomNumbers) && roomNumbers[0] ? `Room ${roomNumbers[0]} added.` : "Room added."),
                    )
                  }
                  onAutoAssignRooms={(from, to) =>
                    runMutation(
                      `/admin/rooms/assign-auto`,
                      {
                        method: "POST",
                        body: JSON.stringify({ from, to }),
                      },
                      `Auto-assigned rooms ${from}-${to}.`,
                    )
                  }
                  onUpdateComplaint={(complaintId, payload) =>
                    runMutation(
                      `/admin/complaints/${complaintId}`,
                      {
                        method: "PATCH",
                        body: JSON.stringify(payload),
                      },
                      "Complaint updated successfully.",
                    )
                  }
                  onUpdateLeave={(leaveId, payload) =>
                    runMutation(
                      `/admin/leaves/${leaveId}`,
                      {
                        method: "PATCH",
                        body: JSON.stringify(payload),
                      },
                      "Leave request updated successfully.",
                    )
                  }
                  onReviewPayment={(invoiceId, payload) =>
                    runMutation(
                      `/admin/payments/${invoiceId}/review`,
                      {
                        method: "PATCH",
                        body: JSON.stringify(payload),
                      },
                      "Payment review updated successfully.",
                    )
                  }
                  onUpdatePaymentBill={(invoiceId, payload) =>
                    runMutation(
                      `/admin/payments/${invoiceId}/bill`,
                      {
                        method: "PATCH",
                        body: JSON.stringify(payload),
                      },
                      "Bill snapshot updated successfully.",
                    )
                  }
                  onUpdatePaymentBillsBulk={(updates) =>
                    runMutation(
                      `/admin/payments/bills/bulk`,
                      {
                        method: "POST",
                        body: JSON.stringify({ updates }),
                      },
                      "Billing updates saved.",
                    )
                  }
                  onGenerateBillingInvoices={(monthKey) =>
                    runMutation(
                      `/admin/billing/generate`,
                      {
                        method: "POST",
                        body: JSON.stringify({ monthKey }),
                      },
                      `Invoices generated for ${monthKey}.`,
                    )
                  }
                  onDeleteFutureInvoices={(payload = {}) =>
                    runMutation(
                      `/admin/billing/delete-future`,
                      {
                        method: "POST",
                        body: JSON.stringify(payload),
                      },
                      payload?.monthKey
                        ? `Removed invoices for ${payload.monthKey}.`
                        : "Removed invoices dated after the current month.",
                    )
                  }
                  onDeletePaymentProof={(invoiceId) =>
                    runMutation(
                      `/admin/payments/${invoiceId}/proof`,
                      {
                        method: "DELETE",
                      },
                      "Payment proof deleted successfully.",
                    )
                  }
                  onUpdateDocument={(studentId, documentId, payload) =>
                    runMutation(
                      `/admin/students/${studentId}/documents/${documentId}`,
                      {
                        method: "PATCH",
                        body: JSON.stringify(payload),
                      },
                      "Document updated successfully.",
                    )
                  }
                  onDeleteDocument={(studentId, documentId) =>
                    runMutation(
                      `/admin/students/${studentId}/documents/${documentId}`,
                      {
                        method: "DELETE",
                      },
                      "Document deleted successfully.",
                    )
                  }
                  onCreateNotice={(payload) =>
                    runMutation(
                      "/admin/notices",
                      {
                        method: "POST",
                        body: JSON.stringify(payload),
                      },
                      "Notice published to the notice board.",
                    )
                  }
                  onDeleteNotice={(noticeId) =>
                    runMutation(
                      `/admin/notices/${noticeId}`,
                      {
                        method: "DELETE",
                      },
                      "Notice deleted successfully.",
                    )
                  }
                  onDeleteComplaint={(complaintId) =>
                    runMutation(
                      `/admin/complaints/${complaintId}`,
                      {
                        method: "DELETE",
                      },
                      "Complaint deleted successfully.",
                    )
                  }
                />
              )
            }
          />
          <Route
            path="/student"
            element={
              currentUser.role === "student" ? (
                <Navigate to="/student/dashboard" replace />
              ) : (
                <AccessDenied
                  title="Access restricted"
                  description="This portal is for hostel residents only."
                  backTo="/admin/dashboard"
                  backLabel="Back to desk portal"
                />
              )
            }
          />
          <Route
            path="/student/:section"
            element={
              currentUser.role !== "student" ? (
                <AccessDenied
                  title="Access restricted"
                  description="This portal is for hostel residents only."
                  backTo="/admin/dashboard"
                  backLabel="Back to desk portal"
                />
              ) : (
                <StudentPortal
                  data={data}
                  activeStudent={activeStudent}
                  currentUser={currentUser}
                  busyMessage={busyMessage}
                  paymentConfig={data.meta.paymentConfig}
                  onCreateComplaint={(payload) =>
                    runMutation(
                      `/students/${currentUser.studentId}/complaints`,
                      {
                        method: "POST",
                        body: JSON.stringify(payload),
                      },
                      "Complaint submitted. We’ll resolve it ASAP.",
                    )
                  }
                  onCreateLeave={(payload) =>
                    runMutation(
                      `/students/${currentUser.studentId}/leaves`,
                      {
                        method: "POST",
                        body: JSON.stringify(payload),
                      },
                      "Leave request submitted for approval.",
                    )
                  }
                  onSubmitPayment={(invoiceId, payload) =>
                    runMutation(
                      `/students/${currentUser.studentId}/payments/${invoiceId}/submit`,
                      {
                        method: "POST",
                        body: payload,
                      },
                      "Payment proof submitted for verification.",
                      true,
                    )
                  }
                  onUploadDocument={(payload) =>
                    runMutation(
                      `/students/${currentUser.studentId}/documents`,
                      {
                        method: "POST",
                        body: payload,
                      },
                      "Document uploaded. Admin will review it.",
                      true,
                    )
                  }
                  onUploadProfilePhoto={async (file) => {
                    if (!file || !currentUser?.studentId) return false;
                    setBusyMessage("Uploading photo…");
                    try {
                      const formData = new FormData();
                      formData.append("profilePhoto", file);
                      const response = await fetch(
                        `${apiBase}/students/${encodeURIComponent(currentUser.studentId)}/profile-photo`,
                        {
                          method: "POST",
                          credentials: "include",
                          headers: buildHeaders({}, true),
                          body: formData,
                        },
                      );
                      await readResponse(response);
                      await loadBootstrap({ showLoader: false });
                      pushToast({ tone: "success", title: "Profile photo updated." });
                      return true;
                    } catch (nextError) {
                      pushToast({ tone: "error", title: "Photo upload failed", body: nextError.message });
                      return false;
                    } finally {
                      setBusyMessage("");
                    }
                  }}
                />
              )
            }
          />
          <Route
            path="*"
            element={
              <Navigate
                to={currentUser.role === "admin" ? "/admin/dashboard" : "/student/dashboard"}
                replace
              />
            }
          />
        </Routes>
      </main>
    </div>
  );
}
