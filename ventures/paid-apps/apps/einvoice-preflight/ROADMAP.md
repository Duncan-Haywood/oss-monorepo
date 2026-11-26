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

## Must do before a public launch

- Owner: the licence decision on the third-party rule sets in `plain/` (EUPL-1.2, MPL-2.0,
  Apache-2.0, LGPL-3.0, and the Croatian set with no stated licence; `PROVENANCE.md`) before
  any paid release that ships or serves them.
- Owner: Paddle secrets and a notification destination ([docs/BILLING.md](docs/BILLING.md),
  "Turning it on"); a domain; the operator name and contact on the site's privacy pages.
- A native German and a native French reviewer for the explanation templates and the site
  copy (both say they are unreviewed).
- Re-check each official deadline source directly (the site's sources were read through
  search excerpts on 2026-11-24; `apps/einvoice-site/content/deadlines.mjs`).

## Next (by what stands between the bet and a paying accountant)

1. Hosting, part 2: the owner picks a Node container host (needs a card) for `Dockerfile.pro`
   with one volume at `/data`; then a daily `VACUUM INTO` backup of the SQLite file.
2. Workspace page, part 2 (part 1 done 2026-11-26: `/app` with trial sign-up, key sign-in, clients,
   batches, explanations, fixed file and diff downloads, history): email sign-in with a reset
   link, API keys on the page, a terms link at sign-up, and the einvoice-site CTA pointing at `/app`
   once a host serves it.
3. `scripts/import-venture.mjs`: also flag NOTICE and `*.LICENSE.txt` files, not only `LICENSE`.
4. XSD schema validation for UBL 2.1 (CII D16B done 2026-11-26: `cii-xsd.mjs`, rules CII-001..007,
   for EN 16931 files and their CIUSes, namespaces included; 499 of 499 verdicts agree with
   xmllint; the site's lists say so in all three languages; README, "CII schema (XSD)
   validation"). Next: the OASIS UBL 2.1 schemas (docs.oasis-open.org was refused by the build
   host's proxy, and ConnectingEurope's repository carries no UBL XSD; try an npm or Maven package
   that ships them, check the OASIS licence), which need `ref=` to global elements and
   `xsd:any` (UBLExtensions) in the builder; then the Factur-X EXTENDED, MINIMUM and BASIC WL
   schemas from the Factur-X package, so those profiles are checked by their own schema.
