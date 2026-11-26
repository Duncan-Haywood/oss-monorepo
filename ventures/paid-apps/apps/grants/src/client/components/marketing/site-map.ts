// Public marketing pages: paths and the nav links the public header and footer show. The routes are
// wired in src/client/router.tsx under publicLayout.

export const MARKETING_PATHS = {
  howItWorks: "/how-it-works",
  pricing: "/pricing",
  trust: "/trust",
  faq: "/faq",
  about: "/about",
  contact: "/contact",
  workforce: "/for-workforce-programs",
} as const;

export type MarketingPath = (typeof MARKETING_PATHS)[keyof typeof MARKETING_PATHS];

export interface NavItem {
  to: MarketingPath;
  label: string;
}

/** Links for the public header (keep it short: four fit on a tablet next to the account buttons). */
export const HEADER_NAV: readonly NavItem[] = [
  { to: MARKETING_PATHS.howItWorks, label: "How it works" },
  { to: MARKETING_PATHS.pricing, label: "Pricing" },
  { to: MARKETING_PATHS.trust, label: "Security & privacy" },
  { to: MARKETING_PATHS.faq, label: "FAQ" },
];

export const FOOTER_PRODUCT_NAV: readonly NavItem[] = [
  { to: MARKETING_PATHS.howItWorks, label: "How it works" },
  { to: MARKETING_PATHS.pricing, label: "Pricing" },
  { to: MARKETING_PATHS.trust, label: "Security & privacy" },
  { to: MARKETING_PATHS.faq, label: "Questions" },
  { to: MARKETING_PATHS.workforce, label: "For workforce programs" },
];

export const FOOTER_COMPANY_NAV: readonly NavItem[] = [
  { to: MARKETING_PATHS.about, label: "About us" },
  { to: MARKETING_PATHS.contact, label: "Contact" },
];

/**
 * Public contact address. hello@marisstella.app is a real, routed mailbox: Cloudflare Email Routing for
 * the marisstella.app zone is kept as code in the portfolio repository
 * (platform/pages/cloudflare/email-routing.json: "hello" = general enquiries, "support" = product help).
 */
export const CONTACT_EMAIL = "hello@marisstella.app";
