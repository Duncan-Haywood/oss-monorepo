---
kind: note
subjects: [ebay-fee-calculator, etsy-profit-calculator, poshmark-fee-calculator, mercari-fee-calculator, depop-fee-calculator, whatnot-seller-payout, grailed-fee-calculator, facebook-marketplace-fee-calculator, stockx-seller-payout-calculator, tiktok-shop-fee-calculator]
---
# Seller tools as front doors for bet #5, reseller books (agent note)

Bet #5 in `portfolio/monetization/bets.md` (branch `claude/relaxed-planck-7fn5tx` at the time) is reseller profit and Schedule C books. These are its free front doors.

## Which ten, and why

I picked them by search intent first (the "<marketplace> fee calculator" queries that multi-platform resellers type) and depth second (number of decision pages already built):

- eBay (largest reseller marketplace; 30+ pages, the strongest tool, so the guides live there)
- Etsy, Poshmark, Mercari, Depop, Whatnot, Grailed, Facebook Marketplace, StockX, TikTok Shop

Left out: `amazon-fba-calculator` and `shopify-fee-calculator`. Their users are mostly brand and private-label sellers, not the multi-platform resellers the bet targets. The narrower analyzers (`*-statement-*`, `*-to-journal`) can follow later.

## Fee recheck, 2026-11-24

Direct fetches of every marketplace host fail DNS in the cloud container (allowlist). I rechecked through web-search extracts of each official page. Each lead now says "rechecked as of 2026-11-24".

| Tool | Figures | Official page | Change made |
|---|---|---|---|
| eBay | 13.6% to $7,500, $0.40/order ($0.30 at or under $10) | ebay.com selling fees id=4822, Seller Center fee table | date |
| Etsy | $0.20, 6.5%, 3% + $0.25 | Etsy Fee Basics | date |
| Poshmark | $2.95 under $15, 20% at $15+ | Poshmark support article 297755057 | source renamed; Texas seller fee tax since 2025-10-01 noted |
| Mercari | 10% of item + buyer-paid shipping; 3.6% buyer fee | Mercari help 169, 2518 | date |
| Depop | US 0% selling, 3.3% + $0.45 | depophelp article 360001791127 | date |
| Whatnot | 8% commission, 2.9% + $0.30 on order total | help.whatnot.com 4847069165965 | hint cites it; caps flagged as unconfirmed |
| Grailed | 6% under $120 (min $1.99), 9% at $120+ | support.grailed.com 30282580172045 | source now Grailed's own; processing still third-party |
| Facebook Marketplace | 10%, $0.80 minimum (shipped) | not fetchable; 2026 guides agree | wording says so |
| StockX | Level 1 9% (another StockX page says 8.5%), 3%, $5.00 US minimum | stockx.com help "What are StockX's fees for sellers?" | new note; the calc does NOT model the $5 minimum (follow-up: add it) |
| TikTok Shop | 6% vs announced 8% unresolved | TikTok public table still 6% (May 2026 revision) | lead shortened (100-word limit), FAQ status updated |

## What landed

- A "Track true profit across every platform" section (`id="true-profit"`) before the footer of each of the ten `index.html` files. It links `../industries/online-sellers/` ("in development — early access") and the three guides. It sits as inline-styled HTML in each venture; `platform/pages` is untouched (siblings own it).
- `llms.txt` and README sections in all ten.
- Three guides in `ventures/ebay-fee-calculator/`, in the sitemap, tested by `reseller-guides.test.mjs` (the arithmetic, FAQ schema, disclaimer, no `$600` 1099-K figure).

## For the next run

- `../industries/online-sellers/` is a sibling session's page. If it has not landed, the link 404s until it does; check before the next edit.
- StockX: model the $5.00 minimum seller fee in `calc.mjs`.
- When marketplace hosts are reachable, read the pages directly and replace "search extracts" in the leads.
