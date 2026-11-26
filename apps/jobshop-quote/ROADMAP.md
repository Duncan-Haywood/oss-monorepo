# Job Shop Quote: Roadmap

Bet #2 of the 2026-11-24 direction (paid vertical software for SMBs): AI RFQ-to-quote for CNC and
fabrication job shops. Pricing and the paid path stay dark until the items marked **launch** are done.

## Done (v0.1, this core)

- Shops, members, roles (owner/admin/estimator/viewer), invitation links.
- Rate card: machines (hourly + optional setup rate, default setup, measured removal rate),
  materials ($/lb with density and scrap, or $/stock piece; minimum charge), finishing/outside
  services (per part + lot minimum), markups (labor / material / outside), line minimum, quote
  defaults (quantity breaks, validity, lead time, terms).
- RFQ intake: pasted email + uploaded PDF drawings/images/text (Workers AI text extraction) + CAD
  files stored for geometry.
- LLM extraction (`rfq.extract`) with verbatim-quote verification; editable part form with sources;
  confirmation gate; rate-card material/finish suggestions.
- Deterministic costing engine with quantity breaks, blocking issues instead of guesses, rate
  snapshots, live preview.
- Quote PDF (own writer), send freezes the quote and stores the exact PDF + SHA-256, won/lost/expired
  log with PO number and win rate.
- Cover note: LLM explains customer-safe facts only; number-grounding check with template fallback.
- Offline demo (`pnpm demo`), unit + worker tests incl. cross-tenant isolation.
- AI cost guards (2026-11-25): per-shop monthly LLM spend cap and global daily kill switch
  (`BudgetedLlm` + `services/guards/llm-budget`, copied from grants), 30/min per-user limit on AI
  routes and 20/min per-shop limit on uploads (Workers Rate Limiting). Next on this: the billing
  plan now sets the per-shop cap (`orgCapMicros` hook, docs/BILLING.md).

- Email verification + password reset (2026-11-25, ported from apps/payapps): `ports/email.ts`
  (Cloudflare Email Service binding, fake, log-only), confirm/reset/"already have an account" mail
  with per-user throttles, durable per-IP and per-account auth rate limits in D1, `/verify-email`,
  `/forgot-password` and `/reset-password` pages, invitations need a confirmed address,
  `/api/health` reports `email`. `docs/EMAIL.md`. Real mail turns on with the deploy (item 3).

- Billing (2026-11-25, ported from apps/payapps on packages/billing; docs/BILLING.md): Early access
  (free, 40 RFQs a month, 3 users), Shop ($199, 125 RFQs, 3 users) and Shop Plus ($399, 300 RFQs, 10
  users), the same numbers as the pricing page (a test keeps them equal). An RFQ counts once, on the
  AI's first read, claimed atomically and given back if the read fails; seats count members plus open
  invitations; the plan sets the shop's monthly AI ceiling through `orgCapMicros`. Paddle checkout and
  portal (dark until the owner sets the secrets), signed webhook with the payapps protections, a
  Billing page, and `billing/paddle-catalog.json` generated from the plans.

- Repeat parts, part 1 (2026-11-25): each quote line shows "Quoted before: N earlier quotes of
  <part number>" (same shop, any status, matched by case and spacing, newest first, at most 10) with
  the quote number, customer, date, status, PO or loss reason, revision (flagged when it differs),
  unit price at each break, material and operations as quoted (retired machines flagged). "Use these
  inputs" copies that line's cost inputs onto a draft line, keeps its quantities and re-prices from
  today's rate card. `GET .../lines/:lineId/history`, `POST .../lines/:lineId/copy-from`.

- Repeat parts, part 2 (2026-11-25): the RFQ review screen shows each part's earlier quotes
  ("Quoted before: N, M won") before a quote exists (`GET /rfqs/:id/part-history`, viewers too). A
  shop setting, "Pre-fill repeat parts" (off by default, admins only), starts each new quote line
  whose part number and revision match a won quote from the last won one's inputs (newest decision
  first; both revisions blank counts as a match, one blank does not), with the RFQ's quantities,
  priced from today's rate card. The line says "Pre-filled from Q-1001 for <customer>, won <day>"
  and a revision of the quote keeps that label (`quote_lines.prefilled_from`, migration 0014).

- Repeat parts, part 3 (2026-11-25): with "Pre-fill repeat parts" on, a line added by hand gets
  the same pre-fill once it has a part number: "Add line" then typing a part number the shop has
  won before (same revision rule as part 2) brings the last won line's inputs onto the line, keeps
  its quantities and prices it from today's rate card, with the same "Pre-filled from" label. Only
  a line with no cost inputs yet (no material, operations, finishing or extras, customer-supplied
  unticked) is filled, only when the save changes its part number, and only once, so typed work
  is never replaced and a line cleared on purpose stays blank. A line posted through the API with
  its part number gets it too (`shouldPrefillOnSave`, `hasNoCostInputs`; no migration).

- Repeat parts, part 4 (2026-11-25): a "Pre-filled from" label is dropped when the line's part
  number or revision changes (compared as for pre-filling) or when "Use these inputs" copies a
  different line, so a line never names a won quote it no longer comes from; its inputs stay
  (`prefillLabelStale`). A line whose part was won before only at another revision shows "Won
  before at Rev A, not Rev B: Q-1001 for <customer>, PO ...  Compare the drawings before reusing
  its inputs", with that quote's RFQ files ("Then: ...") and this quote's RFQ ("Now: ...") a click
  away (`wonAtOtherRevision`; the part history now carries each earlier quote's `rfqId` and
  `rfqFiles`, the shop's own rows only; no migration).

- Quote revisions + expiry job (2026-11-25): Revise on a sent, lost or expired quote starts "Q-1001
  Rev 2" (same number, lines and prices copied exactly, rate snapshot kept; Re-price for today's
  card); sending it marks Rev 1 `superseded` in the same batch (no outcome on it, counted once in the
  log); won quotes are not revised; the PDF says "Replaces Q-1001" and downloads as `Q-1001-R2.pdf`.
  A daily cron expires sent quotes the day after valid-until. `POST /quotes/:id/revise`.
