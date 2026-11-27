# E-invoice fix-and-explain: roadmap

Bet #3 in oss-monorepo `portfolio/monetization/bets.md`: German and French SMEs and their
accountants, ahead of the issuing mandates (Germany: prior-year turnover above €800k from
1 January 2027, everyone from 1 January 2028; France: SMEs from 1 September 2027). The
marketing site is `apps/einvoice-site`. Rules for this app: `pro/README.md` and the root
`CLAUDE.md` (validity is decided by deterministic code only; the model only explains).

## Done

- Import of oss-monorepo `ventures/einvoice-preflight` at `8e9e26d5e5e8` (2026-11-24, PR #26,
  merged 2026-11-26), with the licence review in `PROVENANCE.md`.
- Paid layer `pro/` (PR #26): DE/FR/EN explanation templates for every built-in rule id,
  a guarded model fallback for the long tail, four deterministic `PRO-*` rules, the safe-fix
  whitelist with diffs and re-validation, accountant workspace (clients, batches, run
  history with hashes only), metered API with hashed keys and quotas, checkout dark.
- Explanations on `claude-haiku-5-5` by default (2026-11-26, cheapest-model rule); the
  refusal fallback beta only for models that offer one (`pro/llm.test.mjs`).
- SQLite store `pro/sql-store.mjs` (2026-11-26): `SqlStore`, the same methods as `MemoryStore`,
  on `node:sqlite` (`PRO_DB_FILE`) or a D1 binding; quotas are one conditional UPDATE; one contract
  suite with the cross-account tests runs on all four stores (`pro/store-contract.test.mjs`).
- Hosting decided (2026-11-26, `docs/HOSTING.md`): one Node process + SQLite now, since the official
  Schematron needs `node:fs` and Saxon; the D1 driver keeps a Worker split open.
- The paid layer on Cloudflare Workers + D1 (2026-11-26, `worker/`, docs/HOSTING.md "On
  Cloudflare Workers"): the same handler through a fetch adapter (`pro/fetch-adapter.mjs`), the
  SqlStore on D1, the official rules on the plain route with the rule sets embedded
  (`worker/build.mjs`); 42 of 42 example files answer identically to the Node host
  (`eval/worker-parity-2026-11-26.md`), 2.0 MB gzipped, 40-440 ms CPU per invoice, so Workers
  Paid, which the account already has: no container host or new card needed.
- Marketing site `apps/einvoice-site` (PR #20, merged 2026-11-26): DE/FR/EN, deadlines
  from cited official pages, double opt-in early access.
- Billing through `packages/billing`, dark (2026-11-26, [docs/BILLING.md](docs/BILLING.md)):
  the site's tiers (Firm S/M/L, €19/€29/€49 a month) as the app's plans, with a test that they
  match the site and a 40% margin floor at full allowance; Paddle checkout bound by a signed
  one-time token, signature-verified webhook to the account's plan (idempotent, out-of-order and
  takeover events ignored, 7-day past_due grace), customer portal, public `GET /v1/billing/plans`;
  Paddle catalog as code (`billing/paddle-catalog.json`, EUR; packages/billing now takes EUR).
- Metering as the site promises (2026-11-26): an invoice counts once per account and month by
  the SHA-256 of its bytes (re-checks, duplicates in a batch and base64 copies are free, even at
  the limit), "explained" counts once per invoice per month that needed the model; all four
  stores (`meterDocuments`, `unmeterDocuments`, `meterExplained`, contract-tested), usage headers
  on every metered response.
- Workspace page, part 1 (2026-11-26): `GET /app` (pro/web/, DE/FR/EN, no build, strict CSP, DOM
  from text nodes only): public trial sign-up `POST /v1/signup` (terms box required; per-IP and
  daily caps; `PUBLIC_SIGNUP=off`), sign-in by API key, plan and usage meters with upgrade buttons,
  clients, drag-and-drop batches split to the API's caps, explanations, fixed file and diff
  downloads, history. Tested in Node (`pro/signup.test.mjs`, `pro/workspace-lib.test.mjs`) and
  driven in Chromium (sign up, add client, three files incl. a Factur-X PDF, download the fix).
- The paid API in a container (2026-11-26): `Dockerfile.pro`, built from the repository root,
  ships `pro/` and `packages/billing/src` and starts `pro/serve.mjs`, one process on one port
  for the free pages, `/app` and the paid API, with the SQLite file on a `/data` volume. The free
  JSON API stays off (`FREE_API=on` serves it). `pro/serve.test.mjs`; the runtime stage was built
  and run with Docker (sign-up, a check, data kept across a restart; `docs/HOSTING.md`).
- Site and app say the same thing (2026-11-26, Next 3): the site's "What is checked, and what is
  not" lists (DE/FR/EN), its "Fix, carefully" step and the API page's sample now describe the
  service as it runs. Three claims were made true in the app rather than cut: `PRO-DE-001` (a
  ZUGFeRD / Factur-X MINIMUM or BASIC WL file from a German seller is not an e-invoice, BMF FAQ;
  read from the parsed invoice, so PDFs too), `profile=auto` (the workspace's "Detect from the
  file" used to apply no profile at all: now XRechnung or Peppol from the file's BT-24, France when
  seller and buyer are both French, reported as `profileDetected`), and the workspace asks for the
  official Schematron (`schematron=1`) and shows on each result which rules ran. Cut from the site:
  "file structure against the format's schema" (no UBL/CII XSD runs; now listed as not checked),
  and the fixes the whitelist never makes (totals, wrong code lists). `pro/profile-scope.test.mjs`
  and a server test; the workspace was driven in Chromium on a MINIMUM file and an XRechnung file.

- `scripts/import-venture.mjs` flags NOTICE files (root included) and bundler-extracted
  `*.LICENSE.txt` / `*.LICENSE` licence text, not only nested `LICENSE`/`COPYING` (2026-11-26,
  scripts-import-venture-mjs). Run over this app it finds `plain/NOTICE.txt` and the three
  `plain/*.LICENSE.txt` files the import's hand review already covered in `PROVENANCE.md`;
  wall-framing-takeoff has none.

- Polish KSeF, part 1 (2026-11-26, polish-ksef-part-1-pl-explanations): every FA(3) rule the
  checker emits (PL-001..PL-025, 23 ids) has a deterministic template in English, German, French
  and Polish (`pro/explain-catalog-ksef.mjs`), so a KSeF file no longer falls back to the
  checker's English text or spends a model call; `lang=pl` on `/v1/check` and batches, and PL in
  the workspace's explanation-language picker. A Polish request for a non-KSeF rule gets the
  English template with a Polish notice; the model guard also refuses Polish validity claims.
  Texts claim a KSeF refusal only where the checker does (schema, transport, date, duplicate).
  `pro/explain-ksef.test.mjs` runs all six FA(3) examples through the paid pipeline in four
  languages. The Polish text is the agent's, not yet read by a native speaker.
- Accountant client dashboard, part 1 (2026-11-26, accountant-client-dashboard-part-1): `GET
  /v1/dashboard` and the workspace's "At a glance" table: every client's status (needs attention, OK,
  not checked lately, never checked), last check, pass rate, still-failing invoices with their rules,
  the most frequent rules, attention first, over 7 to 365 days; a CSV per client in DE/FR/EN. From the
  run history only, unmetered (`pro/dashboard.mjs`, pro/README.md "At a glance").
- Polish KSeF, part 2, the workspace in Polish (2026-11-26, polish-ksef-part-2-workspace-ui-pl):
  every string on `/app` in Polish (a PL button, picked from the browser language), the sign-in and
  confirmation emails, and the dashboard CSV's headings; Polish readers get the English legal texts,
  which govern (`pro/workspace-pl.test.mjs`). Drafted by the agent, not yet read by a native speaker.
- PDF to ZUGFeRD, part 1 (2026-11-26, pdf-to-zugferd-part-1-draft-from-text): `POST /v1/convert`
  reads a plain PDF invoice's text layer (`pro/pdf-text.mjs`, positioned lines and table cells) and
  returns the creator's draft (`pro/pdf-draft.mjs`) with the source line of every value; IBANs by
  mod-97 at the registered length, VAT IDs by `vat.mjs`, rows only when quantity x price = amount,
  the PDF's printed totals as the cross-check, § 13b / § 19 / 293 B / intra-EU wording to the VAT
  category; no model. Chromium, LibreOffice and the creator's own PDFs read back complete and the
  resulting Factur-X passes the checker (`pro/pdf-draft.test.mjs`); pro/README.md "PDF to ZUGFeRD".
- PDF to ZUGFeRD, part 2, discounts, charges and pages (2026-11-26,
  pdf-to-zugferd-part-2-allowances-multipage): discount and charge lines between the rows and the
  total become document-level allowances and charges (BG-20/21) with the PDF's wording, each at the
  VAT rate the printed per-rate VAT proves (else left in `missing`); page and section subtotals with
  rows after them carry forward and are checked against the rows above; LibreOffice layouts
  (wrapped labels, rate and amount in one cell, stacked party blocks). Six new PDFs (Chromium and
  LibreOffice) read completely and pass the checker as Factur-X (`pro/pdf-draft-part2.test.mjs`).

- PDF to ZUGFeRD, part 2 (2026-11-26, pdf-to-zugferd-part-2-workspace-screen): the workspace's
  "PDF to e-invoice" screen: drop a PDF, every value beside the line it was read from, confirm the
  marked ones, fill what is missing, edit the lines, then build and check Factur-X / CII / UBL
  (`POST /v1/convert/build`, one unit by the XML's hash). The download is locked until every mark
  is confirmed and the totals match the PDF. DE/FR/EN/PL (Polish unreviewed); einvoice-site's "From a
  PDF" step in three languages; pro/README.md "Part 2: the convert screen".

- PDF to ZUGFeRD, part 3, row discounts (2026-11-26, pdf-to-zugferd-part-3-line-discounts): a
  table with a Rabatt / Remise / Discount column has its rows read as quantity x price less a
  percent or an amount, only where exactly one reading comes out to the cent, and the draft line
  carries it as a line allowance (BG-27). The creator writes line allowances and charges (BG-27/28)
  in UBL and CII for every profile; no new finding under the EN 16931, XRechnung and Peppol rules
  (`generate-line-allowances.test.mjs`); new fixture `rechnung-zeilenrabatt-de` (Chromium and
  LibreOffice) passes the checker as Factur-X (`pro/pdf-draft-part3.test.mjs`).

- PDF to ZUGFeRD, part 3, a row's discount editable (2026-11-26,
  pdf-to-zugferd-part-3-row-discount-edit): the convert screen's line table has a Rabatt / Remise /
  Discount / Rabat column before the VAT rate, showing what the reader found ("10 %" or an amount).
  Typing "12 %" or "5,00" rewrites the line allowance (BG-27) and keeps the PDF's own word for it as
  the reason; blank removes it; anything else is shown as unreadable and "Build" waits, nothing is
  guessed. A line with several allowances shows them read-only. A changed discount is caught by the
  totals check against the PDF as before. Also fixed: a "null" printed under the line table on
  invoices with no whole-invoice discount. `pro/convert-discount.test.mjs`; driven in Chromium on
  `rechnung-zeilenrabatt-de` (cells read, bad input blocks Build, 12 % shows the net/VAT/total
  mismatch, back to 10 % clears it).

- PDF to ZUGFeRD, part 3, saved to a client's history (2026-11-26,
  pdf-to-zugferd-part-3-save-to-history): after an unlocked build the convert screen offers "Save to
  history" for one of the account's clients; `POST /v1/convert/build` with `clientId` records the
  server's own build and check as a one-file run (`origin: "convert"`, format, XML hash), not charged
  again, other accounts' clients refused before metering (`pro/convert-history.test.mjs`, memory and
  SQLite; driven in Chromium).

