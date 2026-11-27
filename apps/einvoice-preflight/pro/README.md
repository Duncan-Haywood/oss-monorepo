# E-invoice preflight: the paid layer ("fix and explain")

All rights reserved (`../LICENSE`). The rest of `apps/einvoice-preflight` started as a copy of
`ventures/einvoice-preflight`, which stays MIT at the imported commit (`../PROVENANCE.md`).

Who it is for: German and French SMEs and their accountants before the e-invoicing
deadlines (Germany: issuing for turnover above €800k from 1 January 2027, everyone from
2028; France: SMEs issuing from 1 September 2027). The free checker says *which rule*
fails. This layer says *what it means* in German, French, Dutch or English, fixes the mechanical
errors with a visible diff, keeps a per-client history for an accounting practice and
meters an API.

## The one rule: the model never decides validity

- Pass or fail comes only from deterministic code: the imported checker (`../report.mjs`:
  INV, XR, PP, FR, PDF rules, and the official Schematron when it is installed) plus the
  four deterministic `PRO-*` rules in `rules.mjs`.
- The model (if configured) only writes an explanation for a rule that has no template.
  Its output is marked `source: "llm"` with a notice, and `explain.mjs` drops it if it adds
  a number the finding does not contain or claims the invoice is valid. A failure or a
  missing key falls back to the checker's own text (`source: "checker"`).

## Modules