- Quotes about to expire, by email (2026-11-25, quote revisions part 4): right after the daily
  expiry run, each estimator gets one email listing their own sent quotes valid until today or
  tomorrow (label, customer and contact, smallest-quantity total, date, a link to each), so they
  can follow up or press Revise before the quote lapses. Only the quote's author, while still a
  member, with a confirmed address; on by default, each member turns it off for themselves under
  the quote log (`GET|PUT /notifications/quote-expiry`, `member_notifications.quote_expiry`). A
  quote is claimed in one UPDATE (`quotes.expiry_reminded_at`) before the send, so a second run
  never mails it again; drafts, won, lost and superseded quotes get none. Migration 0011,
  `services/quotes/expiry-reminders.ts` (docs/EMAIL.md, "Quotes about to expire").
- Changes on the customer PDF + compare with any revision (2026-11-25, quote revisions part 3): a
  revision's "What changed" card has a "Print 'Changes from Q-1001' on the customer PDF" checkbox
  (per quote, off by default, drafts only; `quotes.show_changes_on_pdf`, migration 0008) and
  previews the exact lines. The PDF section is customer-safe by construction
  (`src/shared/quote-change-summary.ts`): it reads only what the PDF already prints (part number,
  part revision, description, quantity breaks with unit prices, lead time), so operations,
  machines, minutes, material, blank, finishing and extras never reach the customer; it always
  compares with the revision the PDF says it replaces, and prints nothing when nothing visible
  changed. The sent PDF stores the section with the rest. A "Compare with" picker appears once a
  quote has two or more earlier revisions (`GET /quotes/:id/revisions`, oldest first, shop-scoped).
  Tests: `src/shared/quote-change-summary.test.ts`, `test/worker/quote-changes.test.ts`.
- What changed from the last revision (2026-11-25): a revision's quote page opens with "What changed
  from Q-1001": the unit price at every quantity break side by side (new, dropped and changed breaks,
  the difference in dollars and percent), then per line the operations (by machine and label, setup
  and cycle minutes), material, blank, part revision, finishing and extras that differ, lines added
  or dropped, and changes to the customer and terms. Prices are the ones each revision stored, never
  recomputed; a line that no longer prices says "not priced". Refreshes as the draft is edited.
  `GET /quotes/:id/changes[?from=]` (any earlier revision of the same number); pure diff in
  `src/shared/quote-diff.ts`. Fixed with it: a line PATCH that sent only `inputs` cleared the
  part revision and description (zod 4 applied the create schema's defaults through `.partial()`).

- Email the quote (2026-11-25): on a sent quote, "Email to customer" sends the exact PDF frozen at
  Mark sent (checked against its SHA-256 first) with the estimator's message (the cover note to
  start), From "<shop> via Job Shop Quote", Reply-To the estimator's confirmed address, to 1-5
  addresses. Each attempt is a `quote_emails` row (to, by, PDF hash, sent/failed, provider id, error
  with addresses removed) listed on the quote; 30 a shop an hour and 5 a quote a day. HTML body is
  the message escaped, never markup. `POST /quotes/:id/email`, `GET /quotes/:id/emails`,
  `src/shared/quote-email.ts`, `services/quotes/email.ts`, docs/EMAIL.md.
- Email the quote, part 2: signature and the estimator's copy (2026-11-25): an admin sets the
  shop's email signature on the rate card (plain text, 1,000 characters); it goes under the
  estimator's message on every quote email, escaped in the HTML, and the form shows it as it will be
  sent. "Send me a copy" (on by default) sends the estimator a second message at their own confirmed
  address with the same PDF and a first line naming who the original went to: a separate message
  rather than a Cc, so the customer sees no second address and a failed copy cannot fail the send.
  The copy goes only after the customer's send succeeds and is recorded on the row
  (`quote_emails.sender_copy`: sent or failed), shown in the email history. Migration 0013.
- Email the quote, part 3: threaded into the customer's RFQ email (2026-11-25): a quote made from
  an RFQ that came in by email, sent back to the address that emailed it, goes as a reply to that
  message (`In-Reply-To`/`References` from the stored Message-ID, subject `Re: <their subject>`),
  so it lands in the customer's own thread instead of as a new, unknown email. Forwarded-in and
  pasted RFQs, and Message-IDs that are not one plain `<left@right>`, are not threaded; neither is
  the estimator's copy. If the provider refuses the headers, the message goes once more without
  them (a refused header fails before sending). The form says when a send will thread.
  `quoteEmailThread` in `src/shared/quote-email.ts`, `services/quotes/email.ts`, docs/EMAIL.md.
  No migration.
- Quote revisions, part 4: "Changes from" in the email body (2026-11-25): when a sent revision's
  PDF prints the "Changes from Q-1001" section, the quote email repeats the same customer-safe lines
  under the estimator's message (escaped in the HTML, at most 20 lines, the rest pointed to the
  PDF), and the email form shows them before sending. Both revisions are frozen once sent, so the
  lines are the ones the attached PDF carries; a revision sent without the toggle, or with nothing
  the customer can see changed, gets no section. No migration.
- Billing, part 2: the 10-page rule (2026-11-25): an RFQ counts once per 10 drawing pages, at
  least once, as the pricing page says. PDF pages are read from the file's page tree at upload (raw
  and compressed object streams, `src/shared/pdf-pages.ts`; unreadable counts as one), images count
  one, email text and CAD none. Claims are rows in `rfq_counts` (migration 0005), so drawings added
  after a read count only past each 10 pages, in the month read; the RFQ page shows pages per PDF and
  what the next read counts; a package bigger than what is left gets a 402 naming both numbers.
