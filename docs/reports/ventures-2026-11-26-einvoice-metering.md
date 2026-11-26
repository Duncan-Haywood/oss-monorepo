---
kind: milestone
date: 2026-11-26
---
# E-invoice fix-and-explain (bet #3): metering as the site promises

2026-11-26, private PR 217 (merged). This was item 3 under "Next" in
`private-monorepo/apps/einvoice-preflight/ROADMAP.md`.

## Why

The pricing page (`apps/einvoice-site/docs/PRICING.md`) promises "an invoice counts once per month,
however often it is re-checked" and sells "invoices explained" per month. The API charged a
document unit for every check and an explanation unit for every model call. So an accountant who
re-checked a client's invoice after fixing it paid twice, which is not what the page sells.

## What landed

- **Documents:** one unit per account, month and SHA-256 of the invoice bytes. Re-checks,
  duplicates inside one batch and base64 copies are free, even when the account is at its limit.
  A batch is metered all or nothing. If the work throws, the hashes it added are unmetered.
- **Explained:** one unit per invoice per month that needed the model. The first model call for an
  invoice reserves the unit and later calls for it are free. Templates stay free. An invoice that
  was never metered pays per call (no route does this today).
- **Stores:** `meterDocuments`, `unmeterDocuments` and `meterExplained` on all four stores, with one
  contract test that runs on each. SQL uses a new `metered_documents` table (`CREATE TABLE IF NOT
  EXISTS`, so existing databases pick it up on start) and inserts in chunks of 30 rows to stay under
  D1's limit of 100 bound parameters. Earlier months' rows are pruned.
- **Headers:** `x-usage-documents-charged` and `x-usage-explained-used`/`-limit` on every metered
  response.

## For the next run

- **Known SQL race:** two requests with the same new invoice can arrive together at the quota edge.
  If one is refused, the other may leave that invoice uncounted. The error favours the customer and
  is documented in `sql-store.mjs`.
- **Not done:** the vendor API meter on the site (per 1,000 validations, billed monthly in arrears)
  has no code. Today's plans are only the accountant tiers.
- **CI:** private CI was starved (no runner). The suites ran locally: `pro/*.test.mjs` 89/89, and
  root `*.test.mjs` 2,321 of 2,322. The one failure is the known `pdfdetach` sandbox failure in
  `repair-facturx.test.mjs`.
- **Next items on the roadmap:** the owner picks a container host, `pro/` goes into the
  `Dockerfile`, then the accountant web UI.
