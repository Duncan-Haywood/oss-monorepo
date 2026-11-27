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
  (key still `team`). ISO 9001, part 2 (2026-11-26): the 47 numbers and headings checked against the
  contents page of ISO 9001:2015(E), fifth edition, in the publisher-licensed preview on
  standards.iteh.ai: all numbers present, 42 headings verbatim, the five "General" subclauses
  prefixed with their parent; `checkedAgainstCopy` is true and the page no longer says "not checked";
  `iso9001-contents.test.ts` pins the rows to the contents page (docs/SOURCES.md, "ISO 9001").

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
- Import part 2, the workbook itself (2026-11-26). "Import spreadsheet" also takes the .xlsx: it is
  read in the browser with no library (the reader from apps/payapps, `src/shared/xlsx.ts`), the sheet
  with the most requirement ids is chosen (a "Sheet" picker shows every tab and its id count), and
  only that sheet goes to the same endpoint as CSV, so one reader decides everything. Rows keep their
  Excel numbers ("Row 14"); formulas count by their saved result, and one saved without a result is
  named by row. An old .xls, a password-protected or ZIP64 workbook gets a message to save it as .xlsx
  or CSV. Tested on a workbook LibreOffice wrote (`test/fixtures/README.md`).
  `src/shared/controls/sheet-import.ts`.

- Import part 3, the POA&M sheet (2026-11-26). "Import spreadsheet" on the POA&M page takes the
  shop's existing POA&M as .xlsx (read in the browser by the same reader, the sheet with the most
  requirement ids chosen) or CSV. The requirement column is found by its contents (the ids the
  control import reads); weakness, scheduled completion, remediation, milestones, responsible and
  status by header. A row needs a weakness and a date; dates are read only as 2026-12-31,
  12/31/2026 (month first, the US form), 31 Dec 2026, Dec 31, 2026 or an Excel date number, and
  31/12/2026 is listed, never swapped. Status reads open or closed phrases only ("risk accepted" is
  listed). Same requirement and same weakness (case and punctuation ignored) as an existing item
  updates only the fields the row fills that differ, so a re-import changes nothing; two such rows
  in one sheet keep the first. The preview shows each row new or updated with its 32 CFR 170.21
  eligibility as the requirement is recorded now (an ineligible item is still imported, as adding
  one by hand is). `POST /poam/import {level, csv, apply}`: preview for any editor, applying Level 2
  items needs the Level 2 plan, one D1 batch and one `poam.import` audit entry.
  `src/shared/controls/poam-import.ts`, `src/worker/services/poam/import.ts`.

- Overdue notice (2026-11-26). The daily reminder run also sends admins and owners one email once
  an annual affirmation, self-assessment or POA&M closeout date has passed with no newer affirmation
  recorded (stage 0 in `affirmation_reminder_sent`, so it goes once per due date and overlapping
  runs never repeat it), only while the date passed at most 30 days ago, so a date that lapsed long
  before the workspace was set up does not start mailing. It names the date and its eCFR basis, says
  how long ago it passed, and asks the admin to record the affirmation if the official already
  entered it in SPRS, with the same planning-aid caveat and stop link. Passed dates lead a message
  that also lists coming ones. The checkbox, docs/EMAIL.md and the privacy policy say so
  (POLICY_VERSION 2026-11-26.4). Unit tests for the stage window and wording; a worker test for the
  one notice, no repeat, and no notice past 30 days.

- Asset inventory (2026-11-26). The Assets tab (migration 0008, `asset`) lists each asset with its
  Level 2 scoping category from 32 CFR 170.19(c) (CUI, Security Protection, Contractor Risk Managed,
  Specialized with its kind, Out-of-Scope), type, location, provider, owner and notes. Pure checks in
  `src/shared/assets.ts` flag no CUI asset, no security protection asset, a specialized asset with no
  kind, and CRMA/specialized/out-of-scope assets with no management note or reason. The Level 2 SSP
  prints the inventory by category under "2. System boundary"; CSV export (formula guard). Readable
  on every plan, recording needs Level 2, deleting never gated; audited; cross-tenant test. Each
  category shows the rule's own description and the six Specialized Asset kinds in the rule's words,
  copied from the public scoping worksheet's pinned quotes (`ventures/machine-shop-guides/scope.mjs`,
  read on eCFR 2026-11-25; eCFR was unreachable from this session). Privacy policy lists the new
  fields (POLICY_VERSION 2026-11-26.5).

