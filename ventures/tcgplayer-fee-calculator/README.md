# TCGplayer Fee Calculator

A free browser tool that prices one TCGplayer marketplace order: a **10.75%
commission** on the order subtotal (cards *plus* the shipping the buyer pays),
**capped at $75 per product**, plus a transaction fee of **2.5% of the whole
order total (tax included) and a flat $0.30 per order**. It shows what you
keep, your profit after postage, card cost and supplies, the card price that
hits a target profit, and the same order as a Pro seller and at last year's
10.25% rate. Nothing is uploaded; the arithmetic runs on the visitor's own
device.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/tcgplayer-fee-calculator/

```
cd ventures/tcgplayer-fee-calculator && node --test
```

Open `index.html` in a browser to use it — there is no build step.

## Why it exists

Sellers of Pokémon, Magic, Yu-Gi-Oh! and One Piece singles usually quote
"TCGplayer takes about 13%". That is right for a mid-priced single card and
wrong in both directions:

**The $0.30 is per order, not per card.** A one-card $1.00 order pays $0.43 in
fees (43%); the same card inside a 20-card $20 order pays $2.95 for the whole
cart (14.75%). For cheap singles the cart size, not the card price, sets the
margin. The calculator takes a quantity and says so.

**The commission base includes shipping, and processing includes tax.** The
buyer's shipping is inside the 10.75%; the 2.5% is charged on sales tax the
seller never receives.

**The commission is capped.** At $75 per product (reached at about $697.67), so
a $1,000 slab pays 10.0% all-in rather than 13%.

**The rate rose in 2026.** Per TCGplayer's fee table the Level 1-4 commission
went from 10.25% (cap $50) to 10.75% (cap $75) on 10 February 2026; many older
calculators still show the old rate. The "old rate" schedule is there to show
what that cost on a given order.

### Alternatives a seller has today

Free third-party TCGplayer fee calculators exist (flat-rate, usually one card at
a time), and so does a spreadsheet. This tool differs by modelling order size
(the per-order $0.30), buyer-paid shipping and tax in the right bases, the
per-product cap, Pro and pre-February rates side by side, and by solving for
the price of a profit target. It is not a listing tool, an inventory
manager or a repricer.

## Where the numbers come from

The rates are constants in [`calc.mjs`](calc.mjs): 10.75% / $75 cap (Level
1-4), 9.25% + 2.5% Pro fee each capped at $75, 10.25% / $50 cap before 10
February 2026, 2.5% + $0.30 transaction fee on subtotal + tax. They are TCGplayer's
published fee table and worked examples as relayed by search results on
2026-10-18 (including the worked example of commission taken on card plus
shipping). TCGplayer's help centre could not be fetched from the build
environment, so check one real payout before you reprice a binder; if a constant
is wrong it is the only thing to change. A $50 card reproduces the commonly
quoted $6.93 (13.9%).

## What it does not do

It does not model **TCGplayer Direct** (fulfilled by TCGplayer): sources describe
its fee schedule differently and a guess would be worse than a gap. It is not
live data, a listing tool, or tax advice, and it does not connect to TCGplayer
or process a payment. Seller-level differences other than Pro are not modelled.

## First visitor

r/pkmntcgcollections-style seller threads and r/mtgfinance, where "what do
TCGplayer fees look like on cheap cards" recurs, and the searches "tcgplayer
fee calculator", "tcgplayer seller fees 2026" and "how much does tcgplayer
take". The wedge is the 2026 rate change and the per-order $0.30.

## Comparing TCGplayer against other channels

[`../where-to-sell-calculator`](../where-to-sell-calculator/) ranks one item
across eBay, Etsy, Whatnot and others; see also
[`../whatnot-seller-payout`](../whatnot-seller-payout/) and
[`../ebay-fee-calculator`](../ebay-fee-calculator/). A TCGplayer row in the
where-to-sell ranking is a natural follow-up.

The footer link opens where-to-sell with this sale's price, shipping and cost
filled in and your TCGplayer commission and transaction fee on its "Other
channel" row, switched on (`to-where-to-sell.mjs`). The $75 commission cap does
not carry over, and an order of more than one card sends the rates only.

## Privacy

Everything runs in your browser. Card prices, costs, and payouts are never
uploaded and never appear in a usage count — those are anonymous tallies of
which features were used, stored locally. We don't have accounts, tracking
cookies, or an analytics vendor.

## Usage

Anonymous, aggregate-only event counts (`sale_calculated`,
`schedules_compared`) are kept in the visitor's own browser via
`localStorage` — see [`usage.mjs`](usage.mjs). No price, cost, or payout is
ever recorded. A checkbox in the page footer turns counting off entirely, and
the counter also honours the browser's own Do Not Track / Global Privacy
Control signal.

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

Not affiliated with, endorsed by, or sponsored by TCGplayer. TCGplayer is a
trademark of its owner, named here only to describe the fee schedule this
tool computes against.

MIT licensed — see [`LICENSE`](LICENSE). Optional
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) support does
not change what the tool does.

**Open from a link.** `share.mjs` lets the page open from a `#...` link; numbers
stay in the URL fragment and are never sent anywhere. "Copy shareable link"
makes one.