- PDF to ZUGFeRD, part 3, a discount on its own line under its row (2026-11-26,
  pdf-to-zugferd-part-3-discount-own-line): "abzgl. 8 % Rabatt  -85,44 €" printed beneath a row is
  that row's line allowance (BG-27), a Zuschlag line its charge (BG-28), when only the row's wrapped
  description stands between them and another row follows; under the last row only when its percent
  fits that row to the cent or the rows above set the pattern. Before, such a line ended the table and
  every later row was lost. New fixture `rechnung-positionsrabatt-de` (Chromium and LibreOffice)
  reads completely and passes the checker as Factur-X (`pro/pdf-draft-part3-own-line.test.mjs`);
  the convert screen shows a row's charge read-only in its discount cell.

- Polish KSeF, part 2, the Poland page on einvoice-site (2026-11-26, polish-ksef-site-page):
  `/en/deadlines/poland/`, `/de/fristen/polen/`, `/fr/echeances/pologne/`, in the nav, the home
  page's deadlines and "checked" list, the early-access form's countries and llms.txt. Five KSeF
  dates (receiving 1 Feb 2026; issuing 1 Feb 2026 above PLN 200m, 1 Apr 2026 for the rest; the
  PLN 10,000-a-month relief to 31 Dec 2026; everyone from 1 Jan 2027) and three rules (FA(3), no
  invoice without a KSeF number, foreign sellers without a Polish establishment, foreign buyers
  get a PDF with a QR code), each read directly from ksef.podatki.gov.pl on 2026-11-26. The page
  says we do not send to KSeF. `test/build.test.mjs` (+1).

