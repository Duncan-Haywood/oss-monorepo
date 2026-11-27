# Job Shop Quote: Roadmap

Bet #2 of the 2026-11-24 direction (paid vertical software for SMBs): AI RFQ-to-quote for CNC and
fabrication job shops. Pricing and the paid path stay dark until the items marked **launch** are done.

Status: **live on the free Early access plan** (2026-11-27). First production deploy: jobshop-quote-deploy
run 46013246899 (manual, main at e8be3de0f), on the account's workers.dev address; the smoke test answered
`{"ok":true,"app":"jobshop-quote","email":true,"files":"d1"}`, so sign-up email works and files are kept
in D1 (no R2 yet). AI extraction is off (no `JOBSHOP_ANTHROPIC_API_KEY`; the owner's choice, LAUNCH-REVIEW.md
section 1), inbound RFQ email is off, paid plans are dark. The workflow now defaults to
`jobshop-quote.marisstella.app` (PR #19764); the next run moves the app there. No customers yet.

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
- Quote follow-up (2026-11-26, bets.md growth path "quote follow-up and win rates"): sending a quote
  sets its first follow-up day, the shop's today plus "First follow-up, days after sending" (a
  weekend day moves to the Monday, added 2026-11-26) (3 by
  default, 0 off, admins set it on the quote log; `shop_settings.follow_up_days`). The quote log
  opens with a "Follow up" card: the shop's sent quotes whose day has come, longest overdue first,
  with contact, total, sent day, valid-until, estimator, the last note and how many were logged,
  and "Show N coming up in the next 7 days". "Log follow-up" (there and on the quote page's
  Follow-up card) takes what happened and the next day: in 1, 2, 3, 7 or 14 days, a date up to 180
  days out, or "No more follow-ups"; a note alone is refused only if the day stays the same. The
  quote page keeps the log (who, day, note, next). Each morning, after the expiry emails, each
  estimator gets one email listing their own quotes due that day, once per day set
  (`follow_up_reminded_for`), skipping quotes the expiry email already names; off per member on
  the quote log. Won, lost, expired and superseded quotes are never due. Migration 0035
  (`quote_follow_ups`, `quotes.follow_up_on`); `src/shared/follow-up.ts`,
  `services/quotes/follow-ups.ts`, docs/EMAIL.md "Quotes due for a follow-up"; unit, worker
  (tenancy, roles, once-per-day mail) and e2e (`test/e2e/12-quote-follow-up.spec.ts`) tests.
- Material price lists, part 1: price dates and history (2026-11-27, bets.md growth path "material
  price lists"): each material row carries the day its price was last set (`materials.price_set_at`;
  only a change to the price it charges by, $/lb or $/stock piece, or a change of basis moves it,
  never a name, density, scrap or sheet-size edit) and a price history (`material_price_changes`:
  added, edited, imported, who, when; written in the same D1 batch as the row, so an import stays
  all or nothing). Migration 0036 dates existing rows by their last edit and gives each one
  "baseline" history row (the price on the card when history began), so no earlier price is
  invented. The rate card's Materials table shows "Price set N days ago" (amber past the limit),
  a History panel per row ("$4.25/lb, up 6.3% from $4.00/lb (imported by Pat)") and a "New price"
  button for the supplier's latest quote (a material's price could only change by import before).
  Shop settings take "Material price limit (days)", 90 by default, blank off
  (`shop_settings.material_price_max_age_days`). A draft quote line on a material past the limit
  says so with the shop's own date, and a line priced before the card's price changed says what it
  was priced at and what the card has now, so the estimator presses Re-price; nothing re-prices on
  its own and sent quotes keep their price. `GET /rate-card/materials/:id/prices` (any member,
  newest first, 50 rows). `src/shared/material-price.ts`; unit and worker
  (`test/worker/material-prices.test.ts`: edits, imports, limit, roles, cross-tenant) tests.
