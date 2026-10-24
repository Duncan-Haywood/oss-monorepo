# Discogs Fee Calculator

A free browser tool that prices one Discogs Marketplace sale: Discogs'
published 9% selling fee on the item price **plus** buyer-paid shipping
(minimum $0.10, maximum $150 per order, in effect since May 22, 2023), an
editable payment processing fee, and what reaches you after postage, what you
paid for the record and packaging. It also solves for the item price that hits
a target profit, and prints a fee ladder from a $3 single to a $2,500 grail.
Nothing is uploaded; the arithmetic runs on the visitor's own device.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/discogs-fee-calculator/

```
cd ventures/discogs-fee-calculator && node --test
```

Open `index.html` in a browser to use it; there is no build step.

## Why it exists

"Discogs takes 9%" is the headline, and a seller who prices a crate by taking
off ten percent is wrong in three places:

- **The 9% reaches shipping.** A $20 record with $6 shipping pays 9% of $26.
- **Processing is separate and has a flat part.** On a $3 single the flat
  amount is a tenth of the sale, so the whole cut is about 22%.
- **The selling fee is capped at $150**, so a $2,500 record pays about 9% all
  in, not 12%.

## What it does not know

Discogs does not publish one payment processing rate for every seller, and
third-party figures disagree (2.7% + $0.25, 2.9% + $0.30, 3.49% + $0.49 all
circulate). The calculator starts at 2.9% + $0.30 and the seller overwrites
both numbers from a payout statement. The 9% selling fee and the $0.10/$150
limits are from Discogs' own Help Center ("What Are The Fees For Selling On
Discogs?" and the 2023 selling-fee FAQ), not a live fetch: verify against a
real payout before relying on it. It does not model Discogs' grading, seller
tiers, shipping-rate rules or per-country payout differences, and it never
connects to Discogs.

## Comparing Discogs with other channels

[`../where-to-sell-calculator`](../where-to-sell-calculator/) ranks one item
across eBay, Etsy, Reverb, Mercari and more, with Discogs as an off-by-default
channel that uses the same 9% and processing default (a parity test keeps the
two equal). The link on this page carries the price, shipping and cost across
with Discogs switched on.

## Privacy

Everything runs in your browser. Prices, costs and payouts are never uploaded
and never appear in a usage count; those are anonymous tallies of which
features were used, stored locally. No accounts, tracking cookies or analytics
vendor.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not legal, tax, financial, or selling advice,
and it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it.** To the maximum
extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be
slow, broken, moved, or taken offline without notice.

Not affiliated with, endorsed by, or sponsored by Discogs. Discogs is a
trademark of its owner, named here only to describe the published fee this tool
computes against.

MIT licensed, see [`LICENSE`](LICENSE). Optional
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) support does not
change what the tool does.

- Crate view: paste one order per line (`label, price, shipping, cost`) to price a whole collection with the same processing rates and see which orders lose money (`calculateBatch` in `calc.mjs`).
