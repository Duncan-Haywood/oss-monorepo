# PayApps — Roadmap

Status: **launch-approved, waiting on a runner** (2026-11-27). The launch review is merged
(#444, [docs/LAUNCH-REVIEW.md](docs/LAUNCH-REVIEW.md), under `docs/legal/OPERATOR.md`): agents may
deploy and open sign-ups without asking. The first deploy (run 45921558751) got no runner, because
this repository's GitHub Actions starts no jobs; it runs once the CodeBuild runners are on
(`private-monorepo` `docs/ci-on-aws.md`) or the app moves to oss-monorepo (task
`products-to-public-repo`). Not deployed yet, no customers. Paid plans are dark
(`BILLING_PROVIDER=none`) until the Paddle key and catalog sync are in place.

## Done (this MVP)

- Orgs, members (add existing users by email), roles
- Projects with GC, contract sum, retainage % (work and stored materials)
- Schedule of values (single + bulk add), locked after the first submitted pay app
- Change orders that add/deduct on existing lines or create new lines; approval dating rules
- Monthly pay applications: work this period, stored materials, retainage held/released, rate changes
- Application summary + continuation sheet as PDF (own layout, "not an AIA document") and CSV
- Draft → submitted → certified → paid workflow; immutable history
- Plans and billing, dark ([docs/BILLING.md](docs/BILLING.md)): Free (1 active job), Solo $99,
  Crew $179, Company $249; active-job and seat limits; Paddle checkout, portal and signed webhook
  via `packages/billing`; Paddle catalog as code (`billing/paddle-catalog.json`); Billing page
- Lien waivers per pay app (Crew and up): track conditional/unconditional, progress/final waivers
  against each application, prefilled from the job and the amount due, marked sent; print the
  state's statutory form where `packages/lien-waivers` has its verified text (Arizona,
  § 33-1008; Florida, § 713.20; Michigan, § 570.1115; Nevada, § 108.2457; Texas, § 53.284; Utah,
  § 38-1a-802; Wyoming, § 29-10-101(b), all added 2026-11-25; Georgia, O.C.G.A. § 44-14-366(d)
  and (e), added 2026-11-26; Mississippi, Miss. Code Ann. § 85-7-433(1) and (2), added 2026-11-26;
  Missouri's residential unconditional final form, § 429.016.27,
  as a choice) and its
  general form in states with no statutory form. Utah has no unconditional statutory form:
  those waivers are tracked with that reason, and a paid Utah pay app is offered Utah's
  conditional form, which takes effect once the check is paid. Florida is the mirror: its two
  forms (§ 713.20(4), (5)) carry no condition, so they print as the unconditional waivers, and a
  conditional Florida waiver (§ 713.20(7) allows the condition but gives no wording) is tracked
  with that reason; before payment PayApps never suggests the unconditional form. Readable and
  printable after a downgrade; creating or changing needs Crew.
  Michigan (2026-11-25): its partial and full waivers (§ 570.1115(9)) print as the progress and
  final kinds, with the statute's blanks (other contracting party, what the contract provides,
  property, amount and through date, address and telephone) and its "(circle one) does does not"
  left for the signer to circle.
- Schedule of values import from the contractor's own spreadsheet (2026-11-25): .xlsx or CSV
  (comma, tab or semicolon, decimal commas read by shape), read in the browser with no library and
  never uploaded. Finds the table under a title block (one- to three-row headers, column-letter
  rows), leaves out division headings, subtotals, totals and change-order lines (each listed with
  its row), checks the sheet's own total against its lines and the import against the contract sum,
  names the cell for an Excel error or a non-amount, and posts the confirmed lines to the bulk
  endpoint. Reader ported from the public pay-application generator (`src/shared/sov-import/`).
  Also: rows pasted from Excel or Google Sheets, and a copy of another job's original lines (with or
  without amounts); tested on the public site's own free SOV template (pay-app-guides).
- SOV import from a PDF (2026-11-25): the bid breakdown, SOV or continuation sheet a GC, an estimating
  program or Excel's "Save as PDF" printed, read in the browser like the .xlsx (never uploaded). Text
  comes from the PDF's own content streams (`src/shared/pdf/text.ts`: text operators, form XObjects,
  page rotation; ToUnicode maps, WinAnsi/MacRoman/Standard encodings and /Differences, glyph widths),
  then `sov-import/pdf.ts` rebuilds rows (a wrapped header or description is one row) and columns
  (from the data lines' numbers and text, a centred header kept whole, an item number at the right of
  its cell joined to CO-1 at the left), joins pages whose columns line up, drops a header repeated on
  page 2 and "Page 2 of 3" lines, and hands the grid to the same `findSov` (sources "page 2, line 14").
  A scan, a PDF that needs a password to open or fonts with no character map end with a message to choose the .xlsx or
  CSV instead; nothing is guessed. The opening-balance fill takes the same PDFs. Tested on PDFs
  printed by Chromium and LibreOffice (`test/fixtures/README.md`). The reader moved from
  `services/export/pdf-merge/` to `src/shared/pdf/` so the browser can use it.
- Mid-job start (2026-11-25): a job already billed elsewhere (a spreadsheet, other software)
  records its last application as the opening balance: its number (the first one here is the next
  number), its period end, its line 6 (carried into line 7), optional line 5a, and work completed
  to date per line (carried into column D). Change orders approved by that period count as
  previous. If the line 5a entered differs from the retainage recomputed at the first application's
  rate, a non-blocking warning names the gap and says to enter an earlier release or set the rate.
  Editable only until the first application here exists (`PUT/DELETE .../projects/:id/opening`).

- Account email (2026-11-25): email verification (required on production/HTTPS), password reset
  (1-hour single-use link, signs out everywhere) and an "already have an account" notice, sent
  through Cloudflare Email Service (`EMAIL` binding + `EMAIL_FROM`), per-user throttles in D1,
  pages `/verify-email`, `/forgot-password`, `/reset-password`. Ported from apps/grants
  ([docs/EMAIL.md](docs/EMAIL.md)).

- Invitations (2026-11-25): admins invite anyone by email, with or without an account, as admin,
  editor or viewer, from a new People page (`/orgs/:orgId/team`, which also changes roles and
  removes members). The invitee signs up or signs in with that address and accepts on the home page
  (the email links to `/invitations`). No bearer token: only a signed-in user whose verified email
  is the invited address can see or accept it. 7-day expiry; re-inviting replaces the pending one;
  pending invitations count toward the plan's users and the limit is checked again on accept;
  20 invitation emails per company per hour ([docs/EMAIL.md](docs/EMAIL.md)).
- Cash and retainage report (2026-11-25): `/orgs/:orgId/cash` and `GET .../reports/cash(.csv)`
  across every job: applied, paid and still owed on sent applications (GC-certified amount where
  entered), aged 0-30/31-60/61-90/90+ days from the application date, retainage held and since when,
  and jobs whose work is complete with retainage still held ("bill the retainage"), sorted by money
  owed. Pure math in `src/shared/cash-report.ts`, computed on read like everything else.
- Partial payments (2026-11-25): each check or transfer received against a sent application is
  recorded (amount, date received, check number or reference) on the pay-app page. The cash report
  counts what came in as paid and ages only the balance, flags an application paid short after 30
  days, and the application turns paid when the payments reach the certified amount (else line 8).
  A payment larger than the balance, dated in the future or on a draft is refused; deleting a payment
  from a paid application reopens it; a certification below the money already received is refused.
  "Mark paid in full" still records the whole application as paid. Rules in `src/shared/payments.ts`.

- Legal pages (2026-11-25): Terms of Service, Privacy Policy, Refund Policy and Acceptable Use
  Policy as drafts in `docs/legal/*.md`, bundled by `docs/legal/sync-documents.mjs` (a unit test
  fails on drift), served publicly at `GET /api/legal(/:key)` and `/legal/:key`, linked from the
  footer and the sign-up form. Each user accepts the current `POLICY_VERSION` before using the app
  (`POST /api/me/legal/accept`, `legal_acceptance` table, shown on `/api/me`); bumping the version
  asks everyone again. Terms say the contractor checks every figure, the forms are not AIA
  documents and the waiver forms are not legal advice; Privacy lists Cloudflare and Paddle as the
  only subprocessors (no AI provider). Ported from apps/grants' legal module.
- Durable auth rate limits (2026-11-25): `middleware/auth-rate-limit.ts` counts in D1 in front of
  Better Auth's per-isolate memory limiter. Per client IP on every auth POST (sign-in 20/15 min,
  sign-up 10/h, reset request 10/h, reset 20/h, verification resend 10/h, others 60/15 min) and
  per account on failed password sign-ins from any IP (10/15 min, keyed by a SHA-256 of the
  address; successful sign-ins never count, so a lock lasts one window at most). 429 with
  Retry-After; fails open on a D1 error. On wherever the deploy is hardened (production/HTTPS).

- Attachments (2026-11-25): files on each pay application (backup such as stored-material
  invoices, certified payroll and insurance certificates; job photos; the signed application the GC
  returns) in the R2 bucket `FILES` (`payapps-files`), rows in `pay_app_attachments`, keys under
  `orgs/{orgId}/projects/{projectId}/pay-apps/{payAppId}/`. Up to 15 MB a file and 40 a pay app;
  storage by plan (Free 250 MB, Solo 5 GB, Crew 20 GB, Company 50 GB). PDF, photos (JPEG, PNG, HEIC,
  WebP), spreadsheets, Word and text only: the stored type comes from the extension, never the
  browser, and downloads are always `attachment` with nosniff, so an upload never renders on our
  origin. Viewers read and download; editors add and delete; deleting a draft pay app or a job
  clears its stored files. Without the bucket the list still reads and uploads answer 503. Rules in
  `src/shared/attachments.ts`, service `services/payapps/attachments.ts`.
- Pay terms and due dates (2026-11-25): each job takes its subcontract's pay terms, in days after
  the application date (`projects.pay_terms_days`, migration 0008; set on the new-job form or the
  job page, blank means not set). The cash report dates every unpaid application (due = application
  date + terms), totals what is past due and what is expected in the next 30 days, and the follow-up
  names the most overdue application, its due date and how late it is, with a paid-short variant.
  A job without terms keeps the 30-days-old rule and its money is reported apart, so the forecast
  never guesses. CSV gains pay terms, past due and next-30-days columns. Math in
  `src/shared/cash-report.ts`.
  From the period end (2026-11-25): a job's terms count from the application date (default, "net
  30") or from the end of the period billed ("30 days after the end of the month"), chosen beside
  the days on the job page and the new-job form (`projects.pay_terms_basis`, migration 0019). The
  cash report, its follow-up text ("30 days after the period end"), the weekly email and the
  QuickBooks invoice's due date all use the same date (`payDueOn`); aging still counts from the
  application date. CSV gains a "Pay terms count from" column.

- QuickBooks Online (2026-11-25, Crew and up): an admin connects the company on
  `/orgs/:orgId/quickbooks` (Intuit OAuth, single-use state bound to that admin, tokens AES-GCM
  encrypted under `QBO_TOKEN_KEY`), and each sent pay application gets a "Send to QuickBooks" panel
  that previews and creates its invoice to the GC: one line per SOV line for the column G change,
  one retainage line to a Retainage Receivable account, total always line 8, numbered
  `PA<job>-<nn>`, due by the job's pay terms, sent once (retries find it by number). Dark until the
  owner sets the QBO secrets ([docs/QUICKBOOKS.md](docs/QUICKBOOKS.md)); built on
  `packages/qbo-sync`.
- Unconditional waivers owed (2026-11-25): once an application is paid (in full, or marked paid)
  and a conditional waiver on it was marked sent, PayApps asks for the unconditional waiver of the
  same scope: an amber note on the pay-app page (with the unconditional kind preselected), a line
  in the cash report's next steps, a count above the job table and a CSV column. A saved but unsent
  unconditional waiver is named as such; a sent unconditional final waiver also settles progress;
  an application paid short is asked only for the money received (see "check received short" below); Utah,
  whose statute has no unconditional form, is never asked. Computed on read from the waiver rows,
  no migration. Rules in `src/shared/waiver-followup.ts`.
  Amounts count (2026-11-25, PR 55): when the application was paid in more than one check and the
  sent unconditional waivers add up to less than was paid, the rest is still owed (the second
  check's waiver), named with its amount, and the waiver form is prefilled with that remainder.

- QuickBooks payments (2026-11-25, Crew and up): each payment received on a sent application goes to
  QuickBooks as a payment from the GC applied to its invoice (date received, check number as the
  reference), once (`qbo_payment_syncs`, migration 0010). Before each send the invoice's open
  balance in QuickBooks must equal the total less the payments already sent, else nothing is sent
  and both figures are shown; "Already in QuickBooks" records a check entered there by hand.
  Sends carry a stable `requestid` idempotency key; deleting a payment that is in QuickBooks asks
  first ([docs/QUICKBOOKS.md](docs/QUICKBOOKS.md), "Payments received").
  Sent as soon as recorded (2026-11-25, QuickBooks part 3): an admin can turn on, per company, sending
  each payment the moment it is recorded (payment form, mark paid with a date, unrecorded money), on
  applications whose invoice is already in QuickBooks, through the same checks as the button. A
  refusal never blocks the record; the reason shows under the payment form and the payment waits in
  the panel. Off by default (`qbo_connections.auto_send_payments`, migration 0030).

- Retainage release by percentage or amount (2026-11-25): on a draft pay application, release a
  share of the retainage held (say 50% at substantial completion, or 100% for the final retainage
  billing) or a dollar amount the GC approved, across every line, the complete lines (work to date
  reaches the scheduled value) or lines chosen. The release is split across lines in proportion to
  what each holds by largest remainder, so it totals to the cent and never exceeds a line's
  retainage; it replaces what those lines already release on this application. Preview first, then
  apply (`POST .../pay-apps/:payAppId/retainage-release`). Pure planner in
  `src/shared/retainage-release.ts`.

- Change orders waiting for approval (2026-11-25): each change order records the date its request
  went to the GC (on the form, or "Date sent" on a pending one; never in the future; migration 0011).
  The cash report lists every pending change order across jobs with its amount and how long it has
  waited (from the date sent, else the date entered), totals the pending additions (work that cannot
  be billed until approved; deductions are listed but not added), and past 30 days the job's next
  step names the oldest one and asks the GC for the signed change order. CSV gains two columns.
  Rules in `src/shared/cash-report.ts` (`pendingChanges`, `pendingChangeText`).
- Change order request PDF (2026-11-25, every plan): a "PDF" link on each change order downloads
  the document to send the GC (`GET .../projects/:id/change-orders/:coId/request.pdf`, viewers
  too): the parties and job, the scope in the contractor's words, the price by schedule-of-values
  line (new line or change to an existing one, deductions in parentheses), the contract sum
  before it (original plus every other approved change order) and if approved, the other pending
  change orders named as not included, and signature blocks for both sides. Dated the day sent
  when recorded, else today; an approved one prints as "Change Order" with its approval date and a
  rejected one carries a banner. Our own layout, "Not an AIA document" on every page. Model in
  `src/shared/change-order-request.ts`, PDF in `services/export/change-order-pdf.ts`.
  Contract time (2026-11-25): each change order records the time it asks for in calendar days
  (`change_orders.schedule_days`, migration 0012; 0 = no change, blank = not stated), on the new
  change order form or "Time" on a pending one (`PUT .../:coId/schedule`), shown on the job page and
  printed on the request as its own "Contract time" line, stated either way, since many
  subcontracts treat silence about time as giving up the claim for it.

- Closing a balance paid short (2026-11-25, every plan): when the GC pays an application short and
  the rest will not come, an editor closes the balance on the pay-app page as a backcharge,
  disputed or written off, with the date and an optional note (`POST .../pay-apps/:id/close-short`;
  `DELETE` reopens it; migration 0013). The application turns paid; the balance at that moment is
  recorded and counted as neither paid nor owed: the cash report lists it under its reason with
  totals per job and across jobs (CSV gains three columns), a disputed balance gets a next step,
  and the unconditional waiver asked for and prefilled covers only the money received. Deleting a
  payment from a closed application reopens it and clears the close. Nothing goes to QuickBooks
  (the page says to record a credit memo there). Rules in `src/shared/payments.ts`.
- Pay application history (2026-11-25, every plan): every change to an application is one
  append-only row in `pay_app_events` (migration 0014) with who made it and when: created, header
  fields changed (only the ones that actually changed), entries saved (with line 8), retainage
  release applied, submitted, certified, marked paid, each payment recorded or deleted (amount, date,
  check number, the status it left), a balance closed short or reopened, lien waivers prepared,
  marked sent or deleted, files attached or removed, and QuickBooks sends. A "History" panel on the
  pay-app page (with a CSV for a dispute file, oldest first) and a job-wide one on the job page,
  where a deleted draft's history stays. Written by the routes after the change succeeds, best effort
  (a failed write is logged, never shown); never read by the math. Any member reads it. Sentences in
  `src/shared/pay-app-history.ts`, service `services/payapps/history.ts`.
- Per-line retainage rates (2026-11-25, every plan): a schedule-of-values line can carry its own
  retainage rate (the "Retainage" column on the job page: blank follows each application, 0 for a
  bond or insurance line the subcontract bills without retainage, or any rate up to 100%). The rate
  is held on the line's work and stored materials in every application, whatever the application's
  rates, so a job-wide cut to 5% leaves it alone. Lines 5a and 5b say which lines were held at their
  own rate on the pay-app page, the PDF and the summary CSV. Locked once a submitted application
  holds anything on the line; a line with nothing billed yet stays open (migration 0015).
- Sample job (2026-11-25, every plan): onboarding for a company with no jobs yet. "Try a sample
  job" on the empty Projects page (`POST /api/orgs/:orgId/projects/sample`, editors; one per company,
  asking again returns it) adds an electrical subcontract three months in: seven SOV lines (the bond
  at 0% retainage), CO-1 approved (adds a line), CO-2 pending past 30 days, application #1 paid in
  full, #2 paid $1,250 short, #3 sent and unpaid, and this month's draft to fill in. Dates are
  relative to the day it is added, so the cash report always has aging, a paid-short balance and a
  change order to chase. Built through the same services as a real job (`services/payapps/sample.ts`,
  plan in `src/shared/sample-job.ts`), all or nothing. `projects.is_sample` (migration 0016): it
  never counts toward the plan's active jobs, every page of its application PDFs says "SAMPLE DATA -
  NOT A REAL APPLICATION", as do its summary and continuation CSVs (a row of their own below the
  table) and every page of its change order PDFs ("NOT A REAL CHANGE ORDER") and lien waiver PDFs, its page carries a banner and a "Remove the sample job" button (admins).
  Never sent to QuickBooks (409), so invented numbers cannot reach real books. No history rows are written: nobody did those things.
