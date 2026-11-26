---
kind: milestone
date: 2026-11-26
---
# jobshop-quote: one currency per shop (2026-11-26)

Private PR 262 (`claim/jobshop-quote/shop-currency`, ROADMAP item 11).

- `shop_settings.currency` (migration 0028), 12 two-decimal ISO 4217 codes, null = USD.
  `src/shared/currency.ts` `formatMoney` is the one formatter: costing basis, quote PDF
  ("Prices in EUR" once chosen), cover-note facts, revision change lines, expiry email, client
  `money()`, settings-import preview. Hand-rolled, not Intl, so Worker, browser and PDF agree.
- The PDF writer (`src/worker/lib/pdf.ts`, WinAnsi) printed `€` as `?` until this PR; it now
  carries `€` (0x80) and `£`. Any other non-ASCII mark still prints `?`: check there before adding
  a currency whose sign is outside WinAnsi.
- The cover-note guard (`coverNoteProblem`) refused only `$` prices before; it now refuses signs,
  codes and names for every listed currency.
- Import, done later the same day (private PR 275, `claim/jobshop-quote/rate-card-import-currency-cells`):
  `splitCurrencyMark` and `headerCurrencyMark` in `currency.ts`. `readMoneyCell(s, currency)`,
  `readRateSheet(kind, grid, currency)` and `readSettingsSheet(grid, currency)` read `€85`,
  `85,00 €`, `CA$95`, `450 kr` and headers like "Rate (€/hr)" in the shop's currency. They refuse
  a cell or a money column marked in another currency, naming both, and never convert. A bare `$`
  fits any dollar or peso shop. `normHeader` rewrites the header's mark to `$` so the existing
  `\$` header rules match any currency, which means a new money rule should key on `$`, not on
  `usd` or `€`. The currency parameters default to null (USD), so old callers behave as before.
  Plan prices (Paddle) stay USD by design.
- Picking work: payapps and jobshop-quote Next lists are mostly "if a customer asks" items, and a
  parallel run claimed payapps item 7 seconds before this run did (roadmap_claim printed it as
  ALSO CLAIMED; release then pick again worked, though `--release` hit a proxy disconnect).