| File | What it does |
|---|---|
| `explain-catalog.mjs` | Deterministic DE/FR/EN template per rule id: all 92 built-in INV/XR/PP/FR/PDF ids (a test checks none is missing) plus the PRO rules. |
| `explain-catalog-ksef.mjs` | Poland's KSeF FA(3) rules (PL-001..PL-025): EN/DE/FR and Polish templates, merged into the catalog. `lang=pl` explains these in Polish; any other rule in Polish gets the English template with a Polish notice (`pro/explain-ksef.test.mjs`). |
| `explain-catalog-nl.mjs` | Dutch (`lang=nl`) text for every rule except the KSeF ones (111 ids), for Flemish and Dutch accountants: Belgium has required structured B2B e-invoices over Peppol since 1 January 2026. Codes, BT numbers, URNs and amounts are copied unchanged from the English text, and a test holds them to it (`pro/explain-nl.test.mjs`); a KSeF rule in Dutch gets the English template with a Dutch notice. Drafted by the agent, not yet read by a native speaker. |
| `explain.mjs` | Template, else model (long tail, guarded, cached), else checker text. |
| `llm.mjs`, `fake-llm.mjs` | `llm.complete({ purpose, ... })` port. The real adapter wraps `@anthropic-ai/sdk` (loaded lazily, not a dependency of this folder); `FakeLlm` has a handler for every purpose (`explain.rule`). Model: `LLM_MODEL`, default `claude-haiku-5-5` (cheapest-model rule; the refusal fallback beta is sent only to models that offer it). |
| `rules.mjs` | `PRO-DEC-001` amounts with more than 2 decimals (BR-DEC), `PRO-DATE-001` dates not in XSD form, `PRO-CUR-001` missing currency code, `PRO-SUM-001` totals exact to the cent (BR-CO-10/13/15/16; the built-in rules allow a tolerance).; `PRO-DE-001` a ZUGFeRD / Factur-X MINIMUM or BASIC WL file from a German seller (or under the XRechnung profile), which the BMF does not count as an e-invoice. Also `detectProfile` for `profile=auto`. |
| `pdf-text.mjs` | The text layer of a PDF as positioned lines and table cells (text matrix x CTM, font widths, an em-sized gap splits cells). Zero-dependency, bounded loops; FlateDecode through `DecompressionStream`, so it runs in Node and on Workers. |
| `pdf-draft.mjs` | PDF to ZUGFeRD, parts 1 to 3: a plain PDF invoice (rows over several pages, discounts and charges below the table, a discount on a single row) to the creator's draft (`../generate.mjs`), each value with the line it came from; see "PDF to ZUGFeRD" below. |
| `fixes.mjs` | The safe-fix whitelist (below). |
| `diff.mjs` | Exact text edits and a unified diff built from them. |
| `check.mjs` | validate, explain, propose fixes, re-validate. |
| `dashboard.mjs` | The cross-client overview: each client's status (needs attention, OK, not checked lately, never checked), pass rate, still-failing invoices and most frequent rules over a window, built from the run history only; and its CSV (formula cells neutralised, BOM for Excel). |
| `store.mjs` | Accounts, hashed API keys, clients, runs, monthly usage. `MemoryStore`, `FileStore` (one JSON file). |
| `sql-store.mjs` | `SqlStore`: the same methods on SQLite, through `node:sqlite` (`PRO_DB_FILE`) or a D1 binding (`d1Db`). The production store (`../docs/HOSTING.md`). |
| `app-files.mjs` | The app's own files by path (the workspace page, legal texts, fonts, rule sets): the disk on Node, the embedded copy in the Worker. |
| `fetch-adapter.mjs` | Runs `server.mjs`'s Node-style handler from a fetch `Request`, for the Worker (`../worker/index.mjs`, `../docs/HOSTING.md` "On Cloudflare Workers"). |
| `plans.mjs` | Plans, prices and limits (the site's tiers). |
| `billing.mjs` | Paddle checkout, signed webhook to plan, portal, entitlement (packages/billing). |
| `paddle-catalog.mjs` | Builds `../billing/paddle-catalog.json`, the Paddle catalog as code. |
| `server.mjs` | The HTTP API (zero dependencies), public trial sign-up, email sign-in, and the workspace page at `/app`. |
| `email.mjs` | The mail port: `ResendMailer` (`EMAIL_PROVIDER=resend`), `FakeMailer` (`FAKE_EXTERNALS=true`, prints instead of sending), bare-address checks and the two fixed DE/FR/EN/NL/PL messages. |
| `serve.mjs` | The hosted product's start command: `server.mjs` plus the free pages on one port (`../Dockerfile.pro`). |
| `web/` | The accountant workspace page (`index.html`, `app.js`, `app.css`, `workspace-lib.mjs`): DE/FR/EN/NL/PL (Dutch and Polish unreviewed; legal texts English for NL and PL), no build step, no dependencies, served same-origin under a strict CSP. |

## Safe fixes

Only these, each shown as a diff, never silent:

| Fix | Example | Refuses when |
|---|---|---|
| `date-format` | `24.08.2026` to `2026-08-24` (CII: `20260824`) | the date is ambiguous (`03/04/2026`) or not a real date |
| `amount-decimals` | `48.504` to `48.50` (prices untouched) | rounding would leave a total a cent off (`PRO-SUM-001`) |
| `currency-case` | `eur` to `EUR` | the upper-case form is not an ISO 4217 code |
| `currency-missing` | adds `DocumentCurrencyCode` (UBL) | amounts name zero or several currencies |
| `peppol-process` | adds the Peppol billing process id (BT-23) | the document is self-billing (389), or a different id is present |

A fix is kept only if the corrected file clears the finding it targets and raises no new
finding; otherwise it is reported under `skipped` with the reason (and the findings it
would have introduced). Arithmetic errors, wrong identifiers and missing business data
are never fixed. PDFs and JSON are reported only. `fixes.test.mjs` re-validates every
fixed file independently.

## API

Run `node pro/server.mjs` (env: `PORT`, `PRO_DB_FILE` (SQLite, production) or `PRO_DATA_FILE`, `ADMIN_TOKEN`, optional
`ANTHROPIC_API_KEY` + `LLM_MODEL`, `FAKE_LLM=true` for an offline demo, and for email sign-in `EMAIL_PROVIDER=resend` +
`RESEND_API_KEY` + `EMAIL_FROM` + `APP_URL`). The route list
is at the top of `server.mjs`. In short:

```
GET  /app                          the workspace page (sign up, sign in with the key, clients, batches, API keys)
GET  /app/terms | /app/privacy | /app/dpa   the Terms of Service, Privacy Policy and Data Processing Agreement (pro/legal/*.md)
GET  /v1/legal                     their titles and versions
POST /v1/signup                    {name, acceptTerms: true, termsVersion?} -> trial account + API key (shown once);
                                   the account records the Terms version; a stale termsVersion gets 409
POST /v1/admin/accounts            (ADMIN_TOKEN)  -> account + first API key (shown once)
POST /v1/check?lang=de&fix=1       raw invoice body -> findings with explanations, fixes, diff
                                   profile= xrechnung|peppol|france|slovakia|auto (auto: from the file)
                                   schematron=1 the official Schematron where installed (the workspace sends it)
POST /v1/convert?profile=en16931   raw plain-PDF body -> {draft, fields, missing, checks, ready}: the creator's draft
                                   read from the PDF, every value with its source line (not metered; "PDF to ZUGFeRD")
POST /v1/clients                   an accountant's client
POST /v1/clients/:id/batches       {documents:[{name, content, encoding?}]} -> run + results
GET  /v1/clients/:id/history       runs, newest first
GET  /v1/dashboard?days=30         every client at a glance, attention first; &format=csv&lang=de|fr|en for a spreadsheet
GET  /v1/account | /v1/keys        usage, plan, subscription, keys
GET  /v1/signin/options            {email: boolean}: whether this server sends sign-in links
POST /v1/account/email             {email, lang?} -> a confirmation link (24 h); DELETE removes the address
POST /v1/email/verify              {token} -> the address is the account's sign-in email
POST /v1/signin/email              {email, lang?} -> 202 always; a one-time link (15 min) to a confirmed address
POST /v1/signin/redeem             {token} -> {account, apiKey}: a new key named "email sign-in"
GET  /v1/billing/plans             public pricing table
POST /v1/billing/checkout          {plan, email} -> hosted checkout URL (dark: 503)
POST /v1/billing/webhook           Paddle notifications (signature-verified)
POST /v1/billing/portal            manage or cancel the subscription
```

One metered unit is one invoice per month, as the pricing page promises: the SHA-256 of its
bytes is kept per account and month, so re-checking the same file (alone, in a batch, twice in
one batch, or base64-encoded) costs nothing more that month, even at the limit. Units are
reserved before the work and given back if it fails; a request whose new invoices would exceed
the plan gets `429 quota_exceeded`. "Explained" is likewise one unit per invoice per month that
needed the model (template explanations are free). Each response carries
`x-usage-documents-used/-limit/-charged` and `x-usage-explained-used/-limit`. Run history keeps file names, SHA-256 hashes, rule ids and fix
ids, never invoice contents.

## PDF to ZUGFeRD (part 1: the draft from a plain PDF)

Most small firms still send invoices as PDFs out of Word, Excel or an old program, and from
2027/2028 (DE) and September 2027 (FR) that is no longer an invoice they may issue. `POST
/v1/convert` takes such a PDF and returns the draft the creator (`../generate.mjs`, `create.html`,
the free `POST /v1/generate`) turns into Factur-X / ZUGFeRD, XRechnung or UBL.

Same rule as everywhere here: nothing is guessed, and no model is called.

- **Read, not inferred.** Every entry in `fields` has the value, the page and the verbatim line it
  was read from. Labels are matched in German, French and English (Rechnungsnummer / N° de facture /
  Invoice no., Leistungsdatum, Fällig am / Échéance, USt-IdNr. / N° TVA, ...).
- **Checked identifiers.** An IBAN is taken only when its mod-97 check digits hold at the
  country's registered length (a truncated or mistyped IBAN is left out, not repaired); a VAT ID
  only when `../vat.mjs` knows its shape or checksum.
- **Rows that multiply out.** A table row becomes a line only when quantity x unit price equals its
  amount to the cent (a description wrapped onto the line above or below joins its row). A row that
  does not is left out, and the cross-checks below say a row is missing.
- **The PDF's own totals as the test.** `checks` compares the rows with the printed net total, net
  plus VAT with the printed total, and the creator's computed net, VAT and total with the printed
  ones. `ready` is true only when the creator can build the invoice, nothing in `missing` remains and
  every check holds.
- **Judgment calls are marked** (`check: true`, listed in `toConfirm`): the parties read from a
  one-line sender address and the block under it, a second VAT ID, a country assumed from a domestic
  address, a VAT rate taken from the only rate in the totals.
- **VAT treatment stated in words** sets the category and keeps the PDF's own wording as the reason:
  § 13b UStG / reverse charge (AE), intra-community supply (K), Kleinunternehmer § 19 UStG and TVA
  non applicable art. 293 B (E).
- **What the checker needs beyond the creator** goes in `missing`: a buyer known only by name needs
  an e-invoice address (BT-49) or a VAT ID (INV-005).
- A PDF that already carries Factur-X / ZUGFeRD / XRechnung XML is read too, with `reason:
  "already_einvoice"`: check that file instead. A PDF without a text layer (a scan) answers
  `readable: false, reason: "no_text"`; an encrypted one `"encrypted"`.

Tested on invoices printed to PDF by Chromium and by LibreOffice (`pro/testdata/*.html` are the
sources: fictional firms; the VAT IDs and IBANs are published examples or synthetic numbers with valid check digits) and on the creator's own Factur-X page;
`pro/pdf-draft.test.mjs` also writes each draft as Factur-X and runs the checker on it (pass).

### Part 2: the convert screen (2026-11-26)

The workspace's "PDF to e-invoice" card (`convertView` in `web/app.js`, DE/FR/EN/NL/PL) puts part 1 in
front of a person:

- Drop one PDF (up to 5 MB): `POST /v1/convert`, unmetered. Every value of the draft is an input with
  the page and verbatim line it was read from ("not on the PDF" otherwise). The values the reader
  marked (`toConfirm`) carry a "confirm" box; editing a marked value confirms it. What the checker
  needs beyond the creator (`missing`, usually the buyer's e-invoice address, typed as an e-mail or a
  Peppol ID `0204:...`, anything else refused) is marked "needed" until filled.
- The lines are a table (description, quantity, unit, unit price, discount, VAT %), editable, with
  rows to add and remove; numbers take a decimal comma, and a blank or unreadable number stays blank
  for the creator to report, never 0. The discount cell (since 2026-11-26) is the line allowance:
  "10 %" of quantity x price or an amount ("5,00"), blank for none; the reason the reader took from
  the PDF's column head is kept. Anything else is marked unreadable and disables "Build"
  (`parseDiscount`, `withDiscount`, `discountText` in `web/workspace-lib.mjs`;
  `pro/convert-discount.test.mjs`).
- "Build and check": `POST /v1/convert/build` writes Factur-X / ZUGFeRD (PDF), CII or UBL with the
  free generator's own code (`../generate.mjs`, `../facturx-pdf.mjs`) and runs the paid check on
  the file (built-in rules, the profile's rules, the official Schematron where the server has it).
  It costs one unit, counted by the SHA-256 of the XML, so rebuilding the same invoice (a Factur-X
  PDF differs only in its timestamp) is free. A draft the creator cannot build returns its errors,
  unmetered.
- The download stays locked while a marked value is unconfirmed, and while the built file's net, VAT or
  total differs from the amount printed on the PDF (`convertBlockers` in `web/workspace-lib.mjs`):
  the e-invoice must carry the amounts of the invoice that was sent. Any edit after a build hides the
  download until the next build.

- "Save to history" (part 3): once the download is unlocked, the screen offers the account's clients.
  Saving builds the same draft again with `clientId`; the server checks the client belongs to the
  account before building or metering (404 otherwise, nothing charged), then records its own build
  and check as a one-file run in that client's history, the same shape as a batch's, with the file
  marked `origin: "convert"`, its `format`, and `xmlSha256` beside the file's `sha256`. The XML is
  the one already built, so saving is not charged again; the answer replaces the shown one, so the
  download is the file that was saved. The client's history lists it as "converted from a PDF", and
  the dashboard counts it like any checked file.

The PDF is read in memory and nothing of it is stored; reading never adds to a client's history,
and a build does only when the person saves it to a client (hashes and rule ids, as for batches).
Tests for saving: `pro/convert-history.test.mjs` (memory and SQLite stores, another account's
client refused unmetered, a failed build saves nothing). Tests: `pro/convert-lib.test.mjs` (the screen's logic on the real test PDFs),
`pro/pdf-draft.test.mjs` (the build route: the German test PDF to a Factur-X that passes, UBL,
refusals, metering). It was driven in Chromium too: sign up, drop `testdata/rechnung-de.pdf`, build
(download locked), add the buyer's address, confirm the marks, build, download `2026-0815.pdf`, and
no horizontal scroll at 390 px.

The screen also lists the discounts and charges the reader found (reason, amount, VAT %, each with
its source line and a confirm box; a VAT rate the reader could not prove is marked "needed"), and
the download compares the PDF's net total after them with the e-invoice's taxable amount (BT-109).

### Discounts, charges and pages (2026-11-26)

**Discounts and charges below the table** (2026-11-26): a line between the rows and the
total labelled as a discount (Rabatt, Nachlass, remise, rabais, discount) or a charge (Versand,
Fracht, Verpackung, Anfahrt, Zuschlag, frais de port, shipping ...) becomes a document-level
allowance (EN 16931 BG-20) or charge (BG-21) with the PDF's own wording as its reason. The sum
printed before the first of them is the rows' total (BT-106), the one after the last is the net
total (BT-109), and the checks compare both. The VAT rate of each is the exemption when every row
is exempt, the invoice's only rate, or, with several rates, the one assignment under which every
rate's printed VAT comes out to the cent; when none or more than one does (a discount split across
rates), the rate goes in `missing` for a person. A printed percentage that is not the amount is
marked. Skonto, escompte and down payments (Abschlag, acompte) are conditions of payment or
prepayments, not discounts, and are never read as one.

**Rows across pages**: a sum with more rows after it and no total in between (Zwischensumme
Seite 1, Übertrag, à reporter, a section's subtotal) only carries forward; the rows continue on the
next page and the `carried-forward` check compares each carried sum with the rows above it.
Also: typographic ligatures (ﬁ, ﬂ) read as letters, a rate and an amount sharing one
cell ("19 % 780,00 €"), a discount or charge label wrapped round its amount or printed in the same
cell, a VAT line whose amount wrapped below its base, and seller and buyer blocks stacked one above
the other. Fixtures `rechnung-rabatt-de`, `facture-remise-fr` and `rechnung-mehrseitig-de`, each
printed by Chromium and by LibreOffice, all read completely and their Factur-X passes the checker
(`pro/pdf-draft-part2.test.mjs`).

### A discount on a single row (2026-11-26)

**Part 3, row discounts** (EN 16931 BG-27): when the table header has a discount column (Rabatt,
Nachlass, Remise, Rabais, Discount, found inside a header cell too, since LibreOffice can print a
whole header row as one), a row whose quantity x price is not its amount is read when exactly one
discount makes it so, to the cent: a percent cell (24 x 8,40 = 201,60 less 10 % = 181,44) or an
amount cell between the price and the amount (6 x 24,90 less 9,40 = 140,00). Any other percent on
the row is its VAT rate, whichever column comes first; "0 %" in the discount column is no discount
and no rate; two readings that both fit, or none, leave the row unread. The draft line gets
`allowances: [{ reason, percent }]` (the percent alone, so the creator works the amount out again
when the quantity or price is corrected on the convert screen) or `[{ reason, amount }]`, and the
line's source note shows the sum. A document-level discount below the same table is still read as
one. The creator (`../generate.mjs`) writes line allowances and charges in UBL
(`cac:InvoiceLine/cac:AllowanceCharge` with `MultiplierFactorNumeric` and `BaseAmount` for a percent)
and CII (`SpecifiedLineTradeSettlement/SpecifiedTradeAllowanceCharge`), nets the line (BT-131), and
refuses a line discount with no reason (BR-42), no amount or percent, a percent that disagrees with
its amount, or a line net below zero. Fixture `rechnung-zeilenrabatt-de` (Chromium and LibreOffice)
reads completely and its Factur-X passes the checker (`pro/pdf-draft-part3.test.mjs`); the creator's
output adds no finding under the EN 16931, XRechnung and Peppol BIS rules
(`generate-line-allowances.test.mjs`).

### A discount on its own line under its row (2026-11-26)

Many invoicing programs print a row's discount as a line of its own beneath it ("abzgl. 8 %
Rabatt  -85,44 €"), with no discount column. Until now the reader took such a line for a discount on
the whole invoice and ended the table there, so every row after it was lost and the totals check
failed. Now (`rowAdjustments` in `pdf-draft.mjs`) a discount line (or a charge line: Zuschlag,
Fracht, Versand...) belongs to the row above it when only that row's wrapped description stands
between them, it is within about a row's height (the table's own row pitch: 17 pt from Chromium,
29 pt from LibreOffice), and another row follows before any total. Directly under the *last* row it
is the row's own only when its printed percent of that row's amount is its amount to the cent, or
when the rows above already carry their discounts this way (then the row asks to be confirmed);
otherwise it stays a discount on the whole invoice, as before. A printed net after the discount
("-50,00  450,00") must be the row's amount less it, or the line is not taken. A printed percent
that fits is kept as the percent (the creator recomputes it if the quantity or price is corrected);
one that does not fit is reported in the row's note and only the amount is kept, with the row marked
to confirm. The row's net (after its own discounts and charges) is what the totals checks add up.
The convert screen shows a row's charge in its discount cell with a "+", read-only. Fixture
`rechnung-positionsrabatt-de` (Chromium and LibreOffice: four rows, discounts under rows 1 and 4)
reads completely and its Factur-X passes the checker (`pro/pdf-draft-part3-own-line.test.mjs`, with
the net-printed, charge, wrong-percent, last-row and French one-cell cases).

### A description over several lines and across a page break (2026-11-26)

A long description (a bill-of-quantities item: "Natursteinmauer Granit trocken gesetzt, / Höhe bis
60 cm, inkl. Streifenfundament / ...") used to keep only the lines within a line and a half of its
amounts, so a five-line description lost its last three, and when the page broke inside the row the
lines on the next page were dropped. Now (`attachWrapped` in `pdf-draft.mjs`) consecutive text lines
a line apart at one x are one run, and the run belongs to the row printed right above it (amounts on
the first line, as Chromium prints) or right below it (amounts centred in the description, as
LibreOffice prints an unsplit row). A run at the top of a page, under the repeated table header,
with no row beside it, goes on with the previous page's last row when it starts at that row's
description column; the row is then marked to confirm, with the joined text in its note. A running
head ("Seite 2 von 2", "Rechnung Nr. ...") is never joined, nor text at another column or well
below the header; in a centred layout the lines above page 2's first row stay that row's. Rows in
m³ and t were dropped too (no such unit); they now read as MTQ and TNE, which the creator accepts.
Fixture `rechnung-umbruch-de` (13 rows, one of five lines split 3/2 by Chromium and 2/5 by
LibreOffice; the LibreOffice print uses `rechnung-umbruch-de-libreoffice.html`, the same invoice
with less space above the table, as its rows are taller) reads completely and its Factur-X passes the
checker (`pro/pdf-draft-part3-page-break.test.mjs`, with the running-head, other-column, far-below
and centred-layout cases).

Not yet (ROADMAP, "PDF to ZUGFeRD, part 3"): scans (OCR).

## The workspace page

`GET /app` serves `web/`: a stranger signs up with a firm name (`POST /v1/signup`, a trial account,
the API key shown once), or signs in by pasting a key (kept in `sessionStorage`, or `localStorage`
with "remember"). Then: plan and usage meters with upgrade buttons (checkout when billing is on,
otherwise a "not open yet" line), client companies, a drop zone that sends files as base64 batches
split to the API's caps (50 files, 1 MiB each, 20 MiB of base64 per request), each finding with its
plain-language explanation, the fixed file and its diff as downloads, and the client's history.
An "API keys" panel lists the account's keys (name, first 12 characters, created, last used; the one
this browser signed in with is marked), creates one (shown once, there) up to the plan's limit, and
revokes one (revoking this browser's own key signs it out, after a warning).

The sign-up checkbox links the Terms of Service and the Privacy Policy, served at `/app/terms` and
`/app/privacy` from `pro/legal/terms.md` and `privacy.md` by a zero-dependency renderer
(`legal.mjs`, every character escaped; the server refuses to start if a file lacks its title or
"**Version YYYY-MM-DD**" line). Sign-up records the Terms version on the account (`termsVersion`,
also in `GET /v1/account`); a page left open across a change sends the old version and is asked to
accept again. They are agent-approved under `docs/legal/OPERATOR.md` at the repository root, not
reviewed by an attorney.

**Translations (2026-11-26).** German and French versions of all three pages
(`pro/legal/de/*.md`, `pro/legal/fr/*.md`) are served at `/app/de/terms`, `/app/fr/privacy` and so
on, and listed under `translations` in `GET /v1/legal`. Each opens with a notice that it is a
convenience translation and that the English text at `/app/<page>` governs; the sign-up checkbox
says the same in German and French, and in those languages the page's legal links open the
translation. Each page links its other languages (`hreflang`). A translation must carry its English
file's version date: one left behind by a change to the English text is not served (the route sends
the reader to the English page with a 302) and `pro/legal.test.mjs` fails, which also checks that
each translation has the English file's headings, table rows and every number (days, months,
characters, entries, clause numbers). So: **change the English text, change both translations and
their version dates in the same PR.** Translated by the agent (DSGVO/RGPD terms as the official
German and French texts of the GDPR use them: Auftragsverarbeiter, sous-traitant), not by a
professional translator.
The page builds the DOM from text nodes only and loads nothing from another origin.

**At a glance (2026-11-26, accountant client dashboard part 1).** Above the client list, a table of
every client over 7, 30, 90 or 365 days (`GET /v1/dashboard`): status, last check, invoices, pass
rate, still-failing invoices (expand for the file names and their rules) and the most frequent rules,
with clients that need attention first, then those not checked for longest, then those never checked.
An invoice counts once per content (SHA-256) at its latest check in the window; a failure is closed by
a safe fix that passes, or by its fixed copy passing a later check. "Download CSV" saves the same
table, one row per client, in the page's language. It reads only the stored history (file names,
hashes, statuses, rule ids), so it costs no units. `pro/dashboard.test.mjs`; driven in Chromium on
three clients (attention, never, OK), the CSV download and the phone width.

