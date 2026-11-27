# Seller Books pricing: proposed tiers and why

Status: **the app's prices, not yet charged** (2026-11-27). The app (`apps/seller-books`, `src/shared/plans.ts`)
is open on its Free plan; the paid plans below are set up there but not on sale until Paddle checkout is
live, and the site says so on every page (`src/launch.mjs`). Written 2026-11-24 as the early-access proposal.
The tiers live in `src/content.mjs` (`TIERS`) and the site, llms.txt and tests read them from there.

## The proposal

| Plan | Monthly | Annual | Orders / month (all platforms) | Platforms | Adds |
| --- | --- | --- | --- | --- | --- |
| Side hustle | $15 | $150 | up to 100 | up to 2 | profit per sale, fees, COGS, mileage log, Schedule C worksheet |
| Full time | $35 | $350 | up to 600 | all 6 | bulk-lot cost splitting, year-end inventory, monthly profit by platform, CSV for a tax preparer |
| Business | $69 | $690 | up to 2,500 | all 6 | 3 extra users (helper / bookkeeper / preparer), quarterly profit summaries, inventory aging |
| Over 2,500 | talk to us | | | | |

Annual = 10 × monthly. Going over the order cap in a busy month never locks anything; repeated overage
gets a suggestion to move up, the seller decides.

## Where the market sits (the $10–20 wedge)

Reseller bookkeeping tools cluster at roughly $10–20 a month for the entry plan. Anchors found on
2026-11-24 (third-party pages; the vendors' own pricing pages could not be fetched from the build
sandbox, so **re-check every figure on the vendor's page before quoting it anywhere**):

| Product | What we found | Source |
| --- | --- | --- |
| Seller Ledger | "from $10/month", free trial; supports eBay, Etsy, Poshmark, Mercari, Amazon | [Shopify App Store listing](https://apps.shopify.com/seller-ledger), [EcommerceBytes, 2023](https://www.ecommercebytes.com/2023/10/23/bookkeeping-solution-now-supports-amazon-poshmark-in-addition-to-ebay-and-etsy/) |
| My Reseller Genie | entry plan around $10/month; top tier connects eBay, Poshmark, Mercari, Whatnot, Etsy, Depop, Vinted | [Voolist guide](https://www.voolist.com/blog/best-tools-to-manage-poshmark-business) |
| Flipwise and similar | category described as $10–30/month | [Closo blog](https://closo.co/blogs/fees/flipwise-pricing) (third-party, partly garbled; weakest source) |

The sourced competitor table for this bet is in oss-monorepo `portfolio/monetization/bets.md` (bet #5).
This session could not read that repository; reconcile the two tables before launch and keep the
better-sourced one.

## Why move up from the wedge

1. **Price on the value metric, not on features.** What a reseller gets from the books grows with
   order volume: more orders means more fees, refunds and labels to reconcile, more items whose cost
   has to follow them, and more profit (and tax) riding on the numbers being right. Orders per month
   is also something the seller already knows about themselves, so picking a plan is easy, and the
   early-access form asks for it (`VOLUME_BANDS` map onto the tiers: under 100 → Side hustle,
   100–600 → Full time, 600–2,500 → Business, more → talk to us).
2. **Multi-platform is the pain and the differentiator.** One platform's dashboard already shows a
   payout. The job nobody does well is six different reports, fee structures and payout timings in one
   ledger, with crosslisted items costed once. That is gated at the Full time tier (all 6 platforms),
   which is where full-time resellers are.
3. **Per order the price falls as the business grows.** At the cap, Full time is about 6¢ an order
   ($35 / 600) and Business about 3¢ ($69 / 2,500), while Side hustle at its cap is 15¢. Bigger sellers
   pay more in total and less per order, which reads as fair.
4. **The entry tier stays in the wedge.** $15 keeps the side-hustler (the largest group, and the
   source of word of mouth) from comparing us only on price, while the plans where the business value
   is concentrate the revenue.
5. **Costs scale with orders too.** Imports, storage and support grow roughly with order volume;
   compute on Cloudflare is small per order and no plan depends on per-order model calls. The caps keep
   the cheapest tier from carrying the heaviest users. (When real cost data exists, check each tier
   against the cost-plus floor the way `apps/grants/docs/PRICING.md` does.)

## What would change the proposal

- **Signup mix.** If most early-access signups pick 100–600 orders and 3+ platforms, Full time is the
  core plan and its price is the one to test hardest (e.g. $29 vs $35 vs $39 in invite cohorts).
- **Competitor parity on platforms.** If a $10–20 product already covers all six platforms with
  per-sale fees and lot costing, the Full time premium has to be earned on accuracy (fees from the
  seller's own reports, inventory at year end) and the gap may need to narrow.
- **Willingness to pay at Business.** Extra users and accountant access are guesses at what larger
  sellers need; interview the 600+ order signups before building them.

## Copy rules for anything about price

- Before launch: say "proposed" and "nothing is charged during early access" wherever a price appears.
  Since the app opened: show the Free plan first and mark paid plans "not on sale yet" until
  `PAID_PLANS_ON` (the launch switch writes both).
- No savings claims ("saves you $X / N hours"), no comparisons with a competitor's price on the site,
  no testimonials, no ratings in JSON-LD.
- Not tax advice. 1099-K: state the federal threshold ($20,000 and 200 transactions; some states lower)
  calmly; never use it as a scare.