- BR-CO-17 rounding margin on the built-in route (2026-11-27, br-co-17-rounding-tolerance): a VAT
  breakdown row less than one currency unit off taxable x rate on a document declaring EN 16931 or a
  CIUS of it (BT-24 `urn:cen.eu:en16931:...`) is an INV-038 *warning*, not a blocking error, and the
  tax total (INV-018) may equal the rows' sum, as CEN's Schematron 1.3.x accepts (VAT rounded per
  line). The 2026-11-19 quality audit found 80 of 80 such files blocked here and passed by CEN, so a
  paying accountant would have been told to "fix" valid invoices. A unit or more off, a total that
  is neither reading, a zero rate, and PINT/ZATCA/national formats keep the exact test. The paid
  explanation has its own DE/FR/EN text for the warning ("no change is needed"); the Python CLI stays
  silent there (no warning severity). `br-co-17-tolerance.test.mjs`, `tests/test_br_co_17.py`,
  `pro/explain.test.mjs`.

- Belgium page on einvoice-site (2026-11-27, belgium-site-page): `/en/deadlines/belgium/`,
  `/de/fristen/belgien/`, `/fr/echeances/belgique/`, in the nav, the home page's deadlines and "checked"
  list (the 0208 enterprise-number check and Peppol BIS rules), the early-access form's countries and
  llms.txt. Five dates (B2G from 1 March 2024; receiving and issuing B2B over Peppol in Peppol BIS from
  1 January 2026; the general tolerance to 31 March 2026; the self-billing tolerance to 30 June 2026)
  and three rules (the fallback when the buyer cannot receive, who is not covered, e-reporting planned
  for 2028 but not yet law), each read directly from efacture.belgium.be on 2026-11-27. The page says
  we are not a Peppol access point. `test/build.test.mjs` (+1).

