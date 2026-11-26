# Email

CMMC Workspace sends account mail (transactional messages to the address a person typed, about
their own account) and one reminder: the affirmation reminder below. The code is a port of apps/jobshop-quote's (2026-11-25), itself from
apps/payapps and apps/grants; the rules below match that app's `docs/EMAIL.md`.

| Mail | When | Link | Expires |
| --- | --- | --- | --- |
| Confirm your email | sign-up (when verification is required), or "Send a new confirmation link" | `/verify-email?token=` | 24 hours |
| Reset your password | "Forgot password?" on the sign-in page | `/reset-password?token=` | 1 hour, single use; a reset signs the user out everywhere and marks the address confirmed |
| Affirmation reminder | daily cron, when a date reaches 60 or 7 days out (below) | `/?tab=affirmations`, and the signed `/unsubscribe?o=&u=&t=` | the stop link never expires (RFC 8058) |
| You already have an account | sign-up with an address that already has one (the API answers the same as a new sign-up, so it reveals nothing) | `/forgot-password` | n/a |

## When verification is required

`requiresEmailVerification` (`src/worker/services/auth/auth.ts`): always on production and any
HTTPS `APP_URL`, and wherever real mail is sent. Off only under `APP_ENV=test` (a worker test opts
in per request with the `x-test-require-email-verification: 1` header) and the plain-http offline
demo (`FAKE_EXTERNALS=true`), where mail goes to an in-memory fake nobody can open.

Where it is on:

- email+password sign-in answers 403 `EMAIL_NOT_VERIFIED` until the link is used; the sign-in form
  then offers "Send a new confirmation link";
- sign-up answers without a session, and the page says to check the inbox;
- opening the link confirms the address and signs the person in;
- an admin cannot add an account that has not confirmed its address to an organization
  (`addMember`, 400), so an account someone created with another person's address and never
  confirmed cannot be put into an organization under that address.

## Affirmation reminders

`src/worker/services/affirmations/reminders.ts`, run by the daily cron (`23 11 * * *`, after
midnight in every US time zone):

- **What:** every annual affirmation, self-assessment or POA&M closeout date on the Affirmations
  page that is 60 days out or less (stage 60) or 7 days out or less (stage 7), and one notice once
  a date has passed with no newer affirmation recorded (stage 0, `OVERDUE_STAGE`), sent only while
  the date passed at most 30 days ago (`OVERDUE_NOTICE_DAYS`), so a date that lapsed long before the
  first run does not start mailing; the page shows it in red either way. The notice asks the admin
  to record the affirmation if the official already entered it in SPRS. One message per member per organization per day, listing every date that reached a stage,
  with the eCFR basis and the planning-aid note (the app never submits to SPRS).
- **Who:** members with role admin or owner, with a confirmed address where sign-in needs one,
  who have not turned it off. Editors and viewers see the setting but get nothing.
- **Once:** each (org, level, deadline, due date, stage) is inserted into `affirmation_reminder_sent`
  before sending; only rows this run inserted are mailed, so overlapping runs never repeat one. A
  new affirmation moves the due date, so the next cycle is reminded again. A missed day sends on
  the next run. A failed send is logged with counts and not retried.
- **Stopping it:** the "Email me 60 and 7 days before each date falls due, and once if it passes" box on the Affirmations
  tab (`GET|PUT /api/orgs/:orgId/affirmations/reminders`, the member's own row in
  `member_notifications`), or the signed link in every message: `List-Unsubscribe` plus
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click` point at
  `POST /api/unsubscribe/affirmation-reminders?o=&u=&t=`, and the text links the `/unsubscribe`
  page, whose button sends the same POST. GET never changes anything (scanners open links). The
  token is an HMAC-SHA256 of the list label, org id and user id under `AUTH_SECRET`
  (`src/worker/lib/unsubscribe-token.ts`, from apps/payapps); a bad one is a 404. Without an
  `AUTH_SECRET` of 32+ characters there is no link and the text points to the page instead.

## Abuse limits

- Per user, durable in D1 (`verification` rows named `throttle:<kind>:<userId>`): 3 confirmation
  mails and 3 reset mails per 15 minutes, 1 "already have an account" mail per hour. A throttled or
  failed send never changes the API's answer, so neither reveals whether an address has an account.
- Per IP, Better Auth's in-memory limits on hardened deployments (best effort, per isolate): 3 a
  minute for resends and reset requests, 10 for resets, 10 for sign-in, 5 for sign-up.
- Logs carry user ids and kinds, never addresses, links or tokens.

## Providers (`src/worker/ports/email.ts`)

- Cloudflare Email Service through the Worker's `send_email` binding `EMAIL` (wrangler.jsonc), when
  `EMAIL_FROM` is set. Every recipient must be one bare address; subjects and display names are put
  on one line, so a name with a line break cannot add a header.
- `FakeEmailSender` in tests and the offline demo (never in production).
- `LogEmailSender` otherwise: logs that a message was not sent (recipient count and subject only).

`GET /api/health` reports `email: true` only when mail actually leaves the Worker. The deploy's
smoke test (`.github/workflows/cmmc-deploy.yml`) warns when it is false.

## Turning it on (owner)

1. Onboard the sender domain to Cloudflare Email Service (the same domain jobshop-quote uses works;
   Cloudflare adds the SPF and DKIM records on a zone it hosts).
2. Optional: set the repository variable `CMMC_EMAIL_FROM` (default
   `CMMC Workspace <no-reply@marisstella.app>`).
3. Run `cmmc-deploy`; the smoke test should print `"email":true`.

Not built yet: emailed invitations (members are still added by an existing, confirmed account's
address).
