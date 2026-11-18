// Where the paid branded results report is sold. Both values are public links, not secrets.
// CHECKOUT_URL stays empty until the owner creates a hosted checkout product at a
// merchant of record. While it is empty nothing offers the report; the ranking, its
// intervals and the CSV stay free either way.
export const CHECKOUT_URL = "";
// Lemon Squeezy's public licence validate call (form POST, no API key). Read from memory
// of its docs, not run against a live product: confirm before CHECKOUT_URL is set.
export const VALIDATE_URL = "https://api.lemonsqueezy.com/v1/licenses/validate";
