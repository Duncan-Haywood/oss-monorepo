---
kind: polish
topics: [seo, product-build]
date: 2026-11-28
---

# Polish 2026-11-28: Seller Books "reconcile payouts" guide, checked by the app's deposit check

Track: polish/0. Item 3 of `polish-2026-11-28-seller-books-tables-stack-phone.md` (item 1, the
"Paid toward it" width, is open as PR #20159; item 2 is still open). The stock report half of item 3
landed as `/reseller-sell-through-rate` (PR #20024), so this run did the deposit check half. Seller
Books is bet #5.

## What was weak

The home page's "Did I import everything? Check your deposits" card was the only feature card
without a guide page, and the site had no page for the search a reseller types when the bank and the
books disagree ("why don't my eBay payouts match my sales", "reconcile payouts to bank deposits").

## What changed

- **`/reconcile-payouts`** (`apps/seller-books-site/src/pages.mjs`, `depositCheck()`): answer-first
  lead with the formula (expected payout = item sales + shipping buyers paid − refunds − fees −
  postage; sales tax left out), why the bank statement is the one record that shows a missing
  report, a worked quarter (eBay, Poshmark, Mercari; invented and labelled so), what each result
  means, money in that isn't a payout (an Amazon refund unticked, a Zelle payment), the app's
  check, four FAQs with `FAQPage` JSON-LD, the not-tax-advice note and the call to action.
- **The example is the app's arithmetic.** `test/site.test.mjs`, "the reconcile payouts page", runs
  the app's own `reconcilePayouts` (`apps/seller-books/src/shared/reconcile-payouts.ts`, loaded by
  Node's type stripping) over `DEPOSIT_EXAMPLE` with the real `PLATFORMS` list and checks every
  per-month and per-platform figure, each status, and the findings the page describes (Mercari
  September named, August not; eBay within its $201.90 threshold; Poshmark no deposits; $45.00 of
  other money; the Amazon refund reads as "no sales imported" if left ticked).
- **Links:** the deposit-check card's `guide`, `llms.txt`, the sitemap (automatic), and a sentence
  on the 1099-K page.

## Verified

| | result |
|---|---|
| seller-books-site tests (`node --test test/*.test.mjs`) | 129 pass before the 1099-K link test, 83/83 in `site.test.mjs` after |
| biome on `apps/seller-books-site` | clean |
| page `scrollWidth` at 390 px / 1280 px | 390 / 1280 (no sideways scroll) |
| feature cards without a guide page | 1 → 0 |

## Still weakest, next

1. The site's tables use `.table-scroll`; the app's `.table-stack` (label beside each figure on a
   phone) has no site equivalent, so the sell-through and reconcile tables still scroll inside their
   box at 390 px. A site-level `.table-stack` would lift every guide's tables at once.
2. The 1099-K page in the app was measured empty; its comparison tables have not been measured with
   data (item 2 of the previous note).
3. Job Shop Quote items 1, 3 to 5 of polish-2026-11-28-jobshop-dark-mode.md.
