import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { TurnstileField } from "./TurnstileField";

const LOGO_SRC = `${import.meta.env.BASE_URL}branding/logo-rc-bhawan.png`;

/** Mirrors server password rules so users see errors before submit. */
function passwordMeetsPolicy(pw) {
  const s = String(pw || "");
  if (s.length < 8 || s.length > 20) return false;
  if (!/[a-zA-Z]/.test(s) || !/[0-9]/.test(s)) return false;
  return true;
}
const TURNSTILE_SITE_KEY = String(import.meta.env.VITE_TURNSTILE_SITE_KEY || "").trim();
/** 16:9 hero (see `npm run prep-auth-bg`). Falls back to legacy file if hero missing. */
const LOBBY_BG_SRC = `${import.meta.env.BASE_URL}branding/auth-lobby-bg-hero.png`;

function IconUser() {
  return (
    <svg className="auth-rc-input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4 4 0-2.5 4-2.5S20 16.5 20 18v1H4v-1c0-1.5 4-2.5 8-2.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconLock() {
  return (
    <svg className="auth-rc-input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconEye({ open }) {
  return open ? (
    <svg className="auth-rc-eye-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ) : (
    <svg className="auth-rc-eye-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconArrowRight() {
  return (
    <svg className="auth-rc-btn-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconShieldSmall() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V7l8-4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AuthPage({ busyMessage, onLogin, onSignup, onForgotPassword, onResetPassword }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState("login");
  const [resetToken, setResetToken] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showResetNewPassword, setShowResetNewPassword] = useState(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] = useState(false);
  const [loginForm, setLoginForm] = useState({
    login: "",
    password: "",
  });
  const [signupForm, setSignupForm] = useState({
    email: "",
    studentId: "",
    password: "",
  });
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const [resetFormError, setResetFormError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [captchaWidgetKey, setCaptchaWidgetKey] = useState(0);
  const [loginIdentifierError, setLoginIdentifierError] = useState("");
  const [loginCaptchaError, setLoginCaptchaError] = useState("");
  const [signupCaptchaError, setSignupCaptchaError] = useState("");
  const [signupPasswordError, setSignupPasswordError] = useState("");
  const lastPrimaryTabRef = useRef("login");

  useEffect(() => {
    const t = searchParams.get("reset");
    if (t) {
      setResetToken(t);
      setMode("reset");
      setResetFormError("");
    }
  }, [searchParams]);

  function clearResetQuery() {
    const next = new URLSearchParams(searchParams);
    if (next.has("reset")) {
      next.delete("reset");
      setSearchParams(next, { replace: true });
    }
    setResetToken("");
  }

  function goToLogin() {
    clearResetQuery();
    setMode("login");
    lastPrimaryTabRef.current = "login";
    setResetPassword("");
    setResetPasswordConfirm("");
    setResetFormError("");
    setShowResetNewPassword(false);
    setShowResetConfirmPassword(false);
    setLoginIdentifierError("");
    setLoginCaptchaError("");
    setSignupCaptchaError("");
    setSignupPasswordError("");
    if (TURNSTILE_SITE_KEY) {
      setTurnstileToken("");
      setCaptchaWidgetKey((key) => key + 1);
    }
  }

  function bumpTurnstile() {
    if (!TURNSTILE_SITE_KEY) return;
    setTurnstileToken("");
    setCaptchaWidgetKey((key) => key + 1);
  }

  function goLoginTab() {
    if (lastPrimaryTabRef.current !== "login" && TURNSTILE_SITE_KEY) {
      setTurnstileToken("");
      setCaptchaWidgetKey((key) => key + 1);
    }
    lastPrimaryTabRef.current = "login";
    setLoginIdentifierError("");
    setLoginCaptchaError("");
    setSignupCaptchaError("");
    setSignupPasswordError("");
    setMode("login");
  }

  function goSignupTab() {
    if (lastPrimaryTabRef.current !== "signup" && TURNSTILE_SITE_KEY) {
      setTurnstileToken("");
      setCaptchaWidgetKey((key) => key + 1);
    }
    lastPrimaryTabRef.current = "signup";
    setLoginIdentifierError("");
    setLoginCaptchaError("");
    setSignupCaptchaError("");
    setSignupPasswordError("");
    setMode("signup");
  }

  async function handleLogin(event) {
    event.preventDefault();
    const identifier = String(loginForm.login || "").trim();
    if (identifier.includes("@")) {
      setLoginIdentifierError("Use your student ID from the hostel office. Email addresses cannot be used here.");
      return;
    }
    setLoginIdentifierError("");
    if (TURNSTILE_SITE_KEY && !String(turnstileToken || "").trim()) {
      setLoginCaptchaError("Please complete the security check below.");
      return;
    }
    setLoginCaptchaError("");
    const payload = {
      ...loginForm,
      login: identifier,
      ...(TURNSTILE_SITE_KEY ? { turnstileToken } : {}),
    };
    const ok = await onLogin(payload);
    if (!ok) {
      bumpTurnstile();
    }
  }

  async function handleSignup(event) {
    event.preventDefault();
    if (TURNSTILE_SITE_KEY && !String(turnstileToken || "").trim()) {
      setSignupCaptchaError("Please complete the security check below.");
      return;
    }
    setSignupCaptchaError("");
    setSignupPasswordError("");
    if (!passwordMeetsPolicy(signupForm.password)) {
      setSignupPasswordError("Password must be 8–20 characters and include at least one letter and one number.");
      return;
    }
    const payload = {
      role: "student",
      email: signupForm.email,
      studentId: signupForm.studentId,
      password: signupForm.password,
      ...(TURNSTILE_SITE_KEY ? { turnstileToken } : {}),
    };
    const ok = await onSignup(payload);
    if (!ok) {
      bumpTurnstile();
    }
  }

  async function handleForgotSubmit(event) {
    event.preventDefault();
    const ok = await onForgotPassword(forgotEmail.trim());
    if (ok) {
      setForgotEmail("");
      goToLogin();
    }
  }

  async function handleResetSubmit(event) {
    event.preventDefault();
    setResetFormError("");
    if (!resetToken) {
      setResetFormError("This reset link is missing or invalid. Open the link from your email again.");
      return;
    }
    if (!passwordMeetsPolicy(resetPassword)) {
      setResetFormError("Password must be 8–20 characters and include at least one letter and one number.");
      return;
    }
    if (resetPassword !== resetPasswordConfirm) {
      setResetFormError("Passwords do not match.");
      return;
    }
    const ok = await onResetPassword({ token: resetToken, password: resetPassword });
    if (ok) {
      setResetPassword("");
      setResetPasswordConfirm("");
      goToLogin();
    }
  }

  const showPrimaryTabs = mode === "login" || mode === "signup";

  return (
    <div className="auth-rc">
      <div className="auth-rc-bg-fallback" aria-hidden />
      <img
        src={LOBBY_BG_SRC}
        alt=""
        className="auth-rc-bg-photo"
        decoding="sync"
        fetchpriority="high"
        aria-hidden
      />

      <div className="auth-rc-layout">
        <div className="auth-rc-panel">
          <div className="auth-rc-card">
            <header className="auth-rc-brand">
              <img
                src={LOGO_SRC}
                alt="R.C. Bhawan — Feels like home"
                className="auth-rc-brand__logo"
                width={360}
                height={144}
                decoding="async"
              />
            </header>

            {showPrimaryTabs ? (
            <div className="auth-tabs auth-rc-tabs">
              <button
                type="button"
                className={`auth-tab ${mode === "login" ? "active" : ""}`}
                onClick={goLoginTab}
              >
                Log in
              </button>
              <button
                type="button"
                className={`auth-tab ${mode === "signup" ? "active" : ""}`}
                onClick={goSignupTab}
              >
                Sign up
              </button>
            </div>
          ) : (
            <div className="auth-tabs auth-tabs--single auth-rc-tabs">
              <button type="button" className="auth-tab active" onClick={goToLogin}>
                ← Back to log in
              </button>
            </div>
          )}

          {mode === "login" ? (
            <form className="form-stack auth-rc-form" onSubmit={handleLogin}>
              <h2 className="auth-rc-form__title">Welcome Back!</h2>
              <p className="auth-rc-form__subtitle">Sign in with your student ID (not email) and password.</p>
              <label className="auth-rc-label">
                Student ID
                <span className="auth-rc-input-shell">
                  <IconUser />
                  <input
                    type="text"
                    className="auth-rc-input"
                    autoComplete="username"
                    value={loginForm.login}
                    onChange={(event) =>
                      setLoginForm((current) => ({
                        ...current,
                        login: event.target.value,
                      }))
                    }
                  
                  />
                </span>
              </label>
              {loginIdentifierError ? (
                <p className="form-error-text" role="alert">
                  {loginIdentifierError}
                </p>
              ) : null}
              <label className="auth-rc-label">
                Password
                <span className="auth-rc-input-shell">
                  <IconLock />
                  <input
                    type={showLoginPassword ? "text" : "password"}
                    className="auth-rc-input auth-rc-input--has-suffix"
                    value={loginForm.password}
                    onChange={(event) =>
                      setLoginForm((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="auth-rc-eye"
                    onClick={() => setShowLoginPassword((s) => !s)}
                    aria-label={showLoginPassword ? "Hide password" : "Show password"}
                  >
                    <IconEye open={showLoginPassword} />
                  </button>
                </span>
              </label>
              <div className="auth-rc-row-between">
                <label className="auth-rc-checkbox">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  Remember me
                </label>
                <button type="button" className="auth-text-link auth-rc-forgot" onClick={() => setMode("forgot")}>
                  Forgot Password?
                </button>
              </div>
              {TURNSTILE_SITE_KEY ? (
                <>
                  {loginCaptchaError ? (
                    <p className="auth-captcha-hint auth-captcha-hint--error" role="alert">
                      {loginCaptchaError}
                    </p>
                  ) : (
                    <p className="auth-captcha-hint">Quick security check — helps keep bots out.</p>
                  )}
                  <TurnstileField
                    siteKey={TURNSTILE_SITE_KEY}
                    widgetKey={captchaWidgetKey}
                    action="login"
                    onToken={setTurnstileToken}
                  />
                </>
              ) : null}
              <button type="submit" className="auth-rc-btn-primary" disabled={Boolean(busyMessage)}>
                {busyMessage || "Login"}
                <IconArrowRight />
              </button>
            </form>
          ) : null}

          {mode === "signup" ? (
            <form className="form-stack auth-rc-form" onSubmit={handleSignup}>
              <h2 className="auth-rc-form__title">Create account</h2>
              <p className="auth-rc-form__subtitle">
                Use the student ID the hostel gave you. Your name and phone come from that record.
              </p>
              <label className="auth-rc-label">
                Email
                <span className="auth-rc-input-shell">
                  <IconUser />
                  <input
                    type="email"
                    className="auth-rc-input"
                    value={signupForm.email}
                    onChange={(event) =>
                      setSignupForm((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                  />
                </span>
              </label>
              <label className="auth-rc-label">
                Student ID
                <input
                  type="text"
                  className="auth-rc-input auth-rc-input--plain"
                  value={signupForm.studentId}
                  onChange={(event) =>
                    setSignupForm((current) => ({
                      ...current,
                      studentId: event.target.value,
                    }))
                  }
                  
                />
              </label>
              <label className="auth-rc-label">
                Password
                <span className="auth-rc-input-shell">
                  <IconLock />
                  <input
                    type={showSignupPassword ? "text" : "password"}
                    className="auth-rc-input auth-rc-input--has-suffix"
                    value={signupForm.password}
                    onChange={(event) =>
                      setSignupForm((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="auth-rc-eye"
                    onClick={() => setShowSignupPassword((s) => !s)}
                    aria-label={showSignupPassword ? "Hide password" : "Show password"}
                  >
                    <IconEye open={showSignupPassword} />
                  </button>
                </span>
              </label>
              {signupPasswordError ? (
                <p className="form-error-text" role="alert">
                  {signupPasswordError}
                </p>
              ) : null}
              {TURNSTILE_SITE_KEY ? (
                <>
                  {signupCaptchaError ? (
                    <p className="auth-captcha-hint auth-captcha-hint--error" role="alert">
                      {signupCaptchaError}
                    </p>
                  ) : (
                    <p className="auth-captcha-hint">Quick security check — helps keep bots out.</p>
                  )}
                  <TurnstileField
                    siteKey={TURNSTILE_SITE_KEY}
                    widgetKey={captchaWidgetKey}
                    action="signup"
                    onToken={setTurnstileToken}
                  />
                </>
              ) : null}
              <button type="submit" className="auth-rc-btn-primary" disabled={Boolean(busyMessage)}>
                {busyMessage || "Create account"}
                <IconArrowRight />
              </button>
            </form>
          ) : null}

          {mode === "forgot" ? (
            <form className="form-stack auth-rc-form" onSubmit={handleForgotSubmit}>
              <h2 className="auth-rc-form__title">Reset your password</h2>
              <p className="auth-rc-form__subtitle">
                Enter the email on your account. We will send a one-hour link to set a new password.
              </p>
              <label className="auth-rc-label">
                Email
                <span className="auth-rc-input-shell">
                  <IconUser />
                  <input
                    type="email"
                    className="auth-rc-input"
                    value={forgotEmail}
                    onChange={(event) => setForgotEmail(event.target.value)}
                    required
                  />
                </span>
              </label>
              <button type="submit" className="auth-rc-btn-primary" disabled={Boolean(busyMessage)}>
                {busyMessage || "Send reset link"}
                <IconArrowRight />
              </button>
            </form>
          ) : null}

          {mode === "reset" ? (
            <form className="form-stack auth-rc-form" onSubmit={handleResetSubmit}>
              <h2 className="auth-rc-form__title">Choose a new password</h2>
              <p className="auth-rc-form__subtitle">
                Use 8–20 characters, including at least one letter and one number.
              </p>
              {resetFormError ? <p className="form-error-text">{resetFormError}</p> : null}
              <label className="auth-rc-label">
                New password
                <span className="auth-rc-input-shell">
                  <IconLock />
                  <input
                    type={showResetNewPassword ? "text" : "password"}
                    className="auth-rc-input auth-rc-input--has-suffix"
                    value={resetPassword}
                    onChange={(event) => setResetPassword(event.target.value)}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="auth-rc-eye"
                    onClick={() => setShowResetNewPassword((s) => !s)}
                    aria-label={showResetNewPassword ? "Hide password" : "Show password"}
                  >
                    <IconEye open={showResetNewPassword} />
                  </button>
                </span>
              </label>
              <label className="auth-rc-label">
                Confirm password
                <span className="auth-rc-input-shell">
                  <IconLock />
                  <input
                    type={showResetConfirmPassword ? "text" : "password"}
                    className="auth-rc-input auth-rc-input--has-suffix"
                    value={resetPasswordConfirm}
                    onChange={(event) => setResetPasswordConfirm(event.target.value)}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="auth-rc-eye"
                    onClick={() => setShowResetConfirmPassword((s) => !s)}
                    aria-label={showResetConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  >
                    <IconEye open={showResetConfirmPassword} />
                  </button>
                </span>
              </label>
              <button type="submit" className="auth-rc-btn-primary" disabled={Boolean(busyMessage) || !resetToken}>
                {busyMessage || "Update password"}
                <IconArrowRight />
              </button>
            </form>
          ) : null}

          {showPrimaryTabs ? (
            <p className="auth-rc-trust">
              <IconShieldSmall />
              <span>Secure. Private. Trusted.</span>
            </p>
          ) : null}
          </div>
        </div>
      </div>

      <div className="auth-rc-footer-wrap">
        <footer className="auth-rc-footer">
          <div className="auth-rc-footer__inner">
            <div className="auth-rc-footer__item">
              <span className="auth-rc-footer__icon" aria-hidden>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 3l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V7l8-4Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9 12.5 11 14.5 15.5 10"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <div className="auth-rc-footer__copy">
                <strong>Secure &amp; Safe</strong>
                <p>Your data is always protected.</p>
              </div>
            </div>
            <div className="auth-rc-footer__item">
              <span className="auth-rc-footer__icon" aria-hidden>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <div className="auth-rc-footer__copy">
                <strong>Community First</strong>
                <p>A supportive environment like home.</p>
              </div>
            </div>
            <div className="auth-rc-footer__item">
              <span className="auth-rc-footer__icon" aria-hidden>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M16 2v4M8 2v4M3 10h18M9 14h2v2H9v-2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M17 17l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div className="auth-rc-footer__copy">
                <strong>Easy Management</strong>
                <p>Everything you need, all in one place.</p>
              </div>
            </div>
            <div className="auth-rc-footer__item">
              <span className="auth-rc-footer__icon" aria-hidden>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M11 20C7 16 4 12 4 8a4 4 0 0 1 7-2.32A4 4 0 0 1 18 8c0 4-3 8-7 12Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 8c1.5 2 2.5 4 2.5 6a6 6 0 0 1-.2 1.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <div className="auth-rc-footer__copy">
                <strong>Feels Like Home</strong>
                <p>Comfort. Care. Belonging.</p>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
