// Public pages: the one list behind scripts/build.ts (one HTML file per route, sitemap.xml,
// robots.txt, llms.txt, llms-full.txt). Same shape as apps/grants' PUBLIC_ROUTES.
// Copy rules: honest summaries only (no invented stats, customers or claims); titles must be unique.

import { EARLY_ACCESS_PLAN, formatUsd, PLANS } from "@shared/plans";
import { CONTENT_DATE, SITE_NAME } from "./config";

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
}

const fromPrice = formatUsd(Math.min(...PLANS.map((p) => p.monthlyPrice)));

export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  {
    path: "/",
    label: "Home",
    title: `${SITE_NAME} · Quote RFQs from email or drawings with your own rates`,
    description: `${SITE_NAME} (in development) reads RFQ emails and PDF drawings and drafts quotes priced with your shop's own rates, for your estimator to check and send.`,
    changefreq: "weekly",
    priority: 1,
    lastmod: CONTENT_DATE,
    structuredData: ["organization", "website", "software"],
  },
  {
    path: "/how-it-works",
    label: "How it works",
    title: `How it works · ${SITE_NAME}`,
    description: `How ${SITE_NAME} will turn an RFQ into a draft quote: your rate table, reading and double-checking the drawing, pricing by your rules, and your estimator's review.`,
    changefreq: "monthly",
    priority: 0.9,
    lastmod: CONTENT_DATE,
  },
  {
    path: "/pricing",
    label: "Pricing",
    title: `Pricing · ${SITE_NAME}`,
    description: `Early access is free while ${SITE_NAME} is in development. Proposed plans from ${fromPrice} a month, sized by RFQs quoted, priced from what it costs to run.`,
    changefreq: "monthly",
    priority: 0.9,
    lastmod: CONTENT_DATE,
    structuredData: ["product"],
  },
  {
    path: "/for-cmmc-shops",
    label: "For CMMC-conscious shops",
    title: `For defense and CMMC-conscious shops · ${SITE_NAME}`,
    description: `What ${SITE_NAME} early access means for shops that handle CUI or export-controlled drawings, and the CMMC workspace we're building alongside it.`,
    changefreq: "monthly",
    priority: 0.7,
    lastmod: CONTENT_DATE,
  },
  {
    path: "/faq",
    label: "FAQ",
    title: `Frequently asked questions · ${SITE_NAME}`,
    description: `Answers about ${SITE_NAME}: what it reads, who sets the prices, whether it sends quotes, your drawings and AI training, ERP links and early access.`,
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
  },
  {
    path: "/privacy",
    label: "Privacy",
    title: `Early-access privacy notice · ${SITE_NAME}`,
    description: `What ${SITE_NAME} stores when you request early access, why, where it is kept, and how to have it deleted.`,
    changefreq: "yearly",
    priority: 0.3,
    lastmod: CONTENT_DATE,
  },
];

export function getRoute(path: string): PublicRoute {
  const route = PUBLIC_ROUTES.find((r) => r.path === path);
  if (!route) throw new Error(`No public route ${path}`);
  return route;
}
