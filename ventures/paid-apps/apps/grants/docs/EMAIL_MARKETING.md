# Email marketing: grant guide newsletter

A double-opt-in email list for people who read the resource guides, plus one-click unsubscribe on
team notification emails. **Sending the welcome series is off by default** and needs the owner to
switch it on (see "Turning it on").

## What exists

| Piece | Where |
| --- | --- |
| Signup form ("Get new grant guides by email") on `/resources` and at the end of every guide | `src/client/components/marketing/newsletter-signup.tsx` |
| Confirm and unsubscribe pages (`/newsletter/confirm`, `/unsubscribe`) | `src/client/routes/marketing/newsletter.tsx` |
| Consent wording + its version, shared contract | `src/shared/newsletter.ts` |
| Public API (`/api/newsletter/*`) | `src/worker/routes/newsletter.ts` |
| One-click unsubscribe for team notifications (`/api/email/unsubscribe`) | `src/worker/routes/email-unsubscribe.ts`, `services/digest/unsubscribe.ts` |
| Subscribe / confirm / unsubscribe / sequence sender / purge | `src/worker/services/marketing/` |
| Welcome series content | `services/marketing/render.ts` (guide titles and links imported from `src/client/content/resources/*`) |
| Tables | `db/schema/marketing.ts`, `notification_opt_outs` in `db/schema/digest.ts`, migration `migrations/0001_newsletter.sql` |
| Admin counts | `GET /api/admin/newsletter` (platform admins; counts and gating only, never addresses) |

## Data model

**Not tenant data.** `marketing_subscribers` and `marketing_email_log` hold public prospects who
signed up on the marketing site. They have no `org_id`, so they are outside tenant export/deletion
(`tenantTables()` skips them) and no tenant route can read them.

`marketing_subscribers`

| Column | Notes |
| --- | --- |
| `email` | Trimmed + lowercased; unique. Kept after unsubscribe as the suppression record. |
| `status` | `pending` → `confirmed` → `unsubscribed`. A re-signup of an unsubscribed address stays `unsubscribed` until the new link is confirmed. |
| `consent_source` | Site path of the form, e.g. `/resources/need-statement-funders-trust`. |
| `consent_text_version` | `NEWSLETTER_CONSENT_VERSION` of the wording shown (bump it when the wording changes). |
| `consent_ip_hash` | Salted SHA-256 of the signup IP (`privacy/consents#hashIp`); raw IPs are never stored. |
| `confirm_token_hash`, `confirm_token_expires_at` | SHA-256 of the double-opt-in token (7-day expiry). Cleared on confirm/unsubscribe. The raw token only exists in the email. |
| `confirm_sent_at`, `confirm_send_count` | Per-address resend limit: one confirmation per 10 minutes, at most 5 per rolling day. |
| `confirmed_at`, `unsubscribed_at`, `unsubscribe_method` | `link` (page button) or `one_click` (RFC 8058 POST from the mail provider). |
| `last_sequence_sent_at`, `next_sequence_at` | Sequence scheduling (cron query uses `(status, next_sequence_at)`). |

`marketing_email_log (subscriber_id, step_key)` is unique: a sequence step is claimed before it is
sent and released if the send fails, so overlapping cron runs and retries never send a step twice.
The Resend idempotency key `newsletter:{subscriberId}:{step}` is a second guard.

`notification_opt_outs (org_id, email_hash, kind)` is tenant data (cascades with the org; included in
org export/deletion): one-click unsubscribes from team notifications by addresses that are not org
members (e.g. listed in `org_settings.notifyEmails`). Only a hash of the address is stored.

**Unsubscribe tokens are not stored.** Newsletter: `u1.{subscriberId}.{HMAC}`; team notifications:
`n1.{orgId}.{w|d}.{sha256(address)}.{HMAC}` (the address never appears in the URL). Both are
HMAC-SHA256 with `AUTH_SECRET`. Rotating `AUTH_SECRET` invalidates links in emails already sent;
the List-Unsubscribe header in newer emails keeps working.

## Flows

1. **Subscribe** `POST /api/newsletter/subscribe` `{ email, source, consentVersion, website }`
   - Origin check (CSRF), then per-IP and per-address limits (`NEWSLETTER_LIMITER`, 5/min each),
     zod validation (single bare address, site-path `source`, current consent version, strict).
   - `website` is a honeypot: when filled, nothing happens but the answer is the same.
   - Always `202 { ok: true, message }` with the same message, whether the address is new, pending,
     confirmed or unsubscribed. The work runs after the response (`ctx.defer`), so timing does not
     reveal list membership either. Confirmed addresses get no email.
   - New / pending / unsubscribed addresses get a confirmation email (idempotency key
     `newsletter-confirm:{id}:{tokenHash}`), within the resend limits above.
2. **Confirm** The email links to `/newsletter/confirm?token=…`. The page asks for one click and then
   calls `POST /api/newsletter/confirm?token=…`. `GET /api/newsletter/confirm` only redirects to the
   page: mail-filter link scanners fetch links, and confirming on GET would let a scanner opt someone
   in on their behalf (which defeats double opt-in). Tokens are single-use and expire after 7 days.
3. **Unsubscribe**
   - Every newsletter email carries `List-Unsubscribe: <https://…/api/newsletter/unsubscribe?token=…>`
     and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 2369 / RFC 8058; required by Gmail
     and Yahoo for bulk senders). Mail providers POST there with no cookies and no Origin; the route
     is mounted before the Origin check and accepts form bodies (`one_click_unsubscribe` body rule).
   - The footer links to `/unsubscribe?token=…`, one button, no login.
   - Unsubscribing is immediate and idempotent; it also cancels any remaining sequence steps.