- Getting started (2026-11-25, every plan): a checklist above the job list on the Projects page,
  from sign-up to the first payment: add a job, enter the schedule of values, start a pay
  application, send it (submitted or later), record the GC's payment (a payment row or paid), plus
  two optional steps (invite a project manager or bookkeeper; connect QuickBooks, which links to
  Billing below Crew). Computed on read from the company's own rows (`GET /api/orgs/:orgId/
  getting-started`, any member), never ticked by hand, and the sample job never counts. Each open
  step links to the job or application where it is done; the card disappears once the five
  required steps are done, and "Hide" dismisses it in that browser. Rules in
  `src/shared/getting-started.ts`, counts in `services/payapps/getting-started.ts`.
- Sample job, part 2 (2026-11-25): its lien waiver PDFs are marked "SAMPLE DATA - NOT A REAL LIEN
  WAIVER" on every page, above the form and outside its body (CSVs and change order PDFs: PR 69).
- Mid-job start from the last continuation sheet (2026-11-25, every plan): on the opening-balance form,
  "Fill from your last continuation sheet" reads the .xlsx or CSV of the last application sent elsewhere
  (G703 or the contractor's own layout) in the browser, never uploaded, through the SOV import's reader,
  which now also returns each row's columns D, E, F, G and retainage, the change-order rows, and the
  application number and period end from the title block. Each sheet row (contract lines and change-order
  rows) is matched to one of the job's lines by item number, then by description, only where exactly one
  row and one line share the key; work completed is D + E (else G less F), so stored materials are never
  carried. Line 6 is filled from G less retainage over every row, line 5a from the retainage column only
  when nothing is stored. Listed, never guessed: rows with work that match no line or more than one,
  unreadable cells, work above a line's scheduled value, scheduled values or descriptions that differ,
  and rows where D + E + F is not G. Nothing is saved until the contractor checks and saves. Pure
  matcher in `src/shared/sov-import/opening.ts`; tested on the LibreOffice-saved G703 fixture.
  Follow-up (2026-11-25): the public site's free template works end to end. When there is no usable
  retainage column (formulas with no saved result, as the template's generator and other non-calculating
  programs write them), line 5 is worked out from the title block's "Retainage on work, %" and "on stored
  materials, %" the way the template's own formula does (per line, ROUND((D + E) x rate + F x stored rate,
  2)), and a note says so; a saved retainage column always wins. A cell that could not be read is a high
  warning only when it leaves a line's work unknown; uncalculated G and retainage cells beside readable D
  and E are one note naming the cells, other unreadable cells there a medium check. Component test for the
  fill (nothing sent until Save; the PUT body is exactly what the form shows).
- QuickBooks, your own item (2026-11-25, Crew and up): an admin chooses which of the company's own
  QuickBooks items (active Service or Non-inventory, posting to an income account; never the
  Retainage item) the work lines are billed with, read live from QuickBooks on the QuickBooks page
  (`GET .../quickbooks/items`, `PUT .../quickbooks/invoice-item`; migration 0017). The send re-reads
  the item and stops, sending nothing, if it was made inactive; null goes back to "Contract
  Billing"; connecting a different QuickBooks company clears the choice. `packages/qbo-sync` gains
  `getItem` and `listSaleItems` ([docs/QUICKBOOKS.md](docs/QUICKBOOKS.md), "Your own item").
- Work billed on a change order not yet approved (2026-11-25, every plan): when a line is billed
  above its approved scheduled value and a change order adding to that line does not count in this
  application, the draft's "Check before submitting" list names it instead of the plain overbilling
  note: still pending (hold the excess until the GC signs, or mark it approved with the signing date)
  or approved after the period end (it counts from the first application ending on or after that
  date). Says when the line would still be over with it counted, and names rejected change orders on
  the line. Not blocking. `uncountedChangesOnLine` and the warning in `src/shared/payapp-math.ts`.
- Deploy workflow (2026-11-25): `.github/workflows/payapps-deploy.yml`, by hand only until launch.
  Checks, build, `scripts/provision.mjs` (creates D1 `payapps` and R2 `payapps-files` when missing,
  writes the deploy config with the database id, drops the R2 binding if R2 is off), migrations before
  the code goes live, Paddle catalog sync, `wrangler deploy` on workers.dev or `PAYAPPS_DOMAIN`, the
  `PAYAPPS_*` secrets copied over, `AUTH_SECRET` generated once, and a health smoke test that warns
  when account mail is off ([docs/DEPLOY.md](docs/DEPLOY.md)).
- Weekly "money to chase" email (2026-11-25, every plan): each member can turn on, for themselves,
  a Monday email with the company's cash-report next steps (applications past due or paid short,
  retainage to bill on finished work, unconditional waivers owed, change orders waiting past 30
  days, disputed balances), checkbox and preview on the Cash and retainage page
  (`GET/PUT /api/orgs/:orgId/digest`, `cash_digest_subscriptions`, migration 0018). The Worker's
  first cron (`0 13 * * 1`) sends it; no email in a week with nothing to chase; never the sample
  job; once a week per member even when a run is retried; members removed or unconfirmed get
  nothing. Selection in `src/shared/cash-digest.ts`, send in `services/payapps/digest.ts`
  ([docs/EMAIL.md](docs/EMAIL.md), "Weekly money to chase email").
  Choice of weekday (2026-11-25): each member picks the day (Sunday to Saturday, Monday by default)
  next to the checkbox, and the page shows the next day the list goes. The cron now runs daily at
  13:00 UTC and mails only the members whose day it is; the 6-day rule still holds, so moving the day
  after this week's email waits for the next week. The getting-started reminder stays on Mondays.
  `cash_digest_subscriptions.weekday` (migration 0024); `nextDigestDay` in `src/shared/cash-digest.ts`.
  One-click unsubscribe (2026-11-25): a signed "Stop this weekly email" link in every email (page
  `/unsubscribe`, no sign-in) and RFC 8058 `List-Unsubscribe` / `List-Unsubscribe-Post` headers so
  mail apps show their own button; the link stops only that member's email for that company
  (`src/worker/lib/unsubscribe-token.ts`, `routes/unsubscribe.ts`).

- Follow-up emails to the GC (2026-11-25, every plan): on the Cash and retainage page, a draft email
  for each unpaid application, written only from the report's figures (job, application number and
  date, period billed, amount owed, the due date under the job's pay terms and its basis, payments
  received). Four drafts chosen by the same rules as the report: not yet due (is it in for
  processing, is anything missing), past due (reminder), more than 30 days past due (second request
  asking for a payment date), and paid short (what is the balance held for). Past-due and paid-short
  applications are listed; ones not yet due on request. Signed with the user's name and company,
  editable, then copied or opened in the user's own mail program (`mailto:` with no recipient).
  PayApps sends nothing and the draft claims no attachment, lien right or legal step. Pure drafting
  in `src/shared/follow-up-email.ts`, panel in `src/client/components/follow-up-emails.tsx`.
  Addressed (2026-11-25): each job takes the GC's billing contact (accounts payable or the project
  accountant), a name and an email (`projects.gc_billing_name`, `gc_billing_email`, migration 0020),
  on the new-job form or "GC billing contact" on the job page; a blank field clears it and anything
  that is not one address is refused (400). The drafts greet the contact by name (else "<GC>
  accounts payable") and fill a "To" field that goes into the `mailto:` link, percent-encoded so an
  address cannot add a recipient or a header; without a contact the draft links to the job page to
  add one. The sample job's contact is `ap@example.com` (reserved, reaches no one). Still nothing
  is sent from PayApps.

- Weekly email links to the follow-up drafts (2026-11-25): the Monday email counts the unpaid
  applications with a draft waiting (past due or paid short, every job, including those cut by the
  15-job cap) and links to `/orgs/:orgId/cash#follow-ups`; the cash page scrolls to the drafts on that
  hash once the report loads. Privacy draft lists the GC billing contact (PR 80) among job data.
  Per application (2026-11-25): under each listed job, the email links each past-due or paid-short
  application to its own draft ("Draft email for application #3 (second request)",
  `/orgs/:orgId/cash#follow-up-<payAppId>`); the cash page opens that draft and scrolls to it, shows
  it even when it is no longer past due, and says so when the application has since been paid.
  `CashDigestJob.drafts`, `followUpAnchor` in `src/shared/cash-digest.ts`.

- GC billing contact, part 2 (2026-11-25): the job's GC billing contact is the QuickBooks invoice's
  own billing email (`BillEmail`, per invoice, not on the shared customer; one plain address of at
  most 100 characters, else left off with a note), shown in the invoice preview; and the application
  PDF prints "Attn: name, email" under "To (general contractor)". `packages/qbo-sync` gains
  `InvoiceInput.billEmail` with its own check. The change order request PDF does not carry it: see "Change order files" below.

- Job history (2026-11-25, every plan): the job itself gets the same append-only log as its pay
  applications, in `job_events` (migration 0021): job created and its terms changed (the fields
  that actually changed; the contract sum's before and after), schedule-of-values lines added (one,
  or a bulk import with count and total), changed (scheduled value and per-line retainage before and
  after; reordering alone is not recorded) and deleted, the opening balance set or removed, and each
  change order entered (net amount, description, date sent, contract time), its date sent or
  contract time changed, approved (with the date), rejected or deleted (its number and amount kept).
  A "Job history" panel on the job page with a CSV (`GET .../projects/:id/history(.csv)`, any
  member). Written by the routes after the change succeeds, best effort; unchanged values and
  refused changes write nothing; the sample job writes none. Sentences in `src/shared/job-history.ts`,
  service `services/payapps/job-history.ts`.

- Getting started, part 2 (2026-11-25, every plan): two emails from the checklist. A welcome email
  when a verified user creates their first company (the five required steps, the sample job, the
  mid-job start, a link to the checklist), and one reminder per company from the Monday cron, 5 to 60
  days after it was created, when it has a real job but no application marked sent: what is done, the
  next open step with a link to the job or draft where it is done, and on a started draft, "mark it
  submitted". Owners with a verified address only; each email claimed once per company in
  `onboarding_emails` (migration 0022), retried after a failed send. Words in
  `src/shared/onboarding-email.ts`, sends in `services/payapps/onboarding.ts` ([docs/EMAIL.md](docs/EMAIL.md)).

