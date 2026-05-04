import { useEffect, useRef } from "react";

/**
 * Explicit rendering for SPAs — Cloudflare recommends `?render=explicit` and programmatic `render`/`remove`.
 * Do not proxy or cache api.js. Load early for better UX.
 *
 * We use `defer` + `load` then `turnstile.render` (same idea as their `window.onload` explicit example).
 * Do not combine `turnstile.ready()` with `async`/`defer` on this script — that pairing throws at runtime.
 *
 * @see https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/#explicit-rendering
 */
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let turnstileScriptPromise = null;

function ensureTurnstileScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Turnstile requires a browser."));
  }

  if (window.turnstile) {
    return Promise.resolve();
  }

  if (!turnstileScriptPromise) {
    turnstileScriptPromise = new Promise((resolve, reject) => {
      const finish = () => {
        if (!window.turnstile) {
          reject(new Error("Turnstile not available."));
          return;
        }
        resolve();
      };

      const existing = document.querySelector('script[data-cf-turnstile-api="1"]');
      if (existing) {
        let settled = false;
        const tryFinish = () => {
          if (settled) return;
          if (!window.turnstile) return;
          settled = true;
          finish();
        };
        existing.addEventListener("load", tryFinish);
        existing.addEventListener("error", () => reject(new Error("Could not load security verification.")));
        queueMicrotask(tryFinish);
        return;
      }

      const script = document.createElement("script");
      script.src = SCRIPT_URL;
      script.defer = true;
      script.dataset.cfTurnstileApi = "1";
      script.onload = finish;
      script.onerror = () => reject(new Error("Could not load security verification."));
      document.head.appendChild(script);
    });
  }

  return turnstileScriptPromise;
}

/**
 * Cloudflare Turnstile — explicit widget lifecycle for React (mount → render, unmount → remove).
 */
/** @param {string} [action] Optional analytics label (e.g. `login` / `signup`) — Cloudflare widget `action` option. */
export function TurnstileField({ siteKey, widgetKey = 0, onToken, action }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return undefined;

    let cancelled = false;

    (async () => {
      try {
        await ensureTurnstileScript();
        if (cancelled || !containerRef.current) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: "auto",
          ...(action ? { action } : {}),
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(""),
          "error-callback": () => onTokenRef.current(""),
        });
      } catch {
        onTokenRef.current("");
      }
    })();

    return () => {
      cancelled = true;
      const id = widgetIdRef.current;
      widgetIdRef.current = null;
      if (id != null && window.turnstile?.remove) {
        try {
          window.turnstile.remove(id);
        } catch {
          /* ignore */
        }
      }
    };
  }, [siteKey, widgetKey, action]);

  if (!siteKey) return null;

  return <div className="auth-turnstile" ref={containerRef} />;
}
