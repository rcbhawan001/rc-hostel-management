import { useRef, useState } from "react";
import { TurnstileField } from "./TurnstileField";

const LOGO_SRC = `${import.meta.env.BASE_URL}branding/logo-rc-bhawan.png`;
const LOBBY_BG_SRC = `${import.meta.env.BASE_URL}branding/auth-lobby-bg-hero.png`;
const TURNSTILE_SITE_KEY = String(import.meta.env.VITE_TURNSTILE_SITE_KEY || "").trim();

function passwordMeetsPolicy(pw) {
  const s = String(pw || "");
  if (s.length < 8 || s.length > 20) return false;
  if (!/[a-zA-Z]/.test(s) || !/[0-9]/.test(s)) return false;
  return true;
}

async function readResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || "Request failed.");
  }
  return payload;
}

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

/**
 * Desk-only auth: log in (email), token-gated signup, forgot password.
 * Mounted only at `VITE_ADMIN_REGISTER_PATH` (not linked from the student app).
 */
export function AdminAuthPage({ apiBase, busyMessage, onLogin, onForgotPassword, onRegisterSuccess, onErrorToast }) {
  const [deskMode, setDeskMode] = useState("login");
  const [loginForm, setLoginForm] = useState({ login: "", password: "" });
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [portalToken, setPortalToken] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [captchaWidgetKey, setCaptchaWidgetKey] = useState(0);
  const [loginIdentifierError, setLoginIdentifierError] = useState("");
  const [loginCaptchaError, setLoginCaptchaError] = useState("");
  const [signupCaptchaError, setSignupCaptchaError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [registerSubmitting, setRegisterSubmitting] = useState(false);
  const [registerFormError, setRegisterFormError] = useState("");
  const lastDeskTabRef = useRef("login");
  const registerInFlightRef = useRef(false);

  function bumpTurnstile() {
    if (!TURNSTILE_SITE_KEY) return;
    setTurnstileToken("");
    setCaptchaWidgetKey((k) => k + 1);
  }

  function goDeskLoginTab() {
    if (lastDeskTabRef.current !== "login" && TURNSTILE_SITE_KEY) {
      bumpTurnstile();
    }
    lastDeskTabRef.current = "login";
    setLoginIdentifierError("");
    setLoginCaptchaError("");
    setSignupCaptchaError("");
    setPasswordError("");
    setRegisterFormError("");
    setDeskMode("login");
  }

  function goDeskSignupTab() {
    if (lastDeskTabRef.current !== "signup" && TURNSTILE_SITE_KEY) {
      bumpTurnstile();
    }
    lastDeskTabRef.current = "signup";
    setLoginIdentifierError("");
    setLoginCaptchaError("");
    setSignupCaptchaError("");
    setPasswordError("");
    setRegisterFormError("");
    setDeskMode("signup");
  }

  function goDeskForgot() {
    setLoginCaptchaError("");
    setSignupCaptchaError("");
    if (TURNSTILE_SITE_KEY) bumpTurnstile();
    setDeskMode("forgot");
  }

  function backFromForgot() {
    setForgotEmail("");
    goDeskLoginTab();
    if (TURNSTILE_SITE_KEY) bumpTurnstile();
  }

  async function handleDeskLogin(event) {
    event.preventDefault();
    const identifier = String(loginForm.login || "").trim();
    if (identifier && !identifier.includes("@")) {
      setLoginIdentifierError("Sign in with the email address on your desk account.");
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
    if (!ok) bumpTurnstile();
  }

  async function handleDeskRegister(event) {
    event.preventDefault();
    if (registerInFlightRef.current) {
      return;
    }
    setRegisterFormError("");
    setSignupCaptchaError("");
    setPasswordError("");
    if (TURNSTILE_SITE_KEY && !String(turnstileToken || "").trim()) {
      setSignupCaptchaError("Please complete the security check below.");
      return;
    }
    if (!passwordMeetsPolicy(password)) {
      setPasswordError("Password must be 8–20 characters and include at least one letter and one number.");
      return;
    }
    registerInFlightRef.current = true;
    setRegisterSubmitting(true);
    try {
      const response = await fetch(`${apiBase}/auth/register-admin`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portalToken: portalToken.trim(),
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          password,
          ...(TURNSTILE_SITE_KEY ? { turnstileToken } : {}),
        }),
      });
      const result = await readResponse(response);
      await onRegisterSuccess(result.user);
    } catch (err) {
      const msg = err.message || "Registration failed.";
      setRegisterFormError(msg);
      onErrorToast?.("Could not create account", msg);
      bumpTurnstile();
    } finally {
      registerInFlightRef.current = false;
      setRegisterSubmitting(false);
    }
  }

  async function handleForgotSubmit(event) {
    event.preventDefault();
    const ok = await onForgotPassword(forgotEmail.trim());
    if (ok) {
      setForgotEmail("");
      backFromForgot();
    }
  }

  const showPrimaryTabs = deskMode === "login" || deskMode === "signup";

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
                  className={`auth-tab ${deskMode === "login" ? "active" : ""}`}
                  onClick={goDeskLoginTab}
                >
                  Log in
                </button>
                <button
                  type="button"
                  className={`auth-tab ${deskMode === "signup" ? "active" : ""}`}
                  onClick={goDeskSignupTab}
                >
                  Create account
                </button>
              </div>
            ) : (
              <div className="auth-tabs auth-tabs--single auth-rc-tabs">
                <button type="button" className="auth-tab active" onClick={backFromForgot}>
                  ← Back to log in
                </button>
              </div>
            )}

            {deskMode === "login" ? (
              <form className="form-stack auth-rc-form" onSubmit={handleDeskLogin}>
                <h2 className="auth-rc-form__title">Desk portal</h2>
                <p className="auth-rc-form__subtitle">Sign in with the email on your admin account.</p>
                <label className="auth-rc-label">
                  Email
                  <span className="auth-rc-input-shell">
                    <IconUser />
                    <input
                      type="email"
                      className="auth-rc-input"
                      autoComplete="username"
                      value={loginForm.login}
                      onChange={(event) =>
                        setLoginForm((current) => ({
                          ...current,
                          login: event.target.value,
                        }))
                      }
                      placeholder="admin@hostel.in"
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
                  <button type="button" className="auth-text-link auth-rc-forgot" onClick={goDeskForgot}>
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
                  {busyMessage || "Log in"}
                  <IconArrowRight />
                </button>
              </form>
            ) : null}

            {deskMode === "signup" ? (
              <form className="form-stack auth-rc-form" onSubmit={handleDeskRegister}>
                <h2 className="auth-rc-form__title">New desk administrator</h2>
                <p className="auth-rc-form__subtitle">
                  Use the registration token you were given. This page is not shown to students.
                </p>
                {registerFormError ? (
                  <p className="form-error-text" role="alert">
                    {registerFormError}
                  </p>
                ) : null}
                <label className="auth-rc-label">
                  Registration token
                  <input
                    type="password"
                    className="auth-rc-input auth-rc-input--plain"
                    autoComplete="off"
                    value={portalToken}
                    onChange={(e) => setPortalToken(e.target.value)}
                    required
                  />
                </label>
                <label className="auth-rc-label">
                  Full name
                  <span className="auth-rc-input-shell">
                    <IconUser />
                    <input type="text" className="auth-rc-input" value={name} onChange={(e) => setName(e.target.value)} required />
                  </span>
                </label>
                <label className="auth-rc-label">
                  Email
                  <span className="auth-rc-input-shell">
                    <IconUser />
                    <input
                      type="email"
                      className="auth-rc-input"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </span>
                </label>
                <label className="auth-rc-label">
                  Phone (10 digits)
                  <input
                    type="text"
                    className="auth-rc-input auth-rc-input--plain"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </label>
                <label className="auth-rc-label">
                  Password
                  <span className="auth-rc-input-shell">
                    <IconLock />
                    <input
                      type={showSignupPassword ? "text" : "password"}
                      className="auth-rc-input auth-rc-input--has-suffix"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
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
                {passwordError ? (
                  <p className="form-error-text" role="alert">
                    {passwordError}
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
                <button type="submit" className="auth-rc-btn-primary" disabled={registerSubmitting}>
                  {registerSubmitting ? "Please wait…" : "Create admin account"}
                  <IconArrowRight />
                </button>
              </form>
            ) : null}

            {deskMode === "forgot" ? (
              <form className="form-stack auth-rc-form" onSubmit={handleForgotSubmit}>
                <h2 className="auth-rc-form__title">Reset your password</h2>
                <p className="auth-rc-form__subtitle">
                  Enter the email on your desk account. We will email a one-hour link to set a new password.
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
          </div>
        </footer>
      </div>
    </div>
  );
}
