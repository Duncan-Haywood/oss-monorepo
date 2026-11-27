// The one switch between "early access, join the list" and "open now, start free on Level 1".
//
// Every page's call to action, the header, the footer line, the pricing page, the privacy notice and
// llms.txt read this, so the site cannot say "not open" on one page and "start free" on another.
// Same design as ventures/seller-books/apps/seller-books-site/src/launch.mjs. Before launch: the
// early-access list (its pages and form, served by this site's own Worker). After: links to
// `<APP_URL>/signup?from=cmmc-site/<page>` and no early-access pages at all. Paid plans read "not on
// sale yet" until checkout is live in the app (PAID_PLANS_ON; apps/cmmc/docs/BILLING.md).
//
// build.mjs takes APP_URL / PAID_PLANS_ON from the environment when set; buildPages(state) renders
// either state for tests.

/**
 * The deployed app's origin. Set 2026-11-27: the first production deploy (cmmc-deploy run
 * 46022366507) answered `/api/health` with ok, email on and files in D1 at this address.
 * Never the workers.dev address, which carries the Cloudflare account's subdomain. null builds the
 * pre-launch copy.
 */
export const APP_URL = "https://cmmc.marisstella.app";

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

/**
 * @typedef {{ open: boolean, appUrl: string | null, paidOn: boolean }} Launch
 * @param {{ appUrl?: string | null, paidOn?: boolean }} [state]
 * @returns {Launch}
 */
export function launchState({ appUrl = APP_URL, paidOn = PAID_PLANS_ON } = {}) {
  const url = normaliseAppUrl(appUrl);
  return { open: url !== null, appUrl: url, paidOn: url !== null && Boolean(paidOn) };
}

/** The state the environment asks for (build.mjs): APP_URL="" builds the early-access copy. */
export function launchFromEnv(env = {}) {
  return launchState({
    appUrl: env.APP_URL === undefined ? APP_URL : env.APP_URL,
    paidOn: env.PAID_PLANS_ON === undefined ? PAID_PLANS_ON : env.PAID_PLANS_ON === "1",
  });
}

/** The app's sign-up link, tagged with the page it came from; null before launch. */
export function signupUrl(launch, from) {
  if (!launch.appUrl) return null;
  const tag = `cmmc-site${from === "/" ? "/home" : from}`;
  return `${launch.appUrl}/signup?from=${encodeURIComponent(tag)}`;
}

/** The app's sign-in screen (its root). */
export function signinUrl(launch) {
  return launch.appUrl ? `${launch.appUrl}/` : null;
}

/** The app's own privacy policy (apps/cmmc, route /legal/:key). */
export function appLegalUrl(launch, key) {
  return launch.appUrl ? `${launch.appUrl}/legal/${key}` : null;
}