**Data Processing Agreement** (`pro/legal/dpa.md`, `/app/dpa`, linked from every page's footer).
An accountant who checks a client's invoices hands us the client's personal data (names, addresses,
VAT ids, IBANs), so under GDPR Art. 28 it needs a processing agreement before it may use the
Service. The Terms incorporate the DPA, so it applies from sign-up without a signature (a signed
copy on request). It covers Art. 28(3)(a) to (g), 30 days' notice of a new sub-processor with a
right to object and cancel, breach notice without undue delay, and the transfer to the US by the
2021/914 SCCs (Module Two or Three; Clause 17 Option 2, the exporter's Member State, else
Ireland), with the UK Addendum and the Swiss adaptations. Annexes I to III are filled from the
code: invoices read in memory only; the explanation cache in memory, at most 5,000 entries
(`server.mjs`); backups and the host "not in place yet". `pro/legal.test.mjs` fails if Annex III
names a sub-processor the Privacy Policy does not, or if the cache claims stop matching
`server.mjs`. The SCC clause numbers and options were written from the 2021/914 text as known to
the agent; EUR-Lex refused this session (403 at the proxy), so check them against
https://eur-lex.europa.eu/eli/dec_impl/2021/914/oj when it answers. Agent-approved like the other
two pages, not reviewed by an attorney.

Sign-up abuse: per client IP (`SIGNUP_PER_IP_PER_HOUR`, 5) and per day for the server
(`SIGNUP_PER_DAY`, 200), in memory. Behind a proxy set `TRUST_PROXY=1` so the IP is the last
`X-Forwarded-For` hop. `PUBLIC_SIGNUP=off` closes it. A trial's worst case is 50 model
explanations a month, about $0.05 at the cost basis below.

## Email sign-in (a lost key is no longer a lost account)

Optional, per account. In the workspace's "Sign-in email" panel a signed-in firm enters an address;
a confirmation link (24 hours) goes there, and pressing its button makes the address the account's
sign-in email (one account per address; `409 email_in_use` otherwise). On the signed-out page,
"Lost your key?" asks for a link: the answer is the same `202` whether or not the address has a
workspace, and a link (15 minutes, once) goes only to a confirmed address. Pressing the link's button
creates a new API key named `email sign-in` and shows it once, as at sign-up; the other keys keep
working. At the plan's key limit it replaces the oldest earlier `email sign-in` key, and with none it
is the one key allowed over the limit, so recovery always works and `POST /v1/keys` stays refused
until a key is revoked.

- **Tokens:** 32 random bytes, stored only as SHA-256, used once by a conditional update (two
  requests with one link cannot both win). Removing or changing the address cancels sign-in links
  already sent. Link records are deleted about a day after they expire.
- **Scanners and leaks:** the token is in the URL fragment (`/app#signin=...`), which a browser
  never sends to a server or in a `Referer`; the page removes it from the address bar and history
  on load, and only the button's `POST` uses it, so a mail scanner that opens the link cannot.
- **Abuse:** per client IP (10 link requests an hour) and per address (3 links an hour, 10 a day,
  verification and sign-in together). Over the address cap the sign-in answer is still `202`.
  Links are built from `APP_URL` only, never from the request's `Host` header.
- **Turning it on:** `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` (one bare address on a
  domain verified in Resend) and `APP_URL`. Without all of them it is off. Resend is listed in the
  Privacy Policy's subprocessors "only if email sign-in is turned on".
- **Not done:** password sign-in (not planned: the key and the link cover it), and the message
  wording has not been read by a German or French native speaker.

Tests: `pro/email-signin.test.mjs` (the whole flow on a socket, caps, expiry, the key limit, off
without a sender) and the sign-in email case in `pro/store-contract.test.mjs` (all four stores).

## Paid path: dark

Paid plans (Firm S/M/L at €19/€29/€49 a month, the tiers the marketing site publishes) are
sold through Paddle by `billing.mjs`: a signed checkout token binds the purchase to the account,
a verified webhook sets the plan, and the customer portal handles changes and cancellation. It
answers 503 `billing_unavailable` until the owner sets the provider secrets. Plans, the margin
test, the purchase flow and the owner's steps: [`../docs/BILLING.md`](../docs/BILLING.md).

Cost basis: checking is CPU only (measured 1.1 ms per invoice without Schematron); a model
explanation is at most 3,000 input and 1,500 output tokens on Claude Haiku 5.5 ($0.10 / $0.50
per million), and is cached per rule, message and language across all accounts.

## Not done yet

- Storage: `SqlStore` on SQLite or D1 is the production store (`sql-store.mjs`); the JSON file
  store is for the demo and tests.
- Email sign-in is built (below) but needs a sender: the owner's Resend key and a verified sending
  domain, or a Cloudflare Email Service route once the paid layer has a host that can use it. Until
  then `GET /v1/signin/options` says `email: false` and the page offers API-key sign-in only.
- The Terms and Privacy Policy are English only, and the hosting provider is named in the
  subprocessor table (and the DPA's Annex III) only once the owner picks one (`../docs/HOSTING.md`).
  The DPA is English only too; a German (AVV) and French courtesy translation is next.
- The official Schematron (BR-xx) runs only where `slimdom` and `fontoxpath` are
  installed (`../plain-node.mjs`); without them the report says `schematron: "unavailable"`.
- Templates were written from the rules' meaning, not reviewed by a German or French
  accountant yet.

## Tests

```
node --test pro/*.test.mjs
```