- Change order files (2026-11-25, every plan): each change order keeps its own files, the backup a GC
  asks for before signing (supplier quotes, T&M tickets, invoices), photos of the condition and the
  signed change order when it comes back, on any status. "Files" on its row on the job page opens the
  same panel as a pay application's attachments (`GET/POST .../projects/:id/change-orders/:coId/
  attachments`, `GET/DELETE .../attachments/:attachmentId`; viewers read, editors add and delete).
  Rows in `change_order_attachments` (migration 0023), objects under
  `orgs/{orgId}/projects/{projectId}/change-orders/{coId}/`; same type allow-list, 15 MB a file,
  20 a change order, and one storage limit per plan counted across pay-app and change-order files.
  The request PDF lists the files as "Backup attached" (name and kind; the signed copy is left out,
  being the GC's answer), so the GC can tell whether everything arrived. Each file added or removed
  is a job history row. Deleting the change order or the job clears its stored objects. Service
  `services/payapps/change-order-attachments.ts`. Not done: the GC billing contact on the request
  PDF, on purpose: billing contacts are accounts payable, while a change order request goes to the
  GC's project manager (a PM contact per job would be the right field, if asked for).

- Backup packets (2026-11-25): one PDF to send the GC. Pay application: the application, an index
  page, then its backup files (`GET .../pay-apps/:payAppId/packet.pdf`, "PDF with backup" on the
  pay-app page; the attachments panel ticks which files go in, `?files=` in order). By default every
  file but the signed application, backup first, then photos, then other, oldest first. Change order:
  the request, an index, then its files except the signed copy, in the request's "Backup attached"
  order (`GET .../change-orders/:coId/packet.pdf`, "PDF + backup" on the row). PDFs go in page for
  page (content, fonts, images and filled form fields copied byte for byte), JPEG and PNG photos one
  to a page in their EXIF orientation (PNG transparency kept), and every page is stamped "Application
  #7 - page 12 of 40" upright whatever the page's rotation. Files that cannot go in (spreadsheets,
  Word, HEIC and WebP photos, PDFs that need a password to open or cannot be read) are listed on the index with the reason
  and what to do. Limits: 40 MB of files read per packet, 500 pages per PDF; streamed out without
  joining. No dependency: our own PDF reader in `services/export/pdf-merge/` (xref tables and
  streams, object streams, incremental updates, a recovery scan for damaged files, depth limits for
  hostile ones). Checked on files from pdfTeX, Microsoft Print to PDF, Adobe PDF Library, Skia
  (Chrome), ReportLab, Matplotlib and LibreOffice by rendering with poppler and diffing every page
  against its original: identical apart from the stamp.
- HEIC and WebP photos in the packet (2026-11-25, Backup packets part 3, every plan): the upload
  form converts a HEIC or WebP photo to JPEG in the browser before sending it, when the browser can
  read it (Safari reads HEIC, where iPhone photos come from; every current browser reads WebP), so
  it goes in the one-PDF packet instead of the "send separately" list. Same name with .jpg, same file
  time; the picture upright as the decoder shows it (EXIF orientation applied), transparency on
  white, JPEG quality 0.9. Photos over 12 megapixels are scaled to 4032 x 3024's area, under iOS
  Safari's 16.7-megapixel canvas limit and the 15 MB file limit. The EXIF metadata inside the file
  (camera, GPS, capture time) is not carried over. A browser that cannot read the file uploads the
  original as before; the packet's note for a HEIC now says to attach it from Safari. The panel
  lists what it converted. Nothing leaves the browser to convert. `client/lib/packet-photo.ts`,
  `convertibleToJpeg`/`convertedSize` in `src/shared/attachments.ts`; checked in Chromium with a real
  WebP (1200 x 800 to a JPEG the packet's `readJpeg` reads; 5000 x 4000 scaled to 3903 x 3123; an
  undecodable HEIC passed through unchanged). Not checked on a real iPhone yet.
- HEIC photos from Chrome, Edge and Firefox (2026-11-27, Backup packets part 3, every plan): where the
  browser cannot open a HEIC as an image, the upload form now decodes it with the browser's own HEVC
  video decoder through WebCodecs (the device's decoder, so no HEVC code is bundled or licensed) and
  converts it to JPEG as Safari's path does. `src/shared/heif.ts` reads the HEIF container with no
  dependency: the primary item as one HEVC image or a grid of tiles (iPhones use 512 x 512), each
  item's bytes from iloc (file or idat), and the hvcC, ispe, clap, irot and imir properties, with
  limits (1,024 tiles, 16,384 pixels a side); it builds the WebCodecs codec string from the hvcC.
  `src/client/lib/heic-webcodecs.ts` feeds each tile as a key frame, draws each decoded frame at its
  grid place straight onto a canvas at the JPEG's size (so a 48-megapixel photo never needs a
  48-megapixel canvas), then crops, turns and mirrors. If the browser has no VideoDecoder, says it
  cannot decode the profile, or a tile fails or never comes out, the original HEIC is uploaded as
  before; the packet's note now names Chrome and Edge too. Checked in Chromium by
  `test/fixtures/pdf-sources/heic-webcodecs-check.cjs`: this Chromium has no HEVC decoder, so ffmpeg
  decodes exactly the bytes our parser hands the stub decoder, and everything else is the real code;
  on four libheif HEICs (3 x 2 grids plain, turned and transposed, and one single image) and the
  64 x 48 clap fixture, ours matches libheif's decode at 40.9 to 48.1 dB PSNR at full size and 34.8
  to 35.8 dB scaled to 37%, and the wrong orientation scores 8.4 dB. Not yet checked on a device
  with a hardware HEVC decoder or with a real iPhone photo; colour profiles are not applied (an
  iPhone's Display P3 shows a little less saturated).
- Packet order (2026-11-25): the pay-app attachments panel lists the files ticked "In packet" under
  "Packet order"; drag a row (desktop) or use the up and down arrows (phone, keyboard) to put the
  backup in the order the GC asks for, and the download sends `?files=` in that order, so the
  index page and the pages follow it. Unticking drops a file; a newly ticked or uploaded file joins
  at the end; "Back to the usual order" restores backup, photos, other. The order is kept while the
  page is open, not saved (`packetIds`/`moveId` in `client/components/attachments.tsx`,
  `test/unit/packet-order.test.tsx`).

- Pay-when-paid terms (2026-11-25, every plan): a job's pay terms can count from the day the owner
  pays the GC for the work ("within 7 days after Contractor receives payment from Owner"), a third
  choice beside the application date and the period end (`projects.pay_terms_basis` "owner_paid").
  Each sent application then records the day the owner paid the GC, as the GC reports it
  (`pay_apps.owner_paid_on`, migration 0025; `PUT .../pay-apps/:id/owner-paid`, editors; null clears
  it; refused on a draft, on a job with other terms, in the future and before the period began). Until
  it is recorded the application has no due date: PayApps never guesses when the owner pays. Its money
  is reported apart ("waiting on the owner's payment": a tile note, a job-row note, a CSV column, a
  line in the weekly email), out of past due and the 30-day forecast, and after 30 days the next step
  and a new follow-up draft ask the GC whether the owner has paid for that period and on what date.
  Once recorded, the due date, past due, forecast, follow-up drafts and the QuickBooks invoice's due
  date count from it. Each date recorded or cleared is a history row. PayApps states no view on
  whether a pay-when-paid or pay-if-paid clause is enforceable. Rules in `src/shared/cash-report.ts`
  (`payDueOn`, `awaitingOwner`) and `src/shared/payments.ts` (`ownerPaidProblem`); panel
  `src/client/components/owner-payment.tsx`.
  Outer limit (2026-11-25, pay-when-paid part 2): many pay-when-paid clauses add "and in any event
  within 90 days". A pay-when-paid job takes that limit in days from the application date
  (`projects.pay_terms_outer_days`, migration 0026; 1 to 365, blank for none, set beside the terms on
  the job page and the new-job form, ignored under the other bases). Each application is then due on
  the earlier of the owner's payment plus the days and the application date plus the limit, and by
  the limit alone while the owner's payment is unrecorded, so it counts in past due and the 30-day
  forecast instead of waiting undated. Until it is past due, the next step and the "owner" draft still
  ask the GC whether the owner has paid (an earlier payment makes it due sooner) and name the outer
  date; once past due it is chased like any late application. The terms phrase in the cash report,
  drafts and job page reads "7 days after the owner pays the GC, and in any event within 90 days of
  the application date"; the pay-app panel and the QuickBooks due date use the same date
  (`payDueOn`, `dueByOuterLimit`); CSV gains the limit's column. PayApps still states no view on
  whether the clause is enforceable.
  Several applications at once (2026-11-25, pay-when-paid part 3): when the GC says one owner
  payment covered more than one period, the job page's "Owner's payment for several applications"
  panel lists the sent applications, ticks the ones still waiting (no date, money owed), and records
  one date on every ticked one (`PUT .../projects/:id/pay-apps/owner-paid` with `payAppIds` and
  `ownerPaidOn`, editors, up to 50). All or nothing: each application must pass the one-application
  rule, and the first refusal names its number. Each application whose date changed gets its own
  history row naming the others ("together with applications #1 and #3"); the same date again
  writes nothing. Clearing stays on the application's own page. `ownerPaidManyProblem` in
  `src/shared/payments.ts`, panel `OwnerPaymentsBulk` in `src/client/components/owner-payment.tsx`.

- Mark paid records the payment (2026-11-25, every plan): "Mark paid in full" asks for the date the
  money came in and the check number, and records the balance still owed as one payment
  (`POST .../mark-paid` with `receivedOn`, `reference`), which turns the application paid by the
  usual rule. The payment then shows on the pay-app page, goes to QuickBooks like any other (Crew and
  up) and dates the history ("now paid in full"). Left blank, it only marks the application paid, as
  before. An application already marked paid with no payment behind (part of) the money shows that
  amount (`unrecordedCents` on the pay app) and records it as one payment later
  (`POST .../payments/unrecorded`; the server works out the amount, never a balance closed short).
  Rules `unrecordedPaidCents` and `unrecordedPaymentProblem` in `src/shared/payments.ts`.

- Unconditional waiver for a check received short (2026-11-25, Crew and up for the forms): when a
  sent application has some money in and some still owed, and its conditional progress waiver went
  out, PayApps asks for the unconditional progress waiver for the money received so far, less the
  unconditional progress waivers already sent, without waiting for the whole application to be paid
  (GCs often hold the next check until it is in). The pay-app page preselects that kind and prefills
  the amount received, the cash report and the weekly email count it, and the wording says never to
  waive the balance still owed. Never a final waiver while money is owed; an unconditional final
  already sent, or one with no amount on record, settles it; Utah is still left out. When the rest
  comes in, the existing rule asks only for the later check's waiver. `partialPaymentWaiver` in
  `src/shared/waiver-followup.ts`.

- Getting started, part 3 (2026-11-25, every plan): a reminder for a company that signed up but never
  added a job ("Add your first job to PayApps"), once, from the Monday cron, 3 to 30 days after the
  company was created, while it has no real job (a sample job alone still counts as none): the ways in
  (a new job with its schedule of values from a spreadsheet, a mid-job start from the last
  continuation sheet, the sample job), linking the Projects page. Both reminders now carry a signed
  one-click stop for that member and company (`/unsubscribe?list=onboarding`, RFC 8058 headers to
  `POST /api/unsubscribe/onboarding`), signed over its own label so it cannot stop the weekly email,
  stored as a `stop:<userId>` row in `onboarding_emails` (no migration). Stopped owners are skipped,
  and a company whose owners all stopped is not claimed. `noJobEmailContent` in
  `src/shared/onboarding-email.ts`, `sendNoJobReminders` in `services/payapps/onboarding.ts`
  ([docs/EMAIL.md](docs/EMAIL.md)).

- Change order history (2026-11-25, every plan): "History" on each change order's row on the job page
  opens that change order's own history, newest first: entered, date sent, contract time, approved or
  rejected, files added or removed, with who and when (`GET .../projects/:id/change-orders/:coId/
  history`, any member; the job history's rows for that change order, so nothing new is written). A
  deleted change order answers 404; its rows stay in the job history. Handy when a GC disputes when a
  change order went out or who approved it. Its own CSV for the dispute file, oldest first
  (`.../history.csv`, "Download CSV" in the panel, named `change-order-<number>-history.csv`).

- GC project manager and change order emails (2026-11-25): each job takes the GC's project manager
  (name and email, `projects.gc_pm_name`/`gc_pm_email`, migration 0027) beside the billing contact,
  on the new-job form and the job page. Change order requests go to the PM, pay applications to the
  billing contact: the request PDF prints "Attn: <PM>" under the GC (never the billing contact), and
  each pending change order gets "Email" on its row, a draft to the PM from the change order as
  entered: a request to review and sign when no date sent is recorded, a follow-up counting the
  days since it was sent otherwise. The draft states the price (add or deduct), the contract-time
  sentence from the PDF and the contract sum before and after (approved change orders only), never
  claims an attachment, and is copied or opened in the contractor's own mail program; nothing is
  sent from PayApps. Pure drafting in `src/shared/change-order-email.ts`; the sample job has a
  sample PM at example.com.

- Change orders, last emailed (2026-11-25): copying or opening a pending change order's email draft
  records the day on its row ("last emailed 2026-11-20 (5 days ago)", `change_orders.last_emailed_on`,
  migration 0028) and a row in its history saying which draft and that sending is not recorded
  (`POST .../change-orders/:coId/emailed`, editors, pending only). A later follow-up names the last
  one ("and on my follow-up of 2026-11-18") when it came after the date sent and before today. After
  a request on a change order with no date sent, the draft offers "Record as sent today", so the next
  draft is a follow-up and the cash report ages it from the right day. Nothing treats an opened draft
  as proof of sending. `lastChase` and `lastEmailedText` in `src/shared/change-order-email.ts`. Copy
  then "Open in my email" (or a second copy) the same day writes no second history row for the
  same draft kind, so the dispute file does not read as two emails.
  In the cash report and the weekly email (2026-11-25, change orders part 6): a pending change
  order's next step names the last follow-up emailed from PayApps when it came after the date sent
  ("Last follow-up emailed from here on 2026-11-20 (5 days ago)"), so a contractor reading Monday's
  list knows whether the PM was already chased this week. With no date sent recorded and a request
  already drafted, it asks for the date sent instead, so the change order is aged from the right
  day. The cash page's pending table shows "last emailed" under the wait and the CSV's pending
  column adds it. `lastFollowUp` in `src/shared/cash-report.ts`; no migration.
- Weekly email at the member's own hour (2026-11-25, weekly email part 3): the Cash and retainage
  page picks the hour (0-23) beside the weekday, read in the member's IANA time zone; turning it on
  sends the browser's zone and 7:00, and a saved zone that differs from the device's gets a
  one-click "Use <zone> time". The cron runs hourly and sends from the chosen hour on the member's
  own weekday (a missed run still sends later that day); the 6-day guard and `last_sent_on` count
  local days. Rows from before keep Monday 13:00 UTC; the Monday getting-started reminders run only
  on the 13:00 UTC run. `hour` and `time_zone` on `cash_digest_subscriptions` (migration 0029);
  `localClock`, `digestDueDay` in `src/shared/cash-digest.ts`.
- Getting started, part 4 (2026-11-25, every plan): the reminders' stop as a switch in the app.
  Owners see "Email me a reminder about the next step" under the checklist on the Projects page
  (there is no account settings page; the checklist is where the reminders' steps live); off writes
  the same `stop:<userId>` row as the email's one-click link, on deletes it, so a stop pressed in an
  email can be undone. `GET/PUT /api/orgs/:orgId/getting-started/reminders`, `myReminderSetting`/
  `setMyReminders` in `services/payapps/onboarding.ts`; no migration (docs/EMAIL.md).
- Payments not yet in QuickBooks, on the cash report (2026-11-25, QuickBooks part 4): a card lists
  every payment on an invoice already in QuickBooks that is not there yet (a refused automatic send,
  or one never sent), oldest first across jobs, with Send to QuickBooks and Already in QuickBooks
  for editors through the pay application's own route and checks. Invoices in another company are
  flagged; the sample job is left out. `unsentPayments` in `services/quickbooks.ts`,
  `GET /api/orgs/:orgId/quickbooks/unsent-payments`; no migration (docs/QUICKBOOKS.md).
- Balance closed short as a QuickBooks credit memo (2026-11-25, cash report part 4): on the pay
  application's QuickBooks panel an editor sends the backcharge, dispute or write-off as a credit
  memo to the GC (`CR` + the invoice number's tail, dated the day closed, on the invoice's work
  item) applied to the invoice, once every payment is there and the open balance in QuickBooks is
  exactly the amount closed short (plus any certified-below-billed difference, as a second line).
  QuickBooks applying the credit itself is read back and used; applied to another invoice, the panel
  says to move it; a retry records an existing memo; "Already in QuickBooks" marks one entered by
  hand; reopening asks first. `src/shared/qbo-credit.ts`, `sendShortCredit`, migration 0032,
  `createCreditMemo`/`applyCreditMemo` in packages/qbo-sync (docs/QUICKBOOKS.md).

- An item per job in QuickBooks (2026-11-25, QuickBooks part 5): below the company's item on the
  QuickBooks page, admins give a job its own item (service work or a tenant improvement billed to
  another income account). Checked like the company's item, it wins over it at send time; made
  inactive, it stops that job's sends only, with a 409 naming the job. Tied to the QuickBooks
  company it was chosen in. `projects.qbo_item_*` (migration 0031), `setJobInvoiceItem` in
  `services/quickbooks.ts`, `PUT /api/orgs/:orgId/quickbooks/job-items/:projectId`
  (docs/QUICKBOOKS.md, "An item per job").

- Photos from a phone camera (2026-11-25, Attachments part 2, every plan): "Take a photo" under
  "Add files" on a pay application's attachments and on each change order's files. On a phone it
  opens the rear camera (`capture="environment"`) and asks for JPEG or PNG, so the shot also fits
  the one-PDF backup packet (not checked on a real phone yet; a phone that still sends HEIC gets the
  packet's usual "send separately" note). The
  picture is saved as a photo whatever the Kind list says, and renamed from the phone's "image.jpg"
  to its capture time, "Photo 2026-11-25 14.05.09.jpg" (`cameraPhotoName` in
  `src/shared/attachments.ts`). Same upload route and checks; no server change, no migration.

- Large photos shrunk before upload (2026-11-25, Attachments part 3, every plan): "Make large photos
  smaller before upload", on by default and remembered per browser, redraws a JPEG over 1 MB with
  its long side at 2560 pixels (quality 0.85; over 250 dpi across a letter page) and sends it only
  if that saves a fifth or more. A phone's 12-megapixel 2.5 to 5 MB photo typically lands under
  1 MB, so the free plan's 250 MB holds several times more photos, each sends faster from a job
  site, and a 48-megapixel photo over the 15 MB limit now goes up instead of being refused. The
  capture time is kept: DateTimeOriginal, OffsetTimeOriginal and DateTime are read from the
  original's EXIF and written into the smaller JPEG (`src/shared/photo-exif.ts`, no image library);
  the picture is drawn upright, so no orientation tag, and the camera, GPS and other EXIF are left
  out. HEIC and WebP being converted are drawn at the same size. PNGs (often screenshots or drawings)
  are never touched; untick the box to send photos at full size. Ships before storage use per plan
  is measured (the Next item's condition): it costs the contractor nothing they cannot turn off and
  stretches the free plan, so it did not need to wait. Checked in Chromium with a 4032 x 3024 JPEG
  (EXIF orientation 6, 7 MB of noise, the worst case for JPEG) written by Pillow: 1920 x 2560
  upright, 1.8 MB, and Pillow reads back the times with no GPS, model or orientation. Not checked on
  a real phone yet. `shrinkable`/`shrunkSize` in `src/shared/attachments.ts`, `client/lib/packet-photo.ts`;
  tests `src/shared/photo-exif.test.ts` (fixture `test/fixtures/exif-photo-pillow.jpg`) and
  `test/unit/packet-photo.test.ts`. No server change, no migration.

- Capture time kept on converted HEIC and WebP photos (2026-11-25, Attachments part 4, every
  plan): an iPhone photo attached from Safari is HEIC, and converting it to JPEG for the packet used
  to drop when it was taken, the one fact a job photo proves. The upload form now reads
  DateTimeOriginal, OffsetTimeOriginal and DateTime from the original and writes them into the JPEG,
  as the shrink step already did for JPEGs; the note says "with the time it was taken kept". The
  EXIF is found where each format keeps it, by hand with no image library: a HEIC's 'Exif' item via
  the meta box's iinf and iloc (ISO/IEC 23008-12 and 14496-12; extents in the file or in idat, 64-bit
  box sizes, iloc versions 0 to 2) and a WebP's RIFF "EXIF" chunk. Camera, GPS and the rest of the
  EXIF are still left out. Shipped without waiting for someone to ask (the Next item's condition):
  HEIC is the main way iPhone photos arrive, and losing their time silently is worse than the small
  parser. Checked in Chromium with a WebP written by Pillow (browser decoder, shrink on): the JPEG
  reads back 2026:11:24 16:42:30 -08:00. HEIC conversion itself still needs Safari, so the HEIC side
  is checked against a libheif-written file in unit tests only; not checked on a real iPhone yet.
  `photoCaptureTime`/`heifExif`/`webpExif` in `src/shared/photo-exif.ts`, `client/lib/packet-photo.ts`;
  tests `src/shared/photo-exif.test.ts` (fixtures `exif-photo-libheif.heic`, `exif-photo-pillow.webp`)
  and `test/unit/packet-photo.test.ts`. No server change, no migration.

- Mid-job start, unmatched rows placed by hand (2026-11-25, every plan): when the fill from the last
  continuation sheet lists rows with work that matched no line or more than one (a change-order row
  that added to an existing line, two rows that share a description), the fill report offers a line
  picker for each one. The row's work is added on top of what the chosen line shows; moving it or
  choosing "Not on a line" takes the same amount back off (never below $0.00), so figures typed by
  hand on other lines stay. A line pushed above its scheduled value is named under the pickers.
  Still nothing is saved until Save. `placeUnmatched` and `overScheduled` in
  `src/shared/sov-import/opening.ts`; no server change, no migration.

- Mid-job start, the summary sheet (2026-11-25, every plan): when the workbook of the last application has its
  summary page (G702, or the contractor's own "Application summary") on another tab, the fill reads it by line
  label, never by position: lines 4, 5a, 5b, 5, 6, 7 and 8, the application number and period end, the amount being
  the last dollar cell right of the label (never the rate before it or a column note). Line 6 and line 5a come from
  there, so stored materials no longer leave 5a blank; 5a is line 5 less 5b when only those are stated. A summary
  that disagrees with the continuation sheet (or with itself: 5a + 5b vs 5, 4 less 5 vs 6) still wins, with a check
  naming both figures; a summary for another application or period is not used at all (high check). Uncalculated
  cells are named, never read as $0.00. `findSummary` in `src/shared/sov-import/summary.ts`, attached by `pickSov`;
  no server change, no migration.

- Mid-job start, the summary page of a PDF (2026-11-25, every plan): a PDF of the last application (the G702
  page and the continuation sheet, printed or saved from Excel, a web tool or the free template) gives line 6,
  5a, 5b and the application number from its summary page, as the workbook's summary tab does. Each page is read
  line by line with a cell per phrase (split at leader dots and after each dollar figure), and on a printed page
  the amount is the first dollar figure right of the label, so the architect's "AMOUNT CERTIFIED" beside line 6
  and a "10" typed in the 5a blank are never taken. A summary page is kept out of the continuation sheet's table
  (its 5a and 5b lines used to join it and blur the columns). Two reader fixes found on the way: kerned letters
  Chromium draws as two runs ("RET" "AINAGE") are one word again, and G703 column letters printed in the label's
  cell ("A Item No.") no longer hide the item column. The free template's combined "Application no. / period
  to" label is read in workbooks too. `summaryPages` in `src/shared/sov-import/pdf.ts`; fixture
  `test/fixtures/g702-g703-chrome.pdf`; no server change, no migration.

- A QuickBooks class and location per job (2026-11-26, QuickBooks part 7, Crew plan and up with
  QuickBooks): for companies on QuickBooks Plus or Advanced that run their profit and loss by class
  or location, the QuickBooks page gives each job a class and a location, read live from the
  company with its own word for locations ("Division", "Property"). Invoices carry the class on
  every line or on the invoice, as the company tracks it, and the location on the invoice; the
  credit memo for a balance closed short does the same. A choice made inactive stops that job's
  send with a 409; a kind the company stopped tracking is left off; another QuickBooks company
  ignores it. `getTrackingPrefs`, `listClasses`/`getClass` and `listLocations`/`getLocation` in
  `packages/qbo-sync`; `quickbooksTracking`/`setJobTracking`/`sendTracking` in
  `services/quickbooks.ts`; `projects.qbo_class_*`/`qbo_location_*` (migration 0052);
  `GET`/`PUT /api/orgs/:orgId/quickbooks/tracking[/:projectId]` (docs/QUICKBOOKS.md, "Class and
  location per job"). The transaction-level class is still to check in a sandbox company.

- An item per schedule-of-values line in QuickBooks (2026-11-25, QuickBooks part 6): "Lines" on
  each job of the QuickBooks page gives any line its own item (equipment, labor and a design fee on
  one job to different income accounts). Order at send time: line, job, company, default; each item
  used is read again, and an inactive one stops only invoices that bill that line, with a 409 naming
  it. The pay application's preview names a line's item when it differs. `sov_lines.qbo_item_*`
  (migration 0033), `setLineInvoiceItem`/`listLineItems` in `services/quickbooks.ts`,
  `PUT /api/orgs/:orgId/quickbooks/job-items/:projectId/lines/:sovLineId`
  (docs/QUICKBOOKS.md, "An item per line").

- Every standard non-image PDF filter (2026-11-25, Backup packets part 3 and SOV import from a PDF,
  every plan): the PDF reader decoded only FlateDecode, so a file whose streams use the other filters
  in ISO 32000-1 section 7.4 lost its text in the SOV import and opening-balance fill (no runs read),
  and one with LZW-compressed object or cross-reference streams was refused as "damaged: its page
  list could not be found" by the packet. `src/shared/pdf/filters.ts` now has ASCIIHexDecode,
  ASCII85Decode (with or without the PostScript "<~" frame), LZWDecode (9-12 bit codes, table reset,
  /EarlyChange 0 or 1) and RunLengthDecode, and the TIFF predictor 2 (1, 2, 4, 8 and 16 bits) beside
  the PNG ones, in any chain and under the abbreviated names; each stops at the same 64 MB budget as
  inflate, so a small hostile stream cannot exhaust memory. Image-only filters (DCT, JPX, JBIG2,
  CCITT) are still not decoded, on purpose: nothing reads image samples and pages are copied with
  their images as they are. Checked on five files built by a separate Python encoder (base64.a85encode,
  an LZW and a RunLength encoder; LZW object and xref streams with the TIFF predictor): poppler reads
  all five; before the change our reader read no text from four and refused the fifth; after it, all
  five read without the recovery scan, give the same 93 text runs, and their packet pages rendered by
  poppler differ from the originals only in the five rows of the page stamp. Unit tests use the
  specification's own LZW example and fail on the old reader.
- Restricted PDFs (2026-11-25, Backup packets part 2 and SOV import from a PDF part 2, every plan): a
  PDF that opens without a password but carries an owner password restricting changes, copying or
  printing (bank statements, insurance certificates, supplier invoices and LibreOffice or Acrobat
  "restrict editing" exports) now goes into the backup packet page for page and feeds the PDF SOV
  import and the opening-balance fill, instead of "send it separately". The Standard security handler
  in `src/shared/pdf/crypt.ts`: revisions 2-4 (RC4 40 to 128 bit, AES-128 with crypt filters) and 5-6
  (AES-256), MD5, RC4 and AES decryption in plain TypeScript, SHA-2 and the revision 6 hash through
  Web Crypto, so it runs in the browser and the Worker with no dependency. Objects decrypt as the
  reader reads them (cross-reference streams, the encryption dictionary and, under
  /EncryptMetadata false, the XMP metadata left alone; /Identity crypt filters dropped), the copy is
  written unencrypted, and a damaged cross-reference is rebuilt before the key is worked out. A PDF
  that needs a password to open is still refused ("needs a password to open"; PayApps never asks for
  or tries one), as is a certificate or plug-in handler. The permission flags are not enforced, as
  pdf.js, poppler and qpdf do not enforce them for reading: the pages are the contractor's own
  backup, copied unchanged. Checked on files encrypted by pypdf (all five methods) and a LibreOffice
  export with restricted permissions: text identical to the originals, and packets rendered by
  poppler identical pixel for pixel to packets of the unencrypted files.
- Ruled tables (2026-11-25, SOV import from a PDF part 2, every plan): a schedule of values printed with
  every cell bordered is now read by its borders. `src/shared/pdf/text.ts` keeps the straight rules a
  page paints (a stroked line, as LibreOffice draws a border, or a thin filled rectangle, as Chromium
  does; white paint, backgrounds and curves left out) and honours rectangular clip paths, dropping the
  glyphs a viewer hides (a spreadsheet prints a cut-off cell's whole text and clips it at the border).
  `sov-import/pdf.ts` takes the vertical rules that cross at least 60% of the data lines as the column
  edges, puts each word in the cell its middle falls in, and never joins two runs across a border. A
  table ruled only in part (two amounts of one line between the same two rules, or an amount across a
  rule, on more than 10% of lines) falls back to the text-position columns, as does an unruled one.
  The note says "columns from its cell borders". Before this, a dense bordered sheet whose description
  was cut off at its border failed outright ("Scope 1 framing and (page 1, line 5) is not a dollar
  amount ("dry1,037,311.50")"): checked on a LibreOffice sheet and two Chromium layouts (3 of 4 failed
  before, 4 of 4 read now); the Chrome bid breakdown fixture, which is bordered too, reads the same
  48 lines either way.
- Rows from horizontal rules (2026-11-25, SOV import from a PDF part 3, every plan): a sheet with a
  rule under each row and its cells top-aligned (many estimating exports and "clean" spreadsheet
  styles) wraps a long description onto a second line a full line below the first, as far as the next
  item sits, so the line-spacing reader made the wrapped part a row of its own and the import dropped
  it: item 2 of the new fixture read "Temporary power , lighting and distribution for the duration of",
  with "the project, including removal at closeout" lost and no warning. `sov-import/pdf.ts` now takes
  the horizontal rules that run across at least 80% of the data lines' width (joined end to end, as
  Chromium paints them a cell at a time; an underline under an amount is not one) and, when they
  divide at least 60% of neighbouring data lines, makes the lines between two rules one row. A band
  that still holds two data lines (a rule left out), and the title and footer outside the ruled
  stretch, are split by spacing as before; rules only under the header and the last line leave the
  spacing reader in charge. The note says "rows from the rules between them" (or "rows and columns
  from its cell borders" for a fully bordered sheet). A comma kerned under the word before it is part
  of that word ("power, lighting"). Fixture `sov-hrules-chrome.pdf` (30 lines, 3 with wrapped
  descriptions); every earlier PDF fixture reads the same lines as before.
- Searchable scans (2026-11-26, SOV import from a PDF part 3, every plan): a schedule of values
  scanned to a "searchable PDF" (the OCR setting on most office scanners, Adobe Scan, Microsoft Lens)
  carries an invisible text layer over the page picture, which the reader already read, but the
  import failed on it: a sheet lies a little tilted on the glass, so a line's words climb or fall
  across the page (0.4 degrees moves the amount at the right edge 3.7 points off its item number,
  past the 3 points that still count as one line) and the header and amounts came apart ("Could not
  find the table header"). `src/shared/pdf/text.ts` now counts text drawn invisibly (rendering modes 3
  and 7); when most of a file's text is, `sov-import/pdf.ts` treats it as a scan: it measures each
  page's tilt from the slope between neighbouring words on a line (weighted median; steeper than about
  5 degrees is a slant, not a tilt) and levels the page, and drops the table borders OCR reads as
  characters ("|", "[", a lone ")"). For every PDF, a count inside a description that arrives as a word
  of its own ("scope item 1 (branch circuits)") stays in the description instead of making a column
  of figures, and a table's header words a little further apart than a space ("Cost" "Code") stay one
  phrase; a header repeated on page 2 with a smudge read beside it ("Seyi Bid Amount") is left out like
  an exact repeat. The note says the lines came from the scan's OCR and to check every amount and
  description against the paper; a scan that still fails says to rescan straight at 300 dpi or
  choose the spreadsheet; a scan with no text layer says to save it as a searchable PDF. Still read in
  the browser, nothing uploaded, no dependency. Checked on the Chrome bid breakdown rasterised, tilted
  and read by Tesseract 5.3.4 (`test/fixtures/pdf-sources/scan-fixtures.sh`): at 0.4 degrees and 200
  dpi and at -1.5 degrees and 300 dpi both failed before and now read all 48 lines and the
  $1,120,223.00 total, matching the sheet's own total; also checked by hand at 0 and -0.8 degrees
  (300 dpi, read) and at 2.5 degrees, or 1.5 degrees at 150 dpi, where Tesseract's own text is too
  garbled (fails with the rescan message). Printed PDFs are not levelled or cleaned (a sparse summary
  page could pair words across lines into a false tilt), and every earlier fixture reads as before.
  OCR misreads stay misreads: in both fixtures "Temporary power" comes back as noise and an item
  number can lose a space ("26 1500"); the sheet-total check and the review screen are the guard.
- Misread pointer for scans (2026-11-26, SOV import from a PDF part 4, first half, every plan): a
  scan's OCR can read one digit as a look-alike (an 8 as a 3, a 6 as a 5) and the figure still reads
  as a dollar amount, so the only sign was "the lines add up to $X, the sheet says $Y" with no line to
  look at. When a scanned schedule of values does not add up to its own totals row,
  `src/shared/sov-import/misread.ts` tries every line's amount, and the totals row's, with one digit
  swapped for a look-alike (our own table of glyph look-alikes, not a measured confusion matrix), and
  a second "high" check names the one to three figures whose swap makes the lines add up: "The scan
  probably misread one figure: 2 Drywall hang and tape (page 1, line 3) reads $8,500.00; $3,500.00 if
  an 8 there is a 3 on the paper". On a mid-job start from a scanned continuation sheet, a row whose
  D + E + F is not G names the cell (or cells) one look-alike would put right, inside the existing
  "columns disagree" check. Nothing is corrected: the figure stays as read and the contractor checks
  the paper. More than three suspects (a round gap that many lines could explain) names none.
  Printed PDFs and spreadsheets are unchanged (a printed figure is not a misread). Tests:
  `misread.test.ts`, and a hand-built scan in `scan.test.ts`. Not checked against a real Tesseract
  misread of an amount (neither scan fixture misreads one).
- Misread pointer, the H and % columns (2026-11-26, SOV import from a PDF part 4, second half, every
  plan): on a continuation sheet D + E + F = G alone often leaves two suspects (E read wrong, or G),
  and a misread scheduled value (C) was never seen per row at all. The balance to finish (H, C - G)
  and the % (G / C) columns are now read into each row's billing (`balanceCents`, `percent` as
  printed, with its precision), leniently: a blank or text cell is left out, never an import error,
  and neither is ever imported. `misreadsInRow` keeps only a swap after which every relation the row
  has holds (D + E + F = G, C - G = H, G / C within one unit of the printed %'s last digit, a bare
  "0.45" also read as a fraction), so in the tests E vs G, G vs E and a C that the sum cannot see
  each pin to one cell. The mid-job start's "columns disagree" check now also names a row whose
  C - G is not its H ("C - G = $15,125.50, H = $10,125.50"), on every sheet, since H = C - G is the
  form's own formula; a sheet that leaves H blank raises nothing. On a scanned sheet's totals
  pointer, a line whose own row agrees with its C as read (or would disagree with the swapped C) is
  dropped from the suspects: two equal lines either of which could explain the total are told apart
  by their H. Tests: `misread-columns.test.ts`. Still not checked against a real Tesseract misread.

- Scans with no text layer, read by OCR in the browser (2026-11-26, SOV import from a PDF part 4,
  every plan): a schedule of values scanned with the scanner's OCR off is pictures only, and the import
  stopped with "save it as a searchable PDF". It now reads it. `src/shared/pdf/text.ts` keeps each page's
  pictures (image XObjects, by reference) and where they land on the page; `src/shared/pdf/images.ts`
  turns the largest into a file an OCR engine reads: the scanner's JPEG as it is (DCTDecode), a
  black-and-white CCITT G3/G4 page (CCITTFaxDecode, the usual office black-and-white scan) wrapped in a
  one-strip TIFF, and Flate/LZW/raw samples (grey, RGB, CMYK, indexed; 1 to 16 bits) written as a PNM.
  JPEG 2000 and JBIG2 pictures are named and refused ("the picture is JBIG2"), and pictures over 60
  million pixels are left out. `src/shared/sov-import/ocr.ts` sends each page (up to 10) to the engine
  the caller passes and lays the words it returns on the page along their line's baseline, through the
  picture's placement, as the text runs a searchable scan's layer gives (each word ending in a space,
  as Tesseract's own layer does), so the page is levelled, cleaned and read exactly as a searchable
  scan is, misread pointer included. One OCR fix is made, and said: an amount read "9.200.00" (the
  thousands comma read as a full stop, which no locale writes) is read as 9,200.00 with a note to check
  it. The engine in the app is Tesseract 5 in WebAssembly (tesseract.js 7.0.0, Apache-2.0, with the
  English `4.0.0_best_int` model from @tesseract.js-data/eng 1.0.0, MIT), loaded only when such a scan
  is chosen and served by the app itself under `/ocr/` (`vite.config.ts` emits the worker, the three
  LSTM-only builds and the model into the build and serves them in `vite dev`), so the file still
  never leaves the browser and no CDN is fetched: about 3.9 MB of engine and 2.9 MB of model on the
  first scan. Page segmentation is set to automatic (3): tesseract.js's default, one block (6), ran
  the ruled table's rows into each other. The import and the opening-balance screens show "Reading the
  scan's text, page 1 of 2". Checked: `test/fixtures/sov-scan-pictures-jpeg.pdf` (the 300 dpi, -1.5
  degree grey scan with its text layer left out) and `sov-scan-pictures-g4.pdf` (the same sheet as a
  black-and-white G4 scan) both import all 48 lines and the sheet's own $1,120,223.00 total, in Node
  (`ocr.test.ts`, the same engine and model) and in Chromium through `vite dev` (8.5 s for the first,
  engine load included, 5 s for the second; every request to the app's own origin). OCR misreads
  remain: the grey scan's first cost code comes back "011000", and on the G4 scan the cost codes read
  too unevenly to make a column, so its lines are numbered in order. The worker (server) never runs
  OCR; it passes no engine and keeps the old message. Pages past the tenth are not read. Scans on
  their side: next entry.
- Scans on their side or upside down, read by OCR (2026-11-26, SOV import from a PDF part 5, every
  plan): a sheet fed into the scanner sideways or upside down, or a landscape picture placed turned
  on a portrait page, read nothing or garbage. Tesseract 5 reads text running down a picture (a
  quarter turn clockwise) by itself but returns its lines as running down, and not text running up
  or upside down (checked on the fixture's page: 93 mean confidence upright and turned clockwise,
  50 turned anticlockwise or upside down). Now `runsFromOcr` reads each line in the direction its
  baseline runs and maps the words through the picture's placement whichever way it is turned; the
  way most of the page's characters then run as displayed decides how the page is turned to read
  left to right, as a person turns the paper (a lone sideways word, a stamp, is still left out). A
  read whose words are mostly unsure (under 60% of characters at Tesseract confidence 60 or more)
  is read again half turned (`upsideDown`, tesseract.js's `rotateRadians: Math.PI`, the same size so
  the boxes map straight back) and the surer read kept, which makes text running up or upside down
  into the two ways Tesseract reads: one extra read, about 3 s, only on such a page. The import says
  "Page 1 of the scan lies on its side or upside down, so it was read turned the right way up." A
  picture stored on its side but placed upright says nothing, since the page looks right.
  Tesseract's own orientation check (OSD) was not used: it needs the legacy engine and its
  `osd.traineddata`, which the LSTM-only build the app serves does not have. Checked: the new
  `test/fixtures/sov-scan-pictures-sideways.pdf` (the G4 sheet, page 1 turned clockwise and shown
  on its side, page 2 turned anticlockwise and placed upright) imports all 48 lines and
  $1,120,223.00 through the real engine in Node (`ocr.test.ts`, 6.5 s, three reads); the upright
  fixtures read as before, with no second read. Not checked in a browser this run (the client
  passes the same option to the same tesseract.js build).
- Notary block (2026-11-25, every plan): some GCs and owners, and some public jobs, want the pay
  application signed before a notary. A job's "Notary block on the application PDF" switch (job page,
  or `notaryBlock` on the new-job and job PATCH API; `projects.notary_block`, migration 0035; recorded in
  the job history) prints a generic jurat under the signatures on the summary page: state and county,
  "subscribed and sworn to (or affirmed) before me on (date) by (name of the contractor's signer)",
  notary signature and commission expiry, and a seal box. Our own words, no state's statutory form; a
  line says a notary whose state prescribes its own certificate wording may attach that instead. With
  the block on, the summary rows and gaps tighten so it fits on page 1 above the footer even with the
  own-rate note (`test/unit/notary-block.test.ts` checks every baseline and box against the footer);
  with it off, page 1 is unchanged apart from the own-rate note, moved 3 pt down off line 9's rule
  (it touched before).

- Mid-job start, retainage released per line before the move (2026-11-25, Mid-job start part 3, every
  plan): a job moved here after some retainage was already paid out (a finished line released in
  full, say) records that release on each line of the opening balance ("Some retainage was already
  released on certain lines" shows the column). It counts as released before the first application
  here, so column I and line 5 start from what is still held, and billing the rest of a job here
  gives the same applications as billing every one here (tested). Before, the only way was to enter
  it as released on the first application here, which printed it as this period's release. The
  `opening_retainage_differs` check subtracts it and now points to the per-line field; a release
  above what the line held is flagged as on any application; none is accepted on a line with no work
  (400). `sov_lines.opening_released_cents` (migration 0034), `releasedCents` on `PUT
  .../projects/:id/opening`. Not done: filling it from the last continuation sheet's retainage
  column (the sheet shows what is held, not why it is lower).

- Lien waivers: Missouri (2026-11-25, Crew and up). Mo. Rev. Stat. § 429.016.27, read on the Missouri
  Revisor's site (snapshot `packages/lien-waivers/sources/mo-429-016.txt`), prescribes one form: an
  unconditional final waiver, valid on residential real property only "if it is on a form that is
  substantially as follows" (new residential construction, homes of four units or fewer,
  condominiums, townhouses; not a remodel of an owner-occupied home, which § 429.013 covers, and not
  commercial work). So Missouri left the list of statutory-form states: a Missouri job gets the
  general forms, with notes naming § 429.016, and the residential form is offered beside the general
  unconditional final one ("Which form", with when it applies). PayApps never picks it from the job,
  since it does not know the property type. The waiver keeps the chosen form's id (`formId` on
  `POST .../waivers`, checked against the state and kind); `alternativeForms`, `allForms` and
  `formById` in `packages/lien-waivers`. Not done: a property-type field on the job to preselect it.

- Lien waivers: Wyoming (2026-11-25, Crew and up). Wyo. Stat. § 29-10-101(b), read in the Wyoming
  Legislature's Title 29 PDF (snapshot `packages/lien-waivers/sources/wy-29-10-101.txt`), gives one
  "LIEN WAIVER" form, which a Wyoming waiver "shall" substantially follow. It acknowledges the
  payment received, so it prints for both unconditional kinds; the conditional kinds are tracked
  with the reason, as in Florida. Its retainage blank is prefilled from the application's total
  retainage (`retainageHeldCents`); "has not been paid the sum of" (`unpaidCents`) is the user's to
  enter. It ends in a notary acknowledgment left blank for the notary. The preliminary notice of
  right to lien (§ 29-10-101(a)) followed the same day (next entry).
- Preliminary notice of right to lien: Wyoming (2026-11-25, Crew and up, with lien waivers). The job
  page's "Preliminary notice of right to lien" panel prints Wyo. Stat. § 29-10-101(a)'s "NOTICE TO
  OWNER", which "shall be sent to the record owner of the property", word for word from the
  snapshot already in `packages/lien-waivers/sources/wy-29-10-101.txt` (the whole of subsection (a)
  is checked against it in `test/notices.test.ts`, headings included). Prefilled from the job (name,
  location) and the company name; the user adds the address and phone, the work, and the legal
  description (left blank, it prints a rule to fill by hand). The notice says "A form of lien waiver
  is attached", so § 29-10-101(b)'s waiver prints blank on page 2. The panel names the job's owner
  as entered and says to check the county record. Nothing is saved (POST
  `/projects/:id/notices/notice.pdf` returns the PDF; viewers may print), no migration. PayApps
  states no deadline: the deadline is in § 29-2-112, which is not in the snapshot and was not
  reachable from this session (wyoleg.gov answered 403 to the proxy), so the notes quote the form's
  own "within the time periods specified in W.S. 29-2-112" and send the reader there or to counsel.
  `noticeForms`/`noticeById`/`renderNotice` in `packages/lien-waivers/src/notices.ts` (a state with
  no encoded notice gets none), `noticePdf` beside `waiverPdf`, `services/payapps/notices.ts`,
  `client/components/lien-notices.tsx`. Also fixed: `wrapText` turned a line break in a multiline
  value into "?" (it now starts a new line on every PDF). Not done: § 29-2-112's deadline from the
  first work date, a record of when a notice was sent, and other states' notices (California's
  preliminary notice once leginfo is reachable).

- Fix (2026-11-25): editing a job no longer resets its retainage. `updateProjectSchema` was
  `projectSchema.partial()`, and zod 4 fills a `.default()` even under `.partial()`, so turning on
  the notary block, setting pay terms, editing the GC billing contact or closing the job set both
  retainage rates back to 10%, and changing the work rate reset the stored-materials rate. The
  patch schema is now built from the fields without defaults (`test/worker/project-patch.test.ts`).

- Lien waivers: California (2026-11-25, Crew and up, the largest market). The four forms of Cal.
  Civ. Code §§ 8132 (conditional progress), 8134 (unconditional progress), 8136 (conditional final)
  and 8138 (unconditional final), word for word. leginfo.legislature.ca.gov still answers 403 to the
  cloud proxy, but the Legislative Counsel's official bulk download
  (`downloads.leginfo.legislature.ca.gov/pubinfo_2025.zip`, 1.2 GB) does: its central directory, the
  `LAW_SECTION_TBL` table and the ten section files of Article 3 (§§ 8120-8138) were read by HTTP
  range request, about 7 MB in all (snapshot `packages/lien-waivers/sources/ca-8132-8138.txt`). Each
  section is as added in 2010 (SB 189), operative 1 Jul 2012, with no later amendment listed. The
  forms keep the statute's headings (Identifying Information, Conditional/Unconditional Waiver and
  Release, Exceptions, Signature) and blanks; the job, GC, owner, through date, check and amount
  prefill from the pay app as for the other states. § 8132's item (3), earlier conditional waivers
  not yet paid, is two optional blanks the user fills (dates, amounts); the final forms' "Disputed
  claims for extras in the amount of" is an optional amount. Notices print bold at the page's
  largest size, as §§ 8134 and 8138 require for the "Notice to Claimant". Notes quote § 8124 (a
  waiver releases the owner, lender or surety only if in substantially the statutory form and signed;
  a conditional one also needs evidence of payment). `src/ca.ts`, `test/ca.test.ts`, a California
  case in `test/whole-form.test.ts`; four one-phrase edits (e.g. "rescission, abandonment, or
  breach" to "rescission or breach", "does not affect the following" to "any of the following") each
  failed 2-5 tests. Georgia replaces California as the "tracked, never printed" case in
  `test/worker/waivers.test.ts`.
- Lien waivers: California part 2 (2026-11-25). § 8132's exception (3), "progress payments for
  which the claimant has previously given a conditional waiver and release but has not received
  payment", now prefills: every earlier application on the job that still owes money and whose
  conditional progress waiver was marked sent gives one entry, oldest first, dated by the waiver's
  signature date (else the day it was sent) and valued at what is still owed on that application
  today (expected less payments recorded, so a partial check shrinks it and a paid application
  drops off). Draft waivers, the current application, later ones and another state's waivers do not
  count. The user can still edit both blanks before saving. `priorUnpaidConditional` in
  `src/worker/services/payapps/waivers.ts`; a worker test bills three applications and walks the
  draft, partial-payment and paid cases through to the printed form.

- Preliminary notice: California (2026-11-25, Crew and up, with lien waivers). The job page's
  "Preliminary notice of right to lien" panel now prints California's preliminary notice for private
  works (Cal. Civ. Code §§ 8102, 8200-8216), the notice a sub or supplier gives the owner, the direct
  contractor and the construction lender before it can record a lien, give a stop payment notice or
  claim on a payment bond (§ 8200). California sets the contents, not a form: each § 8102/§ 8202 item
  under its statutory phrase, then § 8202(a)(3)'s "NOTICE TO PROPERTY OWNER" word for word in bold.
  Prefilled from the job: the owner, the GC and its address (as direct contractor and as the party the
  work is for), the site and its address, the company, and the estimate of the total price (contract
  sum plus approved change orders; pending ones left out). The user adds the relationship to the
  parties, the work, and optionally the lender, the demand and unpaid laborers (left off the notice when
  blank). The notes quote the 20-day rule (§ 8204) without computing a date, and say how to serve it
  and prove it (§§ 8106, 8110, 8118). Text from the Legislative Counsel's bulk download (snapshot
  `packages/lien-waivers/sources/ca-8102-8216.txt`). Footer prints "§§" as "Secs.". Not done: a record
  of when and how each notice was sent, the § 8118 proof of notice declaration, the first-furnished date
  and its 20-day reminder, the public works notice (§ 9300 ff.), and keeping the boldface statement on one
  page (it can break across pages 1 and 2).

- Preliminary notice: California, part 2 (2026-11-25, Crew and up). Under the notice on the job page
  ("Notices given (California)"): enter the day the company first furnished work and PayApps shows
  the last day to give the notice, 20 calendar days later (Cal. Civ. Code § 8204(a); not moved for a
  weekend or holiday). Record each notice given, one per person (§ 8200(a): owner, direct contractor,
  lender): who and their address, how (personal delivery; registered, certified or express mail;
  overnight carrier; left and mailed under Code Civ. Proc. § 415.20, per §§ 8106, 8110), the day,
  where, and the tracking number. Each record shows when the notice is complete (§ 8116; five days
  after mailing for § 415.20) and whether it was on time; a late one says the first day of work it
  still covers (20 days before service, § 8204(a)). Each prints a § 8118 proof of notice declaration
  PDF: the three § 8118(a) items and, for a mailed notice, § 8118(b)'s receipt and tracking documents
  word for word as a checklist, with a declarant line. The cash page and the weekly email remind
  ("due in 5 days, by ...", then "was due ...") until the owner and the direct contractor each have a
  notice recorded, or the date is cleared; the lender never holds it open, since it is owed only "if
  any". Pure rules and the declaration in `packages/lien-waivers/src/ca-proof.ts`
  (`test/ca-proof.test.ts` checks them against the snapshot); records in `lien_notice_sends`
  (migration 0036); worker test `test/worker/ca-notice-log.test.ts`. Not done: the declaration's
  "under penalty of perjury" sentence (Code Civ. Proc. § 2015.5 is not in the snapshot and the
  Legislative Counsel's hosts answered 403 this run; the UI and the PDF say to add it), records in the
  job history, and attaching the scanned receipt to the record.

- Preliminary notice: California, part 3 (2026-11-26, Crew and up). The job history now records
  the notices: setting or clearing the day first furnished (a save that changes nothing writes
  nothing), each notice recorded as given (to whom, how, the day, the tracking number) and each record
  deleted, under "Preliminary notice" in the job history CSV. Each record keeps its own files
  ("Attach receipt" on the record): the post office's or carrier's receipt for the mailing, the return
  receipt, tracking record or returned envelope (the documents § 8118(b) says go with a mailed
  notice's proof of notice declaration) and the signed declaration; up to 10 per record, the same
  types, 15 MB file size and company storage limit as pay-app and change-order files, served as
  downloads with nosniff. Files added and removed are in the history; deleting the record deletes its
  files' objects first (keys under `orgs/{orgId}/projects/{projectId}/notices/{sendId}/`, so
  deleting the job clears them too). A company that drops below Crew still lists and downloads the
  proof it kept. Rows in `lien_notice_files` (migration 0042); service
  `services/payapps/notice-files.ts`; worker test `test/worker/ca-notice-files.test.ts`. Not done:
  listing the attached receipts on the § 8118 proof PDF, and the § 2015.5 perjury sentence.

- GC portal exports, part 1: Procore's subcontractor SOV template (2026-11-25). On the job page, under
  the schedule of values, "Procore subcontractor SOV": choose the CSV template the GC's Procore
  commitment gives (Subcontractor Schedule of Values tab, Edit SSOV, Import CSV, Download CSV
  Template), place each base-contract line under one of the GC's SOV positions (all of them when there
  is one position; otherwise a guess by unique amount, then shared words), see each position's total
  against the GC's amount, and download the filled template for the GC's Import CSV. The file is read
  and written in the browser. The template's own header, column order, delimiter (comma or semicolon),
  rows above the header and the GC's cells are kept; only Subcontractor SOV Description and Amount are
  written, amounts as plain numbers ("40000.00", no commas or $), 0.00 for a position with nothing
  under it, per Procore's help page "Import a Subcontractor Schedule of Values from a CSV" (read
  2026-11-25). Change order lines are left out (Procore keeps commitment change orders apart from SOV
  positions). Pure code in `src/shared/gc-export/procore-ssov.ts` (tests beside it), UI in
  `src/client/components/procore-ssov.tsx` (`test/unit/procore-ssov.test.tsx`). Not checked against a
  live Procore project: the column names come from the help page, and the reader accepts small
  variations ("Position Number", "Sub Amount").

- GC portal exports, part 2a: a Procore invoice sheet (2026-11-26). Procore's subcontractor invoice
  is typed in by hand (the commitment, Create Invoice); its help pages offer no CSV import for it. On
  each pay application, "Procore invoice sheet" lists, per SOV line, the amounts to enter: Work
  Completed This Period (column E), Materials Presently Stored (F, Procore's older form) and New
  Materials Stored (the newer form: only materials added this period), each with a copy button, plus
  % complete, totals and a CSV worksheet. New stored materials are F's rise since the previous
  application here (all of F on a job's first application); where F fell, or the job opened mid-way,
  the sheet says "check" and asks for the delivery records instead of guessing. Change order lines
  are marked. Wording from Procore's "Create a New Subcontractor Invoice as an Invoice Contact"
  (support.procore.com did not resolve from the build session: read through the search index,
  2026-11-26; recheck the column names on the live page). Pure code
  `src/shared/gc-export/procore-invoice.ts` (tests beside it), UI
  `src/client/components/procore-invoice.tsx` (`test/unit/procore-invoice.test.tsx`). Not checked
  against a live Procore project.

- GC portal exports, part 2b: the Procore invoice by SOV position (2026-11-26, every plan). Many
  GCs' Procore invoices list the commitment's own SOV positions, not the subcontractor's detail
  lines (the detail appears only when the GC turned on the subcontractor SOV), so the sub types one
  amount per position. The Procore subcontractor SOV filler on the job page now saves the placement
  with the job ("Save for the invoice sheet": the GC's positions, their descriptions and amounts, and
  which base-contract line sits under which; `projects.procore_ssov`, JSON, migration 0039;
  `PUT/DELETE .../projects/:id/procore-ssov`, editors, validated against the job's own base lines and
  the positions sent, recorded in the job history). Loading the GC's template again preselects the
  saved choices. Each pay application's Procore invoice sheet then totals by position: work this
  period, materials presently stored, new materials stored ("check" when any line under it is
  unknown) and % complete (G over the placed lines' scheduled values), with every position kept
  (zeros when nothing is under it), change order lines listed apart, lines added since the placement
  named as not placed, and positions whose GC amount differs from the placed lines' total flagged;
  a CSV of the same, and one click back to the per-line view. Pure code
  `src/shared/gc-export/procore-placement.ts` (tests beside it); worker test
  `test/worker/procore-ssov.test.ts`. Not checked against a live Procore project; how the GC's form
  shows commitment change orders (one line each is assumed, as Procore's commitment change orders
  are kept apart from the SOV positions) is to be confirmed with the first customer on Procore.
- GC portal exports, part 2c: Oracle Textura's billing upload (2026-11-26, every plan). Textura lets a
  subcontractor fill the invoice from a file: Progress tab, More → Upload Billing Amounts → This Period
  Billing Amounts → Download Template, then upload the saved CSV. On each pay application, "Textura
  billing upload" takes that template (CSV, or the Excel file as Textura gives it, read from its first
  sheet), matches each Textura row to a line of the application (phase code = item number, else the
  same description, else the only line whose scheduled value equals the row's budget; a line goes on
  one row; any row can be re-matched or left as Textura wrote it), and writes Work This Period (G703
  column E) and Material Stored This Period (materials newly stored: the stored balance's rise, as the
  Procore sheet works it out; left for the person, and said so, when the balance fell or the job opened
  mid-way). Every other cell, the rows above the header, the delimiter and unmatched rows are written
  back unchanged; amounts as plain numbers. Retention cells are left alone (Textura "will override the
  amounts in the file" that miss the draw's retention settings). Flags: lines billed this period on no
  row, budgets that differ from the scheduled value, stored materials with no column for them (bill
  them on Textura's Stored Materials tab), the To Date template chosen by mistake; a line on two rows,
  or no work column, blocks the download. Oracle does not publish the template's headings, so columns
  are found from Textura's field names ("Work This Period", "Material Stored This Period", per the
  Subcontractor Billing Workflow Guide, North America, read 2026-11-26) and the person can point at
  another column. Pure code `src/shared/gc-export/textura-billing.ts` (tests beside it), UI
  `src/client/components/textura-billing.tsx` (`test/unit/textura-billing.test.tsx`). Not checked
  against a live Textura project or a real downloaded template: confirm the headings with the first
  customer on Textura. The To Date upload is part 2d; GCPay is part 3.
- GC portal exports, part 2d: Textura's To Date billing upload (2026-11-26, every plan). The same
  panel now takes the template from Upload Billing Amounts → To Date Billing Amounts ("Amounts billed
  until the current billing period"), read as To Date from its headings (a heading with "to date" and
  none with "this period") or by the person's choice of upload. It fills Textura's "Completed to
  Date" with G703 column G (work completed plus materials presently stored), as Oracle's "Progress and
  Retention Tab Fields Overview" describes it as "the total monetary value ... for the current and
  previous periods" and says entering Material Stored This Period adjusts it; a stored-to-date
  column, where the template has one, gets column F. "Previously"/previous, retention, balance, net
  and % columns are never filled. Because To Date needs only balances, it fills lines whose stored
  materials went down or whose job opened mid-way, which the This Period file leaves for the person.
  New flag: a matched row where the template already shows more completed to date than this
  application (the upload would bill a negative period). Pure code and tests in
  `src/shared/gc-export/textura-billing.ts`; UI test `test/unit/textura-billing.test.tsx`. Not checked
  against a live Textura project or a real downloaded To Date template: confirm the headings with the
  first customer on Textura.
- GC portal exports, part 3: GCPay's schedule of values upload (2026-11-26, every plan). When a GC on
  GCPay enters the contract amount (a "constrained" SOV), the sub enters the breakdown by hand or with
  Line Items → Upload, which takes an Excel file only and reads "item number, description, & value"
  and nothing else ("A standard Schedule of Values will be 3 columns: Item Number, Description,
  Value"); the lines must add up to the GC's contract amount before GCPay lets the sub submit, and
  change orders are added by the GC after the base SOV is approved (GCPay Subcontractor Training
  Guide, Rev. 12/19, as published by a GC for its subs, read 2026-11-26). On the job page, "GCPay SOV
  (Excel)" downloads a one-sheet .xlsx with exactly those three columns, the base contract's lines in
  the job's order (item numbers kept as text, values as numbers), and says before the download
  whether the lines add up to the original contract sum, which lines have no item number (GCPay's
  Auto Number can fill them) and which numbers repeat. The workbook is written with no library
  (`src/shared/gc-export/xlsx-write.ts`: a stored ZIP, round-tripped through the app's own reader and
  opened with openpyxl when built). Pure code `src/shared/gc-export/gcpay-sov.ts` (tests beside it),
  UI `src/client/components/gcpay-sov.tsx` (`test/unit/gcpay-sov.test.tsx`). GCPay's billing is typed
  into its "$ This Period" column; the guide describes no billing upload, so none is built. The unit
  price SOV (five columns) is not built. Not checked against a live GCPay project or the GC's own
  template: if GCPay refuses the file, the panel says to paste the rows into the template GCPay offers.
- Lien waivers: Massachusetts (2026-11-26, Crew and up). Mass. Gen. Laws c. 254, § 32, read on the
  General Court's site (snapshot `packages/lien-waivers/sources/ma-254-32.txt`), voids agreements that
  bar filing a notice of contract or enforcing a lien, except four; the fourth is its "Partial Waiver
  and Subordination of Lien", for a person who has filed or recorded a notice of contract under § 2.
  A Massachusetts job gets the general forms, with a note naming § 32, and the statutory form is
  offered beside the general conditional progress one ("Which form", with when it applies). Its
  header is the pay application itself, so PayApps fills lines 1-8 from the G702 summary (original
  contract, net approved change orders, adjusted contract, completed and stored, retainage, earned
  less retainage, previous certificates, current payment due), line 9 from the job's pending change
  orders, the application number and date, the property (job name and address), and the payment in
  words and figures; the words follow the figures as the user edits them, unless the user writes
  their own (`typeValue` in `src/client/components/waivers.tsx`). County, town, disputed claims and
  the lender are the user's. The signer dates the perjury line by hand. Not done: a field on the job
  saying a notice of contract was recorded, to preselect the form; county and town on the job.
- Lien waivers: Georgia (2026-11-26, Crew and up). O.C.G.A. § 44-14-366 is published officially only
  through LexisNexis, so its text was rebuilt from the Acts that wrote it, SB 315 (2020, in force
  1 Jan 2021) and SB 143 (2021), as passed and published by the State: struck and underlined words told
  apart by the PDFs' drawn rules, every change read against the bill (snapshot
  `packages/lien-waivers/sources/ga-44-14-366.txt`). Georgia's interim-payment form ((d)) is offered
  for both progress kinds and its final-payment form ((e)) for both final kinds, since neither is
  conditional: each waives upon receipt, and becomes effective anyway 90 days after signing unless an
  affidavit of nonpayment is filed first ((g)(2)), which the form's notes spell out. The statute
  requires "at least 12 point font", so a Georgia waiver PDF prints every block at 12 pt. Prefilled:
  the contractor (the GC), project title, owner, property (job name and address), the amount and the
  through date; county, city and what was furnished are the user's. Dated by hand under seal, with
  witness and address lines as printed. Not done: a pointer to the official Code.
- Lien waivers: Georgia part 2, the 90 days and the affidavit of nonpayment (2026-11-26). A Georgia
  waiver is conclusively effective 90 days after it was signed even when the money never came, unless
  the claimant files an affidavit of nonpayment in the property's county first (O.C.G.A.
  § 44-14-366(g)(2)). A sent Georgia waiver whose amount the payments recorded on its application do
  not cover now shows, on the pay app's waiver list, the day its 90 days end and the amount unpaid
  (`src/shared/ga-waiver-clock.ts`, pure; the day it was marked sent stands in for the day it was
  signed, since Georgia's forms are dated by hand). The cash page and the weekly email name it from
  30 days before the end to 30 days after. One click opens the affidavit, the statute's (g)(2) form as
  SB 143 (2021) rewrote it (`packages/lien-waivers/src/ga-affidavit.ts`, every sentence checked
  against the snapshot), prefilled from the waiver (county, contractor, work, project, city, county,
  owner, property, claimant) plus the waiver's date and amount and the amount unpaid; printed at 12 pt
  (Crew and up; nothing saved). The package refuses an unpaid amount of zero or more than the waiver's.
  Not done: weekends and holidays (90 calendar days are counted).
- Lien waivers: Georgia part 3, the affidavit recorded as filed (2026-11-26, Crew and up). On the
  waiver's Georgia note an editor records the affidavit of nonpayment as filed: the day (not in the
  future), the county ("Fulton County" is kept as "Fulton") and the clerk's book and page or
  instrument number (`lien_waivers.ga_affidavit_*`, migration 0038; `PUT/DELETE
  .../waivers/:id/ga-affidavit/filing`, only on a Georgia waiver marked sent). Recording it stops the
  90-day reminder and starts the seven days the affidavit's closing paragraph gives to send the
  owner a copy by registered or certified mail or statutory overnight delivery (and the contractor,
  when the filer has no contract with the owner and a notice of commencement was filed): the pay
  app, the cash page and the weekly email name the copy's last day until the copy is recorded (day,
  method, tracking number). Then the waiver reads as suspended until payment in full
  ((g)(5)) and leaves the cash report's next steps. A filing dated after the 90 days ended is kept
  but the text says the statute asks for it before, and to ask counsel. Once the payments cover the
  waiver after a filing, the pay app says that on request the sub must swear in recordable form that
  payment in full was received, which voids the affidavit once recorded ((g)(3)); that affidavit has
  no statutory form, so nothing is printed. History records the filing, the copy and a cleared
  filing. Rules in `src/shared/ga-waiver-clock.ts` (`stage`, `filing`, `gaClockNeedsAction`).
  Not done: the copy to the contractor recorded apart from the owner's; a reminder to record the
  (g)(3) affidavit once signed; weekends and holidays.
- Lien waivers: Georgia part 4, the contractor's copy and the affidavit of payment (2026-11-26, Crew
  and up). The affidavit's closing paragraph sends a copy "TO THE CONTRACTOR AT THE ADDRESS SHOWN ON
  THE NOTICE OF COMMENCEMENT" when the filer "IS NOT IN PRIVITY OF CONTRACT WITH THE PROPERTY OWNER
  AND A NOTICE OF COMMENCEMENT IS FILED". PayApps cannot know either fact, so on a recorded filing
  the user answers once (owed, or not owed) and, when owed, records that copy apart from the owner's
  (day, how, tracking; the statute names the three methods for the owner's copy only, so "another
  way" is allowed here). `PUT/DELETE .../waivers/:id/ga-affidavit/contractor-copy`. The filing stays
  in the cash report and the weekly email until both copies are settled; an unanswered question on
  a filing whose owner's copy was already sent brings it back once, by design. After the payments
  cover the waiver, the (g)(3) affidavit that payment in full was received is recorded as signed
  (the cash report then asks to record it in the filing's county) and as recorded (day, book and
  page or instrument number), and the waiver reads as released: the affidavit of nonpayment is void.
  `PUT/DELETE .../ga-affidavit/paid-affidavit`, refused until the money covers the waiver; nothing is
  printed, since (g)(3) gives no form. Migration 0040 (`lien_waivers.ga_affidavit_contractor_copy*`,
  `ga_paid_affidavit_*`); clearing the filing clears both. History records each. Rules in
  `src/shared/ga-waiver-clock.ts` (stage `released`, `gaContractorCopyPending`).
  Not done: weekends and holidays.
- Lien waivers: Georgia part 5, the job's notice of commencement (2026-11-26, Crew and up to record
  copies; the job fields on every plan). A job records whether a notice of commencement (O.C.G.A.
  § 44-14-361.5) was filed (yes, no, or not known) and the contractor's name and address as the
  notice shows them (`projects.ga_noc_filed`, `projects.ga_noc_contractor`, migration 0041; `PATCH
  .../projects/:id` with `gaNocFiled`, `gaNocContractor`). The waiver list carries them (`gaNoc`). On
  an affidavit's unanswered contractor-copy question the job's answer is asked once, where it
  matters, and then picks the suggested button: filed suggests "owed" (a sub billing the GC usually
  has no contract with the owner), not filed suggests "not owed". The user still clicks: privity is
  theirs to know, and nothing is answered for them. Once owed, the notice's address is shown where
  the copy is recorded. Job history records the change.
  Not done: the fields on the job page itself (they are asked from the affidavit, where they
  matter); weekends and holidays.

- GC billing cutoff (2026-11-26, every plan): GCs commonly take pay applications by a day of the month
  ("by the 25th for that month's draw"), and one that arrives late can wait a whole cycle. Each job
  takes that day (`projects.billing_day`, migration 0037; 1-31, 31 meaning the last day, a shorter
  month's last day otherwise), set beside the pay terms on the job page (or on `POST .../projects`).
  The job page shows the next cutoff and whether this cycle's application went out ("sent" means it
  left draft after the previous cutoff). The cash page and the weekly email get a next step within 7
  days of a cutoff with nothing sent (naming the waiting draft, or saying none is started without
  assuming there is work to bill), and after a missed one: a draft dated on or before a cutoff that
  passed with nothing sent in its cycle. A cycle with nothing drafted is never called missed; closed
  jobs and jobs whose work is complete get no reminder. Pure rules in `src/shared/billing-cutoff.ts`.

- Lien waivers: Mississippi part 2, the sixty days and the affidavit of nonpayment (2026-11-26). A
  Mississippi waiver (either statutory form) is deemed paid in full 60 days after it was signed even
  when the money never came, unless the claimant first files an affidavit of nonpayment
  (§ 85-7-433(3)) in the property's county and sends the owner a copy (§ 85-7-419(5)(b)). It runs on
  Georgia's clock and screens, with Mississippi's numbers and citations held in `NONPAYMENT_RULES`
  (`src/shared/ga-waiver-clock.ts`): the 60 days on the pay app's waiver list and in the cash report
  (from 30 days before the end), the affidavit printed from `msAffidavitOfNonpayment` prefilled from
  the waiver (no unpaid-amount blank: the statute has none), the filing and its copy to the owner
  within two days, the suspension once copied ((5)(e)), and the affidavit of payment in full signed
  and recorded after payment ((5)(c)), which reads the filing void. Mississippi's affidavit names no
  copy to a contractor, so that question is never shown and its endpoints refuse a Mississippi
  waiver. Same endpoints (`.../waivers/:id/ga-affidavit...`) and columns as Georgia's, no migration;
  history entries now carry the state. The count is checked against the package's `msSixtyDays` and
  `msAffidavitCopyDueOn` (`src/shared/ms-waiver-clock.test.ts`, `test/worker/ms-affidavit.test.ts`).

- Insurance certificates (2026-11-26, every plan): `/orgs/:orgId/insurance` keeps the company's own
  certificates of insurance, typed from each certificate: coverage (general liability, commercial auto,
  workers' compensation, umbrella/excess, professional, pollution, builder's risk, other), an optional
  name, insurer, policy number, effective and expiry dates and notes. Each is listed with its status on
  today's date: expired on and after the expiry day (PayApps does not know the hour a policy ends, so
  the day itself counts as expired), expiring within 30 days, else current. Editors add, edit, archive
  (a renewed or dropped policy, never warned about again) and delete; viewers read. The Projects page
  shows a one-line note while an active certificate is expired or expiring, and a draft pay
  application lists every certificate expired on its application date or expiring within 30 days after
  it, since many GCs hold payment while the certificate on file has lapsed. It reads only the typed
  dates: no coverage, limits or subcontract requirements are checked, and the page says so. Rules in
  `src/shared/insurance.ts`, service `services/insurance.ts`, table `insurance_certificates`
  (migration 0044); up to 200 a company. The privacy policy lists the new data (policy version
  2026-11-26.4).
- Insurance certificates in the weekly email (2026-11-26): the "money to chase" email lists every
  active certificate expired or expiring within 30 days of its date under "Insurance certificates to
  renew", soonest first (at most 10, the rest counted), with a summary line and a link to the
  insurance page; the Cash page's preview counts them. The send rule changed with it: a certificate to
  renew is enough to send the email, since it belongs to the company and not to any job's next steps.
  Rules in `src/shared/cash-digest.ts`; `docs/EMAIL.md` has the send rules.

- Insurance certificates, part 2 (2026-11-26, every plan): each certificate keeps its files, the
  certificate PDF the agent sends (usually an ACORD 25), the endorsements a subcontract asks for
  with it (additional insured, waiver of subrogation) and the policy pages, up to 10 a certificate.
  "Files (n)" on the insurance page opens the same upload panel as a pay application's (type and
  size rules, phone camera, HEIC/WebP to JPEG); the files count in the company's one storage limit,
  are served as attachments with nosniff, and go when the certificate is deleted. A draft pay
  application lists the files of every active certificate under "Insurance certificates on file",
  each one click from its backup ("Add to backup" copies it, so it goes in the one-PDF packet and
  survives the certificate's file being deleted); one already attached under the same name reads
  "In the backup". Endpoints `/insurance/:id/attachments[/:fileId]` and
  `.../pay-apps/:id/attachments/from-insurance`; service `services/insurance-files.ts`, table
  `insurance_certificate_files` (migration 0045). Privacy policy version 2026-11-26.5 names the new
  files. Tests: `test/worker/insurance-files.test.ts` (storage, purge, copy, roles, two companies),
  `test/unit/insurance-note.test.tsx` (the offer).
- Insurance certificates, part 3 (2026-11-26, every plan): each certificate records which jobs' GCs
  hold it (the certificate holder on an ACORD 25), with the date it was sent when typed. "Sent to…"
  on the insurance page ticks the jobs (open ones first) and saves the list; a renewal is offered the
  jobs of the archived certificate of the same coverage it replaces. Under each certificate: "Held by
  Peak GC and Sierra Builders", or, while it is expired or expiring, "Send the renewal to ...", each
  GC once however many of its jobs. A draft pay application marks the certificate files its GC
  holds ("GC has it, sent ...") and names the active certificates not recorded as sent to that GC;
  it says nothing until the company records a holder somewhere, since an empty list means the
  feature is unused. The weekly email's renewal lines name the GCs. Endpoint
  `PUT /insurance/:id/holders` (editors; the list is replaced in one batch; a job of another company
  is not found); service `services/insurance-holders.ts`, table `insurance_certificate_projects`
  (migration 0046, gone with the job or the certificate). Privacy policy version 2026-11-26.6 names
  the new data. Tests: `test/worker/insurance-holders.test.ts`, `src/shared/insurance.test.ts`,
  `src/shared/cash-digest.test.ts`, `test/unit/insurance-note.test.tsx`.
- Insurance certificates, part 4 (2026-11-26, every plan): each certificate keeps its limits (each
  occurrence and aggregate, labelled per coverage: combined single limit for auto, employer's
  liability for workers' comp) and the wording it shows (additional insured, waiver of subrogation,
  primary and non-contributory). Each job keeps what its subcontract requires, one row a coverage
  ("Insurance the subcontract requires" on the job page), checked against the certificates on file:
  "Met" (by which certificate, "with the umbrella" when one made up the limit) or "Gap" with each
  reason in words: no certificate, expired, not yet started, a limit below the requirement (both
  figures), a limit not typed (never assumed met), an endorsement not shown. An umbrella in force
  counts toward a limit only where the row says the GC accepts it. A draft pay application lists the
  job's gaps on its own date under the insurance note (a lapsed certificate is said once). PayApps
  reads what was typed from the certificate, not the policy, and says so. Rules in
  `src/shared/insurance-requirements.ts`; endpoints `GET/PUT /insurance/requirements/:projectId`
  (editors replace the list in one batch; another company's job is not found); service
  `services/insurance-requirements.ts`, table `project_insurance_requirements` and five columns on
  `insurance_certificates` (migration 0047). Privacy policy version 2026-11-26.7 names the new data.
  Tests: `src/shared/insurance-requirements.test.ts`, `test/worker/insurance-requirements.test.ts`,
  `test/unit/insurance-requirements-ui.test.tsx`.
- Insurance certificates, part 5 (2026-11-26, every plan): "Email GCs" on an active certificate not
  yet expired drafts one email a GC holding it, or, before anyone is recorded on it, each GC that held
  the earlier certificate of the same coverage it renews (archived or not). A renewal says the policy
  renewed, names the old expiry date and lists that GC's jobs; a first send asks the GC to keep it on
  file. The facts are only those typed from the certificate (coverage, insurer, policy number, policy
  period, limits with their per-coverage labels, endorsements); the draft never says a file is
  attached (the page asks the contractor to attach the PDF from Files). Addressed to the GC project
  manager when all of that GC's jobs name the same one, else blank with the addresses seen. Copy or
  "Open in my email", then "Record as sent today" (editors) saves that GC's jobs as holders of this
  certificate dated today through the existing `PUT /insurance/:id/holders`, so its pay applications
  show the certificate on file. An expiring certificate's "Send the renewal to ..." line points at the
  renewal's row when one is typed in. Nothing new is stored. Pure rules in
  `src/shared/insurance-renewal-email.ts`; component `components/insurance-renewal-email.tsx`. Tests:
  `src/shared/insurance-renewal-email.test.ts`, `test/unit/insurance-renewal-email.test.tsx`.
- Insurance certificates, part 6 (2026-11-26, every plan): "Read from the subcontract's insurance
  exhibit" in the job's requirements form takes the exhibit as a PDF (a scan with no text layer read by
  the same in-browser OCR as the SOV import), a text file or pasted text, read in the browser and never
  uploaded. Deterministic, no model: each coverage named opens a block, limits are read from the label
  beside each amount (before it on a table line, after it in prose; "each occurrence and aggregate"
  sets both), and labels the form does not keep (products-completed operations aggregate, personal and
  advertising injury, medical expense, each employee, deductibles, contract-size thresholds) set
  nothing. Endorsements go to the coverages their sentence names, or every liability coverage on "all
  policies" (workers' comp only when named, and only the waiver); "not required" ticks nothing; "may
  be satisfied by a combination of primary and umbrella" lets the umbrella count. Two amounts for one
  limit keep the first and say so; an amount with no label is listed for the person to place. The
  form is filled (limits replaced where the exhibit gives one, endorsements ticked, never unticked)
  with each value and the sentence it came from listed above it; nothing is saved until Save. Nothing
  new is stored. Pure reader `src/shared/insurance-exhibit.ts`. Tests:
  `src/shared/insurance-exhibit.test.ts` (prose and table exhibits written for the tests, a hand-built
  PDF), `test/unit/insurance-requirements-ui.test.tsx`.
- Insurance certificates, part 7a (2026-11-26, every plan): exhibits that set limits by contract
  size. A contract-size condition ("Subcontracts over $1,000,000 and up to $5,000,000:", "$2,000,000
  for subcontracts under $1,000,000", "Subcontract Amount: $0 - $500,000", "$5,000,000 or more")
  opens a tier; a limit belongs to the condition right after it, else the one before it in its
  sentence, else the last tier heading, until another tier or "regardless of contract amount". The
  job's original contract sum (from the job page) picks the tier: other tiers' limits are set aside,
  each in a note with its tier, and the job's tier replaces a limit read with no tier. Without a
  contract sum the first is kept and a note asks for it; a sum no tier holds says so. Table rows
  ("Umbrella Liability: $2,000,000") and headings ending in ":" are no longer joined to the long line
  above them. Thresholds are never limits. Change orders do not move a job between tiers (the
  original sum decides), which the reader's notes leave to the person. Tests: the
  "limits by contract size" block in `src/shared/insurance-exhibit.test.ts` and the tiered case in
  `test/unit/insurance-requirements-ui.test.tsx`.

- Job costing, part 1 (2026-11-26, Crew and up; readable on every plan): the start of the suite past
  billing. Per job (`/orgs/:orgId/projects/:projectId/job-cost`): a cost budget per schedule-of-values
  line (its own table, so it can be revised after billing locks the SOV), costs entered one at a time
  or pasted from a spreadsheet or accounting export (date, amount, labor/material/equipment/
  subcontract/other, item number, description; rows that do not read are listed, never guessed), and
  the job-cost report: budget, cost, remaining, cost % against billed % per line (over budget red,
  cost more than ten points ahead of billing amber), cost by category, and the WIP figures by
  cost-to-cost percent complete: estimate at completion (each line's budget, or its cost when higher,
  plus costs on no line), percent complete, earned revenue, over/under billing against column G of
  the latest sent application (drafts never move it; costs dated after its period end listed apart),
  gross profit to date and projected gross profit and margin. Nothing is worked out until every line
  with a scheduled value has a budget; a projected loss is flagged with a note to ask the accountant.
  Org-wide WIP schedule (`/orgs/:orgId/wip`, active jobs, sample job left out, totals over jobs whose
  estimate is complete) and CSVs of both. Pure math `src/shared/job-cost.ts` (hand-worked example in
  its test); service `services/payapps/job-cost.ts`; routes `routes/org/job-cost.ts` and
  `GET /reports/wip(.csv)`; tables `job_cost_budgets`, `job_cost_entries` (migration 0048); plan
  flag `jobCosting`, gate `assertJobCosting`. Privacy policy version 2026-11-26.8 names the new data.
  Tests: `src/shared/job-cost.test.ts`, `test/worker/job-cost.test.ts` (plan gate, viewer read-only,
  cross-tenant).
- Job costing, part 2, the revised estimate (2026-11-26, job-costing-part-2-cost-to-complete): a
  cost to complete per line typed by the project manager next to its budget ("Edit budgets and
  estimates"), dated the day it changes. The line's estimate at completion becomes its cost through
  that day plus the cost to complete (never below the cost to date, so later costs use it up), and
  percent complete, earned revenue, over/under billing and projected gross profit follow it on the
  job page, the WIP schedule and both CSVs. Each line shows its estimate against the budget (red when
  over); flags: a revised estimate over budget, and a cost to complete used up by later costs (the
  estimate then holds at the cost to date until a new figure is typed). Blank keeps the budget as the
  estimate. Migration 0049; privacy policy 2026-11-26.9 names the estimates. Hand-worked example in
  `src/shared/job-cost.test.ts`; route test in `test/worker/job-cost.test.ts`.
- Job costing, part 2, costs from QuickBooks (2026-11-26, job-costing-part-2-qbo-costs): "Costs
  from QuickBooks" on the job-cost page links a job to the QuickBooks customer or job its expenses
  are tagged to, reads the Bill, Purchase (check, cash, card) and VendorCredit lines tagged to it in
  a date range (credits negative, a suggested category from the account or item name), and imports
  the ticked ones as costs on the line and category chosen. Amounts are re-read from QuickBooks on
  import; a line is never imported twice (`job_cost_entries.qbo_source`, unique per org); a bill
  changed since import shows both figures. Read only toward QuickBooks. Reader in
  `packages/qbo-sync/src/costs.ts` (with a fake cost book); migration 0051; privacy policy
  2026-11-26.11 names what is stored. Tests: `packages/qbo-sync/test/costs.test.ts`,
  `test/worker/job-cost-qbo.test.ts`, `test/unit/job-cost-qbo.test.tsx`; docs/QUICKBOOKS.md, "Job
  costs from QuickBooks".
- Job costing, part 3, purchase orders from QuickBooks (2026-11-26,
  job-costing-part-3-qbo-purchase-orders): "Read purchase orders" under Costs from QuickBooks lists
  the `PurchaseOrder` lines tagged to the job's customer (Open ticked, Closed not, closed by hand
  said so) and imports the ticked ones as commitments ("PO <number>", vendor, order date, amount
  re-read from QuickBooks; Subcontract category makes a subcontract), never twice
  (`job_cost_commitments.qbo_source`, unique per org). A bill or check made from an order (its
  line's `LinkedTxn` of type `PurchaseOrder`) keeps that link (`job_cost_entries.qbo_po_source`)
  and is put on the commitment whichever is imported first, so the open amount is not counted on
  top of the bill; a cost moved off an order by hand stays off. Migration 0053; privacy policy
  2026-11-26.12 names purchase orders. Tests: `packages/qbo-sync/test/costs.test.ts`,
  `src/shared/job-cost-qbo.test.ts`, `test/worker/job-cost-qbo-po.test.ts`,
  `test/unit/job-cost-qbo-po.test.tsx`; docs/QUICKBOOKS.md, "Purchase orders from QuickBooks".

- Job costing, part 2, committed costs (2026-11-26, job-costing-part-2-committed-costs): purchase
  orders and lower-tier subcontracts per job ("Purchase orders and subcontracts" on the job-cost page:
  type, number, vendor, date, amount, category, line or none; change amount for a change order to it;
  delete keeps the costs entered against it). A cost can be put against one ("Against", which fills
  its line, category and vendor); each commitment shows committed, invoiced to date and open. The open
  amount is cost still to come, so a line's estimate at completion is never below cost to date plus
  its open commitments (basis "committed"; flagged when that passes the budget or the revised
  estimate), and one on no line adds its open amount to the job's estimate; percent complete, earned
  revenue, over/under billing and the WIP schedule follow. Over-invoiced commitments are flagged and
  never lower the estimate; commitments dated after the billed period are left out. Job-cost CSV
  gains committed/open per line, a commitments section and the commitment on each cost. Migration
  0050; privacy policy 2026-11-26.10 names them. Hand-worked example in `src/shared/job-cost.test.ts`
  ("committed costs"); routes, tenancy and the plan gate in `test/worker/job-cost-commitments.test.ts`.

- Job costing, part 2, the WIP schedule as a PDF (2026-11-26; readable on every plan, like the
  screen): "PDF for your surety or bank" on `/orgs/:orgId/wip` downloads `GET /reports/wip.pdf`,
  US Letter landscape, our own layout (no surety's form): per active job the contract to date,
  estimated cost and gross profit at completion, cost to date, percent complete, earned revenue,
  billed to date, over billed, under billed, cost to complete and revenue still to earn (contract -
  earned), each as of its latest sent application (number and period end printed); a job waiting on
  a budget prints a note with its contract, cost and billing and is left out of the totals; totals
  (percent complete = total cost / total estimate), net over or under billing, a blank review block
  (name, title, date, signature) for the company, and the not-financial-statements notice and page
  numbers on every page; a job whose estimate uses typed costs to complete says how many lines are
  re-estimated. Nothing new is computed except sums and backlog. `services/export/wip-pdf.ts`;
  tests `test/unit/wip-pdf.test.ts`, `test/worker/job-cost.test.ts` (download, viewer, cross-tenant).

- Job costing, part 3, labor from a payroll report (2026-11-26, job-costing-part-3-payroll-report):
  "Labor from a payroll report" under Costs on the job-cost page reads the CSV a payroll service
  exports (payroll by job: pay or work date, employee, job/customer/class/department, cost code,
  hours, gross pay, employer taxes, employer contributions) in the browser. The header is found
  under report title lines and its columns matched by name (each can be changed by hand); the job is
  preselected when the report names it; subtotal, total and zero rows are skipped and counted; a
  date or amount that does not read is listed with its row, and a cost code that is not an item
  number on the job blocks the import. Each pay date becomes one labor cost per line (from the cost
  code, or on the line picked): wages + employer taxes + contributions + the contractor's own burden
  percent on wages, which is never assumed (blank counts only the report's figures). Only the sums
  are sent (vendor "Payroll", a count of employees and hours, no names); each carries a reference
  `Payroll <date> item|line <n>`, and `POST .../job-cost/entries` with `skipExistingReferences`
  skips any the job already has, so importing a report twice adds nothing (a corrected report needs
  the old cost edited or deleted first; the preview greys out dates already in). No migration; no
  new stored data. `src/shared/payroll-report.ts`, `src/client/components/payroll-import.tsx`;
  tests `src/shared/payroll-report.test.ts`, `test/unit/payroll-import.test.tsx`,
  `test/worker/job-cost.test.ts` ("skips entries whose reference ...").

- Certified payroll, part 1 (2026-11-26, certified-payroll-wh347, every plan): the job's
  Davis-Bacon weekly certified payroll at `/orgs/:orgId/projects/:projectId/certified-payroll`
  (linked from the job page) in the columns of DOL's optional Form WH-347 (Rev. January 2025, OMB
  1235-0008), read from the form and DOL's instructions (www.dol.gov/agencies/whd/forms/wh347instr,
  2026-11-26). Header (final box, prime/sub, project and contract no., payroll no., wage
  determination(s), week ending, business name and address); per worker the entry number, names, ID
  (a full SSN is refused), J or RA with the apprentice's level, one row per classification worked
  under one entry number, ST and OT hours for the seven days ending on the week-ending date, rates,
  cash in lieu per hour, gross for this project (blank = hours x rates + 6C), gross for all work
  (blank = this project), tax, FICA and other deductions. Computed: column 5, 6B (the worker's total
  hourly credit on page 2 x the row's hours), 6C, deduction total, net (column 9). Page 2: the six
  statements word for word (boxes 1, 2, 3 and 6 always checked, 4 when anyone is paid as an
  apprentice, 5 when any fringe is credited or paid in cash, or set by hand), three apprenticeship
  programs (OA/SAA), six fringe plans (funded or not) with each worker's hourly credit, remarks (each
  "other" deduction named), a blank signature and date (DOL refuses copied signatures), the
  falsification warning, and an addendum page past eight credited workers or long remarks. Errors
  block the PDF (full SSN, over 24 h a day, deductions over gross, 7B under 7A, missing rates, an
  apprentice with no program); warnings print (over 40 ST hours under CWHSSA, OT under 1.5x, a rate or
  fringe under the wage determination's figure typed for the row, an unfunded plan needing approval
  under 29 CFR 5.28, an unnamed other deduction). Nothing is stored: `POST
  .../projects/:id/certified-payroll.pdf` checks the job is the org's and renders; the draft (crew,
  rates, plans) stays in the browser's localStorage, "Start next week" bumps the payroll number and
  date and clears hours and deductions. `src/shared/certified-payroll.ts`,
  `services/export/certified-payroll-pdf.ts`, `src/client/pages/certified-payroll.tsx`; tests
  `src/shared/certified-payroll.test.ts`, `services/export/certified-payroll-pdf.test.ts`,
  `test/unit/certified-payroll-page.test.tsx`, `test/worker/certified-payroll.test.ts` (viewer,
  cross-tenant). Why: subs on public work file this every week, usually in a spreadsheet or a
  separate tool (LCPtracker and the like on the GC's side), and it sits next to the pay app on the
  same job. The Privacy Policy says so (payroll data processed only to print, not stored; the draft
  in the browser), POLICY_VERSION 2026-11-26.13.
- Unit-price lines (2026-11-26, unit-price-sov-lines): a schedule-of-values line can carry a unit, a
  unit price (to six decimals) and, on the base contract, a contract quantity (to three), with the
  scheduled value checked to equal quantity × unit price to the cent (`sov_lines.unit`,
  `unit_price_micros`, `quantity_milli`, migration 0055). Each month a unit-price line is billed by the
  quantity installed (`pay_app_lines.quantity_this_period_milli`); the work this period is always that
  quantity × unit price, rounded half away from zero, and the server refuses an entry whose cents
  differ. The pay-app page, the continuation CSV (five columns after the standard ones) and the PDF
  (a quantities row under the line) show this period's and the to-date quantity; work entered in
  dollars before a line had a price (or a mid-job opening balance) is read back at the price and
  marked "about". Change-order lines take a unit and price but no quantity. The unit price and
  contract quantity lock once a pay app is submitted; a line with no price may still get one. GCPay's
  unit-price SOV upload (Item Number, Description, Units, Unit Description, Unit Value; a lump-sum
  line as 1 LS) downloads from the GCPay panel. Pure rules in `src/shared/unit-price.ts`. Why:
  site work, paving, utility, concrete and landscaping subcontracts are written by unit price, and
  their GCs' forms and portals ask for quantities. Next, if people ask: the quantity added by a
  change order (today a CO adds dollars), quantities in the SOV import, and stored materials by
  quantity.
- Certified payroll, part 2, hours from a time report (2026-11-26,
  certified-payroll-part-2-saved-crew claim; built as the "fill the week from a report" half): "Hours
  from a time report" in the Workers section of the certified payroll page reads a CSV with one row
  per employee and day worked (QuickBooks time activities, Gusto/ADP/Paychex time-card detail, a
  payroll-by-job report with a work date) in the browser. Header found under title lines, columns
  matched by name and changeable (work date, employee or last/first name columns, job, total or
  regular hours, overtime hours, pay type, classification); the job preselected by name. Each day's
  straight time and overtime go on that day of the week ending on the form's date; overtime comes
  out of total hours, or from a pay type (overtime, OT, 1.5x); double time (DT, 2x) is left out and listed per worker, since the form's overtime row has one rate (2026-11-26, private PR after #289); holiday, vacation, PTO,
  sick and other non-work pay types are left out and named. A date column headed pay date, check
  date, period end or week ending is refused (it cannot say which day the hours were worked, and
  spreading them would invent them); a plain "Date" with every row on one day is warned about; a
  day over 24 hours, an hour that does not read and OT above total are listed and block the fill.
  Workers are matched by last and first name (any case): their rows keep classification and rates,
  hours are replaced, a typed gross on a changed row is cleared; a new classification gets a row;
  a name not on the form is added (ID, rates to type); the empty starter worker is dropped; workers
  with no hours in the report are kept at zero and named. Rates, deductions and gross are never
  read. Nothing is sent: the file stays in the browser like the rest of the page (Privacy Policy
  sentence added; not a change in substance, so no POLICY_VERSION bump).
  `src/shared/certified-payroll-import.ts`, `src/client/components/timesheet-import.tsx`; tests
  `src/shared/certified-payroll-import.test.ts`, `test/unit/timesheet-import.test.tsx`. Why: the
  hours by day are the slowest part of the weekly WH-347 and already sit in the sub's time or
  payroll system. Saving the crew on the server stays an "if people ask" item: the page's promise
  is that workers' names and ID numbers are not stored.

- Certified payroll, part 3a: California DIR eCPR XML (2026-11-26, certified-payroll-ca-dir-ecpr,
  every plan). A "California public work" section on the certified payroll page makes the same week
  as the eCPR file (schema 2.0) the DIR Public Works portal takes; DIR accepts version 1 files only
  until 13 January 2027 (V2 FAQ), so every California prevailing-wage contractor's payroll software
  has to move by then. Read from dir.ca.gov on 2026-11-26: the XSD, the commented blank file, the
  sample, "eCPR XML Guidelines V2" and the FAQ. Adds what DIR asks and the WH-347 does not: the
  PWCR (10 digits) and DIR project ID, the awarding body, a statement of non-performance (no
  employees in the file), each worker's middle name, home address, full SSN or ITIN, check number
  or CASH, travel and subsistence and notes, each row's craft, apprentice period (1-10, read from
  the WH-347 level text when it starts with one) and doubletime hours and rate. Deductions are split,
  never re-totalled: state tax out of the WH-347 withholding, SDI, fund admin, savings and dues out
  of its "other", so the PDF and the XML carry the same deductions and net. Fringe: each plan's
  hourly credit under the DIR category picked per plan (guessed from its type), cash in lieu under
  "other" paid to the employee, and a box for "no fringe recorded means paid in the wage" (DIR
  requires one of the two paid flags). Checks DIR's upload rules (lengths, patterns, unique SSNs,
  24 hours a day with doubletime, a period for every apprentice, 500 employees) and the
  source-of-truth totals it stores unchecked. Doubletime is added to gross in the XML only (the
  WH-347 has no doubletime column), with a warning saying so. Built in the browser: SSNs and ITINs
  are held in the page's memory only, never saved in the draft or sent to the Worker; the other
  extras are saved with the draft (Privacy Policy sentence added; data stays on the device, so no
  POLICY_VERSION bump). The output validates against DIR's XSD with xmllint (the XSD is DIR's file
  and not vendored: `ECPR_XSD=<path> pnpm test:unit` runs that check). `src/shared/ca-ecpr.ts`,
  `src/client/components/ca-ecpr-section.tsx`; tests `src/shared/ca-ecpr.test.ts`,
  `test/unit/certified-payroll-page.test.tsx`. Next, if California customers ask: import the
  addresses and SSNs from a payroll export instead of typing them each session, and the portal's
  draft-upload errors checked against a real upload (DIR's classification names are not published:
  an unrecognized one becomes "Other").

- Getting started, part 5 (2026-11-26): where companies stall, in the owner's metrics.
  `GET /api/admin/metrics` now carries `activation`: for every company, and for those that signed
  up inside the window, how many reached each checklist step (job, schedule of values, pay
  application, sent, paid, plus the two optional ones) and how many are stuck on each required step
  (the first one not done), decided by the same `gettingStarted()` rules the company's own checklist
  uses, the sample job excluded. Cross-tenant, so it selects ids, statuses and counts only (a test
  checks a job's and GC's names never appear in the answer). The owner console shows it as a
  "Getting started" table under the product's card. Contract: `ActivationFunnel` in
  `packages/admin-metrics` (optional, so other products send nothing until they have steps); code
  `services/admin/activation.ts`. Why: the onboarding emails (parts 2 to 4) exist to move people
  past a step; this is how the owner sees which step to fix first once strangers sign up.
- RFI log (2026-11-26, every plan, rfi-log): requests for information to the GC, numbered per job
  (one past the highest used; a deleted number is not reused), with the subject, the question, the
  sheet/detail/spec reference, the contractor's proposed solution, the date sent, the response date
  (offered seven calendar days after the date sent and editable, since subcontracts differ), and
  the answer with who gave it and when. Cost and time impact each none, possible or yes (null: not
  stated). Status for today: not sent, open, overdue (its response date has passed) or answered,
  with days outstanding and days overdue; an answered RFI with a cost or time impact and no change
  order linked is flagged "needs a change order" until one on the same job is picked (deleting the
  change order unlinks it). Each RFI prints as a PDF (our layout; a blank response box with
  "responded by" and impact tick boxes until answered, then the answer) with an email draft to the
  GC's PM to send it or chase it past due; the log downloads as CSV. Table `rfis` (migration 0056),
  `src/shared/rfi.ts` (pure rules), `services/payapps/rfis.ts`, `routes/org/rfis.ts` at
  `/api/orgs/:orgId/projects/:projectId/rfis`, `components/rfis.tsx` on the job page. Why: RFIs are
  where a sub's unpriced extra work starts (an answer that adds scope) and the bet's suite grows
  into RFIs (portfolio bets.md, #1).
- RFIs, part 2a: RFI events in the job history (2026-11-26, every plan, rfis-part-2-history):
  entered (with the date sent, or "not sent yet"), sent and date-sent cleared, answered (with who
  answered, as entered) and the answer date changed or cleared, a change order linked, relinked or
  unlinked (by its number), any other field changed (named, with the new response due date), and
  deleted (number and subject kept). Each is a `job_events` row with the RFI as subject, written by
  `routes/org/rfis.ts` after the change succeeds and never for the sample job; the job history
  CSV's "About" column reads "RFI 001". The diff is pure (`rfiEvents` in `src/shared/job-history.ts`).
  A change order deleted while linked unlinks the RFI without an RFI row (its own deletion row is
  there). Why: when an answer added scope, the dispute is over when the RFI went out and when the
  GC answered; the log keeps today's dates, the history keeps who entered which date and when.

- Submittal log, part 1 (2026-11-26): per job, numbered submittals (spec section, type, the
  GC's own number), sent, required-back and returned dates, the GC's action, and resubmittals as
  the next revision with the first one kept on the log. From a needed-on-site date, a lead time and
  review days it works back the last day to send each one and flags late-to-send, overdue-back and
  delivery-at-risk submittals; a CSV of the log with those columns. On every plan; migration 0057;
  `src/shared/submittals.ts`, docs/SUBMITTALS.md. Why: approval of shop drawings and product data
  gates material release for every specialty sub, and a late one is the commonest way a lead time
  turns into a schedule claim against the sub.

- RFIs, part 2, overdue across jobs (2026-11-26, every plan, rfis-part-2-overdue): RFIs sent and
  past the response date entered for them, with no answer, on the company's active jobs are listed
  in the weekly email (most days overdue first, ten by name and the rest counted, each linked to its
  job's RFI log at `#rfis`; an overdue RFI alone is enough to send the email, the sample job is left
  out) and in a box on the projects page. Only entered dates decide it: an RFI with no response date
  is never overdue. `overdueRfis` in `src/shared/rfi.ts`, `companyRfiInputs` in
  `services/payapps/rfis.ts`, `GET /api/orgs/:orgId/rfis/overdue` (`routes/org/company-rfis.ts`),
  `OverdueRfisAlert` in `components/rfis.tsx`. No migration. Why: a late answer holds the work it
  covers and is the usual start of a delay claim or a change order, and a sub with ten jobs does not
  open ten RFI logs to find it.