- External service providers (2026-11-26). The Providers tab (migration 0009, `service_provider`)
  scopes each outside provider by table 4 to 32 CFR 170.19(c)(2)(i): CUI, Security Protection Data
  or neither, and cloud provider or not, each cell quoted verbatim (read on eCFR 2026-11-26; quotes
  hash-pinned in `src/shared/service-providers.test.ts`). It records services, the FedRAMP basis
  for a cloud provider holding CUI, where the service description and customer responsibility matrix
  are kept, notes, and the Level 2 requirements the CRM assigns to the provider or shares. The
  Level 2 SSP prints a provider table under the system boundary and an "External service providers"
  line on each requirement they carry. Pure checks; same plan gate, roles and audit as the assets;
  cross-tenant test. Privacy policy lists the fields (POLICY_VERSION 2026-11-26.6).

- Asset inventory, part 2: import (2026-11-26). "Import spreadsheet" on the Assets tab reads an
  asset list (.xlsx read in the browser, the sheet with the most readable rows picked; or CSV), this
  inventory's own CSV export (formula guard undone) and the CSV the public scoping worksheet exports
  (tested on its real `inventoryCsv(exampleScope())` output, `test/fixtures/`). Name and category are
  found by header; the category only from its own cell (this app's labels, the worksheet's, or
  CUI/SPA/CRMA/OOS), never inferred from a device type, so a row without one is listed and left out,
  as are the worksheet's "Not resolved" rows. A specialized asset's kind comes from its column or a
  worksheet kind naming exactly one kind ("IoT / IIoT device" names two: listed, not picked). The
  worksheet's CRMA policy and out-of-scope separation columns go into the notes the inventory check
  asks for. Same name (case and punctuation ignored) updates only the fields that differ, so
  re-importing changes nothing; the 2,000-asset cap is checked before applying. Preview on any plan,
  apply needs Level 2; one `asset.import` audit entry; cross-tenant test.

- Asset inventory, part 2: the scoping worksheet's saved file (2026-11-26). The same "Import
  spreadsheet" also takes the JSON file the public worksheet's "Save as a file (JSON)" writes (format
  `machine-shop-guides/cmmc-scope`). That file holds answers, not categories, so the worksheet's Level
  2 `normaliseScope` and `classify` are ported to `src/shared/scope-worksheet.ts` (the category
  decision only) and checked against the worksheet's own results for every combination of answers
  per kind (456 cases, `test/fixtures/scoping-worksheet-classify.json`). A "Not resolved" asset is
  listed with the worksheet's open question; an IoT / IIoT asset is listed, not picked; the asset's
  place in the worksheet's list is its line ("Asset 12" in the preview). A Level 1 file is read by its
  CUI answers with a note; another JSON file or broken JSON is refused with a reason. The worksheet
  kind becomes the type; policy and separation go into the notes as from the CSV. The example shop's
  JSON and CSV import to the same categories (unit test); worker test for preview, apply and a
  re-import that changes nothing.

- External service providers, part 2 (2026-11-26): the service description and CRM can each be one
  of the org's evidence files (migration 0010, `service_description_evidence_id` and
  `crm_evidence_id`), picked on the Providers form beside the typed reference; either one satisfies
  the check. Another org's file or a missing id is refused; deleting the file clears the link. The
  SSP prints the file by title and SHA-256 prefix. The Controls list and each Level 2
  requirement's page show "Carried by X; shared with Y" from the providers' marks (non-ESPs never).
  Worker tests cover linking, cross-tenant refusal, unlink on delete and the Controls lines.

- Asset inventory, network diagram (2026-11-26). Table 3 to 32 CFR 170.19(c)(1) gives the CUI,
  Security Protection, Contractor Risk Managed and Specialized Asset rows the same line, "Document
  in the network diagram of the CMMC Assessment Scope." (re-read on eCFR 2026-11-26, same file
  sha256 69465e2b...f197). The Assets tab's "Network diagram" card links one of the org's evidence
  files (migration 0011, `org_profile.network_diagram_evidence_id`), picked from those uploaded or
  uploaded there with the no-CUI attestation. The inventory check asks for it when an in-scope asset
  is listed (out-of-scope assets alone never); the Level 2 SSP names it under the asset inventory
  heading by title, file name and SHA-256 prefix, or says it is not yet linked and quotes the rule.
  Another org's file or a missing id is refused; deleting the file clears the link; linking needs the
  Level 2 plan, unlinking does not; both audited. Worker tests cover all of it plus roles and plan.

