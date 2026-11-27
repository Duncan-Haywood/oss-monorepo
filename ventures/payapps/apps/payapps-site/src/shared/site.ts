// Site identity and the list of public pages: the one source for the build (scripts/build.ts),
// sitemap.xml, robots.txt, llms.txt and the worker's own HTML responses.
//
// The product name is PROVISIONAL (see README.md): change it here and nowhere else.
// Copy rules: the product is in development. Say "early access"; never claim customers, results,
// reviews or ratings, or a feature the app (apps/payapps) does not have yet.

export const PRODUCT_NAME = "PayPencil";
/** Production URL (origin + base path). The build reads env SITE_URL when set. */
export const DEFAULT_SITE_URL = "https://marisstella.app/payapps";
export const SITE_TAGLINE = "Monthly pay applications for subcontractors";
/** One line used wherever the site talks about pay-app forms, waivers or retainage. */
export const NOT_AIA_NOTE = `${PRODUCT_NAME} is not affiliated with the American Institute of Architects (AIA) and does not produce AIA Contract Documents. Nothing on this site is legal advice.`;
/** Date the public copy last changed (sitemap <lastmod>, feed <updated>). */
export const CONTENT_UPDATED = "2026-11-25";

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
      "PayPencil is a pay-application tool in development for subcontractors: schedule of values, retainage, change orders, lien waivers and GC portals in one monthly routine. Early access is open.",
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
      "PayPencil for subcontractors: SOV import, monthly pay apps, retainage release, change orders, lien waivers, a cash report and QuickBooks Online. Built and next.",
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
      "PayPencil pricing: free on one job, then $99, $179 or $249 a month (or yearly at 10% off), sized by active jobs. Nothing is charged during early access.",
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
      "Ask for early access to PayPencil. Tell us about your jobs and the GC portals you bill through; we confirm your email once and write when there is something to try.",
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
      "What PayPencil stores when you join early access, why, how long we keep it and how to remove it with one link.",
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
    description: "Your PayPencil early-access sign-up is confirmed.",
    indexable: false,
    label: "Confirmed",
  },
  removed: {
    path: "/early-access/removed",
    file: "early-access/removed.html",
    title: `Sign-up removed · ${PRODUCT_NAME}`,
    description: "Your PayPencil early-access sign-up has been deleted.",
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

/** "/payapps" from "https://marisstella.app/payapps"; "" at the host root. */
export function basePathOf(siteUrl: string): string {
  return new URL(siteUrl).pathname.replace(/\/+$/, "");
}

/** Absolute URL of a site path. */
export function absoluteUrl(siteUrl: string, path: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  return path === "/" ? `${base}/` : `${base}${path}`;
}
