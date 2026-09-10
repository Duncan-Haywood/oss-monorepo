# Poshmark Fee Calculator

A free browser tool that prices one Poshmark sale the way a payout statement
actually lands: the flat $2.95 fee under $15.00, 20% at $15.00 or more, the
$14.75 break-even price where the two cost the same, profit after your item
and prep cost, the sale price you need to hit a target profit, and whether a
lower offer or bundle discount actually costs what it looks like. Nothing is
uploaded; the arithmetic runs on the visitor's own device.

```
cd ventures/poshmark-fee-calculator && node --test
```

Open `index.html` in a browser to use it — there is no build step.

## Why it exists

Poshmark's published US schedule is two rules, not one flat rate. Sales
under $15.00 pay a flat $2.95 fee. Sales of $15.00 or more pay 20% of the
sale price. That is a real cliff — the whole price is taxed under whichever
rule applies, not just the part above $15 — and "Poshmark takes 20%" is only
true above the line.

Two things this tool computes that a flat "Poshmark takes 20%" page misses:

**The flat fee is a worse deal than it looks, and it gets worse fast.**
Twenty percent of $14.75 is exactly $2.95 — that is the break-even price.
Below it, the flat fee costs more than 20% would: a $10 item pays an
effective 29.5% rate, and a $5 item pays 59%. Above it (and still under $15)
the flat fee is a bargain against 20%.

**Crossing $15.00 in a negotiation is usually a break, not a penalty.**
Because 20% of anything at or above $14.75 is already at least $2.95,
dropping from the percent tier into the flat tier is a one-time *reduction*
in commission. Very close to the line this can even raise a seller's payout
on a lower sale price — for example, a $15.00 sale nets $12.00 while a
$14.99 sale nets $12.04.

## What it does not do

It is not Poshmark's live fee schedule, a closet manager, a listing tool, or
tax advice. It does not connect to Poshmark, create a listing, or submit an
offer. It does not model Poshmark's buyer-paid shipping fee, because
Poshmark takes no commission on it — that fee funds a prepaid label and
never touches seller payout. Verify every figure against your own Poshmark
payout statement before you price a listing.

## First visitor

r/poshmark and r/Reseller, where "how much does Poshmark actually take" and
"should I accept this offer" are recurring threads, and the search phrases
"poshmark fee calculator," "poshmark seller fees," and "poshmark break even
price." Incumbent pages restate the headline 20% or the flat fee separately
without the break-even price or the offer-crossing arithmetic.

## Privacy

Everything runs in your browser. Sale prices, costs, and payouts are never
uploaded and never appear in a usage count — those are anonymous tallies of
which features were used, stored locally. We don't have accounts, tracking
cookies, or an analytics vendor.

## Comparing Poshmark against other channels

[`../where-to-sell-calculator`](../where-to-sell-calculator/) ranks Poshmark
beside eBay, Etsy, Amazon and a direct sale on one item, and
[`to-where-to-sell.mjs`](to-where-to-sell.mjs) carries this page's price and
cost straight into it with Poshmark already switched on — no retyping. The
link in the footer is rebuilt on every render, so it always carries what is on
screen, and the numbers travel in the URL fragment, which browsers never send
to a server.

It does **not** restate the schedule. That page imports `PERCENT_RATE`,
`FLAT_FEE` and `COMMISSION_THRESHOLD` from this venture's own
[`calc.mjs`](calc.mjs), and its `channel-parity.test.mjs` fails if the two
tools ever disagree about the fee, the tier boundary, or the net profit on the
same sale — checked at twelve prices either side of the cliff, including the
$15.00 boundary and the $14.75 point where the flat fee equals 20%. If
Poshmark changes its schedule, this file is the one place that changes.

[`../marketplace-fee-compare`](../marketplace-fee-compare/) deliberately
leaves Poshmark out, and that is not an inconsistency: it ranks channels by a
single headline rate, and a flat fee below a threshold is not one. A per-item
comparison can price the cliff exactly; a rate table cannot.

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

Not affiliated with, endorsed by, or sponsored by Poshmark. Poshmark is a
trademark of its owner, named here only to describe the published fee
schedule this tool computes against.

MIT licensed — see [`LICENSE`](LICENSE). Optional
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) support does
not change what the tool does.
