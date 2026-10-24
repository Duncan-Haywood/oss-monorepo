# Grailed Fee Calculator

A free browser tool that prices one Grailed sale against the seller fee
schedule in force since 20 May 2026: a **6% commission under $120** (minimum
$1.99) and **9% from $120**, plus **3.49% + $0.49 payment processing** on a
domestic sale. It shows what you keep, your profit after item, label and prep
cost, the listing price that hits a target profit, and the **$120 cliff** that
most fee calculators still miss. Nothing is uploaded; the arithmetic runs on
the visitor's own device.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/grailed-fee-calculator/

```
cd ventures/grailed-fee-calculator && node --test
```

Open `index.html` in a browser to use it — there is no build step.

## Why it exists

"Grailed takes 9%" is what older guides and most calculators say. Three
things make it wrong for a seller pricing today.

**The commission is a step, not a flat rate.** Under $120 it is 6%; from $120
it is 9% on the *whole* sale. So a $120.00 sale keeps $104.52 while a $119.99
sale keeps $108.11, and you have to list near $124.10 to net what $119.99
does. The calculator solves for a target profit on both sides of the step and
picks the lowest price that qualifies.

**Small sales hit a minimum.** 6% is under Grailed's $1.99 minimum until a
sale reaches $33.17, so a $20 item pays about 16% all-in.

**Shipping you collect moves the step.** Buyer-paid shipping on your own
label counts toward the tier and the processing base; with a Grailed label
the buyer's shipping goes to the carrier and only the item price counts.

## Where the numbers come from

The rates are constants in [`calc.mjs`](calc.mjs), taken from several
third-party fee guides that agree with each other (the 6% / 9% / $120 / $1.99
tiers effective 20 May 2026, and 3.49% + $0.49 domestic and 4.99% + $0.49
international processing). They are not read from Grailed's own help centre,
which could not be fetched when this was built, and the cliff assumes the tier
applies to the whole sale as those guides describe. A $200 sale reproduces the
published $174.53 worked example. Check one real payout before you price a
whole closet; if a constant is wrong it is the only thing to change.

## What it does not do

It is not Grailed's live fee schedule, a listing tool, or tax advice. It does
not connect to Grailed or process a payment. It does not model sales tax
(collected from the buyer on top), Grailed's other seller programs, or
payment-processing tiers for sellers who have not finished onboarding.

## First visitor

r/grailed and r/streetwear, where "what are Grailed's fees now" and "why did
my payout not match" recur, and the searches "grailed fee calculator,"
"grailed seller fees" and "how much does grailed take." The wedge against
existing calculators is the 2026 tier change and the $120 cliff, which the
many pages still showing a flat 9% do not model.

## Comparing Grailed against other channels

[`../where-to-sell-calculator`](../where-to-sell-calculator/) ranks a listing
across eBay, Etsy, Depop, Poshmark, Mercari, Grailed and more, and opens with
the item's price and cost already filled in. See also
[`../depop-fee-calculator`](../depop-fee-calculator/),
[`../poshmark-fee-calculator`](../poshmark-fee-calculator/) and
[`../mercari-fee-calculator`](../mercari-fee-calculator/).

## Privacy

Everything runs in your browser. Item prices, costs, and payouts are never
uploaded and never appear in a usage count — those are anonymous tallies of
which features were used, stored locally. We don't have accounts, tracking
cookies, or an analytics vendor.

## Usage

Anonymous, aggregate-only event counts (`sale_calculated`,
`schedules_compared`) are kept in the visitor's own browser via
`localStorage` — see [`usage.mjs`](usage.mjs). No item price, cost, or payout
is ever recorded. A checkbox in the page footer turns counting off entirely,
and the counter also honours the browser's own Do Not Track / Global Privacy
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

Not affiliated with, endorsed by, or sponsored by Grailed. Grailed is a
trademark of its owner, named here only to describe the fee schedule this
tool computes against.

MIT licensed — see [`LICENSE`](LICENSE). Optional
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) support does
not change what the tool does.

**Open from a link.** `share.mjs` lets the page open from a `#...` link (a shared sale, or the item handed over from the [where-to-sell calculator](../where-to-sell-calculator/)); numbers stay in the URL fragment and are never sent anywhere. "Copy shareable link" makes one.