- RFIs, part 2d: a change order started from an answered RFI (2026-11-26, every plan,
  rfis-part-2-change-order-from-rfi): an answered RFI with no change order linked shows "Start a
  change order" on its row and in its details. It fills the change order form with "RFI 004:
  <subject>" (cut to the 300 characters a new schedule-of-values line takes) and scrolls to it; the
  contractor picks the line and enters the amount and days, since nothing is priced for them.
  Saving sends `rfiId` with `POST .../change-orders`, which checks the RFI first (on this job, 404
  otherwise; answered, 400; not already priced, 409) so a refused link creates no change order, then
  links it and writes "change order created" and "RFI linked to CO" to the job history.
  `canStartChangeOrder` and `changeOrderDraftFromRfi` in `src/shared/rfi.ts`. No migration. Why:
  the money a sub most often loses on RFIs is the extra work an answer asked for that nobody priced,
  and the step between "answered" and "change order sent" is where it gets dropped.

- Submittal transmittal (2026-11-26): a cover sheet PDF per submittal, every member, every plan:
  to the GC and PM, from the company, dated the sent day (or the print day), what is enclosed, the
  action requested as checkboxes (picked on the page; record for close-out documents and approval
  otherwise), the return-by date, the needed-on-site date and lead time, the revision it replaces
  with the GC's action on it, remarks, and a reviewer's stamp box. No migration;
  `services/export/submittal-transmittal-pdf.ts`, docs/SUBMITTALS.md. Why: a sub sends every
  submittal under a transmittal, and one that states the needed-on-site date puts the reviewer on
  notice of the schedule, which is the record a sub needs if a late review becomes a delay claim.