- Material price lists, part 1b: "Still good" and the phone-width fix (2026-11-27). A material past
  the limit has a "Still good" button (and the amber note "All N still good" for several): the
  admin checked the supplier and the price stands, so the row is dated now with its price unchanged
  and a "confirmed still good" history row, all in one D1 batch (`confirmMaterialPrices`, `POST
  /rate-card/materials/confirm-prices`, admins; a retired material is a 400 and another shop's a
  404, nothing saved). Before, the only way to clear the warning was to re-type the same price,
  which the history then could not tell from a real change. The price-date column and the row
  buttons had widened the Materials table to 526 px, so the rate card scrolled sideways on a 390 px
  phone (`test/e2e/03-phone-width.spec.ts` failed on main); the table now scrolls in its own box like
  the other rate-card tables, and the buttons wrap. Worker tests in
  `test/worker/material-prices.test.ts` ("Still good").
- Material price lists, part 2a: "quotes this changes" (2026-11-27). When a material's card price
  moves, the Materials card lists every open quote (drafts and sent quotes not yet won, lost,
  expired or superseded) with a line priced at a price the card no longer has: per material, the
  quote (linked), customer, status, the price it was priced at and the move ("priced at $4.50/lb,
  up 8.0%"), a line count when several lines use it, and what to do (drafts: Re-price; sent: the
  customer saw the old price, revise if it matters). A "Moved by at least" filter (any change, 1,
  2, 5, 10%) hides small moves; a change of basis or a first price cannot be measured as a
  percentage and is always listed. Read only: nothing re-prices and sent quotes keep their price.
  `GET /rate-card/materials/price-impact?minPct=` (any member; newest 2,000 open quotes, says when
  it stopped; two queries, no IN list). Pure `src/shared/material-price-impact.ts`; unit, worker
  (`test/worker/material-price-impact.test.ts`: drafts and sent listed, won left out, threshold,
  Re-price clears it, roles, cross-tenant) and e2e (`test/e2e/13-material-price-impact.spec.ts`,
  including 390 px) tests. No migration.
- Material price lists, part 2b: a supplier's price sheet (2026-11-27; migration 0038). The
  Materials import (the rate-card "Import from a spreadsheet" card, kind Materials) takes an
  optional supplier and price-list date, typed by the admin; each history row the import writes
  (a new material, or a row whose price or basis changes) keeps both, and the History panel says
  "(imported by Pat, from Acme Metals's price list dated 2026-11-20)". A date that is not a real
  YYYY-MM-DD day refuses the import, nothing saved. Before saving, each row that changes a price
  shows the move ("Price: $4.86/lb, up 8.0% from $4.50/lb", per lb, per piece, per foot or a change
  of basis) and the open quotes priced at another price for that material, linked, with customer
  and status, and a line under the table counts them (drafts: Re-price after saving; sent quotes
  keep the price the customer saw). `POST /rate-card/materials/price-impact/preview` (admins, read
  only: prices that equal the card's and ids that are not the shop's are ignored, never an error).
  Fixed on the way: "quotes this changes" did not read `price_per_foot_cents`, so a per-foot
  material's price move listed no quotes. Pure `importPriceMoves` and `proposedPriceImpact` in
  `src/shared/material-price-impact.ts`, `priceListText` in `material-price.ts`; unit
  (`src/shared/material-price-import.test.ts`), worker (`test/worker/material-price-import.test.ts`:
  supplier and date kept, optional, bad dates refused, preview read only, roles, cross-tenant) and
  e2e (`test/e2e/14-supplier-price-sheet.spec.ts`, including 390 px) tests.
