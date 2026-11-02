// The paid path is dark until both values are set. Neither is a secret: the
// checkout link is a public hosted-checkout URL and the organisation id is sent
// with every licence validate call (docs/reports/2026-10-30-billing-plan.md,
// Option A). Setting them is a visible diff; nothing here can move money.
// Confirm the provider's current validate endpoint before filling these in.
export const CHECKOUT_URL = "";
export const LICENCE_ORG_ID = "";
export const VALIDATE_URL = "https://api.polar.sh/v1/customer-portal/license-keys/validate";
export const REFUND_DAYS = 14;
