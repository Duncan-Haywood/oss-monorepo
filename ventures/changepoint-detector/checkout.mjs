// Where the paid change-report unlock is sold. Both values are public links, not secrets.
// CHECKOUT_URL stays empty until the owner creates a hosted checkout product with a
// merchant of record (docs/reports/2026-10-30-billing-plan.md, Option A). While it is
// empty the page shows no Buy button; the detector, the per-point CSV, the CLI and the
// agent engine all stay free either way.
export const CHECKOUT_URL = "";
// Lemon Squeezy's public licence validate call (form POST, no API key). Read from memory
// of its docs, not run against a live product: confirm before CHECKOUT_URL is set.
export const VALIDATE_URL = "https://api.lemonsqueezy.com/v1/licenses/validate";
