// Site-wide constants. SITE_NAME is the name the app itself uses (sign-up, emails, PDFs), so the site
// and the product a visitor lands in agree. Change it here and every page, title, JSON-LD node,
// llms.txt and the sitemap follow (and the text in public/favicon.svg and public/og.png).

export const SITE_NAME = "Job Shop Quote";
/** One line under the name, used in the header, llms.txt and JSON-LD. */
export const TAGLINE = "RFQ-to-quote for CNC and fabrication job shops";
/** Production URL (origin + base path); scripts/build.ts uses env SITE_URL when set. */
export const DEFAULT_SITE_URL = "https://marisstella.app/jobshop";
/** The sibling CMMC product's site (apps/cmmc-site). Not live yet: always labelled "coming". */
export const CMMC_SITE_URL = "https://marisstella.app/cmmc";
/** Routed mailbox shared with apps/grants (Cloudflare Email Routing). */
export const CONTACT_EMAIL = "hello@marisstella.app";
export const PUBLISHER = "Maris Stella Labs LLC";
/** The day the site's copy was last reviewed (sitemap lastmod for pages without their own date). */
export const CONTENT_DATE = "2026-11-27";

/**
 * The launch switch. What the hosted app can do today decides what the site may say; every line it
 * changes reads these, so flip a value here (and `pnpm export:catalogue`) when the app changes.
 *
 * - `appUrl`: where sign-up lives (apps/jobshop-quote, deployed by priv-jobshop-quote-deploy.yml;
 *   live since run 46018975911, 2026-11-27). `null` before launch: the site then offers only the
 *   early-access list.
 * - `open`: the app takes sign-ups, so the early-access list, its form and its thank-you page are
 *   gone, and every call to action is "Start free". Needs `appUrl`.
 * - `aiReading`: the app reads RFQ emails and drawings with AI. Off until the owner sets
 *   `JOBSHOP_ANTHROPIC_API_KEY` (apps/jobshop-quote/docs/LAUNCH-REVIEW.md, section 1); while off the
 *   site says so wherever it describes the reading.
 * - `inboundEmail`: RFQs forwarded to a shop address arrive by themselves (`JOBSHOP_INBOUND_EMAIL`).
 * - `paidPlans`: checkout is live (Paddle verified, `JOBSHOP_BILLING_PROVIDER` set).
 */
export interface Launch {
  appUrl: string | null;
  open: boolean;
  aiReading: boolean;
  inboundEmail: boolean;
  paidPlans: boolean;
}

export const LAUNCH: Launch = {
  appUrl: "https://jobshop-quote.marisstella.app",
  open: true,
  aiReading: false,
  inboundEmail: false,
  paidPlans: false,
};

/** `path` on the app (`/sign-up`, `/legal/privacy`); throws when the app has no URL yet. */
export function appLink(launch: Launch, path: `/${string}`): string {
  if (!launch.appUrl) throw new Error("The site links to the app, which needs LAUNCH.appUrl");
  return `${launch.appUrl.replace(/\/+$/, "")}${path}`;
}