- Billing, part 3: allowance emails (2026-11-25): owners and admins get one email when an AI read
  brings the month's RFQs to 80% of the plan's allowance and one at 100%, deduplicated per shop,
  month and threshold by an `allowance_notices` row inserted before the send (migration 0012). The
  next plan's allowance and price are named only while checkout is on; dark, it says paid plans are
  not on sale yet. docs/BILLING.md, "Allowance emails".
- Rate-card import (2026-11-25): an admin imports machines, materials or finishing ops from the
  shop's own sheet (.xlsx or CSV chosen on the rate-card page, or rows pasted from Excel/Google
  Sheets), read in the browser and never uploaded (`src/shared/sheet/`, copied from apps/payapps).
  `src/shared/rate-card-import.ts` finds the header under a title block, maps columns by name
  ("Shop rate ($/hr)", "Setup (hrs)", "Price per lb", "Lot minimum", "In-house?", "Lead time
  (weeks)"), and refuses what it cannot read for certain: a bare 0.05 for a percentage, $/kg or
  g/cm³ columns, a material "Price" that does not say per lb or per piece, a "Setup" column with no
  unit, negative or non-numeric amounts. Rows match the card by name (case and spacing ignored):
  a match updates only the columns the sheet has, a new name is added (a machine with no kind is
  "other", with a warning), a retired rate is made active again. The preview shows new / updates
  which fields / un-retires per row; `POST .../rate-card/import` re-plans and re-validates against
  the shop's own card and writes all rows in one D1 batch, or nothing (400 naming each row). Blank
  CSV templates per kind. Fixed on the way: `PATCH` of a machine or finishing op reset every field
  not sent to its default (zod fills defaults inside `.partial()`) and un-retired the row; the
  schemas are now fields (no defaults) + input (defaults).
- Rate-card export (2026-11-25): the import panel downloads the card's current machines, materials
  or finishing ops as a CSV (`exportRateCsv` in `src/shared/rate-card-import.ts`) in the layout the
  import reads back, with Pricing basis and Active columns, retired rates included. An unedited
  export imports as "no change" on every row; an edited price comes back as that one change; the
  same file loads another shop's empty card as new rates (tested per kind). UTF-8 with a BOM for
  Excel; a name starting with = + - @ is written with a leading apostrophe so a spreadsheet does not
  run it as a formula, and the import strips that apostrophe.
- Win/loss analytics (2026-11-25): a "Win/loss" page (`/app/:orgId/win-loss`, any member) over the
  last 90 days, 12 months or all time, counted from the shop's decided quotes by the pure
  `src/shared/win-loss.ts`: win rate (won / (won + lost), expired shown but not counted) and won
  value by customer (names matched by case and spacing), material (customer-supplied its own row),
  machine, and markup band (markup + minimum top-up over cost on each line's first break, the
  headline break); the cost-weighted markup of won vs lost quotes; lost reasons tallied; and "what
  price did we win at": each part's won and lost quotes, newest first, with every quantity break's
  unit price, linked to the quote. Rows under 5 decided quotes say "few". `GET
  /quotes/analytics?window=90|365|all` reads at most 2,000 quotes (two queries, no IN list) and says
  when it truncated. No migration.
- Win/loss analytics, part 2 (2026-11-25): the Win/loss page adds "Win rate by month" (calendar
  months of the decision date in UTC, oldest first, empty months between the first and last shown
  as zero rows, a bar per month, "few" under 5 decided; hidden with a single month) and "By
  estimator" (the member who created the quote, the same person the expiry email goes to; a
  deleted account counts as "Former member"). "Download CSV" (`GET
  /quotes/analytics.csv?window=90|365|all`, any member) gives one row per decided quote in the
  window, newest first: quote, customer, estimator, outcome, decided date, quoted total at the
  smallest quantity, won amount, cost-weighted markup %, lost reason, part numbers. Money is a plain
  decimal, a BOM makes Excel read UTF-8, and text a spreadsheet would run as a formula gets the
  rate-card export's leading apostrophe (`csvField`). Same query and 2,000-quote cap as the page
  (`X-Truncated: true` when it cut). `winLossCsv`, `monthRange` and `estimatorLabel` in
  `src/shared/win-loss.ts`; unit tests for the UTC month edge, gap filling, the 120-month cap, the
  former-member row and the CSV's quoting; a worker test for two estimators in two months, the CSV
  headers and BOM, a formula-shaped customer name, the window, and another shop. No migration.
- Win/loss analytics, part 3 (2026-11-25): "By routing" and "By part family" on the Win/loss page.
  A decided quote counts once for each of the shop's saved routings its lines used, matched the way
  routing suggestions match (`lineUsesRouting`: the routing's operations in order, by machine and
  label, so a routing applied and then tuned still counts); lines with operations that match no
  saved routing count under "No saved routing". A part family row counts the quotes whose lines used
  any routing tagged with that family (case and spacing ignored). Routings are read as they are
  today, so editing a routing changes which past lines match; the page says so. Both cards are
  hidden when the shop has no saved routings (or no families). The CSV gains a "Routings" column
  (routing names, then "No saved routing"). Pure engine in `src/shared/win-loss.ts`
  (`quoteRoutings`), unit tests plus a worker test that another shop's routing never shows.