- POA&M import, day/month dates (2026-11-26): numeric dates are read in one order for the whole
  date column. Left to the sheet, it is day/month/year when some cell can only be day first
  (31/12/2026, or dots: 31.12.2026) and none can only be month first, said in a note naming the
  line; otherwise month/day/year as before. A "Dates like 03/04/2026 are" picker on the import
  overrules it (route field `dateOrder`, `mdy`/`dmy`), and the preview says how many numeric dates
  were read which way. A cell that does not fit the column's order is listed with a hint, never
  swapped on its own. `readDateOrder` and `numericDateOrder` in `src/shared/controls/poam-import.ts`.

- External service providers, part 3, the CRM read into the marks (2026-11-26): "Fill from the
  matrix" on the Providers form reads the provider's customer responsibility matrix (.xlsx in the
  browser, the sheet with the most requirement ids picked, or CSV) into the Provider/Shared marks.
  Two layouts: one responsibility column (Customer, Provider, Shared, Inherited, Hybrid, N/A, the
  provider's own name) or a column per party (Customer, Provider or the provider's name, Shared)
  marked with an X or holding that party's description, "None" and "N/A" counting as unmarked. Ids
  are CMMC ids, Rev. 2 numbers or 800-171A objectives (3.1.1[a]) counted for their requirement; a
  requirement whose rows disagree is marked shared and the disagreement listed. A Rev. 3 matrix
  (03.01.01) is refused with the reason; unreadable cells are listed by line and left out;
  requirements the file does not list keep their marks. Nothing leaves the browser until the
  provider is saved, and the PATCH checks the marks again. `src/shared/crm-import.ts`.

- External service providers, part 3, the provider's files uploaded on its form (2026-11-26): the
  service description and CRM fields each have "Upload a file here": the file goes to the org's
  evidence with no requirement attached (POST /evidence, the same no-CUI attestation), is picked in
  that field at once, and the link is kept when the provider is saved. After "Fill from the matrix"
  the CRM field offers the matrix just read ("Keep the matrix you read as this file"), so one file
  choice fills the marks and keeps the document. A .csv the browser labels
  `application/vnd.ms-excel` (Windows) or an untyped .xlsx is sent as its extension's type instead
  of being refused. `src/client/views/EvidenceUpload.tsx`, tested in `EvidenceUpload.test.tsx`.

- Security policies (2026-11-26). A Policies tab (migration 0012, `security_policy` and
  `security_policy_event`) with one written policy per NIST SP 800-171 Rev. 2 family: a starter text
  that restates the family's requirements in their official wording and copies in accepted
  implementation statements as procedures (never AI drafts), an owner, a review interval (6/12/24/36
  months; NIST sets none), admin approval that keeps the exact approved text, revisions as drafts
  while the approved version stays in force, "Reviewed, no changes", history, downloads (one, any
  approved version, or the whole manual) and SSP section 8. Read on every plan; writing needs the
  Level 2 plan. Privacy policy lists the new records (POLICY_VERSION 2026-11-26.7).
  `src/shared/security-policies.ts`, `services/security-policies`, `views/Policies.tsx`; unit and
  worker tests including roles, plan gate and cross-tenant reads.

- Security policies, part 2: review dates in the calendar and on the dashboard (2026-11-26). Each
  approved policy's next review date is an all-day event in the same `.ics` file and subscribable
  link as the affirmation dates (UID per org and family, so a review moves it; alarms 60 and 7 days
  ahead, matching the Policies tab's amber window). Only the family's fixed name goes in, never the
  policy's title, text or owner; the privacy policy and docs/SECURITY.md say so (POLICY_VERSION
  2026-11-26.8). The Policies tab links the file once a policy is in force. A dashboard card (Level 2
  target) shows how many families have an approved policy, drafts not yet approved, and overdue
  then due-soon reviews by date. `renderAffirmationCalendar({ policyReviews })`,
  `policyReviewDates`, `PoliciesCard`; unit, component and worker tests (no title or text in the
  file, a draft adds no event, the subscribed link, cross-tenant).

