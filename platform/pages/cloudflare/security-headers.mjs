// Baseline response headers, shared by split.mjs (which writes them into both
// Workers' _headers files) and the shard Worker (whose code-built card
// responses do not get _headers rules).
export const SECURITY_HEADERS = Object.freeze({
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
});