4. **Welcome / nurture sequence** (`services/marketing/sequence.ts`), only for `confirmed`
   subscribers, sent by the `*/30 * * * *` cron in batches of 50:

   | Step | Due after confirming | Content |
   | --- | --- | --- |
   | `welcome` | right away (next cron run) | Documents funders ask for; SAM.gov/UEI/Grants.gov registration |
   | `getting-ready` | 3 days | Funder types; need statements |
   | `writing` | 7 days | Grant reporting; using AI honestly; `/trust#accuracy` |
   | `how-it-works` | 14 days | `/how-it-works`, `/demo`, `/trust`; says it is the last email of the series |

   Steps go out in order, at most one per subscriber per run, and at least 2 days apart, so turning
   sending on after a backlog has built up spaces the series out instead of sending four at once.
5. **Purge** The daily cron deletes `pending` signups older than 30 days (this runs even while
   sending is off; it only deletes data).

**Team notifications (weekly digest, deadline nudges).** These were sent as one email to all
recipients with only a "manage notifications" link. They now go one copy per recipient, each with
its own `List-Unsubscribe` headers and an "Unsubscribe" footer link. Clicking it turns off that kind
(digest or deadline reminders) for that org: members get their `email_preferences` flag turned off
(visible and reversible in settings); other addresses get a `notification_opt_outs` row that
`notificationRecipients()` honours. The digest claim (`digest_log`) is released only when no copy
was delivered; idempotency key per recipient `digest:{orgId}:{key}:{addressHash}`.

## Compliance checklist

CAN-SPAM (US) and GDPR/PECR-style consent:

- [x] Consent is opt-in and confirmed (double opt-in). Nothing is pre-checked; account holders are
      not added automatically.
- [x] Consent evidence per subscriber: page, consent wording version, time, hashed IP, confirmation
      time.
- [x] Every marketing email: working unsubscribe link (footer) + one-click `List-Unsubscribe`
      headers, honoured immediately (CAN-SPAM allows 10 business days; we do it at once).
- [x] Unsubscribe needs no login, no fee and no information beyond the click.
- [x] Every marketing email names the sender (`Grant Autopilot · Operated by Mary Stella Labs, LLC`)
      and says why the reader is getting it.
- [ ] **Physical postal address in every marketing email: NOT CONFIGURED.** `MARKETING_POSTAL_ADDRESS`
      is an empty placeholder in `wrangler.jsonc`. No address was invented. Sending refuses to run
      while it is empty (`blockers: ["no_postal_address"]`). A PO box or registered commercial mail
      receiving agency address is acceptable under CAN-SPAM.
- [x] Subject lines describe the content; no deceptive headers (From is `EMAIL_FROM`).
- [x] Copy uses no invented statistics or testimonials; guide titles/descriptions are imported from
      the guides themselves; product claims match the site's existing wording.
- [x] No tracking pixels, no remote images, no link redirect tracking.
- [x] Never-confirmed addresses are deleted after 30 days; unsubscribed addresses are kept only as a
      suppression record (disclosed in the Privacy Policy).
- [x] Privacy Policy updated (version 2026-11-24): what is collected for guide emails, why,
      retention, and unsubscribe choices. `POLICY_VERSION` was bumped with it, so signed-in users are
      asked to re-accept the policies on their next sign-in.
- [x] Logs never contain addresses or tokens (subscriber ids and outcomes only).

## Turning it on (owner)

1. **Postal address.** Set `MARKETING_POSTAL_ADDRESS` in `wrangler.jsonc` `vars` to the real
   mailing address of Mary Stella Labs, LLC (leave the empty key in `wrangler.test.jsonc`).
2. **Sending domain.** Marketing mail goes through Resend even when transactional mail uses
   Cloudflare Email Service, which accepts transactional mail only (docs/EMAIL.md). In Resend, verify the domain used by `EMAIL_FROM` (SPF and DKIM records, and a
   DMARC record, at least `p=none`), and set `EMAIL_FROM` to an address on it. Gmail/Yahoo bulk-sender
   rules require SPF + DKIM + DMARC alignment and one-click unsubscribe. `EMAIL_FROM` is still the
   `example.org` placeholder (see docs/LAUNCH_CHECKLIST.md).
3. **`RESEND_API_KEY`** must be set. Without it the nurture sends fail and retry (they are never sent
   through Cloudflare), and with no provider at all every email is only logged.
4. **Enable.** Set `MARKETING_EMAIL_ENABLED` to `"true"` in `wrangler.jsonc` and deploy.
5. **Check.** `GET /api/admin/newsletter` should show `sendingEnabled: true` and no `blockers`.
   Workers Logs show `newsletter.sequence_run` with counts after each half-hourly run.

Signup and confirmation work while sending is off (confirmation emails are a direct response to
someone's request, not unattended sends), so the list can grow before launch. The form promises a
welcome series and new-guide emails, so turn sending on reasonably soon or adjust the wording.

## Not built yet

- **"New guide published" broadcasts.** The consent wording covers them, but there is no broadcast
  sender. When a guide is added, a one-off send to `confirmed` subscribers (with the same headers,
  footer, idempotency key per subscriber+guide and batching) is the next piece.
- **Bounce / complaint handling.** Cloudflare Email Service keeps its own suppression list for
  transactional mail (docs/EMAIL.md). For the marketing list, Resend webhooks for hard bounces and spam complaints should mark
  subscribers `unsubscribed` (method `complaint`/`bounce`). Not wired.
- **Full erasure on request** is manual (delete the row); there is no self-service "forget me".
- **Bot protection** is the honeypot plus rate limits. If signups get abused, add the existing
  Turnstile check (`middleware/turnstile.ts`) to the subscribe route.
