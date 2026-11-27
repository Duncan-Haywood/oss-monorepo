// The one switch between "in development, join early access" and "open now, start free".
//
// Every page's call to action, the header button, the footer line, the FAQ answers about whether the
// app can be used today and the llms.txt status all read this, so the site cannot say "not open" on
// one page and "start free" on another. The same rule as ventures/pay-app-guides/cta.mjs: before
// launch, early access; after, a link to `<APP_URL>/?signup&from=payapps-site/<page>`, which opens
// the app on "Create an account" (apps/payapps/src/client/lib/auth-mode.ts). Paid plans are described
// as not on sale until checkout is on (PAID_PLANS_ON).
import { formatUsd, PAID_PLANS } from "@shared/plans";
import { APP_URL, PAID_PLANS_ON } from "@shared/site";

export interface LaunchInput {
  /** The deployed app's origin; undefined means the APP_URL constant. */
  appUrl?: string | null;
  /** Whether Paddle checkout is live; undefined means the PAID_PLANS_ON constant. */
  paidOn?: boolean;
}

export interface Launch {
  open: boolean;
  appUrl: string | null;
  paidOn: boolean;
}

export function launchOf(ctx: LaunchInput): Launch {
  const raw = ctx.appUrl === undefined ? APP_URL : ctx.appUrl;
  const appUrl = raw ? normaliseAppUrl(raw) : null;
  const paidOn = Boolean(appUrl) && (ctx.paidOn ?? PAID_PLANS_ON);
  return { open: appUrl !== null, appUrl, paidOn };
}

/** An https origin with no path, query or fragment; anything else is refused at build time. */
export function normaliseAppUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error(`APP_URL must be https: ${value}`);
  }
  if ((url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) {
    throw new Error(`APP_URL must be an origin with no path: ${value}`);
  }
  if (url.hostname.endsWith(".workers.dev")) {
    // The workers.dev subdomain is the Cloudflare account's, a person's name: never link public
    // pages to it (PR #19642).
    throw new Error(`APP_URL must not be a workers.dev address: ${value}`);
  }
  return url.origin;
}

/** `<app>/?signup&from=payapps-site/<page>`; `from` names the page for a later sign-up source report. */
export function signupUrl(appUrl: string, page: string): string {
  const from = page === "home" ? "payapps-site" : `payapps-site/${page}`;
  return `${appUrl}/?signup&from=${encodeURIComponent(from)}`;
}

/** What paid plans cost, or that they are not on sale yet. */
export function plansSentence(l: Launch): string {
  const cents = PAID_PLANS.map((p) => p.priceCents);
  return l.paidOn
    ? `Free on one job, then ${formatUsd(Math.min(...cents))} to ${formatUsd(Math.max(...cents))} a month by active jobs.`
    : "Free on one job with no card. Paid plans for more jobs are not on sale yet.";
}
