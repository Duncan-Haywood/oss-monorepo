# CMMC Workspace roadmap

Bet #4 in the public repository's `portfolio/monetization/bets.md`. Claim an item before building it:
`python3 platform/ci/roadmap_claim.py cmmc` (in the public repository) lists the Next items below.

## Done

- Account email (2026-11-25): confirm the address at sign-up (sign-in refused until then), reset a
  password by email (1 hour, single use, signs out everywhere), "you already have an account" mail,
  per-user send throttles in D1, `email` in `/api/health` and a smoke-test warning, and an admin can
  no longer add an unconfirmed account to an organization ([docs/EMAIL.md](docs/EMAIL.md)). Ported
  from apps/jobshop-quote. Mail goes out once the owner onboards the sender domain.
- Workspace (2026-11-25): Level 1 and Level 2 control library checked against the official text,
  per-control status, objectives, evidence, AI-drafted implementation statements that stay drafts
  until accepted, SPRS score, SSP, POA&M with conditional-status checks (README.md).
- Billing, part 1 (2026-11-25): plans (Level 1 free; Level 2 $249; Level 2 Team $399; comp), the
  margin test and Paddle catalog, Paddle checkout and portal shipped dark, the signed webhook, the
  limits (Level 2 recording, seats, AI drafts per month, evidence storage) and the Billing tab
  ([docs/BILLING.md](docs/BILLING.md)).
- Billing, part 2: legal pages (2026-11-25). Terms, Privacy, Refund and Acceptable Use drafts in
  `docs/legal/*.md`, ported from `apps/jobshop-quote` and rewritten for self-assessment: not a
  certification, not a C3PAO, not DoD-endorsed; the affirming official decides what goes into SPRS
  and the app submits nothing; AI drafts stay drafts until accepted; not a CUI enclave (no CUI,
  ITAR or EAR data); liability capped at 12 months' fees and excludes lost contracts. The privacy
  policy names Cloudflare, Anthropic and Paddle and lists exactly what "Draft with AI" sends (the
  requirement, profile, status, notes and evidence *titles*, never evidence contents), and says the
  app sends no email today. Public at `GET /api/legal[/:key]` and `/legal/:key` in the SPA (links on
  sign-up, the sign-in page and every page's footer). Each user accepts `POLICY_VERSION` once
  (migration 0002, `legal_acceptance`) before the workspace opens; `POST /api/orgs` answers 403
  `legal_not_accepted` until then, so the gate holds server-side too. A unit test keeps the bundle
  equal to the markdown, checks the key phrases, and fails if Job Shop Quote or PayApps wording
  survives the port.

- Controls page, read only on the free plan (2026-11-25). `GET /api/orgs/:orgId` now names the
  plan whose limits apply (`plan: {key, name, level2}`); on a plan without Level 2 the Controls
  page shows Level 2 requirements, objectives and anything already recorded without the status,
  notes, draft and evidence forms, under a note that says so, with "See Level 2 plans" (to the
  Billing tab) for admins and "ask an admin" for everyone else. The server's 402 stays the gate.
- Annual affirmation record (2026-11-25). An `affirmation` table (migration 0003) holds what the
  affirming official entered in SPRS: level, kind (after a self-assessment, annual, after a POA&M
  closeout), Final or Conditional status and its date, the date affirmed, the official's name,
  title and contact (the content 32 CFR 170.22(a)(2)(i) requires), the score entered and the score
  the workspace computed at that moment (a difference is shown). `src/shared/affirmation.ts`
  works out what falls due next, quoting § 170.22, § 170.15(a)(1) and § 170.16(a)(1) as read on
  eCFR the same day: the annual affirmation a year after the last one, the Level 1 self-assessment
  a year after the status date, the Level 2 one three years after the assessment's status date (a
  closeout does not restart that clock), and a Conditional status's closeout 180 days after its
  date; February 29 moves to the 28th so a reminder is never a day late. The Affirmations tab and
  a dashboard card show them, amber within 60 days and red when past. Admins record and delete
  (audited); Level 1 records on every plan, Level 2 needs the Level 2 plan. The reminder is
  in-app only: the app sends no email (privacy policy), so an emailed reminder waits on the app
  sending email at all. The privacy policy lists the new fields.
- Affirmation due dates as a calendar file (2026-11-25). "Add these dates to your calendar (.ics)"
  on the Affirmations tab downloads `GET /affirmations/calendar.ics` (any member, tenant-scoped):
  one all-day event per due date with alarms 60 and 7 days ahead, each carrying the eCFR basis and
  a note that it is a planning aid and the app submits nothing to SPRS. UIDs are fixed per org,
  level and deadline, so re-importing after a new affirmation moves the events in calendars that
  honour UIDs. RFC 5545 escaping and 75-octet folding in `src/shared/affirmation-ics.ts`, unit
  tested; a worker test checks the dates and that another org gets a 404. No email, no new data.
- Affirmation reminder email (2026-11-25). A daily cron (`23 11 * * *`, `src/worker/index.ts`) emails
  each admin and owner 60 and 7 days before an annual affirmation, self-assessment or POA&M closeout
  falls due, from the same schedule the page shows (`services/affirmations/reminders.ts`, stages in
  `src/shared/affirmation-reminders.ts`). Each (org, level, deadline, due date, stage) is claimed in
  `affirmation_reminder_sent` before sending, so overlapping runs never send twice, and a missed day
  sends on the next run; overdue dates get no email. One message per member, each with a signed
  RFC 8058 one-click stop link (`/api/unsubscribe/affirmation-reminders`, HMAC under AUTH_SECRET,
  ported from payapps) and the `/unsubscribe` page; the Affirmations tab has the same switch
  (`member_notifications`, on by default). The privacy policy says so (POLICY_VERSION
  2026-11-25.3). Unit tests for the stages, wording and token; worker tests for both stages, no
  repeats, roles, opt-out, the stop link (tampered links 404) and cross-tenant access.