## Must do before a public launch

- Owner: the licence decision on the third-party rule sets in `plain/` (EUPL-1.2, MPL-2.0,
  Apache-2.0, LGPL-3.0, and the Croatian set with no stated licence; `PROVENANCE.md`) before
  any paid release that ships or serves them.
- Owner: Paddle secrets and a notification destination ([docs/BILLING.md](docs/BILLING.md),
  "Turning it on"); a domain; the operator name and contact on the site's privacy pages.
- A native German and a native French reviewer for the explanation templates and the site
  copy (both say they are unreviewed); a native Polish reviewer for the KSeF templates and the
  workspace page's Polish text before KSeF is marketed in Polish.
- Re-check each official deadline source directly (the site's sources were read through
  search excerpts on 2026-11-24; `apps/einvoice-site/content/deadlines.mjs`).

- Dutch explanations, part 1 (2026-11-27, dutch-explanations-part-1): the wedge in bets.md promises
  "plain German, French or Dutch", and the app had no Dutch. Every rule except the KSeF ones (111 ids)
  now has a Dutch template (`pro/explain-catalog-nl.mjs`, formal "u", neutral standard Dutch);
  `lang=nl` on `/v1/check`, batches, convert and the dashboard CSV (Dutch headings and statuses); NL in
  the workspace's explanation-language picker; Dutch AI and checker notices, the model's system prompt
  names Belgium and the Netherlands, and the guard refuses Dutch validity claims ("is geldig", "voldoet
  aan ...") but lets "voldoet niet" through. `pro/explain-nl.test.mjs` holds every Dutch text to the
  English one's placeholders, codes, BT numbers, URNs and amounts, and runs the example files through the
  paid pipeline in Dutch. einvoice-site now says "German, French, Dutch or English" where it describes
  explanations. Drafted by the agent, not yet read by a native speaker.
- Dutch, part 2 (2026-11-27, dutch-part-2-part-1-done-2026-11): the workspace page itself in Dutch
  (`web/app.js`: every page string, the PDF-to-e-invoice card and its field labels, NL in the language
  switcher, picked from an `nl-*` browser language and remembered), both sign-in emails in Dutch
  (`pro/email.mjs`), prices written "€ 19,50", and Dutch readers get the English legal texts with a line
  saying the English text governs (no Dutch translation exists). The country hint reads "NL, BE, …" and
  the e-invoice address hint names the Belgian (0208) and Dutch (0106) Peppol schemes.
  `pro/workspace-nl.test.mjs` holds every Dutch table to the English keys and placeholders. Checked in
  Chromium with an `nl-BE` locale: sign-up, the signed-in workspace and the converter card render in
  Dutch with no page errors. Drafted by the agent, not yet read by a native speaker.

- Metered validation API, part 1 (2026-11-27, metered-validation-api-part-1-vendor-plan): the site's
  vendor offer as the `api` plan (€1.40 per 1,000 invoices validated, €0.04 per invoice with errors
  explained, €19 minimum credited; rates tested equal to the site's `API_METER`); invoices with errors
  counted once a month in all four stores; `GET /v1/billing/usage`, `meter` on `/v1/account` and
  `x-usage-amount-cents`; month-end settlement `POST /v1/admin/usage/settle` that bills the usage above
  the minimum once as a Paddle one-time charge (packages/billing `chargeUsage`, fake and Paddle,
  contract-tested); margin per unit tested at the minimum and the caps (pro/README.md "The metered
  API plan", docs/BILLING.md).
- Metered validation API, part 2a (2026-11-27, metered-validation-api-part-2-explain-off): `explain=0`
  on checks, batches and converter builds: the same verdict and findings with the checker's own
  English text, no fixes, `explained: false`, billed as a validation unit even when the file fails;
  a later explained check of the file marks it once; `explain=0&fix=1` refused before metering
  (pro/README.md "The metered API plan", `pro/metered-api.test.mjs`).

- Metered validation API, part 2b (2026-11-27, metered-api-site-vendor-page): einvoice-site's API page
  in all three languages now matches the shipped `api` plan: a validation-only section naming
  `explain=0` with its response shape and billing (a failing file stays a validation unit,
  `explain=0&fix=1` refused), how usage is counted and billed (one unit per file and month by
  SHA-256, the minimum paid in advance and credited, usage above it charged once with the next
  renewal, `x-usage-amount-cents`, `GET /v1/billing/usage`, the safety caps), and the early-access
  form on the page itself with "software vendor" pre-selected. The old "billed monthly in arrears"
  line, wrong for the minimum, is gone from the page and corrected in docs/PRICING.md.

- einvoice-site in Dutch (2026-11-27, einvoice-site-dutch): the marketing site's fourth language, every
  page under `/nl/` (home, boekhouders, api, prijzen, the four deadline pages, vroege-toegang, privacy
  and the form-flow pages), Belgium first for Flemish accountants, each deadline text in Dutch, the
  sign-up email in Dutch, and a D1 migration so the form stores `nl`. Drafted by the agent, not yet read
  by a native speaker (einvoice-site README, "Dutch").

## Next (by what stands between the bet and a paying accountant)

1. Hosting, part 3 (part 2 done 2026-11-26: the Worker + D1 build, and the manual deploy workflow
   `einvoice-preflight-deploy.yml` with `worker/provision.mjs`, which creates the `einvoice-pro` D1
   database in the EU jurisdiction, writes the deploy config, syncs the Paddle catalog and secrets,
   generates `CHECKOUT_SECRET` once and smoke-tests the pages; Cloudflare named as the hosting
   sub-processor in the Privacy Policy and the DPA's Annex I.B, II and III in all three languages,
   invocation logs off; docs/HOSTING.md "Deploying"): the owner runs the workflow once (Cloudflare
   secrets are already shared with the other apps); then add `einvoice-pro` to `set-admins.yml`'s
   `apps`, re-read CPU per check from Workers Metrics, and point einvoice-site's CTA at the
   Worker's `/app`. A D1-backed sign-up cap if trial abuse shows up (the in-memory one is per
   isolate). The Node container (`Dockerfile.pro`) stays the alternative and the only Saxon route.
2. Workspace page, part 2 (part 1 done 2026-11-26: `/app` with trial sign-up, key sign-in, clients,
   batches, explanations, fixed file and diff downloads, history; API keys on the page and the
   Terms and Privacy Policy linked at sign-up with the accepted version recorded, done 2026-11-26,
   `pro/legal/`, pro/README.md "The workspace page"; email sign-in, a confirmed address and a
   one-time link that issues a new key, done 2026-11-26, pro/README.md "Email sign-in", off until
   the owner sets `RESEND_API_KEY` and a sending domain; the data processing agreement, GDPR Art. 28
   with the 2021/914 SCCs, incorporated by the Terms and served at `/app/dpa`, done 2026-11-26,
   pro/README.md "The workspace page"; German and French versions of the three legal pages, the
   English text governing, done 2026-11-26, pro/README.md "Translations"): check the DPA's SCC
   clause choices against EUR-Lex once it answers (403 at the proxy again on 2026-11-26), and the
   German and French SCC terms against the official language versions there;
   the host is named (Cloudflare, 2026-11-26, item 1); and the einvoice-site CTA pointing at `/app`
   once the deploy has run.
3. XSD schema validation: CII D16B done 2026-11-26 (`cii-xsd.mjs`, rules CII-001..007, for
   EN 16931 files and their CIUSes, namespaces included; 499 of 499 verdicts agree with xmllint;
   README, "CII schema (XSD) validation"). UBL 2.1 done 2026-11-26 (`build-ubl-schema.mjs` from
   the OASIS UBL-2.1.zip, which docs.oasis-open.org served this time, SHA-256 pinned;
   `ubl-xsd.mjs`, UBL-XSD-01..07 on every UBL file; same verdict as xmllint on 38 of 38 files and
   21,719 of 21,726 mutated ones, the 7 being base64 that libxml2 accepts and Xerces refuses,
   `eval/ubl-xsd-2026-11-26.md`). Both are "checked" on einvoice-site in all three languages.
   Factur-X MINIMUM, BASIC WL and EXTENDED done 2026-11-26 (`build-facturx-schema.mjs` from the
   Factur-X 1.0.9 XSDs, picked by BT-24 in `cii-xsd.mjs`; CII-005 also refuses undeclared attributes;
   1,199 of 1,199 mutants agree with xmllint, `eval/facturx-xsd-2026-11-26.md`). The French
   EXTENDED-CTC-FR schema done 2026-11-26 (the full UN/CEFACT D22B set akretion ships as
   `cii-extended-ctc-fr`, read by `build-facturx-schema.mjs`, picked by BT-24; 5 of 5 FNFE-MPE
   examples and 1,499 of 1,499 mutants agree with xmllint, same eval file). Next: the XRechnung
   extension's schema, if German files declaring it turn up.
4. Accountant client dashboard, part 2 (part 1 done 2026-11-26): the dashboard in the monthly or
   weekly email to the firm's sign-in address (needs email sign-in on: `RESEND_API_KEY`), and the
   failing rules grouped by the invoice's seller once the run history stores a seller id (today it
   keeps hashes and rule ids only; a seller VAT id would be personal data under the DPA, so it needs
   the Annex I update in the same PR), if accountants ask.
5. Polish KSeF, part 3 (part 1 done 2026-11-26: PL templates in four languages, `lang=pl`; part 2:
   the workspace in Polish and the einvoice-site Poland page, both done 2026-11-26): the
   native-speaker read of the Polish templates and workspace (Must do above), and a Polish-language
   version of einvoice-site, only if Polish accountants are a market worth the site's space (bets.md
   lists KSeF as a growth path, not the wedge; the form's country boxes now count PL requests).
6. PDF to ZUGFeRD, part 3 (parts 1 and 2 done 2026-11-26: `POST /v1/convert`, the workspace's
   convert screen with build, check and a download locked until the totals match, and discounts and
   charges below the table and rows continued across pages; row discounts from a discount column
   done 2026-11-26; a row's discount editable on the convert screen and saving the converted invoice
   to a client's history, both done 2026-11-26; a discount printed on its own line under its row
   done 2026-11-26; a description over several lines and across a page break, and rows in m³ and t,
   done 2026-11-26): scans (OCR) if customers send them.
7. Dutch, part 2 (part 1 done 2026-11-27: every non-KSeF rule explained in Dutch, `lang=nl`): a
   native speaker's read of `pro/explain-catalog-nl.mjs` and the workspace's Dutch strings (Flemish and
   Netherlands usage; part 2, the workspace page and emails, done 2026-11-27; einvoice-site in Dutch,
   every page under `/nl/` written for Belgian accountants, done 2026-11-27, einvoice-site README
   "Dutch"): the same native read for `apps/einvoice-site/content/i18n/nl.mjs`, and the Dutch pages'
   CTA pointed at the workspace once the deploy has run.
8. Metered validation API, part 2 (part 1 done 2026-11-27; `explain=0` plain validation done
   2026-11-27): the settlement on a schedule (a Worker cron on the 1st once the deploy has run,
   calling the same `settleUsage`); the einvoice-site API page's link to the `api` plan's sign-up
   once the deploy has run (the page itself, done 2026-11-27, below).
