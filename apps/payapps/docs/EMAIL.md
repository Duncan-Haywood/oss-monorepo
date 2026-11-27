# Email

PayApps sends account mail and invitations, all transactional:

| Mail | When | Link | Expires |
| --- | --- | --- | --- |
| Confirm your email | sign-up (when verification is required), or "Send a new confirmation link" | `/verify-email?token=` | 24 hours |
| Reset your password | "Forgot password?" | `/reset-password?token=` | 1 hour, single use; a reset signs the user out everywhere and marks the address verified |
| You're invited to a company on PayApps | an admin invites the address from the People page | `/invitations` (no token: the invitee accepts signed in with that verified address) | 7 days |
| Your weekly PayApps list: money to chase | the weekday and hour each member picks, in their own time zone (Monday at 13:00 UTC unless they choose otherwise; the page offers 7:00 in the browser's zone; the Worker's hourly cron), to each member who turned it on for a company on the Cash and retainage page, and only in a week with something to chase | `/orgs/:orgId/cash` | n/a |
| Welcome to PayApps: five steps to your first paid application | once, when a verified user creates their first company (not a second one) | `/orgs/:orgId` (the getting-started checklist) | n/a |
| Add your first job to PayApps | once per company, from the cron on Mondays (the 13:00 UTC run only), 3 to 30 days after the company was created, while it has no real job (a sample job alone still counts as none); to its owners with a verified address who have not stopped the reminders | `/orgs/:orgId` (add a job) | n/a; carries the reminders' one-click stop |
| Your first pay application on PayApps | once per company, from the cron on Mondays (the 13:00 UTC run only), 5 to 60 days after the company was created, when it has a real job (never the sample) and no application marked sent; to its owners with a verified address who have not stopped the reminders | the next open checklist step (the job or the draft application) | n/a; carries the reminders' one-click stop |
| You already have an account | sign-up with an address that already has one (the API answers the same as a new sign-up, so it reveals nothing) | `/forgot-password` | n/a |

Templates and the per-user throttle: `src/worker/services/auth/emails.ts`. Better Auth wiring:
`src/worker/services/auth/auth.ts`. Pages: `src/client/pages/account.tsx`. Tests:
`test/worker/auth-email.test.ts`, `src/worker/ports/email.test.ts`.

## Weekly "money to chase" email

Opt-in per member per company (`cash_digest_subscriptions`, migration 0018; no row, no mail):
`GET/PUT /api/orgs/:orgId/digest` sets only the signed-in member's own row, any role, and the
Cash and retainage page has the checkbox, the day of the week (`weekday`, 0 Sunday ... 6 Saturday,
default Monday; migration 0024), the hour (`hour`, 0-23, default 13) and the IANA time zone
(`time_zone`, default `UTC`; both migration 0029) they are read in, the next day it will go and a
preview count. The page sends the browser's zone and 7:00 when a member turns it on, and offers to
switch to the device's zone when the saved one differs. The hourly cron (`wrangler.jsonc`
`triggers.crons`, `scheduled` in `src/worker/index.ts`) runs `sendWeeklyDigests`
(`src/worker/services/payapps/digest.ts`):

- Due (`digestDueDay`): in the member's own zone it is their weekday and at or after their hour
  (a missed hourly run still sends later that local day), still a member, verified address,
  nothing sent in the last 6 days counted in their local days (so a day changed after this week's email takes effect the week after). One cash report per
  company, without the sample job; the lines are the report's own next steps
  (`src/shared/cash-digest.ts`), at most 15 jobs, the rest counted.
- The company's own insurance certificates (2026-11-26): every active one expired or expiring within
  30 days of the report's date is listed under "Insurance certificates to renew", soonest first, at
  most 10 (the rest counted), with a link to `/orgs/:orgId/insurance`; archived ones never. Each
  line names the GCs recorded as holding the certificate (part 3), each GC once: "Send the renewal
  certificate to Peak GC and Sierra Builders" once expired, "Held by ..." while expiring. A
  certificate alone sends the email, since it is the company's and not a job's next step.
- The company's licenses and other compliance documents (2026-11-27, `documentsNeedingRenewal` in
  `src/shared/company-documents.ts`): every active one with an expiry date that is expired or
  expires within 30 days of the report's date, under "Licenses and company documents to renew",
  soonest first, at most 10 (the rest counted), with a link to `/orgs/:orgId/documents`. Archived
  ones and ones with no expiry date (a W-9, a written safety program) never. Alone enough to send
  the email, like a certificate: a GC asks for the renewed copy, and a lapsed license can stop work.
