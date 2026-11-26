// Where the "Try the live demo" CTA and the demo banner point. Build-time config (Vite):
//   VITE_DEMO_URL     origin of the live demo deployment, e.g. https://grants-demo.example.org
//   VITE_DEMO_MODE    "true" in the demo deployment's own build (it then starts sessions itself)
//   VITE_PRODUCT_URL  URL of the real product (origin + base path), for the banner's "Start your own"
//                     (demo build only)

import { DEMO_PATH } from "./demo-meta";

/** Fallback when no live demo is configured: the static sandbox (routes/marketing/demo.tsx). */
export const STATIC_DEMO_PATH: string = DEMO_PATH;

export interface DemoTarget {
  /** Where the CTA links (also the no-JS fallback). */
  href: string;
  /** On the demo host itself: clicking calls POST /api/demo/start instead of following the link. */
  startsSession: boolean;
}

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}

export function resolveDemoTarget(opts: {
  demoUrl?: string;
  demoMode?: string;
  /** window.location.origin, or null while prerendering. */
  origin: string | null;
}): DemoTarget {
  const demoOrigin = originOf(opts.demoUrl);
  const onDemoHost =
    opts.demoMode === "true" || (demoOrigin !== null && opts.origin === demoOrigin);
  if (onDemoHost) return { href: demoOrigin ?? "/", startsSession: true };
  return { href: demoOrigin ?? STATIC_DEMO_PATH, startsSession: false };
}

/** Only same-origin app paths from the start response (never `//host` or `https://...`). */
export function safeRedirect(redirect: unknown): string | null {
  return typeof redirect === "string" && /^\/(?!\/)[\w\-/]*$/.test(redirect) ? redirect : null;
}

/**
 * "Start your own": sign-up on the real product when the demo build knows where it is. The product
 * URL may carry a path (https://marisstella.app/grants), which is kept.
 */
export function productSignupHref(productUrl: string | undefined): string {
  const origin = originOf(productUrl);
  if (!origin || !productUrl) return "/signup";
  const path = new URL(productUrl).pathname.replace(/\/+$/, "");
  return `${origin}${path}/signup`;
}

/** GET /api/me marks throwaway demo visitors with `isDemo: true`. */
export function isDemoMe(me: unknown): boolean {
  return typeof me === "object" && me !== null && (me as { isDemo?: unknown }).isDemo === true;
}

const env = import.meta.env as Record<string, string | undefined>;

export const demoConfig = {
  demoUrl: env.VITE_DEMO_URL,
  demoMode: env.VITE_DEMO_MODE,
  productUrl: env.VITE_PRODUCT_URL,
};