- Affirmation calendar subscription link (2026-11-25). Admins make a private link on the
  Affirmations tab (`POST /affirmations/calendar-feed`) that Google Calendar, Outlook or Apple
  Calendar subscribes to (`GET /api/calendar/<token>.ics`, no session; webcal:// offered too), so a
  new affirmation moves the dates without a re-download. Same file as the download. The token is
  32 random bytes shown once; only its SHA-256 is stored (migration 0006,
  `affirmation_calendar_feed`); "Make a new link" replaces it (the old link 404s at once) and "Turn
  the link off" deletes it, both audited. The page shows who made it and when a calendar last
  fetched it (written at most hourly). The privacy policy says who can read the link
  (POLICY_VERSION 2026-11-25.4); docs/SECURITY.md, "Calendar subscription link". Unit tests for the
  token shape; worker tests for the subscription, reset, delete, roles, cross-tenant access and 404s.

- ISO 9001:2015 clause checklist on the same evidence (2026-11-25). The 47 requirement clauses
  (4.1 to 10.3) as static data with the app's own "what shops usually keep" prompts and no ISO text
  (`src/shared/quality/`, docs/SOURCES.md, "ISO 9001"); per-org status, owner and notes (migration
  0004, `quality_clause_record`); not applicable needs a reason. Evidence is shared: files on a
  related CMMC requirement show under the clause, and any file can be linked
  (`quality_evidence_link`; deleting a file removes its links). Readiness by section (partial counts
  half, floored), clauses in place with no file, and a Markdown gap report at `/quality/report`. The
  ISO 9001 tab is readable on every plan; recording needs the $399 plan, renamed "Level 2 + Quality"
  (key still `team`). The headings were not checked against a copy of the standard (no outside host
  reachable): the page says so.

- Billing, part 3: deploy (2026-11-25). `.github/workflows/cmmc-deploy.yml`, by hand only, ported
  from jobshop-quote's: checks, build, `scripts/provision.mjs` (D1 and the required R2 bucket, the
  deploy config with the database id; tested pure parts in `scripts/provision.test.mjs`, run by
  cmmc-ci), migrations before the code, the Paddle catalog sync that passes the price ids read back
  as `BILLING_PRICE_IDS`, `wrangler deploy` with `APP_ENV=production` and `FAKE_EXTERNALS=false`,
  secrets copied (a generated `AUTH_SECRET` never overwritten) and a smoke test on `/api/health`,
  which now answers `app: "cmmc-workspace"` and whether checkout is on (`billing`). Checked with
  `wrangler deploy --dry-run`; the workflow has not run ([docs/DEPLOY.md](docs/DEPLOY.md)).
- ISO 9001 clause owners and a dashboard card (2026-11-25). Each clause takes an owner from the
  org's members (saved on change; someone outside the org is refused); viewers see the name.
  Readiness lists open items (gaps, partly in place) nobody owns, on the ISO page, the dashboard
  and the gap report, which gains an Owner column (names from this org's members only). The
  dashboard's ISO card shows percent in place, gaps and the unowned list on Level 2 + Quality, and
  a one-line pointer to the readable checklist on other plans.
- Import from a spreadsheet (2026-11-26). "Import CSV" on the Controls page reads a self-assessment
  sheet saved as CSV (comma, semicolon or tab; title rows and family headings above or between the
  rows are skipped). The requirement column is found by its contents: CMMC ids (AC.L2-3.1.1), NIST
  numbers (3.1.1) or, for Level 1, AC.L1-b.1.i, (b)(1)(i) and the NIST numbers behind each FAR item.
  Status, owner (matched by e-mail to members), notes and implementation statement columns are found
  by header; status by contents when no header says so. Only listed phrases count as a status (Met,
  Not met, Partially implemented, N/A, Planned...); anything else, a duplicate row, a Level 2 id in
  a Level 1 import or an unknown member is listed by line and left out. Blank cells never overwrite.
  `POST /controls/import {level, csv, apply}` previews (any editor, any plan) or applies (Level 2
  needs the Level 2 plan) in D1 batches with one `control.import` audit entry. Partial credit for
  3.5.3 and 3.13.11 is still picked by hand. `src/shared/controls/csv-import.ts`.

## Must do before a public launch

- Owner: run `cmmc-deploy` once (by hand; [docs/DEPLOY.md](docs/DEPLOY.md)) and, at launch, let it
  run on every merge (`push: branches: [main]`)
- Owner: Paddle secrets and a notification destination (docs/BILLING.md, "Turning it on")
- Owner: confirm the operator name and contact email in the legal pages and have the agent legal review check them (no outside counsel: owner, 2026-11-26)

## Next

- ISO 9001, part 2: check the 47 clause headings against a copy of ISO 9001:2015 (or ISO's free
  contents preview) and set `checkedAgainstCopy`; AS9100D's aerospace additions once a source is in
  hand; filter the clause list to "mine" once shops with several owners ask
- Import, part 2: read .xlsx directly (no CSV step) and the POA&M sheet, once shops send real files;
  check the header phrases against a real NIST SSP template or a prime's questionnaire
- Affirmation reminders, part 3 (the subscribable calendar link done 2026-11-25): an overdue
  notice to admins (one, not daily) if shops ask; the reminder email goes out only once the owner onboards the sender domain (docs/EMAIL.md)