- Win/loss analytics, part 4: the shop's time zone (2026-11-26). Rate card, "Time zone": an IANA
  name (a picker of the browser's zone list, a "Use this computer's" button), checked against Intl
  and stored in its canonical spelling (`shop_settings.time_zone`, migration 0026; null is UTC).
  The Win/loss page's months and the CSV's "Decided (<zone>)" date read that calendar, so a quote
  won at 7 pm on 31 October in Chicago counts in October, not November; stored instants stay UTC.
  The plan allowance and AI ceiling months stay UTC on purpose (docs/BILLING.md): one month edge
  for every shop keeps the counter one SQL key.
- Quote dates on the shop's calendar (2026-11-26): the same time zone now dates the quote. The PDF's
  "Date" (preview and the frozen sent copy), the valid-until day of a new quote or revision (the
  shop's today plus its valid days), the daily expiry job's "past its day" and the day-before
  email's "today"/"tomorrow" all read `shopDay` (`src/shared/time-zone.ts`), so a quote sent at
  8 pm in Chicago is dated that day and good for 30 days from it, and a shop at UTC+14 or UTC-11
  sees quotes expire on its own midnight's side of the 11:17 UTC cron. The sweeps stay one query
  each: candidates bounded by UTC's calendar (no zone is more than a day from it), then each
  checked against its shop's day; worker tests in `test/worker/quote-dates-time-zone.test.ts`.
- Inbound RFQ email (2026-11-25): each shop can turn on `rfq+{token}@{INBOUND_EMAIL_DOMAIN}` (`rfq-` until 2026-11-26)
  (admins turn it on, replace or stop it; every member sees it on the RFQs page). The worker's
  `email` handler parses the message with an own MIME reader (`src/shared/mime.ts`: folded and
  RFC 2047 headers, RFC 2231 file names, base64 and quoted-printable, charsets, nested multiparts,
  forwarded `message/rfc822`, HTML bodies to text without regex over markup) and stores an RFQ with
  the body and the attachments the upload form accepts; the rest is listed as intake notes. No AI
  read on arrival; one RFQ per Message-ID; 25 MB, 50 a day per shop. Migration 0007. Off until
  `INBOUND_EMAIL_DOMAIN` is set and the domain's mail is routed to the worker (docs/EMAIL.md).
  Arrival emails (2026-11-25, part 2): each member turns on "Email me when an RFQ arrives" for
  themselves on the RFQs page; a new emailed RFQ sends each of them a notice (subject, claimed
  sender, file count, a link), never the body or attachments, with stranger-supplied text defanged
  so it cannot carry links. Not on a redelivery; current members only; a failed send keeps the RFQ.
  Migration 0010 (`member_notifications`).

- Routing templates (2026-11-25): "Save these operations as a routing" names a line's operations
  (machine, op label, setup and cycle minutes) and finishing steps, with an optional part family;
  the line editor's "Routing templates" picker lists the shop's routings (the chosen family first)
  and "Use routing" replaces the line's operations and finishing, "Add after" appends them (finishing
  the line has is not added twice; past 30 operations it refuses rather than truncating). Material,
  blank, extras and quantities are never touched, and a routing holds no prices: applying only
  changes the editor's inputs, which preview and save at today's rate card. Every machine and
  finishing id must be on the shop's own card (400 otherwise); retired ones are flagged. One name per
  shop (409), 200 at most; viewers read, estimators write. `routings` table (migration 0006),
  `src/shared/routings.ts`, `services/routings`, `GET|POST /routings`, `PATCH|DELETE /routings/:id`.
- Routings, part 2 (2026-11-25): a **Routings** page (nav) lists the shop's routings grouped by
  part family, with a filter past five; **Edit** changes a routing in place (name, family, each
  operation's machine, label, setup and cycle minutes, add, remove and reorder operations, finishing
  checkboxes) and saves only the fields that changed (`routingPatchFrom`). A retired or deleted
  machine already on a routing stays visible and flagged instead of being silently swapped, and a
  save that would keep a deleted id is blocked in the form. On a quote line, **Update routing from
  this line** overwrites the chosen routing with the line's operations and finishing (shown only
  when they differ, `lineMatchesRouting`). Both send `ifUpdatedAt`, so a second estimator's stale
  copy gets a 409 ("Someone else changed ... Reload") rather than undoing the first edit. Quotes
  that already used a routing keep their own operations; it holds no prices.
- Routings, part 3: suggestions (2026-11-25): above the line's routing picker, up to three of the
  shop's routings are suggested from the line's material and description, each with the evidence it
  rests on ("Used on 3 earlier lines in Aluminum 6061-T6 plate (2 won); its name matches
  "bracket""). Evidence comes only from the shop's own records: earlier lines (its newest 1,000,
  superseded revisions and the line itself left out) whose operations contain the routing's, by
  machine and label in order, so a tuned cycle time or an appended routing still counts; and
  description words in the routing's name or family or in the descriptions of lines that used it.
  A routing with no evidence is never offered. Clicking one picks it; applying stays the normal
  "Use routing" step. `src/shared/routing-suggest.ts` (pure, unit-tested), `suggestRoutingsFor` in
  `services/routings`, `GET /routings/suggestions?materialId=&description=&lineId=` (viewer).
- Routings, part 4: material family (2026-11-25): a suggestion also counts earlier lines in another
  rate-card row of the same alloy, so a routing used on "6061 bar" is offered for "6061-T6 plate"
  ("Used on 2 earlier lines in other 6061 stock (1 won)"). `materialFamily` reads the family from
  the row's name only: the first numbered grade that is not a size (6061, 304 for 304L, 17-4, A36,
  C360, D2; tempers like -T651 dropped; decimals, fractions, 2x4 and numbers with a unit are sizes),
  or, with no number, the name's words without form words ("Delrin rod" and "Delrin plate" are
  "delrin"). No synonyms ("acetal" is not "delrin") and no family for a name like "Alloy 20", so a
  suggestion never rests on a guess about which materials are alike. Scored 2 per such line and 1
  more if won, between the same row (3 + 2) and other materials (1). Retired rows still give their
  old lines a family.