- Signed T&M tickets not on a change order (2026-11-26, `ticketsToBill` in
  `src/shared/tm-tickets.ts`): one line per active job under "Signed T&M tickets to bill", the
  oldest work first, at most 10 jobs (the rest counted), with the ticket numbers, the priced total,
  how many are not priced yet and the oldest work date, linked to the job's T&M page. Tickets on the
  sample job never; a ticket on any change order (pending, approved or rejected) drops off. Alone
  enough to send the email: the GC signed for the work and nobody has asked to be paid for it.
- Lower-tier waivers still out (2026-11-26, `lowerTierToChase` in
  `src/shared/lower-tier-waivers.ts`): one line per pay application on an active job with a
  supplier's or sub-subcontractor's waiver not received (no received date, no signed file on its
  row), under "Lower-tier waivers still out", the longest wait since the request first (lists nobody
  has asked yet after those), at most 10 (the rest counted). Each names up to three parties, how many
  are out, how long the oldest request has waited and how many are not asked for yet, linked to the
  pay application's lower-tier panel. The sample job and closed jobs never. Alone enough to send the
  email: many GCs hold a payment until the lower-tier waivers are in. The same list is an alert on
  the projects page (`GET /api/orgs/:orgId/lower-tier-waivers/outstanding`, every member).
- Weekdays without a daily report (2026-11-27, `dailyReportGaps` in `src/shared/daily-reports.ts`):
  one line per active job with weekdays missing from its log in the 7 days before the email (less
  the company's holidays listed on the crews page, 2026-11-27), among
  jobs with a report in the 14 days through it, most days first, at most 10 (the rest counted),
  linked to the job's daily reports. Never enough alone to send the email (docs/DAILY-REPORTS.md,
  "In the weekly email").
- Nothing to chase and no certificate or document to renew: no email, and the week counts as done.
- Each send is claimed first by a conditional update of `last_sent_on`, so a retried or doubled
  run never mails twice; a failed send restores the old value and the next run tries again.
- At most 200 companies a run (the rest wait for the next run); logs `digest.run` with counts only.
- Fixed subject; company, job and GC names (customer text) only in the escaped body.
- One-click unsubscribe (2026-11-25): every email carries a "Stop this weekly email" link to
  `/unsubscribe?o=&u=&t=` and the RFC 2369/8058 headers `List-Unsubscribe:
  <APP_URL/api/unsubscribe/digest?o=&u=&t=>` and `List-Unsubscribe-Post:
  List-Unsubscribe=One-Click`, so Gmail, Outlook and Apple Mail show their own unsubscribe button.
  `t` is an HMAC-SHA256 of the company and member ids under `AUTH_SECRET`
  (`src/worker/lib/unsubscribe-token.ts`, verified in constant time, never expires): it stops only
  that member's email for that company, and nobody can make one for someone else. `GET` only reads
  (mail scanners open links); `POST` deletes the row, from a mail app's one-click or the page's
  button, with no session (`src/worker/routes/unsubscribe.ts`). A bad link answers 404. Without an
  `AUTH_SECRET` of 32+ characters (local dev) the email has no link and says to turn it off on the
  Cash page. The email port passes only these two extra headers (`ALLOWED_HEADERS`), each on one
  line.

## Getting-started emails

Words and rules in `src/shared/onboarding-email.ts`, built from the same checklist as the Projects
page (`src/shared/getting-started.ts`), so an email never calls a step done that the page does not.
Sends in `src/worker/services/payapps/onboarding.ts`:

- Each send is claimed first with a row in `onboarding_emails` (migration 0022; primary key company +
  kind), so a company gets each email at most once even when a request or the cron runs twice; a
  failed send deletes the claim and the next chance retries. A company checked and not due is not
  claimed, so the cron looks again next week while it is inside its window (3 to 30 days for the
  no-job reminder, 5 to 60 for the first-send one).
- The welcome email is sent from `POST /api/orgs` after the company exists and never fails that
  request. The two reminders run from the same cron as the weekly digest, on Mondays only, each
  independently of the other and of the digest, at most 200 companies a run each, logging
  `onboarding.no-job_run` and `onboarding.first-send_run` with counts only. Their states never
  overlap (no real job, or a real job and nothing sent), so a company gets at most two reminders
  over its first two months, and the no-job one says one more may follow.
