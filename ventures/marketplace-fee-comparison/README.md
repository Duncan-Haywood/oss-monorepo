# Where Should I Sell This? — Marketplace Fee Comparison

**One item, every channel, ranked by what you keep.** A free browser tool for
sellers who list on more than one place. Enter an item's price and costs once
and see the net profit, margin, return on invested cash, and break-even price
on eBay, Etsy, Amazon, Shopify (with Shopify Payments and with an outside
processor), and your own site — side by side, ordered by what actually lands
in your pocket.

```sh
# ES modules need an origin, so serve the directory rather than opening the file
python3 -m http.server 8000   # then visit http://localhost:8000/
```

The calculation is local. It works without an account, a network request, or an
API key.

## Why it's different

Every marketplace has a fee calculator, and each one answers *what does this
channel cost me?* A seller who lists in more than one place has a different
question: **where should this item go, and what is that choice worth?** Nobody
can answer it from six separate tabs of six calculators that each want their
own copy of the same cost of goods.

So this one enters the item once and adds the three figures the decision needs:

- **The spread** — best channel minus worst, on this order. The headline number
  is what the choice is worth, because that is the thing a seller can act on.
- **Price to match the best channel** — what you would have to list at *here* to
  take home what the best channel gives you *there*. It turns a verdict into a
  repricing decision: sometimes the "expensive" marketplace is worth it if its
  audience will bear another two dollars.
- **Your own site as a baseline** — the same arithmetic with card processing
  only. The gap between it and the marketplaces is what you are paying for
  their audience, stated in money rather than in percentage points.

Alongside the usual per-channel break-even price, margin, and return on the
cash you actually invested (fees come out of the sale, not your pocket up
front, so they are deliberately excluded from invested cash).

Monthly platform costs — a Shopify plan, hosting — are spread across your
typical monthly order count, so a quiet store is not credited with a big-store
per-order economics.

## It does not know what marketplaces charge

Every rate in the tool is an **editable starting point, not a claim about a
current fee schedule.** Marketplace fees vary by category, seller tier,
subscription level and country, and published schedules change. Enter the rates
from your own recent statements; the tool supplies the arithmetic and shows
every input it used.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not tax, financial, or business advice, and it
does not replace a qualified professional. **You are responsible for reviewing
and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage
arising from its use.

## Privacy and usage

Everything runs in your browser. Prices, costs, and fee rates are never
uploaded. There are no accounts, cookies, tracking pixels, or analytics
vendors.

The optional local counter records only an event name (`channels_compared`,
`channel_rates_opened`) and the current day, in your own browser's
`localStorage` under `marketplace-fee-comparison-usage`. It never records any
input. Turn it off with the checkbox in the footer, or with your browser's Do
Not Track / Global Privacy Control setting, which the counter honors without
being asked. Nothing is ever transmitted, so nothing is retained anywhere else
and there is nothing to delete but your own browser storage.

## Support

The tool is free and full-featured. The
[project lives on GitHub](https://github.com/Duncan-Haywood/monorepo-projects),
and [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is entirely
optional — it never changes what the tool does, and there is no feature behind
it.

## Going deeper on one channel

The single-channel calculators in this repository model their channel in more
depth — batch economics, plan tiers, shareable assumptions — and this tool is
the fastest way to decide which of them to open:

- [`ventures/ebay-fee-calculator`](../ebay-fee-calculator/)
- [`ventures/etsy-profit-calculator`](../etsy-profit-calculator/)
- [`ventures/shopify-fee-calculator`](../shopify-fee-calculator/)
- [`ventures/quote-margin-check`](../quote-margin-check/) — for quoted work
  rather than listed products

## Development

Pure ES modules, no build step, no dependencies.

```
node --test        # runs calc.test.mjs and usage.test.mjs
```

- `channels.mjs` — the channels and their fee rates, declared as data. A rate's
  `role` (`percent`, `fixed`, `monthlyCost`, `monthlyOrders`) is what the
  arithmetic does with it, so **adding a channel is a data edit, not new math**,
  and the form and the calculation cannot drift apart: both are generated from
  this file.
- `calc.mjs` — the comparison arithmetic.
- `usage.mjs` — the anonymous local counter.
- `index.html` — the entire UI, generated from `channels.mjs`.

The test suite checks the arithmetic against its own definitions rather than
against fixed expected numbers: it re-runs the calculator at each reported
break-even price and asserts the profit really is zero, at each target-margin
price and asserts the margin really is the target, and at each "price to match
the best" and asserts the profit really does equal the best channel's. A change
that breaks the relationship between the headline numbers fails even if every
individual formula still returns something plausible.

## Opportunity

"etsy vs ebay fees", "amazon vs ebay seller fees", and "is it cheaper to sell
on my own site" are recurring, high-intent comparison queries, and they are
answered today by blog posts with a static table of rates that goes stale, not
by anything that takes the seller's own numbers. The comparison shape is also
the one an AI assistant reaches for when asked "where should I sell this" —
a page that states its method and its inputs is quotable in a way an ad-heavy
fee table is not.

Marginal cost is ~$0: static files, no backend, no API. The single-channel
calculators in this repository already have the audience-facing depth; this is
the page that routes a multi-channel seller to the right one and gives them a
reason to come back before every sourcing decision.