- Deploy pipeline (2026-11-25): `.github/workflows/jobshop-quote-deploy.yml` (manual, ported from
  payapps): checks, build, `scripts/provision.mjs` (creates D1 `jobshop-quote` and R2
  `jobshop-quote-files`, which is required here, and writes the deploy config with the database id
  and an optional custom domain), D1 migrations before the code, the Paddle catalog sync, `wrangler
  deploy` with production `APP_URL`, `EMAIL_FROM`, `BILLING_PROVIDER`, `INBOUND_EMAIL_DOMAIN`, secrets
  (Anthropic key, Paddle, AUTH_SECRET generated once) and a `/api/health` smoke test. `docs/DEPLOY.md`.
  Checked with `wrangler deploy --dry-run`; not yet run against the account.
- Legal pages (2026-11-25): Terms of Service, Privacy Policy, Refund Policy and Acceptable Use
  Policy in `docs/legal/*.md`, ported from payapps' drafts and rewritten for this app (prices come
  from the shop's own rate card; the AI's reading is a suggestion an estimator confirms; drawings and
  CAD are stored per shop; no ITAR/EAR/CUI uploads; Cloudflare incl. Workers AI, Anthropic and Paddle
  named as subprocessors, with exactly what the model sees for extraction and for cover notes; no
  training on customer data). Bundled into the Worker by `docs/legal/sync-documents.mjs` (a unit test
  fails on drift), public at `GET /api/legal` and `/api/legal/:key` and at `/legal/:key` in the SPA
  (copied safe markdown renderer, no raw HTML). Each user accepts the current `POLICY_VERSION` once
  (`legal_acceptance`, migration 0009; `POST /api/me/legal/accept` refuses a stale version):
  onboarding and the shop are behind the notice until then. Sign-up links the four documents; every
  signed-in page and the auth pages have them in the footer. Still drafts: the owner confirms the
  operator name and contact email, and the agent legal review checks them (no outside counsel: owner, 2026-11-26) (`docs/DEPLOY.md`).
- Phone width (2026-11-25): no page of the signed-in app scrolls sideways on a 390 px screen.
  The cause was not the line editor's grid but the price table: a browser gives `<fieldset>`
  `min-inline-size: min-content`, so the nine-column table (476 px) stretched the whole line, and the
  page, to 509 px once a line had prices. `fieldset { min-inline-size: 0 }` in `styles.css`, explicit
  `grid-cols-1` tracks (minmax(0, 1fr)), and the table scrolls inside its own box with the Qty column
  pinned and a "Swipe the table for unit price and total" hint on phones. Operation rows stack two
  to a row below 640 px with a "Remove" button (the ✕ stays on wider screens); the extras row puts
  the label on its own line. The line's two-column layout starts at 1280 px instead of 1024 (at
  1024 the table was 12 px wider than its half). RFQ detail (460 px: card headers whose action
  buttons never wrapped, now `flex-wrap` in the shared `Card`) and Team (406 px: table now scrolls
  in its box) fixed too. `node scripts/phone-width.mjs` (with `pnpm demo` running; needs Playwright)
  seeds a priced quote and checks all 11 signed-in pages; it failed on the quote and RFQ pages
  before this change and passes after. Measured at 390, 640, 768, 1024, 1280 and 1440 px.
- Sheet-metal operations from a DXF (2026-11-25): machines take three optional rates, cut speed
  (in/min), pierce seconds and seconds per bend (rate-card form, CSV import with "IPM"/"feed rate"
  read as cut speed and a pierce or bend time in minutes refused, export round trip). A quote from an
  RFQ whose part has a DXF flat pattern starts with "Cut from DXF: 84.3 in at 300 in/min + 5 pierces
  × 1.5 s" on the one machine with a cut speed and "Bend from DXF: 2 bend lines × 8 s" on the one
  with a bend time; nothing when two machines qualify, the outline or holes are low confidence, or
  the bend lines are only dashed. Tested in the unit suite, against a generated inch DXF through the
  real parser, and end to end in workerd.

- Cut speed per material and thickness (2026-11-25, item 5): laser, waterjet and plasma speeds
  swing several-fold with alloy and gauge, so one speed per machine mis-timed most DXF parts. The
  rate card's new "Cut speeds by material" card stores a cutting machine's speed (and optionally
  its pierce time) on one material row; material rows already carry the sheet thickness, so a row
  is that alloy at that gauge (`cut_speeds`, migration 0018, one row per machine and material, PUT
  replaces). A DXF part quoted in that material is timed at that speed, labelled "(rate for A36
  plate 0.5 in)"; when only one machine has a speed for the material it gets the cut even if
  several machines have a default speed (before, two cutters meant no suggestion at all). With no
  row for the material, the machine's default speed applies as before. Rows on a retired machine
  are ignored; mills and other non-cutting machines are refused; another shop's machine, material
  or row is a 404. Speeds come only from the shop's own cut charts: none are assumed. Tested in the
  unit suite (`costing.test.ts`) and end to end in workerd (`test/worker/cut-speeds.test.ts`,
  including the cross-tenant and role checks).

