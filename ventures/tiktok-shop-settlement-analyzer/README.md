# TikTok Shop Settlement Analyzer

A free browser tool for TikTok Shop sellers: **drop in your sales CSV and see
what you actually take home.** The file is read in the browser; nothing is uploaded and
no TikTok Shop account access is needed.

**Live tool:** https://marisstella.app/tiktok-shop-settlement-analyzer/

After using this, you can now **see the service fee TikTok Shop actually took (observed, not
assumed), your take-home per order, net revenue per product and per buyer, repeat-buyer
share, refunds and cancellations, withdrawal costs, funds still clearing, and the price
to charge for a target take-home**, which used to mean building the pivot table by hand.

## Input

Any CSV with an amount: `Amount`/`Price` (before fee) and/or `Earnings`/`Net` (what you
keep). `Date`, `Type`, `Status`, `Product`, `Buyer`, `Service fee` and `Hours` are used when
present. **Column names are matched by alias and were not checked against a real TikTok Shop
export; the assumed names are stated on the page.** Comma/tab/semicolon files, quoted
fields, US and day-first dates and UTF-16 exports are read. Unreadable rows are listed
with a line number and reason.

## Model

Fee rate is fees over order value from the file's fee column or amount minus earnings;
the percentage you enter is used only when the file has neither, and the page says so.
Take-home is net order and tip revenue minus refunds, your cost per order and withdrawal
fees. Hours (optional, yours) enable a take-home-per-hour ranking; the tool never guesses
them. Break-even price is (target + cost) / (1 - fee rate), also shown adjusted for your
refund rate. See the page for what is not modelled.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Known gaps (quality audit 2026-11-20)

From the census audit, [`2026-11-20-tiktok-shop-settlement-analyzer.json`](../../portfolio/quality/audits/2026-11-20-tiktok-shop-settlement-analyzer.json). Fixed in PR #17836: positive Adjustment rows read as refunds, year-first slash dates rejected, a Fiverr page label. Still open:

Re-audit 2026-11-21 ([`2026-11-21-tiktok-shop-settlement-analyzer.json`](../../portfolio/quality/audits/2026-11-21-tiktok-shop-settlement-analyzer.json)): fixed in PR #18064, a positive adjustment (or reimbursement) counted as an order, taking a cost per order and an assumed fee; "Inactive" read as still clearing and "Unsettled" not. Also still open from it: three seeded mutants survive (date-range end day, refund-share severity threshold, net above gross in difference mode).

- The engine is the Fiverr earnings analyzer with a TikTok skin. It has never been run on a real TikTok Shop settlement export, whose fee columns are negative and split by type (referral fee, affiliate commission, shipping).
- The headline "TikTok Shop kept X%" counts affiliate commission paid to creators as TikTok's fee.
- The refund administration fee (20% of the referral fee, capped at $5) is not modelled.
- Fiverr and Upwork ideas remain on the page: tips, hours per order and withdrawal fees.
- There is no reconciliation of settlements to payouts.
