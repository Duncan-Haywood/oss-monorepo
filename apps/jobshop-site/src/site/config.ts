// Site-wide constants. The product name is PROVISIONAL (see README.md): change SITE_NAME here and
// every page, title, JSON-LD node, llms.txt and the sitemap follow.

export const SITE_NAME = "RFQ Desk";
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
export const CONTENT_DATE = "2026-11-24";