- Security policies, part 3: "Draft with AI" for a procedure (2026-11-26). On the Policies tab, each
  requirement of the open family has "Draft with AI" (editors, Level 2 plan): numbered steps from
  that requirement's notes, accepted statement, evidence titles and the service providers recorded
  as carrying it, with `[CONFIRM: …]` and a question for every missing fact and a question for any
  number not in the inputs (step numbers aside). The policy owner's name is never sent; the model is
  told only whether there is one. Drafts live in `policy_procedure_draft` (migration 0013, one per
  requirement, a new draft replaces the old), never in the policy text, the template, the SSP or a
  download. "Put in the policy and save" is enabled once every placeholder is resolved: it puts the
  edited text under the requirement's `### 3.x.y` heading (`replaceProcedure`, headings in the text
  escaped; a missing heading is reported, not guessed), saves (an approved policy starts its next
  version as a draft) and discards the draft. Approve shows how many `[CONFIRM: …]` remain in the
  text. Each draft is a `policy.procedure_draft` audit row and counts against the plan's AI drafts
  a month (402 before the model is called). Terms and Privacy Policy say what the model sees
  (POLICY_VERSION 2026-11-26.9). `services/drafting/procedure*.ts`, `views/Policies.tsx`; unit,
  component and worker tests (plan gate, viewer, allowance, other family, cross-tenant).

- Personnel and training records (2026-11-26). A People tab (migration 0014, `person`, and
  `org_profile.training_refresh_months`) records who uses the systems in scope: job title, optional
  email, access to systems containing CUI, security duties and which, when and how they were
  screened (method only), when access was granted, the last security awareness (3.2.1), role-based
  (3.2.2, people with security duties only) and insider threat (3.2.3) training, and for a departure
  or transfer when access and credentials were removed (3.9.2). Next due dates follow the org's
  refresher interval (admin setting, 6/12/24/36 months, default 12; NIST sets none and the page says
  so); 31 January plus a month is the last day of February, never 1 March. Checks name each gap
  with its requirement (training missing or overdue, screening missing or after access, duties not
  described, nobody with security duties, departure with no removal date) and count coverage per
  requirement, quoting it from the control library; counts set no status. Future dates refused;
  CSV export with next due dates and a formula guard. Read on every plan, record on Level 2, delete
  on any plan; writes audited. The privacy policy lists the fields (POLICY_VERSION 2026-11-26.10).
  `src/shared/personnel.ts`, `services/personnel`, `views/People.tsx`; unit tests (dates, states,
  checks, CSV) and worker tests (checks, interval, roles, plan gate, audit, cross-tenant).

- Personnel, part 2: roster and training completion import (2026-11-26). "Import roster or
  completions" on the People tab reads a roster (CSV, an .xlsx sheet read in the browser, or the
  page's own export) or a training provider's completion report. Columns by header (name or first
  and last, email, job title, yes/no CUI access and security duties, each date); people matched by
  email, else by name (a same-name row with a different email is a new person). Blank cells keep;
  a training date only moves forward, so last year's export never undoes this year's training.
  A completion report (a completion date column, one row per course, a status other than
  completed or passed left out) updates only people already listed and records a course only for
  the trainings the person ticks for it, never read from the course title; the latest completion
  per person wins. Dates use the POA&M reader (one order per file, detected or chosen); future
  dates refused; each result re-validated with the People rules before it is saved. Preview on any
  plan, apply on Level 2, one batch and one `person.import` audit row. No new fields, so the
  privacy policy is unchanged. `src/shared/personnel-import.ts`, `services/personnel/import.ts`,
  `views/PeopleImport.tsx`; unit, component and worker tests (matching, forward-only dates, course
  choice, plan gate, viewer, cross-tenant).

- Personnel, part 3: training due dates in the calendar and on the dashboard (2026-11-26). The
  calendar file and the subscribable link carry each training refresher date as one all-day event
  per training and date, "Training due: Security awareness (AT.L2-3.2.1), 3 people", with the
  same 60- and 7-day alarms. Counts only, never names, so the link stays free of personal data; UID
  per org, training and date. Current people and trainings that apply to them only (role-based for
  people with security duties); someone with no date yet has no refresher date and is listed on the
  dashboard instead. A Level 2 dashboard card counts overdue, due within 30 days and no date
  recorded, and lists them in that order (overdue oldest first, up to 8 lines). `GET /people` adds
  `attention`. The privacy policy and docs/SECURITY.md say what the link now carries
  (POLICY_VERSION 2026-11-26.11). `trainingDueDates`, `trainingAttention` in
  `src/shared/personnel.ts`, `renderAffirmationCalendar({ trainingDue })`, `TrainingCard`; unit,
  component and worker tests (grouping, names left out, interval, order, feed).