- Cut speeds from the shop's cut chart (2026-11-25, item 5): a shop's speeds already live in a cut
  chart (a laser maker's table or the shop's own sheet), so typing them one pair at a time was the
  chore that kept the table empty. The rate-card import now takes "Cut speeds by material (cut
  chart)": a CSV, an .xlsx worksheet or a paste with Machine, Material and speed columns (pierce
  optional), each row matched by name to a cutting machine and a material already on the card
  (`src/shared/cut-speed-import.ts`, `POST /rate-card/cut-speeds/import`). Metric and feet charts
  convert by exact factors only (mm/min and m/min by 25.4, ft/min by 12, pierce ms by 1000), each
  noted on the row; in/sec, a pierce count and thickness columns are left out with the reason
  (thickness comes from the material row). An unknown, retired or non-cutting machine, an unknown
  material, a pair listed twice, a zero and a new pair without a speed are row errors, and one error
  saves nothing; rows that change nothing are not written. "Download the N speeds on the card now"
  exports them sorted by machine and thickness, guarded against spreadsheet formulas, and the export
  reads back as no change (a retired machine's unchanged rows included). Tested in the unit suite
  (`cut-speed-import.test.ts`) and in workerd (`test/worker/cut-speeds.test.ts`: all or nothing,
  estimator 403, another shop's names never resolve).

- CAD upload hardening (2026-11-25): STEP and DXF files over 1 MB (`INLINE_GEOMETRY_MAX_BYTES`) are
  stored without measuring, so a slow STEP cannot run the upload out of CPU (30 s per request, and an
  upload may carry 10 files). The RFQ's Source card says "Not measured yet" with a Measure button
  (estimators) that measures one file per request (`POST /rfqs/:id/files/:fileId/measure`); on
  success the RFQ's parts with no geometry are linked to it by extraction's rule (file name contains
  the part number, or the only file of a one-part RFQ), so a quote made afterwards gets the CAD
  suggestions. A file that gives nothing is marked once ("Could not measure this CAD file") and not
  offered again. Basis for 1 MB: 76 ms for a 166 KB STEP in Node (about 0.5 ms per KB), so ten 1 MB
  files stay near 5 s; a linear estimate, not a measurement of a large file. No migration.

- E2E Playwright suite (2026-11-25): `pnpm test:e2e` (`scripts/e2e-run.sh`, `playwright.config.ts`,
  `test/e2e/`), offline on a fresh local D1 built from the committed migrations (port 5198, state in
  `.wrangler/e2e`). `01-rfq-to-quote` drives the browser from sign-up through a typed rate card, a
  pasted RFQ (each extracted value shows its RFQ quote and starts unconfirmed), one confirmed part, a
  priced line checked cell by cell against figures worked by hand in the spec, the PDF, Mark sent and
  Won, to the quote log and win/loss. `02-tenant-isolation` checks a second shop gets 403/404 on
  every read and write of the first's RFQ, quote, PDF and rate card, and 401 signed out.
  `03-phone-width` is `scripts/phone-width.mjs` as a test; the script's page list held
  `/rate-card/import` and `/account`, which are not routes, so it had been measuring the "Page not
  found" screen and printing "ok" (the spec now fails on a page with no app layout and measures the
  import panel opened on the rate card). Seeded fault: dropping scrap from the material cost in
  `costing.ts` fails `01` on the price table. New CI job `e2e` in `jobshop-quote-ci`.
- Inbound RFQ email, sender allowlist (2026-11-25, migration 0021): admins list who may email RFQs
  in (an address or a whole `@domain`, with subdomains); empty accepts anyone. Mail passes on the
  envelope sender or the From header, so a shop forwarding from its own domain works; other mail is
  refused with a "contact the shop" reason before anything is stored. The last 10 refused senders
  show under the list with an "Allow" button. A noise filter, not authentication (docs/EMAIL.md).
  Pure parse/match in `src/shared/sender-allowlist.ts` (unit tests), five worker tests (roles,
  normalising, a bad entry saving nothing, refusal and both match paths, the refused list's order
  and cap, per-shop isolation).
- Inbound RFQ email, sender checks (2026-11-25, no migration): a listed address now counts only
  when Cloudflare Email Routing's own `Authentication-Results` (the first header, authserv-id
  `mx.cloudflare.net`, as Cloudflare's docs say) backs it: DMARC pass or an aligned DKIM pass for
  the From header, SPF pass for the envelope. A forged listed sender is refused with its own reason
  and shown as "failed SPF/DKIM/DMARC" without an "Allow" button; with no list, a DMARC failure
  becomes an intake note. Fails closed when the header is missing. RFC 8601 parser in
  `src/shared/sender-auth.ts` (10 unit tests: comments cannot smuggle a result, a joined
  `Headers.get` value keeps only the first header) and two worker tests (six forgeries refused,
  including a sender-written "pass" below Cloudflare's, a pass for another domain, and the real
  buyer through both header paths).

- Removal rate per material (2026-11-25, item 5): a mill clears aluminum several times faster than
  steel and far faster than titanium, so one removal rate per machine mis-timed every "Rough from
  CAD" suggestion outside the alloy it was measured in. The rate card's new "Removal rates by
  material" card stores a roughing machine's in³/min on one material row (`removal_rates`,
  migration 0022, one row per machine and material, PUT replaces, `PUT/DELETE
  /rate-card/removal-rates`). A STEP part quoted in that material is roughed at that rate, labelled
  "(rate for Aluminum 6061-T6 plate)"; when only one active machine has a rate for the material it
  gets the roughing even if several machines have a default rate (before, two rated machines meant
  no suggestion). With no row for the material, the machine's default rate applies as before; two
  machines with a rate for the same material leave the choice to the estimator. Rows on a retired
  machine are ignored; lasers and other non-roughing machines are refused (mills, lathes, mill-turn
  and Swiss, or any machine with a default rate); another shop's machine, material or row is a 404.
  Rates come only from the shop's own cuts: none are assumed. Tested in the unit suite
  (`costing.test.ts`) and end to end in workerd (`test/worker/removal-rates.test.ts`, including the
  cross-tenant and role checks).

