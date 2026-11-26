// The early-access list's shared words: which products take sign-ups, and the
// consent sentence the form shows and the edge Worker stores the version of.
//
// It lives here, dependency-free, because both sides import it: the site
// builder (platform/pages/early-access-form.mjs), which runs in the privileged
// Pages deploy jobs, and the edge Worker (platform/edge/early-access.mjs).
// .github/ci-policy.yaml already accepts platform/pages/ in every workflow,
// so the builder never imports the Worker's storage code.

/** Products that take early-access sign-ups: the paid bets in portfolio/monetization/bets.md. */
export const EARLY_ACCESS_PRODUCTS = Object.freeze({
  payapps: 'PayApps: pay applications, retainage and lien waivers for subcontractors',
  'jobshop-quote': 'Job shop quoting: RFQ to quote for CNC and fabrication shops',
  cmmc: 'CMMC and ISO 9001 workspace for small defense suppliers',
  einvoice: 'E-invoice fix-and-explain',
  'seller-books': 'Reseller profit and Schedule C books',
  takeoff: 'Residential takeoff from plans',
});

/** Bump with any change to CONSENT_TEXT: each row stores the version its person saw. */
export const CONSENT_VERSION = '2026-11-26';
/** The words shown beside the checkbox. */
export const CONSENT_TEXT =
  'Email me once when this product opens. Maris Stella Labs keeps my address privately for at most a year and uses it for nothing else.';
