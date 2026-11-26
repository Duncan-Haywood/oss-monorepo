// Cloudflare Turnstile widget for the auth forms (bot check; verified server-side by
// middleware/turnstile.ts). Entirely off unless the build sets VITE_TURNSTILE_SITE_KEY: no script is
// loaded, `widget` is null and `authOptions()` adds nothing to the request.
//
// The widget mode (Managed / Non-interactive / Invisible) is chosen on the Turnstile widget in the
// Cloudflare dashboard. With the default appearance "interaction-only" a Managed widget stays hidden
// unless Cloudflare wants the visitor to click. Tokens are single-use and live 300 s: call reset()
// after every submit so the next attempt gets a fresh one.
//
// Usage:
//   const turnstile = useTurnstile("login");
//   await authClient.signIn.email({ email, password, ...(await turnstile.authOptions()) });
//   turnstile.reset();
//   ...
//   {turnstile.widget}
import * as React from "react";

export const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
/** Must match middleware/turnstile.ts. */
export const TURNSTILE_TOKEN_HEADER = "x-turnstile-token";
/** How long authOptions() waits for a token that is still being generated. */
const TOKEN_WAIT_MS = 10_000;

export type TurnstileAction = "login" | "signup" | "forgot-password" | "resend-verification";
export type TurnstileAppearance = "always" | "execute" | "interaction-only";

interface TurnstileRenderOptions {
  sitekey: string;
  action?: string;
  theme?: "auto" | "light" | "dark";
  size?: "normal" | "flexible" | "compact";
  appearance?: TurnstileAppearance;
  "refresh-expired"?: "auto" | "manual" | "never";
  callback?: (token: string) => void;
  "error-callback"?: (code: string) => void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
}

interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string | undefined;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function turnstileSiteKey(): string | null {
  const v: unknown = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

let scriptPromise: Promise<TurnstileApi> | null = null;

/** reset/remove throw when the widget's DOM is already gone; nothing to do then. */
function safely(fn: () => void) {
  try {
    fn();
  } catch {
    // ignore
  }
}

/** Loads api.js once per page (from Cloudflare directly: it must not be bundled or proxied). */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.onload = () =>
        window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile_missing"));
      script.onerror = () => reject(new Error("turnstile_load_failed"));
      document.head.appendChild(script);
    }).catch((e: unknown) => {
      scriptPromise = null; // allow a retry on the next mount
      throw e;
    });
  }
  return scriptPromise;
}

export interface TurnstileHandle {
  /** False when no site key is configured: everything below is a no-op. */
  enabled: boolean;
  /** Render this inside the form (null when disabled). */
  widget: React.ReactNode;
  /** The current token, waiting briefly for one still being generated; null if none. */
  getToken(): Promise<string | null>;
  /** Spread into a Better Auth client call: `{ fetchOptions: { headers } }`, or `{}` when off. */
  authOptions(): Promise<{ fetchOptions?: { headers: Record<string, string> } }>;
  /** Discard the (now spent) token and get a fresh one. */
  reset(): void;
}

export interface UseTurnstileOptions {
  appearance?: TurnstileAppearance;
  /** Overrides VITE_TURNSTILE_SITE_KEY (tests). */
  siteKey?: string | null;
}

export function useTurnstile(
  action: TurnstileAction,
  opts: UseTurnstileOptions = {},
): TurnstileHandle {
  const siteKey = opts.siteKey === undefined ? turnstileSiteKey() : opts.siteKey;
  const appearance = opts.appearance ?? "interaction-only";
  const [failed, setFailed] = React.useState(false);
  const tokenRef = React.useRef<string | null>(null);
  const waitersRef = React.useRef<Array<(t: string | null) => void>>([]);
  const widgetIdRef = React.useRef<string | null>(null);
  // A callback ref (state) so the widget follows its container: rendered when the form mounts,
  // removed when it unmounts (e.g. the forgot-password form after "sent").
  const [container, setContainer] = React.useState<HTMLDivElement | null>(null);

  const settle = React.useCallback((token: string | null) => {
    tokenRef.current = token;
    const waiters = waitersRef.current;
    waitersRef.current = [];
    for (const w of waiters) w(token);
  }, []);

  React.useEffect(() => {
    if (!siteKey || !container) return;
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled) return;
        widgetIdRef.current =
          api.render(container, {
            sitekey: siteKey,
            action,
            appearance,
            theme: "light",
            size: "flexible",
            "refresh-expired": "auto",
            callback: (token) => {
              setFailed(false);
              settle(token);
            },
            "expired-callback": () => {
              tokenRef.current = null;
            },
            "timeout-callback": () => {
              tokenRef.current = null;
            },
            // Turnstile keeps retrying on its own; a later success clears the message.
            "error-callback": () => {
              setFailed(true);
              settle(null);
            },
          }) ?? null;
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        settle(null);
      });
    return () => {
      cancelled = true;
      const id = widgetIdRef.current;
      widgetIdRef.current = null;
      tokenRef.current = null;
      if (id) safely(() => window.turnstile?.remove(id));
    };
  }, [siteKey, container, action, appearance, settle]);

  const getToken = React.useCallback(async (): Promise<string | null> => {
    if (!siteKey) return null;
    if (tokenRef.current) return tokenRef.current;
    return new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => {
        waitersRef.current = waitersRef.current.filter((w) => w !== done);
        resolve(null);
      }, TOKEN_WAIT_MS);
      const done = (t: string | null) => {
        clearTimeout(timer);
        resolve(t);
      };
      waitersRef.current.push(done);
    });
  }, [siteKey]);

  const authOptions = React.useCallback(async () => {
    if (!siteKey) return {};
    const token = await getToken();
    // No token: send the request anyway; the server answers with a clear "security check" error.
    return token ? { fetchOptions: { headers: { [TURNSTILE_TOKEN_HEADER]: token } } } : {};
  }, [siteKey, getToken]);

  const reset = React.useCallback(() => {
    tokenRef.current = null;
    const id = widgetIdRef.current;
    if (id) safely(() => window.turnstile?.reset(id));
  }, []);

  const widget = siteKey ? (
    <div className="flex flex-col gap-1">
      <div ref={setContainer} data-turnstile={action} />
      {failed && (
        <p className="text-xs text-neutral-500" role="status">
          The security check couldn't load. Allow challenges.cloudflare.com (content blockers can
          stop it) or refresh the page.
        </p>
      )}
    </div>
  ) : null;

  return { enabled: Boolean(siteKey), widget, getToken, authOptions, reset };
}