- Subcontractors and suppliers (2026-11-26). A Suppliers tab (migration 0015, `supplier`) lists the shops
  an org sends drawings, specs or contract information to: what the order sends (CUI, FCI only or neither),
  whether it is for COTS items, the CMMC level flowed down (the shop's choice: 32 CFR 170.23 could not be
  read, docs/SOURCES.md, "Suppliers"), the supplier's status (the seven in DFARS 252.204-7021's definition),
  its date, the latest affirmation, CMMC UIDs (10 letters and digits each), whether the PO carries the
  clause and its reference, and the dates the status was checked and the order awarded. Checks quote the
  clause (12 verbatim quotes, hash-pinned): status at the level "or higher", "current" per paragraph (a)
  (Conditional 180 days, Final L1 one year, Final L2/L3 three years, affirmation one year; amber within 60
  days), CUI flowed at Level 1, the clause missing ((f)(1), not for COTS or orders with no FCI or CUI), no
  status check or one after award ((f)(2)). CSV export with the "current through" date and a formula
  guard. FCI-only Level 1 flow-down records on every plan; CUI or a Level 2 or 3 requirement needs the
  Level 2 plan; writes audited. The privacy policy lists the fields (POLICY_VERSION 2026-11-26.12).
  `src/shared/suppliers.ts`, `services/suppliers`, `views/Suppliers.tsx`; unit, component and worker tests
  (currency edges, level order, validation, plan gate, roles, audit, cross-tenant).
- Suppliers, part 3: current-through dates in the calendar and on the dashboard (2026-11-26).
  `supplierDueDates` groups the suppliers the clause applies to by the last day their CMMC status or
  their affirmation is current (paragraph (a)), one event per date and part with a count and a UID
  per org, part and date, alarms 60 and 7 days ahead, in both the downloaded .ics and the subscribable
  link; never a supplier's name, so a leaked link does not list the supply chain (docs/SECURITY.md).
  `supplierAttention` feeds a dashboard card on every plan: not current first, then running out within
  60 days, then status or a date missing, with "N / M with no open gap". Privacy Policy updated
  (POLICY_VERSION 2026-11-26.13). Unit, component and worker tests (feed and file carry the events and
  no name; the dashboard list order).
- Suppliers, part 4: the level suggested from 32 CFR 170.23 (2026-11-26). eCFR answered once asked for a
  compressed response; its text is quoted in `FLOWDOWN_RULE_QUOTES` (6 verbatim quotes, hash-pinned,
  docs/SOURCES.md). `suggestFlowdownLevel` applies (a)(1)-(4) from what the order sends and the prime
  contract's level; the form shows the suggestion with the paragraph's words and a "Use" button, and the
  "choose the level" gap names the minimum. FCI-only orders flowed down above Level 1 get a note, not a gap.
  No migration: the prime contract's level is a form-only input.