- Material price lists, part 2d: a per-foot row's bar setup edited in place (2026-11-27; no
  migration). A per-foot material's cut allowance, bar length and remnant could only be set when
  the row was added; a shop that switched to 20 ft bars or a wider saw blade had to retire the row
  and add it again, losing its price history. Each active per-foot row now has "Bar setup" beside
  New price: stock size, cut allowance, bar length, remnant (or scrap % when no bar length is set),
  and "Check a blank (in)", which says what a blank gets before anything is saved ("A 2.875 in
  blank: 3 in per part, 47 parts per bar now; 3.0625 in per part, 46 parts per bar with these
  settings", or that it is longer than the usable bar and the price would be blocked). Saving PUTs
  the row with the price untouched, so the price date and history do not move. A draft line priced
  with the old setup says so ("This line was priced with 1018 CRS at 0.125 in cut allowance, 144
  in bars (3 in remnant); the rate card now has 0.1875 in cut allowance, ... Re-price to use it.")
  after any price note; spellings the engine prices the same (no allowance and 0, a remnant on a row
  with no bar, scrap % with a bar) are not a change. Pure `src/shared/material-bar-setup.ts`
  (`barSetupMoved`, `blankCheckText`, `lineMaterialNotes`); unit, worker (in-place edit keeps the
  price date and history, re-counts parts per bar, estimator 403, other shop 404, remnant as long as
  the bar 400) and e2e (`test/e2e/16-material-bar-setup.spec.ts`, including 390 px) tests.
- Material price lists, part 2c: prices per cwt and per metre kept exactly (2026-11-27; migration
  0039). Steel service centers quote plate and structural by the hundredweight and metric mills by
  the metre; whole cents per lb or per foot could not hold $412.50/cwt ($4.125/lb) or $10.00/m
  ($3.048/ft), so the import used to refuse those columns. A per-lb material now keeps either a
  $/lb or a $/cwt price (`price_per_cwt_cents`), a per-foot material a $/ft or a $/metre price
  (`price_per_metre_cents`), never both (400). Costing derives the exact $/lb or $/ft
  (`lbPriceCents`, `footPriceCents` in `src/shared/material-price.ts`) and rounds only the line's
  material total, as before; the basis line shows the supplier's figure and the price it charges
  ("10 lb per part at $412.50/cwt ($4.125/lb)"). The Materials form has a "Price per" choice (lb
  or cwt, foot or metre), the table and New price use the card's unit, and the history and the
  "quotes this changes" moves read in it ("$440.00/cwt, up 6.7% from $412.50/cwt"). Re-entering
  the same price in the other unit dates it as a new price but does not flag open quotes for
  Re-price (`priceMoved`). The import reads "Price per cwt" / "Price/cwt" / "per 100 lb" and
  "Price per metre" / "per m" columns and basis cells ("per cwt", "per metre"); a sheet price in
  one unit clears the card's price in the other, a row with both is refused, and export and the
  workbook carry the two columns and read back as no change. Unit
  (`src/shared/material-price-cwt-metre.test.ts`) and worker
  (`test/worker/material-price-cwt-metre.test.ts`: D1 round trip, exact preview, history, both
  units refused, the import swapping $/lb for $/cwt, another shop) tests.
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
- Rate-card workbook (2026-11-26): "Download the whole rate card as one Excel file" on the import
  panel (open or closed) writes one .xlsx with a tab per sheet the import reads (Shop settings,
  Machines, Materials, Cut speeds, Removal rates, Drill feeds, Finishing), each tab exactly that
  kind's CSV export (`src/shared/rate-card-workbook.ts`). The writer is ours, no library
  (`src/shared/sheet/xlsx-write.ts`: plain XML parts, a hand-built ZIP, CompressionStream):
  amounts are real numbers Excel can sum ("95.00" keeps two decimals on screen), percentages are
  percent-formatted fractions, names and descriptions stay text ("1.50" in a stock description
  comes back "1.50"), a name starting with "=" is an inline string and never a formula, the header
  row is bold and frozen, and the same card gives the same bytes. Choosing the file on the import
  panel opens the tab for the kind already picked, and picking a tab by name sets the kind, so
  any edited tab imports back; every tab of an unedited workbook imports as "no change" and an
  edited price as that one change (`rate-card-workbook.test.ts`). Checked by hand in openpyxl and
  LibreOffice (formats 0.00, 0%, 0.00%; "=X" as text).
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
- Win/loss by the routing a line was built from (2026-11-26). Lines record the saved routings they
  were built from (`quote_lines.routing_ids`, migration 0030): "Use routing" records only that one,
  "Add after" adds it, and saving a routing from the line or updating one from it records that
  routing; Save stores it with the line (the PATCH drops ids that are not this shop's routings).
  Revisions, repeat-part pre-fills and "Use these inputs" copies carry the record. "By routing",
  "By part family" and the CSV's "Routings" count the record, so a line built from "Plate" and tuned
  down to one op counts as "Plate", not as whatever routing it now resembles; a routing deleted since
  counts under "Routing since deleted"; lines with no record still match by operations.
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
  operator name and contact email, and counsel reviews them (`docs/DEPLOY.md`).
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
  Measured 2026-11-27 (docs/GEOMETRY-LIMITS.md, geometry-large-step-timing): 15 real STEP files,
  0.4 to 12.9 MB (NIST test models, Onshape exports), timed in workerd at 0.03 to 0.19 ms per KB
  (12.9 MB in 1.3 s), so CPU never limits; memory does: the 12.9 MB file needed 198 MB of V8 heap
  against the isolate's 128 MB, and a request killed for memory cannot record its failure, so its
  Measure button would fail on every click. The STEP parser now keeps lists at exact size and names
  once (132 MB for that file, same results on all 36 files), and a CAD file over 6 MB
  (`MAX_MEASURE_BYTES`; every real file up to 6 MB fitted in 78 MB) is stored with the reason
  ("Over 6 MB, too large to measure here ...") and never offered Measure.
  `packages/cad-features/scripts/heap.ts` finds the heap a file needs.

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

- Shop logo on the quote PDF (2026-11-26, the open question "whether quotes should carry the
  shop's logo"): an admin uploads a PNG or JPEG on the rate card ("Logo on quotes", with a
  preview); it prints at the top left of every quote PDF above the shop name, inside 2.5 x 0.75 in,
  shape kept, PNG transparency as a soft mask and a JPEG's EXIF orientation applied. The file is
  checked at upload by the same reader the PDF writer uses (`lib/pdf-image.ts`, ported from
  payapps' packet images: type from the bytes, at most 1 MB and 4 megapixels, 8-bit PNG), stored
  under `orgs/{orgId}/logo/` by content hash (the old file deleted on replace or remove), and
  `shop_settings.logo_key` (migration 0029) never leaves the Worker (`settings.hasLogo`). Sent
  quotes keep the PDF they were sent with. Shops with no logo get the same PDF as before. Next, if
  shops ask: the logo on the quote email's HTML signature too.
- Costing fixes from the 2026-11-26 quality audit (`portfolio/quality/audits/2026-11-26-jobshop-quote.json`
  in the public repository), done 2026-11-26: a new operation's cycle time starts blank and a
  cleared box stays blank (`cycleMinutesPerPart: null`, quote lines and routings), which blocks
  pricing (`operation_needs_cycle_time`) instead of costing free machine time; an operation with 0
  setup and 0 cycle is `operation_has_no_time`; a typed 0 cycle is still a setup-only operation.
  Fallout per line ("Fallout %", `falloutBps`, at most 50%): each break starts ceil(q / (1 − fallout))
  parts, and run time, per-part finishing, per-lb material and whole stock pieces are priced on the
  starts (setup, lot charges and extras stay per lot or per part shipped); the price table shows
  "start N" under the quantity and the basis prints the fallout. Unit-price rounding up is pinned
  by a hand-checked test (the audit's surviving ceil → round mutant now fails). Next from the same
  audit, if shops ask: a per-lot labor line for programming and first-article inspection (today a
  setup-only operation, which now prices at the labor markup); parts per bar from bar length, part
  length, parting kerf and remnant instead of typed by hand; a shop-wide default fallout (done
  2026-11-27, below).
- Customer links: accept or decline online (2026-11-26, claim `quote-acceptance-link`). The quote
  email has a box (on by default) that adds "Accept or decline this quote online: <link>" under the
  footer, a clickable link in the HTML; "Copy a customer link" on the quote page makes one to send
  from the shop's own mail. The link opens `/q/<token>` without an account: the quote as sent
  (shop, customer, part numbers, descriptions, quoted quantities and prices, lead time, notes,
  terms; never rates, costs, markups or basis) and the exact PDF (`GET /api/quote-links/:token/pdf`,
  checked against its SHA-256). The customer picks one quoted quantity per part (or "not ordering
  this part"), types a name and an optional email, PO number and note, and accepts: the quote is
  marked won at the chosen breaks' total with that PO (`shared/customer-link.ts` `priceAcceptance`
  only picks breaks the sent quote carries; any other quantity is a 400 and a new quote). Declining
  marks it lost with "Declined online: <reason>", so the win/loss report shows where it came from.
  One answer per quote (the status moves out of "sent" in a conditional update, so two answers at
  once cannot both land); past the valid-until day, superseded, won or lost, the page shows that
  state and takes no answer. The estimators who made or emailed the quote are emailed the answer
  (parts, quantities, total, PO, note) when mail is on; the quote page shows it with each link's
  "opened" time (written at most hourly) and "Turn off this quote's links" (they 404 at once). Only
  the token's SHA-256 is stored (migration 0032, `quote_links`, `quote_responses`); an email's own
  link is turned off again if the send fails. The privacy policy says what the link shows and what
  the customer's answer stores (POLICY_VERSION 2026-11-26.4). Tests: `src/shared/customer-link.test.ts`,
  `test/worker/customer-link.test.ts` (no session, PDF hash, won/lost, one answer, refused quantity,
  expired, revoked and malformed tokens, roles, cross-tenant, the email's link and a failed send).
  Next, if shops ask: an e-signature line on acceptance, a reminder to a customer who opened but
  did not answer, and the accepted order as a job traveler.

- Job traveler (2026-11-26, every plan): once a quote is won, the quote page's "Job traveler" card
  prints the floor's copy (`GET /quotes/:id/traveler.pdf?due=YYYY-MM-DD&qty.<lineId>=N`), one sheet
  per part: customer, quote, PO and due date; quantity ordered and parts to start at the line's
  fallout; the material, its stock description, the blank and the stock pieces to pull (when parts
  per piece is set); every operation numbered 10, 20, 30 in the estimate's order with its work
  center, setup, cycle per part and run time on the starts; finishing after them (outside services
  named); final inspection; a sign-off line per step and a heat/lot box. No price, rate or markup
  appears. The quantity per part is the one the shop types (from the PO), else the break the customer
  picked when accepting online (a part they did not order is left off, and the card says which),
  else the line's only break; a multi-break line with none of these is refused with the part
  number, never guessed; a blank cycle time prints
  "not set" with a note and no total; a machine, material or finish no longer on the rate card is
  named as such (names come from the line's price-time snapshot first). Won quotes only (409
  before), viewers may print. Logic in `src/shared/traveler.ts`, PDF in
  `services/quotes/traveler-pdf.ts`. Next, if shops ask: a saved job (work order) with its own
  number and status, and a barcode per operation for shop-floor time tracking.
- QuickBooks Online, part 1 (2026-11-26, every plan; docs/QUICKBOOKS.md): an admin connects the
  shop's QuickBooks Online company on the rate card page (Intuit OAuth through `packages/qbo-sync`,
  single-use state bound to the admin, tokens sealed per shop, disconnect revokes), and an estimator
  sends a won quote as an invoice: number `Q1001`/`Q1001-R2`, the customer matched by name (an
  existing one never edited), one line per part under "Machined parts" at a quoted break's exact
  quantity, unit price and amount (picked, else accepted online, else the only break; a quantity
  never quoted is refused), and "Your PO ... Per our quote ..." printed on the invoice. Once per quote
  (`qbo_quote_invoices`, migration 0033), retried with a stable QuickBooks `requestid`, an invoice
  already there under the number reused only at the same total, refused when the company's home
  currency is not the shop's. Dark until the owner sets `JOBSHOP_QBO_*` (docs/DEPLOY.md). The package
  gained `customerMemo`, an invoice `requestId` and the company's `homeCurrency` (additive).
- QuickBooks Online, part 2a (2026-11-26; docs/QUICKBOOKS.md, "The invoice item"): an admin picks
  the shop's own item, and with it the income account sales post to, from the company's active
  Service and Non-inventory items (read live, the package's `listSaleItems`, as payapps does), on
  the rate card page's QuickBooks card; null goes back to "Machined parts". Checked on save (an
  Inventory, unknown or inactive item is refused) and again at send (an item made inactive since
  refuses the send, nothing written). Tied to the company it was chosen in (migration 0034), so a
  reconnect to another company falls back to the default. `GET /quickbooks/items`,
  `PUT /quickbooks/item` (admin).

- Material priced by the foot (2026-11-27; migration 0037, bets.md growth path "material price lists"): bar,
  tube and extrusion are bought and price-listed by the foot, often in 12 ft bars, and turned parts
  are mostly cut from them, so per lb (needs a density and over- or under-counts the drop) and per
  stock piece (the estimator works out parts per bar by hand) both made the estimator do the
  arithmetic. A rate-card material can now be priced "by the foot": price per foot, a cut
  allowance (saw kerf and facing) added to each part's blank length, and optionally the bar length
  the shop buys and the remnant (chuck or bar-feeder drop) each bar leaves. With a bar length, a
  line is charged whole bars for the parts started (`barStockUse`: floor(usable / cut length),
  float-safe at an exact fit); without one, the length used plus the row's scrap %. The line's
  round or rectangular blank length is what is priced; a weight-only blank, a missing price and a
  cut longer than the usable bar block the price (`material_needs_length`,
  `material_bar_too_short`) instead of guessing. The basis line says it all ("2.875 in blank +
  0.125 in cut allowance = 3 in per part at $4.20/ft, bought in 144 in bars (3 in remnant): 47
  parts per bar, whole bars charged"). The rate-card import reads a supplier's price list: "Price
  per ft" / "$/ft" / "per lineal foot", "Bar length (in)", "Cut allowance" / "Kerf (in)",
  "Remnant (in)", a basis cell "per ft" / "by the foot", and infers per ft from the one price a
  row has; a length in feet or mm is left out with the exact conversion to make, never converted
  by guess (a price per cwt or per metre is now kept exactly: part 2c below). Export and the workbook carry the four columns and read back as no change.
  The traveler prints the cut list ("Cut 53 blanks at 3" (13.25 ft)") and the bars to pull.
  Price dates and history (#437) record the price per foot too. `src/shared/material-per-foot.test.ts`, `test/worker/material-per-foot.test.ts`
  (D1 round trip, whole-bar preview, refusals, the import and another shop).
- Default fallout (2026-11-27, the last open costing item of the 2026-11-26 quality audit that
  needed no shop to ask): "Default fallout %" in Shop and pricing rules (`defaultFalloutBps`,
  migration 0040, 0.01% to 50%; blank or 0 is none). Every new quote line from an RFQ and every
  "Add line" starts with it, so 100 good parts at 3% start 104 without the estimator typing it on
  each line; a line pre-filled from a won quote keeps that quote's own fallout. The settings sheet
  reads and exports it ("Default fallout", "Fallout %", "Reject rate", "Yield loss"; "(none)"
  clears it); "Yield" is refused ("a 97% yield is 3% fallout") and "Scrap" alone is refused because
  it could be a material's kerf and drop. `src/shared/settings-import.test.ts`,
  `test/worker/default-fallout.test.ts`.

## Next

3. **launch** (first deploy done 2026-11-27, run 46013246899, see Status; still open: the run on
   `jobshop-quote.marisstella.app`, then `push: branches: [main]`) Operator and contact email are filled in and launch is agent-approved
   (`docs/legal/OPERATOR.md`, 2026-11-26); the deploy workflow is ported to oss-monorepo
   (`.github/workflows/priv-jobshop-quote-deploy.yml`, 2026-11-27, manual and main-only; its first run
   has its launch review, `docs/LAUNCH-REVIEW.md`, 2026-11-27; R2 no longer blocks it, since without the
   bucket files are kept in D1's `file_blobs`, `src/worker/ports/file-store.ts`, 2026-11-27, and on a
   free D1 that is 500 MB per database, so add R2 edit to the token before shops fill it); run `jobshop-quote-deploy` once, onboard the sender domain,
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
   import/export from a cut chart, done 2026-11-25; parts per sheet from a rectangular nest of the
   flat pattern on the row's sheet width, length and nest gap, done 2026-11-26, `src/shared/nest.ts`,
   docs/ARCHITECTURE.md; next, if shops ask: the nest count offered on the quote line when the
   material is changed there, a nest drawing on the quote, and true-shape nesting for L-shapes and
   rings); STL done 2026-11-26 (binary and ASCII meshes:
   box, area, and the volume of a closed mesh; an STL has no units, so it is read in assumed mm at
   low confidence, which suggests nothing, until an estimator picks millimetres or inches on the
   RFQ page and the file is measured again in that unit; the same chooser serves a DXF with no
   `$INSUNITS`); IGES done 2026-11-26 (ASCII fixed-format 5.x: units from the Global section,
   the box from trimmed faces (144/143 and 186 B-rep faces), measured by their model-space edges and,
   for B-spline faces, a grid kept inside the (u, v) trim loops, so an oversized trimmed plane does
   not inflate it; a curved face that may reach past what was measured flags
   `bbox-may-underestimate` with the most it can be off per axis, from the control points or the
   full sweep; no volume, ask for STEP; packages/cad-features/README.md, "IGES"); IGES holes done
   2026-11-26 (192, 120 and B-spline cylinders grouped by axis like STEP, a hole told from a boss by
   rays along the axis, checked on Open CASCADE's own trimmed, B-rep and NURBS output; the hole
   locations feed "Drill from CAD"; packages/cad-features/README.md, "IGES holes"); next: IGES
   from another exporter (SolidWorks, NX), cross holes through round parts, the
   parent-matrix rule checked against a real exporter's file, and holes from an STL mesh (cylinder
   fitting) if shops send STL for machined parts; removal rates by material (done 2026-11-25; from a CSV in the rate-card import
   done 2026-11-26). Hardening
   (size threshold done 2026-11-25): a queue consumer that measures large files in the background
   if shops find the Measure click a chore; real 10-15 MB STEP files timed in workerd, done
   2026-11-27 (docs/GEOMETRY-LIMITS.md: CPU is fine, memory is the limit, files over 6 MB are not
   measured); next, if shops send assemblies over 6 MB: free each body's sampled edges as it is
   done (`Sampler.cache` in step.ts), or measure large files in a container with more memory.
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
    quote, part history, won-price dates and invite expiry, done 2026-11-26, `useShopDay`; routing
    rows from the routing a line was built from done 2026-11-26: `quote_lines.routing_ids`,
    migration 0030, set by "Use routing", "Add after", saving a routing from the line and updating
    one from it, carried by revisions, pre-fills and copied lines, "Routing since deleted" for a
    routing deleted since, older lines still matched by operations; docs/ARCHITECTURE.md, rule 11).
    The line shows which routing it is recorded as built from, and the estimator can take one off
    or clear the record, done 2026-11-26 (`recordedRoutings`, `withoutRouting` in
    `src/shared/routings.ts`; an emptied record counts under "No saved routing";
    `test/e2e/10-routing-record.spec.ts`). Next: whatever the first shops ask of the report.
11. Rate-card import, part 3 (settings from the same sheet done 2026-11-26: "Shop settings" in the
    import reads label/value rows anywhere on the sheet, so a block of markups above the machine
    table imports in one paste; "Markup" alone, "Margin" and "Minimum order" are left out with the
    reason, never mapped to the nearest setting; the export reads back unchanged;
    `src/shared/settings-import.ts`; the whole card as one .xlsx, a tab per kind, done 2026-11-26,
    `src/shared/rate-card-workbook.ts`; the default lead time and the quote terms as text rows, line
    breaks kept, and "(none)" to empty either, done 2026-11-26: a number setting refuses "(none)"
    and says what to write, "Payment terms" and "Lead time (days)" are left out with the reason, and
    a terms cell an unquoted CSV comma split is refused rather than cut). Currency, part 1 done
    2026-11-26: one currency per shop on the rate card (`shop_settings.currency`, twelve
    two-decimal ISO 4217 codes, null is USD; `src/shared/currency.ts`), printed on every page, the
    costing basis, the quote PDF ("Prices in EUR" once chosen; the PDF writer now carries `€` and
    `£`), the cover-note facts, the revision's change lines and the expiry email; the cover-note
    guard refuses a price in any listed currency; labels like "$/hour" follow it; nothing converts.
    The rate-card import reads `€`, `£`, `CA$`, `kr`, `zł` and ISO-code cells and headers in the
    shop's currency and refuses an amount or a money column marked in another, naming both (a bare
    `$` fits any dollar or peso shop), done 2026-11-26 (`splitCurrencyMark`, `headerCurrencyMark`;
    the settings sheet's minimum line charge too; docs/ARCHITECTURE.md, the currency paragraph).
    Next: several currencies in one shop (a quote's own currency with a typed rate) if a shop asks.
12. E2E suite, part 3 (part 1 done 2026-11-25; part 2 done 2026-11-26: a STEP file attached to
    an RFQ and measured by the real parser, its blank on the quote line, the quote email recorded
    offline, a revision and its changes view with the PDF summary, an invited estimator's role
    limits in the page and the API, and the rate-card spreadsheet import with an update).
    A DXF flat pattern's cut, bend and sheet-blank suggestions, measured by the real parser, and
    the win/loss CSV download are done 2026-11-26 (`test/e2e/08-dxf-and-csv.spec.ts`). A drawing
    PDF attached is done 2026-11-26 (`test/e2e/09-drawing-pdf.spec.ts`): the offline converter
    reads a real PDF's text (`src/shared/pdf-text.ts`: page tree in order, Flate content streams,
    object streams, ToUnicode maps for Chromium's and LibreOffice's subset fonts, title blocks drawn
    as form XObjects), so the material and finish an email leaves out come from the drawing with
    its line as the source; a PDF that gives no text (a scan) is flagged on the RFQ page ("no text
    read from it, likely a scan"). The same pass fixed page counting for object streams with an
    indirect `/Length` of two or more digits (the regex backtracked to a length of 1). Next: check
    production's Workers AI `toMarkdown` on a scanned drawing once a shop sends one (whether it
    returns OCR text or nothing decides whether the scan note shows in production).

13. QuickBooks Online, part 2 (part 1 done 2026-11-26, docs/QUICKBOOKS.md; the shop's own item
    and income account done 2026-11-26): an item per part family if shops ask, class and location for
    Plus and Advanced companies, and an estimate at "Mark sent" for shops that keep quotes in
    QuickBooks too; then, if shops ask, payments read back to mark the job paid.
14. Quote follow-up, part 2 (part 1 done 2026-11-26): a follow-up email to the customer drafted from
    the quote (the estimator sends it, threaded like the quote email) if estimators ask for it;
    follow-up counts and response time on the Win/loss page (does a second follow-up change the
    win rate?) once shops have a few months of logged follow-ups.
15. Material price lists, part 2 (part 1 done 2026-11-27: price dates, history, the stale-price
    warning, "New price"; "quotes this changes" done 2026-11-27; the supplier's sheet with supplier,
    date, the move per row and the quotes each change touches done 2026-11-27, part 2b): the
    supplier and date read from a title block on the sheet ("Supplier:", "Effective:") instead of
    typed, if shops' sheets carry them; rows matched by grade and size when the sheet's names differ
    from the card's (an alias per material), if shops ask; a list of stale materials and moved
    quotes in the weekly or morning email if shops ask.

15. Material price lists, part 2 (per-foot pricing done 2026-11-27; prices per cwt and per metre
    kept exactly done 2026-11-27, part 2c; the bar setup edited in place done 2026-11-27, part 2d):
    "quotes this changes" listing open quotes priced with another bar setup too (today only the
    draft line says so), if shops ask; several bar lengths per material (12 ft and 20 ft random lengths)
    with the cheapest whole-bar mix, if shops ask; a supplier's PDF price list read into the import
    preview, if shops send them.

## Open questions for the owner

- QuickBooks invoices are on every plan in early access; say if they should be a Shop plan feature.
- Price point and plan limits: built as per-shop with an RFQ allowance (the pricing page's
  proposal, docs/BILLING.md); say if per-estimator-seat pricing should replace it.
