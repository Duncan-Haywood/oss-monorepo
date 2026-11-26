// Public, crawlable pages: the one list behind scripts/prerender.mjs (static HTML per route, sitemap.xml,
// robots.txt) and scripts/check-seo.mjs. useDocumentMeta can read titles/descriptions from here so the
// client-side <title> matches the prerendered one. A path missing from router.tsx is skipped by the
// prerender with a warning (and left out of the sitemap), so pages can be listed before they ship.
// Copy rules: honest summaries only (no invented stats or claims); titles must be unique.

import { DEMO_DESCRIPTION, DEMO_PATH, DEMO_TITLE } from "@client/components/demo/demo-meta";
import { GUARANTEE_DAYS } from "@client/components/marketing/plan-copy";
import { RESOURCE_ROUTES } from "@client/content/resources";
import { PLAN_LIST } from "@shared/billing/plans";
import { LEGAL_DOC_KEYS, LEGAL_DOC_TITLES, type LegalDocKey } from "@shared/legal";

export const SITE_NAME = "Grant Autopilot";
/** Production URL (origin + base path); scripts/prerender.mjs uses env SITE_URL when set. */
export const DEFAULT_SITE_URL = "https://marisstella.app/grants";

/**
 * JSON-LD added on top of the WebPage node (and, below the home page, the BreadcrumbList) every
 * prerendered page gets. "software" = SoftwareApplication with the plan price range; "article" =
 * Article built from the resources library entry (dates, sources as citations); "glossary" =
 * DefinedTermSet built from the page's rendered <h3> terms.
 */
export type StructuredData =
  | "organization"
  | "website"
  | "faq"
  | "product"
  | "software"
  | "article"
  | "glossary";

export interface PublicRoute {
  path: `/${string}`;
  /** Full document title, unique per page. */
  title: string;
  /** Meta / OG description, roughly 70-160 characters. */
  description: string;
  changefreq: "weekly" | "monthly" | "yearly";
  priority: number;
  /** ISO date the content last changed, when known (sitemap <lastmod>). */
  lastmod?: string;
  structuredData?: readonly StructuredData[];
}

const cheapestMonthly = PLAN_LIST.filter((p) => p.purchasable).reduce<number | null>(
  (min, p) => (min === null || p.priceCents < min ? p.priceCents : min),
  null,
);
const fromPrice =
  cheapestMonthly === null
    ? null
    : `$${(cheapestMonthly / 100).toFixed(cheapestMonthly % 100 === 0 ? 0 : 2)}`;

const LEGAL_DESCRIPTIONS: Record<LegalDocKey, string> = {
  terms:
    "The terms for using Grant Autopilot in plain language: accounts, billing, your role as the applicant, opt-in autopilot and acceptable use.",
  privacy:
    "How Grant Autopilot collects, uses and protects personal information, and the choices and rights you have.",
  "data-use":
    "How Grant Autopilot uses your organization's documents: only for your own applications, never sold and never used to train AI models.",
  refunds: `Grant Autopilot's refund policy: a full refund within ${GUARANTEE_DAYS} days of your first payment, cancel any time, and when renewals can be refunded.`,
  "acceptable-use":
    "What Grant Autopilot may and may not be used for, including the rule against fraudulent or misleading grant applications.",
};

export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  {
    path: "/",
    title: `${SITE_NAME} · Grant applications for small nonprofits`,
    description:
      "Grant Autopilot helps small nonprofits find grants and draft applications where every fact cites your own documents. Anything unverified is flagged, and you approve before anything is sent.",
    changefreq: "weekly",
    priority: 1,
    structuredData: ["organization", "website", "software"],
  },
  {
    path: "/how-it-works",
    title: `How it works · ${SITE_NAME}`,
    description:
      "From your documents and interviews to a cited draft: how Grant Autopilot builds your fact base, finds grants that fit and prepares applications for your team to review.",
    changefreq: "monthly",
    priority: 0.9,
  },
  {
    path: "/pricing",
    title: `Pricing · ${SITE_NAME}`,
    description: `${fromPrice ? `Plans from ${fromPrice} a month, ` : "Plans "}priced close to what it costs us and sized by how many applications you draft. No setup fees, cancel any time, ${GUARANTEE_DAYS}-day money-back guarantee.`,
    changefreq: "monthly",
    priority: 0.9,
    structuredData: ["product"],
  },
  {
    path: "/trust",
    title: `Accuracy and trust · ${SITE_NAME}`,
    description:
      "How Grant Autopilot keeps drafts honest: facts come only from your records, a separate checker verifies every claim, and nothing is sent until your team approves it.",
    changefreq: "monthly",
    priority: 0.8,
  },
  {
    path: "/faq",
    title: `Frequently asked questions · ${SITE_NAME}`,
    description:
      "Answers about Grant Autopilot: how drafts stay accurate, approvals, what happens to your data, AI training, pricing, Grants.gov registration and refunds.",
    changefreq: "monthly",
    priority: 0.7,
    structuredData: ["faq"],
  },
  {
    path: "/for-workforce-programs",
    title: `For workforce programs · ${SITE_NAME}`,
    description:
      "How workforce development programs can use Grant Autopilot to find grants and draft applications grounded in their own program records and outcomes.",
    changefreq: "monthly",
    priority: 0.7,
  },
  {
    path: "/about",
    title: `About · ${SITE_NAME}`,
    description:
      "Why Grant Autopilot exists: helping small nonprofits and tribal organizations apply for more grants with the team they already have.",
    changefreq: "yearly",
    priority: 0.5,
  },
  {
    path: "/contact",
    title: `Contact · ${SITE_NAME}`,
    description:
      "Get in touch with the Grant Autopilot team about plans, partnerships, data handling or support for your organization.",
    changefreq: "yearly",
    priority: 0.5,
  },
  ...LEGAL_DOC_KEYS.map(
    (key): PublicRoute => ({
      path: `/legal/${key}`,
      title: `${LEGAL_DOC_TITLES[key]} · ${SITE_NAME}`,
      description: LEGAL_DESCRIPTIONS[key],
      changefreq: "monthly",
      priority: 0.3,
    }),
  ),
  {
    path: DEMO_PATH,
    title: `${DEMO_TITLE} · ${SITE_NAME}`,
    description: DEMO_DESCRIPTION,
    changefreq: "monthly",
    priority: 0.8,
  },
  ...RESOURCE_ROUTES,
];

export function getPublicRoute(path: string): PublicRoute | undefined {
  const normalized = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return PUBLIC_ROUTES.find((r) => r.path === normalized);
}