- Personnel, part 4: counts in the SSP (2026-11-26). On Level 2, each of AT.L2-3.2.1-3.2.3 and
  PS.L2-3.9.1-3.9.2 in the SSP's requirement section carries one line from the People tab, dated
  the day it was generated: the coverage count ("2 of 3 current people have up-to-date security
  awareness training"), the refresher interval for the three trainings (the org's choice, and that
  NIST sets none), and how many open gaps the People tab lists. A zero says what it means ("No
  departures or transfers recorded"); an empty roster says none are recorded. Counts only, never
  names or emails, since the SSP goes to primes and assessors; no new fields, so the privacy policy
  is unchanged. `personnelLine` in `services/ssp/render.ts`; unit tests (line, interval, gaps,
  empty roster, Level 1) and a worker test (counts through `/ssp`, no names).

- ISO 9001 document control, part 1 (2026-11-26): the master list (clause 7.5) on a new Documents
  tab. Each controlled document has a number (unique per org), title, type, origin (ours, or issued by a
  customer, standards body or supplier, with who issued it), working revision, status (draft / released /
  obsolete), the revision in force, owner, where the controlled copy is kept, a 12/24/36-month or no
  periodic review, and notes. Release records the approver (a member, default the actor), approval and
  effective dates (not in the future, effect not before approval) and a change summary (required after
  the first release); "Start rev" opens the next revision as a draft (A to B, Z to AA, 01 to 02, "Rev C"
  to "Rev D") while the last released one stays in force; a released revision is never edited in place,
  and a revision name is never released twice. "Reviewed" moves the review date on; "Withdraw" marks it
  obsolete with a reason and keeps it, with its history; only never-released drafts can be deleted.
  History per document (`controlled_document_event`, migration 0016), the master list as CSV (formula
  guard, approver and owner names), and checks: never released, review overdue or due within 60 days,
  no approver, no location, no owner. Readable on every plan; recording needs Level 2 + Quality, as the
  checklist does; writes audited; tenant-scoped. No ISO text (docs/SOURCES.md, "Document control"). The
  privacy policy lists the fields (POLICY_VERSION 2026-11-26.14). `src/shared/document-control.ts`,
  `services/documents`, `views/Documents.tsx`; unit tests and worker tests (lifecycle, plan gate, roles,
  cross-tenant). This makes the site's "document control" line on the Level 2 + Quality plan true;
  internal audits and corrective actions on the same line followed the same day (below).

- ISO 9001 internal audits and corrective actions, part 1 (2026-11-26): a new Audits tab. The audit
  programme (clause 9.2): each audit's title, clauses (from the 47-clause list) or process in scope,
  planned date, auditor (a member, or an outside auditor by name), done date and summary, or cancelled
  (kept). Findings per audit graded major / minor nonconformity, observation or opportunity for
  improvement, each with a clause and what was seen. A finding opens one corrective action (clause
  10.2), numbered CA-0001 per org, raised on the audit's date; actions can also be logged from a customer
  complaint, a return, a supplier, the shop floor or a customer audit. Each records the nonconformity,
  the immediate correction, root cause, action, owner, due and done dates (root cause required before
  done), a check date (90 days after the action by default), and the effectiveness check: effective
  closes it, not effective keeps it open and a changed action clears the check for a new one (the old
  result kept in the notes). Checks: audit overdue or within 30 days, an auditor who owns a clause in
  scope on the ISO 9001 checklist (audits own work), nonconformity with no corrective action, applicable
  clauses (the checklist's not-applicable ones left out) not audited in 12 months and not planned,
  action or check overdue or within 14 days, not effective, no owner or due date. Corrective-action log
  CSV (formula guard). Audits with linked actions, findings with an action and closed actions are never
  deleted. Tables `internal_audit`, `audit_finding`, `corrective_action` (migration 0017); readable on
  every plan, recording on Level 2 + Quality; writes audited; tenant-scoped. Privacy policy lists the
  fields (POLICY_VERSION 2026-11-26.15). No ISO text (docs/SOURCES.md, "Internal audits and corrective
  actions"). `src/shared/internal-audits.ts`, `services/internal-audits`, `views/Audits.tsx`; unit tests
  and worker tests (lifecycle, not-effective retry, independence check, plan gate, roles, cross-tenant).
  With document control, this makes the site's Level 2 + Quality line (document control, internal
  audits and corrective actions) true.

- Evidence without R2 (2026-11-27, cmmc-files-without-r2): the shared Cloudflare token is refused on
  R2 ("Authentication error [code: 10000]", PayApps run 45947552522), and `provision.mjs` stopped the
  deploy there, so `cmmc-deploy` could not have succeeded. Now `ctx.files` is R2 when `FILES` is bound,
  else D1's `file_blobs` (1 MiB chunks written in one batch, a torn read refused; migration 0018);
  reads fall back to D1 after R2 is bound, so nothing is copied. `provision.mjs` deploys without the
  bucket on "not enabled" or code 10000 and writes `files=r2|d1` to the job output; `/api/health`
  answers `"files": "r2" | "d1"`. Ported from Job Shop Quote (PR #19749), live that way since its first
  deploy. `test/worker/file-store.test.ts` uploads, downloads and deletes evidence with no bucket.

## Must do before a public launch

- Run `cmmc-deploy` once (by hand; [docs/DEPLOY.md](docs/DEPLOY.md); R2 no longer blocks it, and the
  launch review is done, docs/LAUNCH-REVIEW.md, so an agent may dispatch it as Job Shop Quote's was) and, at launch, let it
  run on every merge (`push: branches: [main]`)
- Owner: Paddle secrets and a notification destination (docs/BILLING.md, "Turning it on")
- Done 2026-11-26: operator (Maris Stella Labs LLC, Colorado) and contact email filled in; launch is
  agent-approved under `docs/legal/OPERATOR.md`. No attorney review (open checks listed there)

- ISO 9001 dates in the calendar and on the dashboard (2026-11-27). The downloaded `.ics` and the
  subscribable link carry controlled documents' review dates (one event per date, "Document review
  due: 3 controlled documents"), planned internal audits, and each open corrective action's next
  date: its action due date until the action is done (or again after a check found it did not
  work), then the date to check it worked (`caNextDate`); one event per kind and date with a count,
  UID per org, kind and date, the same 60- and 7-day alarms. Never a document's or audit's title or a
  nonconformity's text, which can name a customer, part or person (docs/SECURITY.md). An "ISO 9001
  dates" dashboard card on Level 2 + Quality merges document reviews (60 days), audits (30) and
  corrective actions (14), overdue first, oldest first, up to 8 lines, from `needingReview` and the
  new `attention` on GET /audits (`qualityAttention`). The Affirmations tab and the Privacy Policy say
  what the file and link now carry (POLICY_VERSION 2026-11-27.1). `qualityDueDates`,
  `qualityAttention` in `src/shared/internal-audits.ts`, `renderAffirmationCalendar({ documentReviews,
  qualityDue })`, `QualityDatesCard`; unit, component and worker tests (stages, grouping, windows,
  order, no titles in the file or link, cross-tenant).

## Next

- Internal audits, part 3 (calendar dates and the dashboard card done 2026-11-27): an audit report
  (Markdown) per audit, and evidence files linked to a finding or an effectiveness check, if shops ask
- Document control, part 3 (review dates in the calendar and the dashboard done 2026-11-27): linking
  an evidence file as the controlled copy of a revision, and an import of an existing master list
  (CSV/.xlsx) once shops send theirs
- ISO 9001, part 3 (the headings checked against the 2015 contents page done 2026-11-26): AS9100D's
  aerospace additions once a source is in hand; filter the clause list to "mine" once shops with
  several owners ask
- Import, part 4 (the POA&M sheet and its day/month date order done 2026-11-26): check the header
  phrases of both imports against a real NIST SSP/POA&M template or a prime's questionnaire once
  shops send real files
- Affirmation reminders, part 4 (the subscribable calendar link done 2026-11-25; the one overdue
  notice done 2026-11-26): the reminder email goes out only once the owner onboards the sender
  domain (docs/EMAIL.md); a per-member choice of stages if admins find three emails per date too many
- Asset inventory, part 2 (an existing asset list from CSV/.xlsx, this inventory's own export and
  the scoping worksheet's CSV export done 2026-11-26, `src/shared/assets-import.ts`; the worksheet's
  saved JSON file done 2026-11-26, `src/shared/scope-worksheet.ts`, its Level 2 `classify` ported and
  pinned against the worksheet's own results in `test/fixtures/scoping-worksheet-classify.json`):
  regenerate that fixture when the public worksheet's questions change. External service
  providers, part 3 (part 2, evidence-file links and the Controls page line, done 2026-11-26): read
  a provider's CRM spreadsheet into the requirement marks done 2026-11-26 (`src/shared/crm-import.ts`):
  check its header and cell words against real CRMs (Microsoft's GCC High matrix, an MSP's) once
  shops share them; uploading the service description or CRM straight from the Providers form done
  2026-11-26 (`EvidenceUpload.tsx`).
- Security policies, part 2 (review dates in the calendar file and the subscribable link, and a
  dashboard card, done 2026-11-26): the reminder email for review dates (the same 60/7-day stages as
  the affirmations) once the owner onboards the sender domain; "Draft with AI" for a procedure done
  2026-11-26 (part 3), next "Draft all missing" for a whole family if shops find one at a time slow;
  the policy manual as a PDF if shops ask for one
- Personnel, part 5 (the 3.2 and 3.9 counts in the SSP done 2026-11-26): a saved
  course-to-training choice per provider if shops import monthly
- Suppliers, part 2 (the register checked against DFARS 252.204-7021 done 2026-11-26; calendar and dashboard
  done 2026-11-26; the level suggested from 32 CFR 170.23, quoted from eCFR, done 2026-11-26, part 4): save
  the prime contract's level per supplier (a form-only input now) if shops flow down under several primes;
  a supplier list import (CSV/.xlsx) once shops send their approved-supplier lists