- The welcome email is a one-off reply to creating the company and has no unsubscribe. Both
  reminders carry a signed one-click stop (2026-11-25): a "Stop these reminders" link to
  `/unsubscribe?list=onboarding&o=&u=&t=` in the text and RFC 8058 `List-Unsubscribe` /
  `List-Unsubscribe-Post` headers pointing at `POST /api/unsubscribe/onboarding?o=&u=&t=`. The token
  is the same HMAC as the weekly email's under `AUTH_SECRET` but over its own label
  (`lib/unsubscribe-token.ts`), so a digest link never stops the reminders or the other way round.
  GET reads and never changes anything; POST writes one `stop:<userId>` row in `onboarding_emails`
  for that company (no migration: `kind` is plain text). Stopped owners are skipped; when every owner
  stopped, the company is not claimed. Without `AUTH_SECRET` (local dev) the reminders go without the
  link. Fixed subjects; the company and job names (customer text) appear only in the escaped body.
- The same stop, in the app (2026-11-25): an owner sees **Email me a reminder about the next step**
  under the Getting started checklist on the Projects page (`GET/PUT
  /api/orgs/:orgId/getting-started/reminders`, `{ on }`, the signed-in member for the tenant's
  company only). Off writes the same `stop:<userId>` row as the link; on deletes it, which is also
  the only way back after pressing the link. Each reminder is still claimed once per company, so
  turning them back on never repeats one already sent. Non-owners get `sentToRole: false` and no
  switch, since the reminders go to owners only.

## When verification is required

`requiresEmailVerification(env)`: always on production or any HTTPS `APP_URL`. Off in `APP_ENV=test`
(tests opt in per request with the `x-test-require-email-verification: 1` header) and in the local
plain-http offline demo (`FAKE_EXTERNALS=true`), where mail goes to an in-memory fake nobody can open.

## Throttles

- Better Auth's in-memory limiter (per isolate, HTTPS only): sign-in 10/min, sign-up 5/min,
  send-verification-email 3/min, request-password-reset 3/min, reset-password 10/min.
- Invitations: 20 emails per company per hour (`INVITE_EMAIL_THROTTLE`, `throttle:invite:<orgId>`).
  Over the limit the invite is refused with 429 before anything is saved. The subject is fixed text,
  so a company or inviter name (typed by customers) never reaches a header; the body escapes both.
- Durable per-user windows in the `verification` table (`throttle:<kind>:<userId>`): 3 confirmation
  and 3 reset emails per 15 minutes, 1 "already have an account" email per hour. A throttled or failed
  send is logged (`auth.email_throttled`, `auth.email_failed`, user id only) and never changes the
  HTTP answer.

## Provider (`src/worker/ports/email.ts`, `createEmailSender`)

| Setting | Mail goes to |
| --- | --- |
| `APP_ENV=test`, or `FAKE_EXTERNALS=true` outside production | `FakeEmailSender` (memory) |
| `EMAIL` binding present and `EMAIL_FROM` set | Cloudflare Email Service (`CloudflareEmailSender`) |
| anything else | `LogEmailSender`: logs `email.not_sent_no_provider` with the recipient count and subject |

The `EMAIL` binding is `send_email` in `wrangler.jsonc`; `wrangler dev` only simulates sends.
Cloudflare Email Service is transactional-only, which is all PayApps sends. Pricing, limits, SPF/DKIM
and the beta caveat were checked for apps/grants on 2026-11-24: `apps/grants/docs/EMAIL.md`.

The adapter keeps the grants rules: one bare address per recipient (anything with a comma, angle
bracket, quote or whitespace is refused), the subject flattened to one line, `EMAIL_FROM` parsed and
refused unless it is one safe address, and the provider's error code kept in the thrown message.
Logs never carry an address, link or token.

## Turning it on (the deploy, once it exists)

1. The sender domain must be onboarded to Cloudflare Email Service. `marisstella.app` already is, for
   apps/grants (`apps/grants/email-sending.json`, applied by `apps/grants/scripts/email-sending.mjs`).
2. Set `EMAIL_FROM`, for example `PayApps <no-reply@marisstella.app>`, as a deploy var.
3. After the deploy, `GET /api/health` must answer `"email": true`. With `false`, verification is still
   required on HTTPS, so nobody can finish signing up: treat it as a failed deploy.

## Not yet

- One-click unsubscribe for the weekly email (above).
- A notice to the member when someone adds them to a company.
