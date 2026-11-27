# Depop Fee Calculator

A free browser tool that prices one Depop sale against Depop's current,
per-region fee schedule: **0% selling fee** for US, UK and (from 22 July
2026) Australian sellers (just a payment-processing fee of 3.3% + $0.45 in the
US, 2.9% + £0.30 in the UK, or 2.6% + A$0.30 in Australia, on the item price
plus buyer-paid shipping), and the older **10% selling fee** that still
applies elsewhere, where Depop also charges a payment-processing fee this
tool does not model. It shows real profit after
your item and shipping-label cost, the item price you need to hit a target
profit, and a side-by-side comparison of what the same sale would pay out in
each of the four regions. Nothing is uploaded; the arithmetic runs on the
visitor's own device.

**Live tool:** https://marisstella.app/depop-fee-calculator/

```
cd ventures/depop-fee-calculator && node --test
```

Open `index.html` in a browser to use it — there is no build step.

## Why it exists

Depop used to charge every seller a flat 10% selling fee, and "Depop takes
10%" is still the number most sellers — and most older guides — quote. For a
US or UK seller today, that is wrong in both directions at once:

**The selling fee is 0%, not 10%.** But that does not mean the sale is
fee-free — a payment-processing fee (3.3% + $0.45 in the US, 2.9% + £0.30 in
the UK) still comes out, on the item price *plus* any shipping the buyer
paid. Assume the old 10% and you underprice; assume "0% selling fee" means no
fee at all and your payout comes in lower than you expected.

**Depop's buyer-side Marketplace fee is not a seller cut.** Depop separately
charges the *buyer* a checkout fee (up to 5% + $1, on a sliding scale Depop
has not published in full) on top of what the buyer sees as your price. It
never reduces seller payout. This tool notes that it exists without
inventing a precise number for a scale it cannot see — a specific wrong
figure would be worse than an honestly labelled unknown.

**Outside the US, UK and Australia, the 10% selling fee still runs, and
processing is charged on top.** The processing rate there depends on the
country and payment provider, so the rest-of-world row shows only the 10% and
says the payout is an upper bound; add your processing fee as an other cost.
A seller who splits listings across currencies, or who is unsure which
schedule their account is actually on, can see all four side by side for one sale rather
than trusting either headline number.

## What it does not do

It is not Depop's live fee schedule, a listing tool, an authentication
service, or tax advice. It does not connect to Depop, create a listing, or
process a payment. It does not compute a dollar figure for the buyer-side
Marketplace fee, because Depop has not published the sliding scale behind it
precisely enough to model correctly. It does not model the
rest-of-world processing fee, sales tax in the processing base (Depop includes
applicable taxes, so the US fee is slightly understated on taxed sales), or
shipping in the boost base for own-label sales (Depop's Boosted Listings
policy adds it). Verify every figure against your own Depop payout before you
price a listing.

### Sources

The rates are constants, not a live fetch. Depop's own pages
([Seller fees and charges](https://depophelp.zendesk.com/hc/en-gb/articles/360001791127),
the Boosted Listings policy, and the 2026-07 Australia announcement on
news.depop.com) were not reachable from the sessions that wrote and audited
this tool, so the figures were taken from search extracts of those pages and
from independent fee guides that quote them:

| figure | as of | basis |
|---|---|---|
| US 0% + 3.3% + $0.45 on item + shipping | rechecked 2026-11-24 | Help Centre, via fee guides |
| UK 0% + 2.9% + £0.30 on item + shipping | 2026-11 | Help Centre, via fee guides |
| AU 0% + 2.6% + A$0.30 on AUD sales, from 22 July 2026 | 2026-11-27 | Depop AU announcement (0% selling fee, processing and boost still apply); the 2.6% + A$0.30 rate from fee guides, not seen on a Depop page |
| Rest of world 10% selling fee, plus processing (rate not modelled) | 2026-11-27 | fee guides quoting the Help Centre |
| Boost 12% US/UK, 8% elsewhere | 2026-11-27 | Boosted Listings policy, via search extracts; fee guides disagree on the 8% |
| Boost base = item price | inference | the author's reading; the policy adds shipping for own-label sales |

A session with access to depophelp.zendesk.com should confirm the AU rate and
the 8% boost rate first ([audit](../../portfolio/quality/audits/2026-11-26-depop-fee-calculator.json)).

## First visitor

r/Depop and r/DepopSuccess, where "how much does Depop actually take" and
"why did my payout not match" are recurring threads, and the search phrases
"depop fee calculator," "depop seller fees," and "how much does depop take."
Several existing calculators for this niche quote a single flat rate; this
one keeps the US/UK/Australia 0%-plus-processing schedules, the rest-of-world
10% schedule, and the Boosted Listings surcharge separate rather than collapsing
them into one number, and separates the buyer-paid Marketplace fee from
seller payout explicitly rather than folding it in by mistake.

## Comparing Depop against other resale channels

[`../where-to-sell-calculator`](../where-to-sell-calculator/) ranks a listing
across eBay, Etsy, Amazon and a direct sale, and
[`../marketplace-fee-compare`](../marketplace-fee-compare/) ranks eBay, Etsy,
Amazon, Walmart, TikTok Shop, and an own Shopify store — neither currently
models Depop's region-split schedule. Selling secondhand clothing on Poshmark
or Mercari instead? See [`../poshmark-fee-calculator`](../poshmark-fee-calculator/)
or [`../mercari-fee-calculator`](../mercari-fee-calculator/) for those
platforms' own schedules.

## Privacy

Everything runs in your browser. Item prices, costs, and payouts are never
uploaded and never appear in a usage count — those are anonymous tallies of
which features were used, stored locally. We don't have accounts, tracking
cookies, or an analytics vendor.

## Usage

Anonymous, aggregate-only event counts (`sale_calculated`, `regions_compared`)
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

Not affiliated with, endorsed by, or sponsored by Depop. Depop is a
trademark of its owner, named here only to describe the published fee
schedule this tool computes against.

FSL-1.1-MIT licensed — see [`LICENSE`](LICENSE). Optional
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) support does
not change what the tool does.

**Open from a link.** `share.mjs` lets the page open from a `#...` link (a shared sale, or the item handed over from the [where-to-sell calculator](../where-to-sell-calculator/)); numbers stay in the URL fragment and are never sent anywhere. "Copy shareable link" makes one.

## Track true profit across every platform

The page ends with a short section for sellers on more than one marketplace. It links the online-sellers industry page (`/industries/online-sellers/`), where Seller Books, a hosted product for payout reconciliation, cost of goods and a Schedule C-shaped profit and loss, is listed as in development, early access. It also links three guides that live in `ventures/ebay-fee-calculator/`: reconciling marketplace payouts to sales, cost of goods sold for resellers, and a Schedule C worksheet for resellers. Fee figures in the page's sourced lead were rechecked on 2026-11-24 (`docs/reports/2026-11-24-seller-tools-front-doors.md`).
