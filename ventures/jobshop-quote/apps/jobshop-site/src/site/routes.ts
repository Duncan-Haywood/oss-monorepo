// Public pages: the one list behind scripts/build.ts (one HTML file per route, sitemap.xml,
// robots.txt, llms.txt, llms-full.txt). Same shape as apps/grants' PUBLIC_ROUTES.
// Copy rules: honest summaries only (no invented stats, customers or claims); titles must be unique.
// Titles and descriptions follow the launch switch (LAUNCH in ./config): an open site says "free to
// start", a closed one "in development", and the early-access pages exist only while closed.

import { EARLY_ACCESS_PLAN, formatUsd, PLANS } from "@shared/plans";
import { CONTENT_DATE, LAUNCH, type Launch, SITE_NAME } from "./config";

export type StructuredData = "organization" | "website" | "software" | "product" | "faq";

export interface PublicRoute {
  path: `/${string}`;
  /** Full document title, unique per page. */
  title: string;
  /** Meta / OG description, roughly 70-160 characters. */
  description: string;
  /** Short label for breadcrumbs and llms.txt. */
  label: string;
  changefreq: "weekly" | "monthly" | "yearly";
  priority: number;
  lastmod: string;
  structuredData?: readonly StructuredData[];
  /** Pages that exist but should not be indexed (thank-you page). Left out of sitemap and llms.txt. */
  noindex?: boolean;
  /** Early-access pages: built only while the site is closed (LAUNCH.open false). */
  closedOnly?: boolean;
}

const fromPrice = formatUsd(Math.min(...PLANS.map((p) => p.monthlyPrice)));

/** Every route for a launch state, closed-only pages included (the Worker renders the form page). */
export function allRoutes(launch: Launch = LAUNCH): readonly PublicRoute[] {
  const open = launch.open;
  return [
    {
      path: "/",
      label: "Home",
      title: `${SITE_NAME} · Quote RFQs from email or drawings with your own rates`,
      description: open
        ? `${SITE_NAME} prices machined and fabricated parts from your shop's own rate card and builds the quote PDF for your estimator to check. Free to start.`
        : `${SITE_NAME} (in development) reads RFQ emails and PDF drawings and drafts quotes priced with your shop's own rates, for your estimator to check and send.`,
      changefreq: "weekly",
      priority: 1,
      lastmod: CONTENT_DATE,
      structuredData: ["organization", "website", "software"],
    },
    {
      path: "/how-it-works",
      label: "How it works",
      title: `How it works · ${SITE_NAME}`,
      description: open
        ? `How ${SITE_NAME} turns an RFQ into a quote: your rate card, the parts and CAD files, pricing by your rules, and your estimator's check before sending.`
        : `How ${SITE_NAME} will turn an RFQ into a draft quote: your rate table, reading and double-checking the drawing, pricing by your rules, and your estimator's review.`,
      changefreq: "monthly",
      priority: 0.9,
      lastmod: CONTENT_DATE,
    },
    {
      path: "/pricing",
      label: "Pricing",
      title: `Pricing · ${SITE_NAME}`,
      description: open
        ? `Start free on the Early access plan, up to ${EARLY_ACCESS_PLAN.rfqsPerMonth} RFQs a month. Paid plans from ${fromPrice} a month, sized by RFQs quoted, priced from what it costs to run.`
        : `Early access is free while ${SITE_NAME} is in development. Proposed plans from ${fromPrice} a month, sized by RFQs quoted, priced from what it costs to run.`,
      changefreq: "monthly",
      priority: 0.9,
      lastmod: CONTENT_DATE,
      structuredData: ["product"],
    },
    {
      path: "/for-cmmc-shops",
      label: "For CMMC-conscious shops",
      title: `For defense and CMMC-conscious shops · ${SITE_NAME}`,
      description: `What ${SITE_NAME} means for shops that handle CUI or export-controlled drawings today, and the CMMC workspace we're building alongside it.`,
      changefreq: "monthly",
      priority: 0.7,
      lastmod: CONTENT_DATE,
    },
    {
      path: "/faq",
      label: "FAQ",
      title: `Frequently asked questions · ${SITE_NAME}`,
      description: `Answers about ${SITE_NAME}: what it reads, who sets the prices, whether it sends quotes, your drawings and AI training, ERP links and the free plan.`,
      changefreq: "monthly",
      priority: 0.7,
      lastmod: CONTENT_DATE,
      structuredData: ["faq"],
    },
    {
      path: "/early-access",
      label: "Early access",
      title: `Request early access · ${SITE_NAME}`,
      description: `Ask to try ${SITE_NAME} on your own RFQs while it's in development. Early access is free, up to ${EARLY_ACCESS_PLAN.rfqsPerMonth} RFQs a month.`,
      changefreq: "monthly",
      priority: 0.8,
      lastmod: CONTENT_DATE,
      closedOnly: true,
    },
    {
      path: "/early-access/thanks",
      label: "Request received",
      title: `Request received · ${SITE_NAME}`,
      description: `Thanks for asking about ${SITE_NAME} early access. Here is what happens next.`,
      changefreq: "yearly",
      priority: 0.1,
      lastmod: CONTENT_DATE,
      noindex: true,
      closedOnly: true,
    },
    {
      path: "/privacy",
      label: "Privacy",
      title: open
        ? `Site privacy notice · ${SITE_NAME}`
        : `Early-access privacy notice · ${SITE_NAME}`,
      description: open
        ? `This site stores nothing about you: no forms, no cookies, no analytics scripts. The ${SITE_NAME} app has its own privacy policy, linked here.`
        : `What ${SITE_NAME} stores when you request early access, why, where it is kept, and how to have it deleted.`,
      changefreq: "yearly",
      priority: 0.3,
      lastmod: CONTENT_DATE,
    },
  ];
}

/** The pages a launch state builds: closed-only pages drop out once the site is open. */
export function publicRoutes(launch: Launch = LAUNCH): readonly PublicRoute[] {
  if (launch.open && !launch.appUrl) {
    throw new Error("An open site needs LAUNCH.appUrl: sign-up is its only call to action");
  }
  return allRoutes(launch).filter((r) => !(launch.open && r.closedOnly));
}

/** The pages the current launch switch builds. */
export const PUBLIC_ROUTES: readonly PublicRoute[] = publicRoutes(LAUNCH);

export function getRoute(path: string, launch: Launch = LAUNCH): PublicRoute {
  const route = allRoutes(launch).find((r) => r.path === path);
  if (!route) throw new Error(`No public route ${path}`);
  return route;
}