- RFI files (2026-11-26, every plan, rfis-part-2-attachments): each RFI keeps its own files, the
  marked-up sheet or detail the question is about, photos of the condition, and the response that
  comes back (a sketch, an ASI, the RFI returned answered). "Files" on the RFI's row opens the same
  panel as a change order's (`GET/POST .../projects/:id/rfis/:rfiId/attachments`,
  `GET/DELETE .../attachments/:fileId`; every member reads, editors add and delete), with a count on
  the row. The RFI PDF lists the files sent with it under "Attached" (name and kind; the response is
  left out, being the GC's), and "PDF + files" (`.../rfis/:rfiId/packet.pdf`) is the RFI, an index
  and those files in one PDF, through the same packet code as a change order. Same type allow-list,
  15 MB a file, 20 an RFI, one storage limit per plan counted across every kind of file. Each file
  added or removed is a job history row ("RFI 001: file attached, ..."). Deleting the RFI or the job
  clears its stored objects. Table `rfi_files` (migration 0058), `services/payapps/rfi-files.ts`,
  `RFI_CATEGORY_LABELS` in `src/shared/attachments.ts`. Why: an RFI about a clash is read against
  the marked-up sheet, and the GC answers with a sketch; a sub that keeps both with the RFI has the
  record in one place when the answer becomes a change order or a delay claim.

- Submittals to chase across jobs (2026-11-26, every plan, submittals-part-2-overdue): the
  newest revision of each submittal on the company's active jobs that is overdue back from the GC,
  late to send for the material to arrive on time, or returned for resubmittal with no next
  revision entered, delivery-at-risk first, then most days late. Listed in the weekly email
  ("Submittals to chase", ten by name and the rest counted, each linked to its job's submittal log;
  one alone is enough to send the email, the sample job left out) and in a box on the projects
  page (the browser's date, so it turns over at the user's midnight). Only typed dates decide it.
  `submittalsToChase` in `src/shared/submittals.ts`, `companySubmittalInputs` in
  `services/payapps/submittals.ts`, `GET /api/orgs/:orgId/submittals/to-chase`
  (`routes/org/company-submittals.ts`), `SubmittalsToChaseAlert` in
  `components/submittals-to-chase.tsx`. No migration. Why: a sub with ten jobs does not open ten
  logs to find the shop drawing that is holding a material release.
- **Submittals, part 2c: files with a submittal** (2026-11-26, submittals-part-2-attachments). Each
  revision keeps its own files: product data, shop drawings, sample photos and the stamped copy
  returned, under the same rules and company storage limit as pay-app files. The transmittal lists
  every file but the returned copy under "Files enclosed", and "With files" (`packet.pdf`) is the
  transmittal, an index and those files as one PDF, through the pay app's packet code.
  `submittal_files` (migration 0059), `services/payapps/submittal-files.ts`, routes in
  `routes/org/submittals.ts`, a Files row on the submittal log (`AttachmentsPanel`, holder
  `submittal`). Why: a sub sends the reviewer the transmittal and the drawings together; keeping
  them apart meant a second tool for the part the GC actually reviews.
- **Submittals, part 3a: a register imported from the GC's register or the spec sections**
  (2026-11-26, submittals-part-3-register-import, every plan). "Import from the register or the
  spec" reads, in the browser, the GC's register (.xlsx, CSV or a printed PDF: spec section, number,
  title, type, due and on-site dates, lead and review times in calendar days or weeks) or the spec
  sections' SUBMITTALS articles (each lettered paragraph a row, typed from its label, the
  procedures section left out), shows the rows to check, and adds the kept ones as the next numbers
  in one transaction. Business-day times, unreadable dates and unknown types stay in the notes,
  never guessed; rows already on the log are unticked. `src/shared/submittal-import.ts`,
  `submittal-import-file.ts`, `POST .../submittals/import`, `components/submittal-import.tsx`,
  docs/SUBMITTALS.md. No migration. Why: a sub's first hour on a job is typing the spec's
  submittal list into a log by hand; the spec already lists every one.
