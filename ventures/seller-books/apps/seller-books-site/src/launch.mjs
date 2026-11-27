// The one switch between "in early access, join the list" and "open now, start free".
//
// Every page's call to action, the header, the footer line, the FAQ answers about availability and
// price, the pricing page and llms.txt read this, so the site cannot say "not open" on one page and
// "start free" on another. The same rule as ventures/reseller-books/seller-books-cta.mjs (the free
// front-door tools): before launch, the early-access list; after, a link to
// `<APP_URL>/signup?from=seller-books-site/<page>`. Paid plans read "not on sale yet" until checkout
// is live in the app (PAID_PLANS_ON; apps/seller-books/docs/BILLING.md).
//
// The build takes APP_URL / PAID_PLANS_ON from the environment when set (build.mjs); tests use
// withLaunch() to render each state.

/**
 * The deployed app's origin. Set 2026-11-27: the app is live there (ventures/seller-books/DEPLOY.md,
 * "First deploy"; /api/health answered ok with email on). Never the workers.dev address, which
 * carries the Cloudflare account's subdomain. null builds the pre-launch copy.
 */
export const APP_URL = "https://seller-books.marisstella.app";

/** True once Paddle checkout is live in the app. Env PAID_PLANS_ON=1. */
export const PAID_PLANS_ON = false;

/** Refuses a value that would ship a wrong or private link: workers.dev, a path, plain http. */
export function normaliseAppUrl(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === "") return null;
  let u;
  try {
    u = new URL(s);
  } catch {
    throw new Error(`APP_URL is not a URL: ${s}`);
  }
  if (u.protocol !== "https:") throw new Error(`APP_URL must be https: ${s}`);
  if (/\.workers\.dev$/i.test(u.hostname))
    throw new Error(`APP_URL must not be a workers.dev address (it names the account): ${s}`);
  if (u.pathname !== "/" || u.search || u.hash)
    throw new Error(`APP_URL must be an origin with no path: ${s}`);
  return u.origin;
}

let current = { appUrl: normaliseAppUrl(APP_URL), paidOn: PAID_PLANS_ON };

/** { open, appUrl, paidOn } for the build in progress. */
export function launch() {
  return { open: current.appUrl !== null, appUrl: current.appUrl, paidOn: current.paidOn };
}

/** Sets the state for the build (build.mjs reads the environment through this). */
export function setLaunch({ appUrl, paidOn } = {}) {
  current = {
    appUrl: appUrl === undefined ? current.appUrl : normaliseAppUrl(appUrl),
    paidOn: paidOn === undefined ? current.paidOn : Boolean(paidOn),
  };
  if (!current.appUrl) current.paidOn = false;
}

/** Renders fn() under a given state and restores the previous one (tests). */
export function withLaunch(state, fn) {
  const saved = current;
  try {
    setLaunch(state);
    return fn();
  } finally {
    current = saved;
  }
}

/** The app's sign-up link, tagged with the page it came from. */
export function signupUrl(from) {
  const { appUrl } = launch();
  if (!appUrl) return null;
  return `${appUrl}/signup?from=${encodeURIComponent(`seller-books-site${from === "/" ? "/home" : from}`)}`;
}

/** The app's sign-in page. */
export function signinUrl() {
  const { appUrl } = launch();
  return appUrl ? `${appUrl}/login` : null;
}

/** The app's own privacy notice (apps/seller-books, route /legal/$key). */
export function appPrivacyUrl() {
  const { appUrl } = launch();
  return appUrl ? `${appUrl}/legal/privacy` : null;
}