- Peck time for deep holes (2026-11-26, item 5): deep holes (over 3×D) were only flagged in the
  drilling label, so a 6×D hole was quoted as one straight plunge and the estimator added the peck
  retracts by hand. Each machine now takes an optional peck depth in drill diameters (the G83 Q as a
  multiple of D) and seconds per peck (one retract to clear chips and back to depth) on the rate card
  and in its spreadsheet import and export ("Peck depth (xD)", "Peck (×D)", "Seconds per peck",
  "Peck time (s)"; a peck depth in inches or a time in minutes is refused with the reason rather
  than converted). With both set, "Drill from CAD" adds ceil(depth / (peck × D)) − 1 pecks per deep
  hole at that time and names them in the label ("+ 5 pecks × 2 s (1 deep, pecked every 1×D)");
  holes at or under 3×D drill in one plunge, and with either value missing nothing changes. A time
  per peck rather than a rapid rate: short retracts are bound by the machine's acceleration more than
  its rapid traverse, so one measured cycle is the better input. Pure `extraPecks` in
  `src/shared/costing.ts` (`costing.test.ts`), migration 0025, end to end in workerd
  (`test/worker/geometry.test.ts`, a zero peck depth refused).

- Removal rates and drill feeds from a spreadsheet (2026-11-26, item 5): both per-material tables
  were typed one machine-and-material pair at a time, the same chore that kept the cut-speed table
  empty until it took a CSV. The rate-card import now takes "Removal rates by material (roughing)"
  and "Drill feeds by material" sheets (`src/shared/material-rate-import.ts`, the same two pure
  steps as the cut chart, in the browser for the preview and again in the Worker): a CSV, a paste
  from Excel or Google Sheets, or a worksheet of an .xlsx, with columns machine, material and the
  value. Headers are read loosely ("Work center", "Alloy", "Material removal rate (in³/min)",
  "MRR", "Penetration feed IPM"); cm³/min and mm³/min convert by the exact inch (16.387064 cm³ to
  the in³) and mm/min by 25.4, each conversion shown on the row; a feed per revolution or per
  tooth is refused with the reason (it needs the spindle speed, which the app never assumes).
  Names match rows already on the card (case and spacing ignored), never create them; a laser in
  a removal-rate sheet or a drill feed for a saw is refused, as are duplicates, retired rows that
  change, new pairs without a value and values over the editor's limits. One bad row saves
  nothing (`POST /rate-card/removal-rates/import`, `POST /rate-card/drill-feeds/import`, admins
  only, one D1 batch); "download the N rates on the card now" exports the table with each
  machine's default as a read-only last column, and the export imports back as "no change".
  Tested in the unit suite (`material-rate-import.test.ts`) and in workerd
  (`test/worker/material-rate-import.test.ts`, including the role and cross-tenant checks).

- The RFQ's own email thread kept on the quote (2026-11-26, item 6): a quote emailed back to the
  buyer threaded on the RFQ's Message-ID alone, so a buyer whose RFQ was a reply (to an earlier
  quote, or inside their own purchasing thread) got a quote that a client which
  builds threads from the whole `References` chain could split off. Intake now stores the RFQ's chain
  (`rfqs.thread_references`, migration 0024: its `References`, else a lone `In-Reply-To`, RFC 5322
  § 3.6.4) and the quote's `References` is that chain then the RFQ's Message-ID, safe ids only, cut
  to 20 ids and 900 characters keeping the root and the newest (`src/shared/quote-email.ts`,
  docs/EMAIL.md). Tested in the unit suite (`quote-email.test.ts`, `mime.test.ts`) and in workerd
  (`test/worker/inbound-email.test.ts`, `test/worker/quote-email.test.ts`).

## Next

