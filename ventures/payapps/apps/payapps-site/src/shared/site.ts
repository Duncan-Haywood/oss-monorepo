// Site identity and the list of public pages: the one source for the build (scripts/build.ts),
// sitemap.xml, robots.txt, llms.txt and the worker's own HTML responses.
//
// The product name is the app's own ("PayApps", apps/payapps/index.html and the pay-app-guides CTAs);
// no trademark search has been done (README.md). Change it here and nowhere else.
// Copy rules: never claim customers, results, reviews or ratings, or a feature the app (apps/payapps)
// does not have yet. Before APP_URL is set the product is "in development" with early access; after,
// it is "open now" on the Free plan, and paid plans are "not on sale yet" until PAID_PLANS_ON.

export const PRODUCT_NAME = "PayApps";
/**
 * The deployed app's origin. Set 2026-11-27, when the app moved to https://payapps.marisstella.app
 * (PR #19642); never the workers.dev address, which carries the account's subdomain. The build reads
 * env APP_URL when set. Keep it equal to APP_URL in ventures/pay-app-guides/cta.mjs.
 */
export const APP_URL: string | null = "https://payapps.marisstella.app";
/** True once Paddle checkout is live in the app (apps/payapps/docs/BILLING.md). Env PAID_PLANS_ON=1. */
export const PAID_PLANS_ON = false;
/** Production URL (origin + base path). The build reads env SITE_URL when set. */
export const DEFAULT_SITE_URL = "https://marisstella.app/payapps";
export const SITE_TAGLINE = "Monthly pay applications for subcontractors";
/** One line used wherever the site talks about pay-app forms, waivers or retainage. */
export const NOT_AIA_NOTE = `${PRODUCT_NAME} is not affiliated with the American Institute of Architects (AIA) and does not produce AIA Contract Documents. Nothing on this site is legal advice.`;
/** The footer's warranty line, as the app's Terms of Service put it (apps/payapps/docs/legal/terms.md). */
export const NO_WARRANTY_NOTE = `No warranty: ${PRODUCT_NAME} is provided as is, and you check every figure before you send a pay application or waiver.`;
/** Date the public copy last changed (sitemap <lastmod>, feed <updated>). */
export const CONTENT_UPDATED = "2026-11-27";

export interface PublicPage {
  /** Site path without the base path; "/" is the home page. */
  path: `/${string}`;
  /** Output file under dist (relative to the base path directory). */
  file: string;
  title: string;
  /** Meta / OG description, 70-160 characters. */
  description: string;
  /** Crawlable pages are listed in sitemap.xml and llms.txt; the rest get noindex. */
  indexable: boolean;
  /** Breadcrumb label below the home page. */
  label: string;
  changefreq?: "weekly" | "monthly" | "yearly";
  priority?: number;
}

export const PAGES = {
  home: {
    path: "/",
    file: "index.html",
    title: `${PRODUCT_NAME} · ${SITE_TAGLINE}`,
    description:
      "PayApps: hosted pay applications for subcontractors. Schedule of values, retainage, change orders, lien waivers and GC portal files in one monthly routine.",
    indexable: true,
    label: "Home",
    changefreq: "weekly",
    priority: 1,
  },
  features: {
    path: "/features",
    file: "features.html",
    title: `Features · ${PRODUCT_NAME}`,
    description:
      "PayApps for subcontractors: SOV import, monthly pay apps, retainage release, change orders, lien waivers, a cash report and QuickBooks Online. Built and next.",
    indexable: true,
    label: "Features",
    changefreq: "monthly",
    priority: 0.9,
  },
  pricing: {
    path: "/pricing",
    file: "pricing.html",
    title: `Pricing · ${PRODUCT_NAME}`,
    description:
      "PayApps pricing: free on one job with no card, then $99, $179 or $249 a month (or yearly at 10% off), sized by active jobs.",
    indexable: true,
    label: "Pricing",
    changefreq: "monthly",
    priority: 0.8,
  },
  earlyAccess: {
    path: "/early-access",
    file: "early-access.html",
    title: `Join early access · ${PRODUCT_NAME}`,
    description:
      "Ask for early access to PayApps. Tell us about your jobs and the GC portals you bill through; we confirm your email once and write when there is something to try.",
    indexable: true,
    label: "Early access",
    changefreq: "monthly",
    priority: 0.8,
  },
  privacy: {
    path: "/privacy",
    file: "privacy.html",
    title: `Privacy notice · ${PRODUCT_NAME}`,
    description:
      "What PayApps stores when you join early access, why, how long we keep it and how to remove it with one link.",
    indexable: true,
    label: "Privacy",
    changefreq: "yearly",
    priority: 0.3,
  },
  checkEmail: {
    path: "/early-access/check-your-email",
    file: "early-access/check-your-email.html",
    title: `Check your email · ${PRODUCT_NAME}`,
    description: "We sent a confirmation link to the address you gave.",
    indexable: false,
    label: "Check your email",
  },
  confirmed: {
    path: "/early-access/confirmed",
    file: "early-access/confirmed.html",
    title: `You're on the list · ${PRODUCT_NAME}`,
    description: "Your PayApps early-access sign-up is confirmed.",
    indexable: false,
    label: "Confirmed",
  },
  removed: {
    path: "/early-access/removed",
    file: "early-access/removed.html",
    title: `Sign-up removed · ${PRODUCT_NAME}`,
    description: "Your PayApps early-access sign-up has been deleted.",
    indexable: false,
    label: "Removed",
  },
  notFound: {
    path: "/404",
    file: "404.html",
    title: `Page not found · ${PRODUCT_NAME}`,
    description: "This page does not exist.",
    indexable: false,
    label: "Not found",
  },
} as const satisfies Record<string, PublicPage>;

export type PageKey = keyof typeof PAGES;
export const PAGE_LIST: readonly PublicPage[] = Object.values(PAGES);

/** The pages that only work with the Worker's early-access API behind them. */
export const EARLY_ACCESS_PAGES: ReadonlySet<PageKey> = new Set([
  "earlyAccess",
  "checkEmail",
  "confirmed",
  "removed",
]);

/** Left out of the static copy too: the catalogue serves its own 404 page. */
const CATALOGUE_OWNS: ReadonlySet<PageKey> = new Set(["notFound"]);

/** The page keys a build writes: all of them, or without the early-access ones on a static host. */
export function pageKeys(opts: { staticHost?: boolean } = {}): PageKey[] {
  const keys = Object.keys(PAGES) as PageKey[];
  return opts.staticHost
    ? keys.filter((k) => !EARLY_ACCESS_PAGES.has(k) && !CATALOGUE_OWNS.has(k))
    : keys;
}

/** "/payapps" from "https://marisstella.app/payapps"; "" at the host root. */
export function basePathOf(siteUrl: string): string {
  return new URL(siteUrl).pathname.replace(/\/+$/, "");
}

/** Absolute URL of a site path. */
export function absoluteUrl(siteUrl: string, path: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  return path === "/" ? `${base}/` : `${base}${path}`;
}
