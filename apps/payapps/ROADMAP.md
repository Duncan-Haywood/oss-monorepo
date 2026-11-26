# PayApps — Roadmap

Status: **in development**. Not deployed, no customers, not for sale. Paid plans are dark
(`BILLING_PROVIDER=none`).

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

## Must do before a public launch

- Deploy sets `EMAIL_FROM` and checks `GET /api/health` answers `"email": true` (docs/EMAIL.md)
- Run the deploy workflow once (`payapps-deploy`, by hand; [docs/DEPLOY.md](docs/DEPLOY.md)) and, at
  launch, let it run on every merge (`push: branches: [main]`)
- Owner: confirm the operator name in `docs/legal/*.md` (copied from apps/grants: Mary Stella Labs,
  LLC, New Mexico), fill in the contact email, and have the agent legal review check the drafts (no outside counsel: owner, 2026-11-26) (each says so)
- Owner: Paddle secrets and a notification destination (docs/BILLING.md, "Turning it on"); the
  deploy workflow runs the Paddle catalog sync
- Owner: an Intuit developer app, its keys and redirect URI, and `QBO_TOKEN_KEY`
  (docs/QUICKBOOKS.md, "Turning it on"); check one invoice in a sandbox company first
- Marketing site with the pricing table (`apps/payapps-site`, PR #18) reading `/api/billing/plans`

## Next (suite, by promise)

- Lien waivers: Mississippi part 3, if asked: move the sixty days off a weekend or holiday once
  Miss. Code Ann. § 1-3-67 (which § 85-7-425 sends the computation of time to) is read; PayApps counts
  calendar days and says so. California
  preliminary notice part 4: Code Civ. Proc. § 2015.5's perjury sentence on the § 8118 declaration
  once the official text is reachable; the attached receipts listed on the proof PDF (part 3, the
  job history and the receipts kept with each record, done 2026-11-26)
- QuickBooks, part 7: class or location per job (QuickBooks Plus tracking), once a customer asks
- SOV import from a PDF, part 4: a scan with no text layer through OCR in the browser (searchable
  scans are read since 2026-11-26; a misread amount is pointed at, and pinned by the H and %
  columns, since 2026-11-26)
- State-specific pay-application forms (beyond the notary block); GC portal export formats, part 2
  (Textura, GCPay). Part 1, Procore's SSOV template, part 2a, the Procore invoice sheet, and part 2b,
  that sheet by the GC's SOV positions, are done
- Backup packets, part 3: HEIC photos attached from Chrome or Firefox (no HEIC decoder there: one
  in WebAssembly, or the Worker's); save a packet order with the pay
  app if people ask for it to survive a reload
- Getting started, part 5: count which step people stall on, once usage is measured
- History, part 3: history for the job's waivers outside a pay app, if those ever exist