3. **launch** Owner: confirm the operator name and contact email in `docs/legal/*.md` and have
   counsel review them (the pages ship as drafts, each says so); run `jobshop-quote-deploy` once, onboard the sender domain,
   pick `JOBSHOP_DOMAIN`, and add `push: branches: [main]` (docs/DEPLOY.md, "Before strangers sign
   up"). Inbound RFQs: set `JOBSHOP_INBOUND_EMAIL=on` and `CLOUDFLARE_EMAIL_ROUTING_TOKEN` (item 8).
4. Billing, part 4 (the RFQ page's 80%/100% banner for every member done 2026-11-25; the deploy
   workflow's Paddle catalog sync was already in `jobshop-quote-deploy.yml`; the "you are at 100%"
   note on the New RFQ form itself done 2026-11-26; the per-RFQ "this package needs N reads and M
   are left" note before submit, pages counted in the browser by the worker's rule, done
   2026-11-26, docs/BILLING.md; the RFQ page already shows what the next read will count): splitting a
   large packet into one RFQ per part, if shops ask for it.
5. Geometry: `packages/cad-features` is wired in (`CadFeaturesGeometry`: STEP solids and ASCII DXF
   flat patterns, per-field confidence and flags shown on the RFQ; a solid's box pre-fills the blank
   and, with exactly one machine with a measured removal rate, a "Rough from CAD" operation; a DXF
   pre-fills "Cut from DXF" and "Bend from DXF" operations from the cut length, pierces and bend
   lines at the shop's cut speed, pierce seconds and seconds per bend, done 2026-11-25; a STEP solid's
   hole locations, counterbores counted once and bores over 1 in left out, pre-fill "Drill from CAD"
   at the machine's seconds per hole, done 2026-11-25; plus each hole's depth at the machine's drill
   feed in in/min, deep holes over 3×D counted in the label, done 2026-11-25; tapping: the estimator
   ticks which drill-sized hole sizes are threaded on the RFQ review and the quote adds "Tap from
   CAD" at the machine's seconds per tapped hole, done 2026-11-25). Next: tap size and pitch per
   ticked size (a per-size time, or rigid tapping from pitch and rpm) if one time per hole proves
   too coarse; drill feeds by material (rate card "Drill feeds by material", one in/min per
   drilling machine and material row, overriding the machine's default feed; a machine with a feed
   for the line's material becomes the drilling machine, done 2026-11-25; the same rows in the
   rate-card spreadsheet import/export done 2026-11-26; next: a split by diameter if one feed per material proves too
   coarse); peck time for deep holes (per-machine peck depth ×D and seconds per peck, done
   2026-11-26; next, if shops ask, a peck depth that shrinks with depth, G83 with a decreasing Q); a per-sheet
   material priced by nest yield (the sheet-metal blank from the DXF's flat size × the material row's
   sheet thickness done 2026-11-25; cut speed per material and thickness, and its CSV
   import/export from a cut chart, done 2026-11-25); STL done 2026-11-26 (binary and ASCII meshes:
   box, area, and the volume of a closed mesh; an STL has no units, so it is read in assumed mm at
   low confidence, which suggests nothing, until an estimator picks millimetres or inches on the
   RFQ page and the file is measured again in that unit; the same chooser serves a DXF with no
   `$INSUNITS`); IGES done 2026-11-26 (ASCII fixed-format 5.x: units from the Global section,
   the box from trimmed faces (144/143 and 186 B-rep faces), measured by their model-space edges and,
   for B-spline faces, a grid kept inside the (u, v) trim loops, so an oversized trimmed plane does
   not inflate it; a curved face that may reach past what was measured flags
   `bbox-may-underestimate` with the most it can be off per axis, from the control points or the
   full sweep; no volume or holes, ask for STEP; packages/cad-features/README.md, "IGES"); next:
   IGES holes from 192 cylinders and revolved lines if shops send IGES for drilled parts, the
   parent-matrix rule checked against a real exporter's file, and holes from an STL mesh (cylinder
   fitting) if shops send STL for machined parts; removal rates by material (done 2026-11-25; from a CSV in the rate-card import
   done 2026-11-26). Hardening
   (size threshold done 2026-11-25): a queue consumer that measures large files in the background
   if shops find the Measure click a chore; time a real 10-15 MB STEP in workerd to replace the
   linear estimate behind the 1 MB limit.
6. Email the quote, part 4 (signature, the estimator's copy and threading into the RFQ email done
   2026-11-25; the RFQ's own `References` chain kept ahead of its Message-ID, done 2026-11-26,
   docs/EMAIL.md): a per-estimator signature line if shops ask for one beyond the shop-level block.
8. Inbound RFQ email, part 2 (the quote email threaded to the customer's RFQ, and the optional
   per-shop sender allowlist with the last refused senders and an "Allow" button, done 2026-11-25;
   routing as code done 2026-11-26: a catch-all is apex-only, so addresses are `rfq+{token}@` on
   `rfq.marisstella.app`, matched by one literal rule with subaddressing, applied by
   `scripts/email-routing.mjs` from the deploy with `JOBSHOP_INBOUND_EMAIL=on`, docs/EMAIL.md
   "Routing as code"). Owner: the routing token and the variable. The sender check that reads
   Cloudflare's `Authentication-Results` (a listed address counts only when DMARC, an aligned
   DKIM signature or SPF backs it; a DMARC failure noted on unlisted shops' RFQs) is done
   2026-11-25 (docs/EMAIL.md, "Sender checks"). Next: check it against a real message through
   Email Routing once the inbound domain is live (the parser follows Cloudflare's documented
   example and RFC 8601; the live header's exact properties are not yet seen).
9. Routings, part 4 (suggestions from material and description done 2026-11-25): learn from which
   suggestion the estimator picked, if shops use them; match material by family ("6061" plate vs
   bar) rather than the exact rate-card row (done 2026-11-25: `materialFamily`; next, if shops ask,
   a family the shop sets per row when its names carry no grade). Repeat parts, part 4 (the stale label and the
   "won before at a different revision" prompt with both RFQs' files done 2026-11-25): a
   side-by-side drawing viewer in the app, if opening the two files in tabs proves a chore.
10. Win/loss analytics, part 4 (by estimator, by month, the CSV, and by routing and part family
    done 2026-11-25; the shop's own time zone for month edges done 2026-11-26, and for the dates
    printed on quotes, valid-until days, expiry and the expiry email's "tomorrow", done
    2026-11-26; and for the dates the app's pages print, the quote log, the RFQ list, "Sent" on a
    quote, part history, won-price dates and invite expiry, done 2026-11-26, `useShopDay`): routing rows from the routing a line was built from, if lines ever store it (today they are
    matched against the saved routings as they stand).
11. Rate-card import, part 3 (settings from the same sheet done 2026-11-26: "Shop settings" in the
    import reads label/value rows anywhere on the sheet, so a block of markups above the machine
    table imports in one paste; "Markup" alone, "Margin" and "Minimum order" are left out with the
    reason, never mapped to the nearest setting; the export reads back unchanged;
    `src/shared/settings-import.ts`): a way to clear a value from the sheet (a blank cell leaves it
    as it is today); an .xlsx export; the remaining settings (lead time text, terms) if shops keep
    them in the sheet. Multiple currencies.
12. E2E suite, part 3 (part 1 done 2026-11-25; part 2 done 2026-11-26: a STEP file attached to
    an RFQ and measured by the real parser, its blank on the quote line, the quote email recorded
    offline, a revision and its changes view with the PDF summary, an invited estimator's role
    limits in the page and the API, and the rate-card spreadsheet import with an update):
    a drawing PDF attached (the fake converter reads bytes as text, so it needs a converter
    fixture the server can find), a DXF flat pattern's cut and bend suggestions, the CSV export.

## Open questions for the owner

- Price point and plan limits: built as per-shop with an RFQ allowance (the pricing page's
  proposal, docs/BILLING.md); say if per-estimator-seat pricing should replace it.
- Whether quotes should carry the shop's logo (needs an image in the PDF writer).