- **Submittals, part 3c: the spec reader** (2026-11-26, submittals-part-3-spec-register). The
  import's spec path now runs on `src/shared/spec-submittals.ts`. It reads federal UFGS sections'
  `SD-nn` lists as well as SectionFormat articles, reads up to 400 pages per PDF (`extractText`
  takes `maxPages` and reports the file's page count), drops running headers and footers by where
  they sit on the page, and leaves all of Division 01 out. Measured on the 54 trade sections of the
  2019 UFGS package: 865 of 869 tagged items found, none extra (docs/SUBMITTALS.md).

- **Submittals, part 3b: the returned stamp read from the PDF** (2026-11-26,
  submittals-part-3-returned-stamp). "Read the stamp" in a submittal's edit form reads the
  reviewer's action and date from the stamped copy (an attached one, or a PDF picked from the
  computer), in the browser, and fills Returned and GC's action for the user to save. Reads stamp
  annotations (Bluebeam, Acrobat: `extractText(..., { annotations: true })` in `@shared/pdf/text`
  now runs each stamp's appearance stream into page coordinates) and stamps flattened into the page;
  the ticked box when the tick is text; the labelled date, else the annotation's placed date. Says
  so, and fills nothing, for drawn ticks, disagreeing stamps, several dates, a date outside the
  submittal's window, or a scan. `src/shared/submittal-stamp.ts`, `components/stamp-reader.tsx`,
  docs/SUBMITTALS.md "Reading the stamp". Why: the stamped copy is the one record of what came
  back, and typing its action and date off it is the chore left after part 2 attached it.

- **Punch list, part 1** (2026-11-26, every plan, punch-list): per job, the items the GC, architect,
  owner or an inspector listed at a walk-through (or the sub's own walk), numbered P-001 on (one past
  the highest on the list), with the location, who listed it, the dates listed and due, when it was
  fixed and by whom, and when the GC accepted it and who. Status for today: open, overdue (its due
  date has passed), done and awaiting back-check, accepted, or "not ours" with the reason (another
  trade's work, built as drawn), which keeps it out of the count until the GC accepts it. The
  summary counts each and the accepted share of the items that count; when every one is accepted
  the job page says so, with the note that many subcontracts release retainage once the punch list
  and close-out documents are in. A list pasted from the GC's email is read one item per line
  (numbering dropped, the location split off before a tab, " - " or ": ", nothing else guessed) and
  added all or nothing (`POST .../punch-list/bulk`, a date problem names its line). "Fixed today" and
  "Accepted today" on each row; one back-check email draft to the GC's PM lists every fixed item and
  how many are still open. The list prints as a landscape PDF (all, or `?only=open` for what is
  left) with a column for the GC's initials, and as CSV. Table `punch_items` (migration 0061),
  `src/shared/punch-list.ts` (pure rules), `services/payapps/punch-list.ts`,
  `routes/org/punch-list.ts` at `/api/orgs/:orgId/projects/:projectId/punch-list`,
  `services/export/punch-list-export.ts`, `components/punch-list.tsx` on the job page; privacy
  policy 2026-11-26.17 names the items. Why: close-out is where a sub's retainage (often 5-10% of
  the contract) waits, and the punch list is the usual gate; Procore, Buildertrend and Contractor
  Foreman all carry one, and the bet's suite grows into it (portfolio bets.md, #1).
- **Close-out, part 1** (2026-11-26, every plan, closeout-checklist): per job, the close-out documents
  the subcontract asks for, each with its kind (warranty, O&M manuals, as-builts, attic stock, final
  lien waiver, consent of surety, owner training, test and start-up reports, final inspection
  sign-off, other), where the requirement comes from ("Subcontract Exhibit D", "Spec 01 78 00"), and
  the dates due, sent and accepted (and by whom), or "not required" with the reason, which keeps it out
  of the count. "Add the standard list" adds warranty, O&M manuals, as-builts, attic stock, final
  inspection and final waiver, plus consent of surety when the job is marked bonded, skipping kinds the
  job already has (`POST .../closeout/standard`). The checklist is read with the punch list and the
  retainage on the latest pay application sent (the cash report's reading: held, and whether that
  application bills the whole contract), and lists in words what still stands between the job and its
  retainage: work left to bill, punch items not accepted, documents not sent. Once nothing does, an
  email draft to the GC's PM asks for the release, stating the amount held, the punch list's state and
  each document with its dates; it says what was delivered, never that the subcontract's conditions
  are met. Table `closeout_items` (migration 0067), `src/shared/closeout.ts` (pure rules),
  `services/payapps/closeout.ts`, `routes/org/closeout.ts` at
  `/api/orgs/:orgId/projects/:projectId/closeout`, `components/closeout.tsx` on the job page under the
  punch list; privacy policy 2026-11-26.21 names the documents; payapps-site features and llms.txt.
  Why: the punch list's own note said retainage waits on "the punch list and close-out documents", and
  only the first was tracked; retainage is often 5-10% of a subcontract and a sub's last and slowest
  money (portfolio bets.md, #1).
- **Close-out, part 2: the documents and the binder** (2026-11-26, every plan,
  closeout-part-2-documents-binder): each close-out document keeps its files under the RFI files'
  rules (the document as sent, photos such as attic stock delivered, and the GC's receipt or
  acceptance; 30 per document, the company's one storage limit, PDF and photos only, nosniff
  downloads), with "Files (n)" on each checklist row. "Download the close-out binder" makes one PDF
  for the GC (`GET .../closeout/binder.pdf`): a close-out transmittal listing every document with
  its kind, where it is required and the dates due, sent and accepted (or "not required" with the
  reason), numbered, then the files enclosed; an index; then each required document's files in
  checklist order (not the GC's receipt, not a not-required document's files). The transmittal lists
  what is enclosed; it never says close-out is complete. Adding and removing a file writes the job
  history. Table `closeout_files` (migration 0070), `services/payapps/closeout-files.ts`,
  `services/export/closeout-transmittal-pdf.ts`, `buildCloseoutBinder` in `services/payapps/packet.ts`,
  routes in `routes/org/closeout.ts`; privacy policy 2026-11-26.23 names close-out files;
  payapps-site features and llms.txt. Why: a GC's close-out is a stack of documents, and the sub's
  retainage waits on getting all of them to the GC in one delivery it can check off; Procore and
  Buildertrend keep close-out documents with files, and part 1 tracked only their dates
  (portfolio bets.md, #1).
- Daily reports, part 1 (2026-11-26, every plan, daily-reports-part-1): one field log per job and day
  (`/orgs/:orgId/projects/:projectId/daily-reports`, linked from the job page): weather and high/low °F
  as typed (no weather service), hours lost to weather or a delay, crew lines (company, trade, workers,
  hours each) with workers and man-hours totalled, work performed, delays, equipment, deliveries,
  visitors and inspections, safety and notes, and who wrote and last changed it. The log counts
  reports, man-hours and days with hours lost, and lists the weekdays since the first report with none
  (through yesterday; holidays are not known, and the page says so); "New, with the crew from <date>"
  copies the latest crew and equipment. A PDF per report, one PDF for a date range (up to three
  months: a week for the GC, a month with the pay app), and the log as CSV. Table `daily_reports`
  (migration 0060), `src/shared/daily-reports.ts`, `services/payapps/daily-reports.ts`,
  `routes/org/daily-reports.ts`, `services/export/daily-report-export.ts`, `pages/daily-reports.tsx`,
  docs/DAILY-REPORTS.md; also on the marketing site's features page and llms.txt. Why: a GC's dispute
  over a change order, a delay or a pay app turns on what happened on site that day, and the suite
  grows past billing (portfolio bets.md, #1); daily logs are a standard module of the construction suites
  the bet compares against.
- Daily reports, part 3a (2026-11-27, every plan, daily-reports-part-3-missing-weekdays): the weekly
  email's "Weekdays without a daily report": each active job with weekdays missing from its log in the
  7 days before the email, among jobs with a report in the 14 days through it, most days first, 10
  listed and the rest counted, each linked to the job's log; the summary line counts the days and
  jobs and the cash page's preview names them. Never enough alone to send the email (a sub is often
  not on site every weekday). `dailyReportGaps` in `src/shared/daily-reports.ts`,
  `companyDailyReportJobs` in `services/payapps/daily-reports.ts`; docs/DAILY-REPORTS.md, "In the
  weekly email". Nothing new is stored.
- Daily reports, part 2 (2026-11-26, every plan, daily-reports-part-2-attachments): photos and files
  per report through the shared attachments panel (camera, shrink-before-upload, HEIC/WebP to JPEG),
  up to 30 per report on the plan's one storage limit, with "Photos (n)" on the log and "PDF + photos"
  (`.../daily-reports/:reportId/packet.pdf`: the report, an index, then its files, not a signed copy).
  Job history rows for each report entered, changed (fields named, a moved date with both dates) and
  deleted, and each file attached or removed. Table `daily_report_files` (migration 0065),
  `services/payapps/daily-report-files.ts`, `dailyReportEvents` in `src/shared/job-history.ts`;
  privacy policy 2026-11-26.19 names the files. Why: photos are the part of a field log a sub leans on
  in a delay or extra-work claim, and the suites it competes with (Procore, Buildertrend, Contractor
  Foreman) attach them to the daily log.
- Estimates, part 1 (2026-11-26, every plan, estimates-part-1): the bid before the job. A company's
  estimates (`/orgs/:orgId/estimates`, numbered EST-0001.. per company) priced from cost lines (labor,
  material, equipment, subcontract, other: quantity, unit, unit cost to six decimals) that roll up into
  bid items; markup set per category and sales tax the contractor pays on material added before its
  markup. Pure math in `src/shared/estimate.ts`, rounded once per bid item and category so the total is
  exactly the sum of the items and each item exactly its cost plus tax plus markup (hand-worked and
  random-line tests). Draft, sent (dated), lost and won, with the open pipeline and hit rate on the
  list; a proposal PDF for the GC with prices only (no costs or markup), includes, excludes, notes, the
  date it lapses and an acceptance block. "Won: start the job" creates the job through the normal
  paths (so the plan's active-job limit applies, and a refused job leaves the bid unwon): GC, contact,
  location and contract sum from the estimate, one schedule-of-values line per bid item at its price,
  and on Crew and up each line's job-cost budget at the item's cost with tax. A won estimate's lines are
  locked as the record of what was bid. Tests: `src/shared/estimate.test.ts`,
  `test/unit/estimates-page.test.ts`, `test/worker/estimates.test.ts` (flow, win, Free plan, roles,
  cross-tenant).
- Estimates, part 2, spreadsheet import (2026-11-26, every plan, estimates-part-2-spreadsheet-import):
  "Import from a spreadsheet" on an estimate reads a bid sheet, a supplier's quote or the takeoff's
  material list (`materialListCsv`: section as the bid item, item, size and length as the description,
  its Warning row carried into the notes) from .xlsx or CSV, or rows pasted from Excel or Google
  Sheets, in the browser (the file is never uploaded). Columns are found by header under a title block;
  a heading row with no numbers names the bid item for the lines under it when there is no bid item
  column; a sheet with a unit cost or total per category (material, labor, equipment, sub) gives one
  line per priced category. A total alone is a lump sum (1 LS); a total with a quantity gives the unit
  cost (flagged, and flagged again when the extension is a cent off); a quantity with no cost comes in
  at $0 and is flagged to be priced; totals, negatives and unreadable cells are left out with the
  reason. The kept lines go into the editor and are saved with "Save lines". Pure reader
  `src/shared/estimate-import.ts` (hand-worked tests in `estimate-import.test.ts`), panel
  `src/client/components/estimate-import.tsx`.
- Estimates, part 2, alternates (2026-11-26, every plan, estimates-part-2-alternates): any bid item can
  be an add alternate (priced on the proposal, left out of the base bid) or a deduct alternate (in the
  base bid, taken out if the GC accepts the deduction); a substitution is a deduct plus an add.
  Alternates share one numbering (Alternate No. 1, 2, ..), the page shows the base bid and what the
  adds and deducts come to, and the proposal PDF prints "Base bid" and an Alternates section with a box
  per alternate to tick. "Won: start the job" asks which alternates the GC accepted: the job's
  schedule of values is the base bid less the accepted deducts plus the accepted adds, renumbered 1..m,
  with the contract sum exactly their total; the accepted ones are kept with the won estimate. Saved
  with the lines (PUT .../lines `alternates`; left out keeps them, a renamed item's is dropped).
  Migration 0064 (`estimate_alternates`). Tests: `src/shared/estimate.test.ts` (hand-worked and
  random), `test/worker/estimates.test.ts` (flow, PDF, win with alternates, cross-tenant).
- Estimates, part 2, price list (2026-11-26, every plan, estimates-part-2-price-list): a company price
  list (`/orgs/:orgId/price-list`, linked from Estimates) of material prices, labor and equipment
  rates and sub quotes (category, description, unit, unit cost, optional code and source note), up to
  5,000 per company and one per category, description and unit (matched without case or extra
  spaces). Typed, or read from a supplier's price sheet with the estimate import's reader (in the
  browser; the file is never uploaded). On an estimate: "Add from the price list" (search by any
  word, by category) adds a line under the last bid item with the quantity left to type; "Save lines
  to the price list" adds new prices and updates matching ones (a code or note left blank keeps the
  saved one; a price given twice at different costs keeps the last and names it); "Use list prices"
  appears when lines differ from the list and sets them to it, for the person to check and save. A
  line copies the cost, so changing the list never changes a saved estimate. Table
  `price_list_items` (migration 0068), pure matching in `src/shared/price-list.ts`,
  `services/payapps/price-list.ts`, `routes/org/price-list.ts`, `pages/price-list.tsx`; privacy
  policy lists estimates and the price list. Tests: `src/shared/price-list.test.ts`,
  `test/unit/estimates-page.test.ts`, `test/worker/price-list.test.ts` (CRUD, key clash, merge over
  the D1 statement size, roles, cross-tenant). Why: estimators reprice the same few hundred items on
  every bid, and reusing a saved catalog of costs is the step from a spreadsheet to estimating
  software that the contractor suites in portfolio bets.md (#1) are compared on.
- Estimates, part 2, bid-day email (2026-11-26, every plan, estimates-part-2-bid-followup): "Email the
  proposal" on a draft estimate and "Follow up by email" on a sent one draft an email to the GC
  estimator on the estimate (greeting the GC's estimating team, recipient blank, without one), from
  the saved estimate only: the job and location, the bid due date while it is ahead, the base bid (or
  bid price) and each alternate by number with its add or deduct, and the date the proposal is open
  until as the PDF prints it (from the date sent, else today). The follow-up gives the date sent and
  the days since, asks where the bid stands, whether anything is needed and, if it went to someone
  else, the result; past the open date it says so and offers to confirm or update the pricing. No
  attachment is claimed (the person attaches the PDF), nothing is sent from PayApps, and after the
  proposal draft is copied or opened it offers "Mark sent today". Won and lost estimates get none. The
  header form now reads markups to 500%, as the API takes them (other percents stay 0 to 100%). Pure
  `src/shared/estimate-email.ts` (hand-worked tests), panel `src/client/components/estimate-email.tsx`
  (render test), `parsePercentToBps(input, maxBps)`. Why: submitting the bid and chasing it
  afterwards is the email a sub writes for every bid, and the draft starts it from the saved numbers.
- Estimates, part 2, budget by cost type (2026-11-26, Crew and up to change, every plan reads,
  estimates-part-2-cost-lines-to-job-budget): a job made from a won estimate starts each schedule-of-
  values line's budget split the way it was bid, the bid item's labor, material (with its sales tax),
  equipment, subcontract and other cost, and the job-cost page's "Budget by cost type" compares each
  type with the costs entered on the line in that type (cost to date to the report's as-of date,
  remaining, cost %; red and an issue line when a type is over, including a cost in a type the line
  was bid with none of). Any line can be split or re-split by hand ("Split by cost type"), which sets
  the line's budget to the split's sum and keeps its cost to complete; a line budget changed alone
  later shows the difference as "not split" rather than spreading it by a guessed ratio; clearing a
  line's budget clears its split. The line budget, not the split, still drives the estimate at
  completion and WIP. Table `job_cost_type_budgets` (migration 0071), pure
  `src/shared/cost-type-budget.ts`, `PUT .../job-cost/cost-type-budgets`,
  `src/client/components/cost-type-budgets.tsx`. Tests: `src/shared/cost-type-budget.test.ts`,
  `test/unit/cost-type-budgets-ui.test.tsx`, `test/worker/job-cost-types.test.ts` (save, sum, clear,
  win split, plan gate, viewer, cross-tenant). Why: subs track labor against the hours they bid more
  than anything else, and a line total hides labor running over while material comes in under;
  carrying the bid's own breakdown means nobody retypes it. Not done: estimate cost lines carried as
  purchase orders or subcontracts (an estimate line has no vendor or PO number to commit to), and a
  cost code below the cost type.

- T&M tickets, part 1 (2026-11-26, every plan, tm-tickets): extra work written up per job
  (`/orgs/:orgId/projects/:projectId/tm-tickets`, linked from the job page): a numbered ticket (the
  next free number or a paper book's), the date, the work, location, who directed it and a reference;
  labor (trade, workers, hours each, rate), material (quantity, unit, unit cost) and equipment (hours,
  rate) lines, each rate optional until priced; labor, material and equipment markups. The GC's
  representative signs on the device (a drawn signature stored as JPEG and printed on the PDF) or on
  paper; once signed the work and quantities are locked and only prices, markups, reference and notes
  change. Signed, priced tickets (one or many) become one pending change order on an existing or new
  SOV line, linked back to the tickets and freed if it is deleted. The log leads with the signed work
  not yet on a change order (count, total, oldest date). A priced PDF and a field copy per ticket, a
  change order's tickets as one backup PDF, the log as CSV. The PDF writer embeds JPEG images. Table
  `tm_tickets` (migration 0063), `src/shared/tm-tickets.ts`, `services/payapps/tm-tickets.ts`,
  `routes/org/tm-tickets.ts`, `services/export/tm-ticket-export.ts`, `pages/tm-tickets.tsx`,
  docs/TM-TICKETS.md; marketing features page and llms.txt; privacy policy 2026-11-26.18 lists tickets
  and signature images. Why: extra work is hard to get paid for without a signed, priced, submitted ticket (unsigned, unpriced
  or never-submitted tickets), it feeds the change orders and pay apps this product already bills, and
  T&M tickets are a standard module of the field suites bet #1 grows into (portfolio bets.md).

- T&M tickets, part 2: the rate sheet and the weekly email (2026-11-26, every plan,
  tm-tickets-part-2-rate-sheet-weekly-email): one rate sheet per job (labor per man-hour by trade,
  equipment per hour, material per unit, the three markups, where the rates come from), saved whole
  by `PUT .../tm-tickets/rate-sheet` and drafted in one click from the rates already on the job's
  tickets. New tickets start with its markups and "Fill blank rates" takes its rates first; it never
  reprices a ticket, but a ticket not yet billed lists each rate or markup that differs from it. The
  weekly "money to chase" email lists signed tickets on no change order per job (numbers, priced
  total, unpriced count, oldest work date), linked to the job's T&M page, and they alone send it.
  Table `tm_rate_sheets` (migration 0066), `src/shared/tm-tickets.ts` (rate sheet and
  `ticketsToBill`), `pages/tm-rate-sheet.tsx`, docs/TM-TICKETS.md and docs/EMAIL.md. Tests:
  `src/shared/tm-rate-sheet.test.ts`, `src/shared/cash-digest.test.ts`,
  `test/unit/tm-rate-sheet-page.test.ts`, `test/unit/tm-rate-sheet-ui.test.tsx`,
  `test/worker/tm-tickets.test.ts` (save, replace, refuse, viewer, cross-tenant, email preview and
  render). Why: a T&M exhibit fixes the rates and markups, and a GC sends back a ticket priced off
  them; signed work nobody has billed is the money this product exists to collect.

- T&M tickets, part 2: photos and files per ticket, and the job history (2026-11-26, every plan,
  tm-tickets-part-2-attachments-history): the attachments panel on each ticket (photos of the work by
  default, material backup, a scan of a paper-signed ticket; 20 per ticket, the company's one storage
  limit, open on signed and billed tickets), "PDF + photos" (the priced ticket, an index, then its
  files) and "CO backup + photos" (every ticket on a change order, then each ticket's files, named by
  ticket). The job history gains ticket rows: written up, changed (quantities apart from rates),
  signed (who, title, date, drawn or on paper), signature taken off, billed on a change order (per
  ticket, with its total), deleted, and files attached and removed. Table `tm_ticket_files`
  (migration 0072), `services/payapps/tm-ticket-files.ts`, `buildTmTicketPacket` in
  `services/payapps/packet.ts`, `tmTicketEvents` in `src/shared/job-history.ts`, docs/TM-TICKETS.md;
  the privacy policy names T&M tickets among the records files attach to (POLICY_VERSION
  2026-11-26.24). Tests: `src/shared/job-history-tm.test.ts`, `test/worker/tm-ticket-files.test.ts`.
  Why: a GC disputing T&M hours asks for photos of the work and the material receipts, and a ticket's
  history (when it was signed, what changed after) is what a claim over extra work turns on.

- Lower-tier waivers, part 1 (2026-11-26, Crew and up to change, every plan to read,
  lower-tier-waivers): on each pay application, the lien waivers the contractor collects from its own
  suppliers and sub-subcontractors to hand the GC with its own. The panel offers the job's purchase-order
  and subcontract vendors (one per vendor, ticked when something is invoiced to date) and the parties on
  the last application's list, added in one go through the period end with the waiver kind chosen;
  parties typed by hand too. Each row is owed, asked (days waiting) or received, with an amount, a note,
  "Copy request" and an "Email" draft in our own words (the job, the GC, the kind, through date and
  amount); the summary names who still owes one. Nothing is sent from PayApps and nothing decides what a
  contract or state requires. Table `lower_tier_waivers` (migration 0067), `src/shared/lower-tier-waivers.ts`,
  `services/payapps/lower-tier-waivers.ts`, `routes/org/lower-tier-waivers.ts`,
  `components/lower-tier-waivers.tsx`. Tests: `src/shared/lower-tier-waivers.test.ts`,
  `test/unit/lower-tier-waivers-ui.test.tsx`, `test/worker/lower-tier-waivers.test.ts` (Crew gate, flow,
  all-or-nothing batch, last list offered, viewer, cross-tenant, a deleted draft takes its list). Why:
  GCs commonly hold a sub's payment until its suppliers' and sub-subs' waivers are in, and the
  sub-side tools priced in bets.md sell waiver collection.

- Lower-tier waivers, part 2 (2026-11-26, still out across jobs;
  lower-tier-waivers-part-2-outstanding-across-jobs): the projects page lists every pay application on
  an active job with lower-tier waivers not received (`lowerTierToChase`, longest wait first: the
  parties, how many are out, days since the oldest request, how many not asked yet), each linked to
  its pay application's lower-tier panel, and the weekly "money to chase" email carries the same list
  (at most 10, enough alone to send it; the sample job never; docs/EMAIL.md). Read-only for every
  member on every plan; closed jobs drop off.
- Lower-tier waivers, part 2 (2026-11-26, the received file; lower-tier-waivers-part-2-received-file):
  "Attach signed" on a row files the waiver the party sent back (a PDF, JPEG or PNG, so the packet can
  include it) as one of the pay application's attachments with the row's id, so it shows under
  Attachments, goes in the backup packet with the other backup (upload order) and is named "Lower-tier
  waiver: <party>" in the packet's index; the row is marked received today unless a date was already
  entered, and lists its files as download links. Filing needs the same plan as changing the list
  (Crew and up, 402 otherwise) and a row on that company's job and that pay application (404
  otherwise); removing a row keeps its files as ordinary backup. Column
  `pay_app_attachments.lower_tier_waiver_id` (migration 0073, no foreign key: cleared by the row's
  delete, cascaded with the pay app). Tests: `test/worker/lower-tier-waivers.test.ts` (filed, received,
  kept date, listed, packet index, kept on delete; another app's row, another company's row, Free),
  `test/unit/lower-tier-waivers-ui.test.tsx` (the multipart upload with the row id, the file link, the
  packet-type check). Why: the GC wants the signed lower-tier waivers in the same packet as the
  application, and a row that says "received" with no file is the gap a GC's payment hold turns on.
- Lower-tier waivers, part 2 (2026-11-26, the party's email; lower-tier-waivers-part-2-party-email):
  each row keeps the party's email address (`lower_tier_waivers.party_email`, migration 0074; blank
  clears, checked as an address, 400 otherwise). The list also returns the company's address book
  (`partyEmails`, the newest address per party across every job, matched as party names are, bounded
  to the newest 2,000 rows), so "Email" opens the request draft addressed to the party when the row or
  any earlier row for it has one, the suggestions show the address they will be added with, and a row
  added without an address (field left out, not cleared) is saved with the party's address. The add
  form takes an optional address; "Email address"/"Change address" on a row sets or clears it.
  Nothing is sent from PayApps. Rules `lowerTierPartyEmails` and `lowerTierEmailFor` in
  `src/shared/lower-tier-waivers.ts`. Tests: `src/shared/lower-tier-waivers.test.ts` (newest wins,
  name matching, inherited keys), `test/worker/lower-tier-waivers.test.ts` (saved, bad address, filled
  on a later row, cleared on purpose, kept on rename, another company's book empty),
  `test/unit/lower-tier-waivers-ui.test.tsx` (the mailto addressed from the book, the PATCH, the typed
  address on add). Why: the request is the step that gets skipped; a draft that opens addressed is one
  click instead of a lookup in the contractor's inbox for the supplier's AP address, every month.
- Company documents, part 1 (2026-11-26, compliance-documents-licenses-w9, every plan): the
  compliance papers other than insurance that GCs ask a subcontractor for, at
  `/orgs/:orgId/documents` ("Licenses" on the Projects page): contractor's licenses (state, class,
  number, board), business license, W-9, the surety's bonding letter (capacity as typed), safety
  program, EMR letter, OSHA 300A summary, DBE/MBE/WBE certification, other. The expiry date is
  optional (a W-9 has none: "No expiry date", never warned about); with one, the insurance page's
  rules apply (expired on and after the day, expiring within 30 days). A W-9 keeps no number: its
  number is the company's EIN or SSN, so the API refuses one on add and on an edit (also turning a
  numbered document into a W-9), and the form says why. Editors add, edit, archive and delete;
  viewers read. The Projects page shows a one-line note while an active document is expired or
  expiring; a draft pay application lists any lapsed by its date or expiring within 30 days after.
  "For a prequalification form" lists the active documents as text to paste into a GC's
  subcontractor prequalification form (licenses first; an expired one listed and marked EXPIRED). It
  reads only what was typed and does not check a license with the state board; the page says so.
  Rules in `src/shared/company-documents.ts`; endpoints `GET/POST /documents`, `PATCH/DELETE
  /documents/:id`; service `services/company-documents.ts`, table `company_documents` (migration
  0075), up to 200 a company. Privacy policy version 2026-11-26.25 names the new data. Tests:
  `src/shared/company-documents.test.ts`, `test/worker/company-documents.test.ts` (roles, W-9
  number refused, two companies), `test/unit/documents-note.test.tsx`.
- Company documents, part 2, files (2026-11-26, company-documents-part-2-files, every plan): each
  document keeps up to 10 files (the license card or board printout, the bonding letter PDF, the EMR
  letter), with the insurance page's attachment rules (type allow-list, 15 MB, the company's one
  storage limit, downloads as attachments with nosniff). "Files (n)" / "Add the file" on each row of
  the documents page. A signed W-9 shows the EIN or SSN, so its file is kept only by the
  contractor's choice: the page explains and asks for a tick first, and the Worker refuses the upload
  without `keepTaxId=yes`; the typed record still never holds the number, and a document with files
  cannot be changed into a W-9. A draft pay application offers the active documents' files as backup
  ("Licenses and documents on file", an expired or expiring one marked), copied so either can be
  deleted alone. Deleting a document deletes its objects. Endpoints `GET/POST
  /documents/:id/attachments`, `GET/DELETE /documents/:id/attachments/:fileId`, `POST
  .../pay-apps/:payAppId/attachments/from-documents`; service `services/company-document-files.ts`,
  table `company_document_files` (migration 0076), keys `orgs/{orgId}/documents/{documentId}/`.
  Privacy policy version 2026-11-26.26 names the files and the W-9 choice. Tests:
  `test/worker/company-document-files.test.ts` (W-9 consent, storage, cascade, copy, roles, two
  companies), `test/unit/documents-note.test.tsx` (the offer, the W-9 tick).
- Job schedule, part 1 (2026-11-27, every plan, job-schedule-part-1): the job's own schedule, the
  piece the contractor suites in portfolio bets.md (#1) all carry and PayApps lacked. Activities
  (`/orgs/:orgId/projects/:projectId/schedule`, A-001.. per job, never renumbered) with the trade or
  crew, start and finish dates as typed, percent complete, and optionally the activity each waits for
  (finish to start) with a lag in workdays. Status for today (not started, in progress, done, late
  start, past finish); an activity starting before what it waits for finishes is flagged with its
  earliest start; a predecessor loop is refused; a deleted predecessor leaves what waited on it in
  place, flagged. "Move with what follows" shifts an activity and everything downstream of it (not
  the finished ones) by N workdays in one batch, so a slip on the GC's schedule is one step; start
  and finish each move by workdays so lengths hold. The three-week lookahead (this week's Monday on;
  `?weeks=` 1 to 6) is drawn as bars over the workdays on the job page and printed as a landscape
  PDF for the GC's coordination meeting (late work shown to today); the whole schedule downloads as
  CSV. Weekends are not workdays; holidays are not known, and the screen and PDF say so. Pure math
  in `src/shared/schedule.ts` (hand-worked calendar tests in `schedule.test.ts`),
  `services/payapps/schedule.ts`, `services/export/schedule-export.ts`, `routes/org/schedule.ts`,
  `components/job-schedule.tsx`. Migration 0077 (`schedule_activities`); privacy policy 2026-11-27.1
  names the schedule. Tests: `test/worker/schedule.test.ts` (flow, shift, loop, PDF and CSV, roles,
  cross-tenant).
- Job schedule, part 2: the crew lookahead (2026-11-27, every plan, job-schedule-part-2-crew-lookahead):
  who is where next week. `/orgs/:orgId/crews` lists every active job's open activities (not done,
  starting by the window's end, late ones from before it kept) grouped by the trade or crew typed on
  them, matched with capitals and extra spaces ignored ("Crew A" and " crew  a" are one crew), named
  crews A to Z then "No trade or crew named". Each crew's activities are bars over the workdays
  (`?weeks=` 1 to 6, two by default: this week and next), linked to the job's schedule, and the
  workdays a named crew has work on two or more jobs are listed ("a crew can split": dates, not a
  judgment). Downloads as a landscape PDF for the Monday crew meeting. The bar of an activity past
  its finish runs to today, as on the job lookahead. Read-only; no new table or stored data (so no
  privacy policy change); up to 3,000 open activities read, the earliest starts first, with a note
  when more exist. More than one active job needs a paid plan, so this is where the Crew plan's
  extra jobs show. Pure grouping in `src/shared/schedule.ts` (`crewLookahead`, hand-worked tests in
  `schedule.test.ts`), `services/payapps/crew-lookahead.ts`, `services/export/crew-lookahead-export.ts`,
  `routes/org/company-schedule.ts` (`GET /api/orgs/:orgId/schedule/crews` and `/crews.pdf`),
  `pages/crews.tsx`; linked from the company page and each job's schedule. Tests:
  `test/worker/crew-lookahead.test.ts` (grouping, overlap day, closed job, weeks, PDF, viewer,
  cross-tenant).
- Job schedule, part 2: company holidays (2026-11-27, every plan, job-schedule-part-2-holidays): the
  weekdays a company's crews do not work, left out of every job schedule's workday counts, the
  "waits for" check and earliest start, "Move with what follows", the percent complete weighted by
  workdays, and both lookaheads' day columns (job and crew, screen and PDF, each naming the holidays
  it left out). Listed under the crew lookahead (`/orgs/:orgId/crews`): editors type a date and a
  name, or add the federal list for this year or next (the eleven legal public holidays of
  5 U.S.C. § 6103(a), moved to the day OPM observes a weekend one: Saturday to the Friday before,
  Sunday to the Monday after; New Year's Day on a Saturday listed with the year before) and delete
  the days their crews work. Nothing is assumed: with none listed only weekends are skipped, as
  before. A date already listed keeps its name; up to 200 per company. New table
  `company_holidays` (migration 0078; company calendar data, no personal data, so no privacy policy
  change). Pure math in `src/shared/schedule.ts` (`HolidayCalendar` as an optional last argument to
  every workday function, `federalHolidays`; tests in `schedule-holidays.test.ts`, the federal
  lists checked against OPM's 2026 and 2027 tables), `services/payapps/holidays.ts`,
  `GET/POST /api/orgs/:orgId/schedule/holidays` and `DELETE .../holidays/:id`
  (`routes/org/company-schedule.ts`). Tests: `test/worker/company-holidays.test.ts` (duplicates,
  bad dates, workdays, the check and the shift over holidays, the crew lookahead and PDF, viewer
  read-only, cross-tenant). Daily reports' missing-day list still counts weekdays only (since
  fixed, below).
- Daily reports: the missing days skip the company's holidays (2026-11-27, every plan,
  daily-reports-missing-days-holidays): the log's "weekdays without a report", the date a new
  report starts on and the weekly email's "weekdays without a daily report" line all leave out the
  holidays listed on the crews page (the calendar the schedule's workdays read), so Thanksgiving is
  no longer a gap a foreman is told to write up. The log names the holidays it left out and links to
  the list; a report written on a holiday still counts, and a day off not listed still shows. Pure
  math in `src/shared/daily-reports.ts` (`missingWeekdays`, `summarizeDailyReports`,
  `suggestedReportDate` and `dailyReportGaps` take the `HolidayCalendar` as an optional last
  argument); `dailyReportLog` and `previewDigest` load the company's calendar (filtered by org_id).
  Tests: `src/shared/daily-reports.test.ts`, `test/worker/daily-reports.test.ts` (another company's
  holiday is not applied) and `test/worker/digest.test.ts`. No schema change. Why: a GC that asks
  for a report every workday does not ask for one on the company's holiday, and a list that flags
  every holiday teaches people to ignore it (portfolio bets.md, #1).
- Job schedule, part 2: the GC's P6 schedule imported (2026-11-27, every plan,
  job-schedule-part-2-xer-import): the GC's Primavera P6 export (.xer) is read in the browser (never
  uploaded) and the sub ticks its own activities, found by P6 activity ID, name or WBS. Each keeps
  P6's days (actual once started or complete, else remaining, early, then planned), percent
  complete (100 when complete, physical percent held to 99 while open), and of its finish-to-start
  links to activities on the job the driving one (latest start) as the predecessor, lag hours turned
  into workdays at its calendar's hours a day; the other links (SS, FF, SF, a second FS, links to
  activities left out) are named in the notes. Level-of-effort and WBS summary activities are left
  out with a count; an export with several projects offers the one with the most activities first.
  The GC's next update, imported the same way, matches by P6 activity ID (new column
  `schedule_activities.source_code`, migration 0079) and updates name, dates, percent and
  predecessor, keeping the contractor's trade and notes; new ones are added. One batch after the
  usual checks (loop, dates, the 1,000-activity limit). The CSV gains a "P6 activity ID" column.
  Privacy policy 2026-11-27.3 names the P6 ID and the browser-only read. Reader ported from the
  xer-schedule-check tool: `src/shared/xer.ts`, mapping in `src/shared/schedule-xer.ts`
  (hand-worked XER in `schedule-xer.test.ts`), `importActivities` in
  `services/payapps/schedule.ts`, `POST .../schedule/import`, `components/schedule-import.tsx`.
  Tests: `test/worker/schedule-import.test.ts` (add, update from a later export, loop, limits,
  roles, cross-tenant).
- Job schedule, part 2: delays against an activity (2026-11-27, every plan,
  job-schedule-part-2-delays): a daily report names the schedule activity its lost hours held up
  ("Activity it held up", next to the hours lost; new column `daily_reports.delay_activity_id`,
  migration 0080, set null when the activity is deleted so the report keeps its hours, untied). The
  job schedule lists the delays by activity (days, hours lost, first and last day, reports without
  hours counted apart) and prints the delay log as a PDF, for one activity or all, in a date range:
  each day's hours, weather and the delay as the foreman wrote it. On a change order's files,
  "Attach the delay log" prints it with the change order's number, description and requested time
  and keeps it as backup (the same file rules and storage limit as an upload; job history "file
  added"). Only sums and counts: nothing turns hours into days or says how much time a delay earns,
  and the log says it is not a notice of delay. Pure grouping in `src/shared/schedule-delays.ts`
  (tests beside it), `services/payapps/schedule-delays.ts`, `services/export/delay-log-export.ts`,
  `GET .../schedule/delays(.pdf)`, `POST .../change-orders/:coId/delay-backup`,
  `components/schedule-delays.tsx`. Tests: `test/worker/schedule-delays.test.ts` (tie, untie,
  delete keeps the report, filters, PDF text, attach, viewer read-only, another company's activity
  refused, cross-tenant 404s).

## Must do before a public launch

- Deploy sets `EMAIL_FROM` and checks `GET /api/health` answers `"email": true` (docs/EMAIL.md)
- Run the deploy workflow once (`payapps-deploy`, by hand; [docs/DEPLOY.md](docs/DEPLOY.md)) and, at
  launch, let it run on every merge (`push: branches: [main]`)
- Done 2026-11-26: operator (Maris Stella Labs LLC, Colorado) and contact email filled in; launch is
  agent-approved under `docs/legal/OPERATOR.md` (no attorney review; open checks listed there)
- Owner: Paddle secrets and a notification destination (docs/BILLING.md, "Turning it on"); the
  deploy workflow runs the Paddle catalog sync
- Owner: an Intuit developer app, its keys and redirect URI, and `QBO_TOKEN_KEY`
  (docs/QUICKBOOKS.md, "Turning it on"); check one invoice in a sandbox company first
- Marketing site with the pricing table (`apps/payapps-site`, PR #18) reading `/api/billing/plans`
- At launch, point the free guides at sign-up: set `APP_URL` in `ventures/pay-app-guides/cta.mjs` to the
  deployed origin and run `node cta.mjs` there (30 pages' CTAs switch from "in development" to "open
  now, free on one job" and link to `/?signup&from=pay-app-guides/<page>`, which opens "Create an
  account", `src/client/lib/auth-mode.ts`); set `PAID_PLANS_ON` once checkout is live. Update the
  "Can I buy the pay-app suite today?" answer in `platform/pages/industry-construction.mjs` the same day

## Next (suite, by promise)

- Job schedule, part 2 (part 1, activities, the sequence check, the shift and the lookahead PDF,
  done 2026-11-27; the crew lookahead across every job and the company's holidays left out of
  workdays, done 2026-11-27; the daily reports' missing days skipping the company's holidays, done
  2026-11-27): a GC's schedule read from its PDF export into activities (the P6/XER import is done
  2026-11-27; delays against an activity from the daily reports' lost hours, with the delay log as
  change order backup, done 2026-11-27, job-schedule-part-2-delays); the delay log's days as
  calendar days on the change order's time, if contractors ask
- Company documents, part 3 (files per document as pay application backup done 2026-11-26, the
  documents to renew in the weekly email done 2026-11-27): which jobs' GCs hold each one, as the
  insurance page records holders, if contractors ask
- Lower-tier waivers, part 3 (part 2, the received file, the list across jobs and the party's email,
  done 2026-11-26): the vendor's email read from QuickBooks with its purchase orders, if people ask
- Estimates, part 2 (the spreadsheet and takeoff import, alternates, the company price list with
  labor rates, the bid-day email drafts, markups to 500% in the form and each line's budget split by
  cost type as bid are done, 2026-11-26): a sub quote on the estimate carried to the job as a
  subcontract commitment once the estimate keeps the sub's name, if people ask; "last emailed" on an
  estimate (as change orders keep it), if people ask
- Lien waivers: Mississippi part 3, if asked: move the sixty days off a weekend or holiday once
  Miss. Code Ann. § 1-3-67 (which § 85-7-425 sends the computation of time to) is read; PayApps counts
  calendar days and says so. California
  preliminary notice part 4: Code Civ. Proc. § 2015.5's perjury sentence on the § 8118 declaration
  once the official text is reachable; the attached receipts listed on the proof PDF (part 3, the
  job history and the receipts kept with each record, done 2026-11-26)
- Job costing, part 3 is done (2026-11-26): lines picked by class when a company tracks jobs by
  class instead of customer (bills, checks, card charges, vendor credits, journal entries and
  purchase orders, job-costing-part-3-by-class; docs/QUICKBOOKS.md). Next, if people ask: a class
  and its sub-classes read together. Payroll journal entries a payroll service posts to QuickBooks per
  job (read with the other QuickBooks costs, 2026-11-26), labor from a payroll report upload, purchase orders read from QuickBooks as
  commitments (with the bills made from them counted against them), costs from QuickBooks bills,
  checks, card charges and vendor credits by customer/job, the revised estimate per line, the WIP
  schedule as a PDF and committed costs are done (2026-11-26)
- QuickBooks, part 8: a class per schedule-of-values line (like the item per line), if people ask
  (part 7, a class and a location per job on invoices and credit memos, done 2026-11-26; costs read
  by class are job costing part 3)
- SOV import from a PDF, part 6: JBIG2 pictures and more than ten pages, if people ask (scans with
  no text layer, on their side or upside down included, are read by OCR in the browser since
  2026-11-26)
- State-specific pay-application forms (beyond the notary block; the contractor's sworn statement for
  Illinois 770 ILCS 60/5 and Michigan MCL 570.1110, and a lender's or title company's draw, done
  2026-11-26: `src/shared/sworn-statement.ts`, the job's "Sworn statement" page, parties prefilled from
  its purchase orders and subcontracts with invoiced to date as a cross-check, checked against the
  contract sum and the pay app's amount due, PDF with our own affirmation and a generic jurat; nothing
  stored. Next, if people ask: saving the paid column per pay app instead of in the browser, and the
  Michigan statutory form's own wording once the section can be read in full); GC portal export formats, part 4:
  other portals (Trimble Pay/Flashtract, Siteline) if customers bill through
  them. Parts 1 to 3 (Procore SSOV and invoice sheet, Textura's two billing uploads, GCPay's SOV
  upload) are done
- Backup packets, part 3 (HEIC from Chrome, Edge and Firefox through WebCodecs done 2026-11-27): check
  it on a Windows PC and an Android phone with a real iPhone photo; save a packet order with the pay
  app if people ask for it to survive a reload
- Getting started, part 6: once real companies are counted (part 5, 2026-11-26), change the step most of them
  stall on; per-step time from sign-up if counts alone do not say why
- Insurance certificates, part 7: the exhibit reader checked against real GC exhibits once customers
  share them (part 6, reading the exhibit's PDF or text into the form, and part 7a, limits by
  contract size picked by the job's contract sum, done 2026-11-26), a tier read from a two-column
  table with the contract sizes in one column if exhibits laid out that way turn up; per-holder endorsements (a certificate that names one GC as
  additional insured and not another) if one certificate a coverage proves too coarse; a separate
  insurance-compliance contact per GC if PMs turn out to be the wrong recipient (parts 3 to 6, the
  holders, the job's requirements, the renewal email and reading the exhibit, done 2026-11-26)
- Certified payroll, part 3: the hours from a QuickBooks Time or payroll connection instead of a
  CSV, if people ask (a by-day CSV fills the week since 2026-11-26), save the crew and rates with the job instead of the
  browser if people ask, other states' prevailing-wage formats once their official specs are read (California's DIR eCPR
  XML, schema 2.0, done 2026-11-26: part 3a), and the upload formats of the compliance
  systems GCs use (LCPtracker and the like) if GCs ask
- History, part 3: history for the job's waivers outside a pay app, if those ever exist
- RFIs, part 3: (part 2 is done 2026-11-26: history, overdue across jobs, files, and a change
  order started from an answered RFI) the RFI's answer and files carried onto the change order
  request PDF as its backup, if people ask
- Close-out, part 3: (part 2 is done 2026-11-26: files per document and the binder PDF) close-out
  events beyond files in the job history (sent, accepted, not required), documents overdue across
  jobs in the weekly email, and a "retainage waiting on close-out" line on the cash report, if
  contractors use the checklist.
- Punch list, part 2: photos per item (before and after, the attachments rules the RFIs use),
  punch events in the job history, items overdue across jobs in the weekly email, and a line on the
  retainage-release pay application naming the punch list's state, if people ask; a GC's punch list
  PDF read into items (text layer) once customers share real ones
- Submittals, part 4: spec sections from a scan, and OCR of a scanned stamp with no text layer (the
  SOV import's Tesseract path), if people ask (part 3a, the register import; part 3b, the returned
  stamp read from the PDF; and the spec reader for UFGS SD lists and up to 400 pages, all done
  2026-11-26)
- Daily reports, part 3b (part 3a, the "weekdays without a daily report" line in the weekly email, is
  done 2026-11-27): a report picked as backup on a change order or RFI, if contractors ask; the
  company's holidays left out of the missing days, if a holiday listed as missing turns out to annoy
- T&M tickets, part 3 (part 2 is done 2026-11-26: the rate sheet, the weekly-email line, photos and
  files per ticket with the "PDF + photos" and "CO backup + photos" packets, and ticket rows in the
  job history): a rate sheet copied from another job or a company default, a daily report's crew
  started as a ticket and a remote signature by email link, if contractors ask
