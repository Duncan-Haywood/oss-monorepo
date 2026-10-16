# Mercari Fee Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/mercari-fee-calculator/>

A free browser tool that prices one Mercari sale against both of Mercari's
live US fee schedules: the current one (10% on the item price plus any
buyer-paid shipping, effective for listings created or updated on or after
January 6, 2025, with no separate payment processing fee) and the legacy one
(10% on the item price only, plus a payment processing fee of 2.9% of the
combined total plus a flat $0.50, which still applies to any older listing
that has not since been edited). It shows real profit after your item and
shipping-label cost, the item price you need to hit a target profit, and
which schedule actually pays more on a given sale. Nothing is uploaded; the
arithmetic runs on the visitor's own device.

```
cd ventures/mercari-fee-calculator && node --test
```

Open `index.html` in a browser to use it — there is no build step.

## Why it exists

Mercari's fee change on January 6, 2025 is easy to get only half right. The
headline is "10% flat fee, no more payment processing fee" — true, and a real
simplification for most sellers. What that headline omits:

**The 10% now reaches buyer-paid shipping.** Under the old schedule, the 10%
selling fee applied to the item price alone; only the (smaller) processing
fee touched shipping. Under the current schedule the whole 10% applies to the
item price *plus* shipping combined, so a listing with real buyer-paid
shipping can pay a similar or larger total fee than before, even though the
processing fee disappeared.

**Mercari's 3.6% Buyer Protection Fee is not a second seller cut.** It is
charged to the buyer, on top of what they pay, and never reduces seller
payout — but it was announced in the same breath as the seller fee change, so
it is an easy thing to double-count by mistake.

**Old listings are not automatically on the new schedule.** A listing created
before January 6, 2025 keeps the legacy 10% + 2.9% + $0.50 schedule until the
seller edits it. Whether editing an old listing actually helps depends on how
much of its price is shipping — the calculator's schedule comparison answers
that for a specific sale rather than assuming either direction.

## What it does not do

It is not Mercari's live fee schedule, a listing tool, an authentication
service, or tax advice. It does not connect to Mercari, create a listing, or
submit an offer. Every rate is a constant lifted from Mercari's own published
Help Center articles ("Fees on Mercari" and "FAQs about our new fee
structure"), not a live fetch — verify every figure against your own Mercari
payout statement before you price a listing.

## First visitor

r/Mercari and r/MercariSellers, where "how much does Mercari actually take"
and "did my fees go up or down" are recurring threads since the January 2025
change, and the search phrases "mercari fee calculator," "mercari selling
fee," and "mercari fee calculator 2025." Existing calculators for this niche
restate the flat 10% headline without modeling the shipping-inclusive fee
base, the Buyer Protection Fee's non-effect on payout, or the legacy schedule
an unedited older listing is still running.

## Privacy

Everything runs in your browser. Item prices, costs, and payouts are never
uploaded and never appear in a usage count — those are anonymous tallies of
which features were used, stored locally. We don't have accounts, tracking
cookies, or an analytics vendor.

## Comparing Mercari against other channels

[`../where-to-sell-calculator`](../where-to-sell-calculator/) ranks a listing
across eBay, Etsy, Amazon and a direct sale, and
[`../marketplace-fee-compare`](../marketplace-fee-compare/) ranks eBay, Etsy,
Amazon, Walmart, TikTok Shop, and an own Shopify store. Neither currently
models Mercari's own schedule, which is why this stays a separate,
purpose-built calculator rather than one more row in a generic rate table —
the shipping-inclusive fee base and the legacy/current split need their own
arithmetic, not a headline percentage.

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

Not affiliated with, endorsed by, or sponsored by Mercari. Mercari is a
trademark of its owner, named here only to describe the published fee
schedule this tool computes against.

MIT licensed — see [`LICENSE`](LICENSE). Optional
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) support does
not change what the tool does.
