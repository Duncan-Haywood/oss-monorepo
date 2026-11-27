# Early-access list (double opt-in, D1)

Same design as apps/grants' newsletter (`apps/grants/docs/EMAIL_MARKETING.md`), reduced to what a
waitlist needs. Code: `src/early-access.mjs` (logic), `src/worker.mjs` (routes), table in
`migrations/0001_early_access.sql`. Tests: `test/early-access.test.mjs` (real SQL via node:sqlite).

## Flow

1. **Sign up.** The form (home, every platform page, pricing, Schedule C, `/early-access`) is a plain
   POST to `/seller-books/api/early-access/subscribe`: no JavaScript. Checks, in order: Origin must be
   this site (CSRF), per-IP rate limit (`EARLY_ACCESS_LIMITER`, 5/min), validation (one bare address,
   site-path `source`, current `consentVersion`, platforms from the list, order band from the list).
   `website` is a honeypot. Every valid request gets the same 303 to `/early-access/thanks` (or 202 JSON),
   whatever the address's state; the work runs in `waitUntil`, so timing doesn't reveal membership.
2. **Confirmation email** (transactional, Cloudflare Email Service `send_email` binding) with a
   7-day single-use token. Only its SHA-256 is stored. Per address: one email per 10 minutes, five a
   day. A confirmed address gets nothing and its survey answers can't be changed by an unconfirmed
   request.
3. **Confirm.** The link opens a page with a button (GET never confirms: mail scanners fetch links);
   the button POSTs the token.
4. **Unsubscribe.** `u1.{id}.{HMAC-SHA256(TOKEN_SECRET)}`, derived, never stored. Every email carries
   `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058); the POST route
   has no Origin check because mail providers send it. Unsubscribing keeps the address as a suppression
   record and clears the survey answers and IP hash (as `/privacy` says).
5. **Purge.** A daily Durable Object alarm (`src/purge-clock.mjs`; any request to the Worker arms it, then it re-arms itself; not a cron trigger, since the account allows 5) deletes signups never confirmed within 30 days, once their newest confirmation link (7 days) has also expired.

## Data (`early_access_signups`)

Public prospects, not customer data. Columns: `email` (lowercased, unique), `status`
(`pending` → `confirmed` → `unsubscribed`), `platforms` (JSON array of slugs), `volume` (order band),
`consent_source`, `consent_text_version` (`EARLY_ACCESS_CONSENT_VERSION`; bump it whenever
`EARLY_ACCESS_CONSENT_TEXT` changes), `consent_ip_hash` (salted SHA-256, never the raw IP), token hash +
expiry, send counters, timestamps (epoch ms).

Never log an address or a token. Counts for pricing research:

```bash
wrangler d1 execute seller-books-site --remote --command \
  "SELECT volume, COUNT(*) FROM early_access_signups WHERE status='confirmed' GROUP BY volume"
```

## Not built yet

- Invite / progress emails to confirmed members. Those are marketing mail: send them through a
  marketing sender (grants uses Resend for this), with the unsubscribe headers above and a real postal
  address (CAN-SPAM) — never invent one.
