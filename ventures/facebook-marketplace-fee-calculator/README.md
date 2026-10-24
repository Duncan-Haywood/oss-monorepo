# Facebook Marketplace Fee Calculator

A free browser tool that prices one Facebook Marketplace sale against the
current, corroborated fee schedule: **10% of the buyer-paid total** (item
price, buyer-paid shipping, and any sales tax Facebook collected) on a
**shipped checkout order**, with an **$0.80 minimum fee**, and **$0** for a
**local pickup** sale. It also models the flat $20 chargeback penalty a
disputed shipped order can carry. It shows real profit after your item and
shipping-label cost, and the item price you need to hit a target profit.
Nothing is uploaded; the arithmetic runs on the visitor's own device.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/facebook-marketplace-fee-calculator/

```
cd ventures/facebook-marketplace-fee-calculator && node --test
```

Open `index.html` in a browser to use it — there is no build step.

## Why it exists

Facebook's shipped-order selling fee has changed more than once in the last
two years, and a lot of what is written about it — old blog posts, cached
help pages, forum answers — is already stale. Getting the rate wrong in
either direction means a listing priced on a payout that will not match the
deposit.

**Shipped checkout pays 10%, with a floor.** The fee is 10% of the full
buyer-paid total, not just the item price — shipping and any sales tax
Facebook collected count too. Below an $8 total, the $0.80 minimum fee takes
over instead of the percentage, which most spreadsheet versions of this math
forget to model.

**Local pickup is genuinely free.** No selling fee, listing fee, or
subscription cost applies to a sale arranged for pickup rather than
Facebook's shipped checkout.

**A dispute costs more than the lost sale.** A payment dispute on a shipped
order, ruled against the seller, carries a flat $20 chargeback penalty on top
of losing the sale — a cost easy to leave out of a quick mental estimate.

## What it does not do

It is not Facebook's live fee schedule, a listing tool, or tax advice. It
does not connect to Facebook, create a listing, or process a payment. Every
rate is a constant corroborated against Facebook's own Commerce/Seller Help
pages and multiple independent third-party fee breakdowns, not a live fetch
— verify every figure against your own payout statement before you price a
listing.

## First visitor

The search phrases "facebook marketplace fee calculator," "facebook
marketplace seller fees," and "does facebook marketplace charge a fee," plus
r/FacebookMarketplace and the flea-market/reselling subreddits where sellers
compare payout against what they expected. Several independent blog and
calculator sites cover this exact question with inconsistent, sometimes
stale rates (a flat percentage with no minimum, or an extra processing fee
line most current sources no longer show) — proof of real search demand for
the question, and a gap this tool closes by keeping the shipped/local split
and the minimum-fee floor explicit and current.

## Comparing Facebook Marketplace against other resale channels

Selling secondhand goods on Depop, Poshmark, or Mercari instead? See
[`../depop-fee-calculator`](../depop-fee-calculator/),
[`../poshmark-fee-calculator`](../poshmark-fee-calculator/), or
[`../mercari-fee-calculator`](../mercari-fee-calculator/) for those
platforms' own schedules. Want a channel ranked against eBay, Etsy, Amazon
and a direct sale? See [`../where-to-sell-calculator`](../where-to-sell-calculator/)
or [`../marketplace-fee-compare`](../marketplace-fee-compare/).

## Privacy

Everything runs in your browser. Item prices, costs, and payouts are never
uploaded and never appear in a usage count — those are anonymous tallies of
which features were used, stored locally. We don't have accounts, tracking
cookies, or an analytics vendor.

## Usage

Anonymous, aggregate-only event counts (`sale_calculated`, `numbers_saved`)
are kept in the visitor's own browser via `localStorage` — see
[`usage.mjs`](usage.mjs). No item price, cost, or payout is ever recorded.
A checkbox in the page footer turns counting off entirely, and the counter
also honours the browser's own Do Not Track / Global Privacy Control signal.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial, or selling
advice, and it does not replace a qualified professional. **You are
responsible for reviewing and verifying its output before relying on it.**
To the maximum extent permitted by law, the authors accept no liability for
any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and
may be slow, broken, moved, or taken offline without notice. Do not use
this as a system of record.

Not affiliated with, endorsed by, or sponsored by Meta or Facebook. Facebook
Marketplace is a trademark of Meta Platforms, Inc., named here only to
describe the published fee schedule this tool computes against.

MIT licensed — see [`LICENSE`](LICENSE). Optional
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) support does
not change what the tool does.

**Open from a link.** `share.mjs` lets the page open from a `#...` link (a shared sale, or the item handed over from the [where-to-sell calculator](../where-to-sell-calculator/)); numbers stay in the URL fragment and are never sent anywhere. "Copy shareable link" makes one.
