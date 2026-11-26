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
- Not done (next run): the rate-card import's `readMoneyCell` still takes only `$`/"USD"; a EUR
  shop's "€85" cell is refused. Plan prices (Paddle) stay USD by design.
- Picking work: payapps and jobshop-quote Next lists are mostly "if a customer asks" items, and a
  parallel run claimed payapps item 7 seconds before this run did (roadmap_claim printed it as
  ALSO CLAIMED; release then pick again worked, though `--release` hit a proxy disconnect).
