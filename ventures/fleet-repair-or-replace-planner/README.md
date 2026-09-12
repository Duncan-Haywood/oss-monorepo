# Fleet repair-or-replace planner

**Is it cheaper to repair or replace it this year?** A free, browser-local
planner for owners of small trade and service fleets — a handful of vans,
trucks, trailers or machines and one capital budget. It costs out keeping each
asset against replacing it, including the downtime most owners leave out, then
ranks which ones actually pay to replace and fills the budget you have.

**After using this, you can now put a defensible number on which van or
machine to replace first — which used to be a judgement call made off the
repair invoices alone, which are the visible half of the cost and usually the
smaller one.**

→ **[Open the planner](https://duncan-haywood.github.io/monorepo-projects/fleet-repair-or-replace-planner/)**
· [Why downtime decides this](https://duncan-haywood.github.io/monorepo-projects/fleet-repair-or-replace-planner/is-it-cheaper-to-repair-or-replace-a-work-truck.html)

## The problem

The comparison almost everybody makes is "this year's repair bill" against
"the price of a new one". It is wrong in a specific, expensive way: it leaves
out the days the asset was off the road.

A van in the shop is not merely a repair invoice. It is billable days the crew
could not work, or a rental, or a job that went to a competitor. For a
two-person crew billing $900 a day, eleven downtime days is $9,900 —
frequently several times the repair spend that got all the attention. The
repair invoice arrives in the post; the lost day does not, which is exactly
why it gets left out.

The second half of the problem is picking an order. With one budget and
several candidates, the instinct is to start with the oldest asset or the
biggest repair bill. Both can be wrong: an old machine with a huge repair bill
is still the wrong first move if its replacement is expensive and its trade-in
is worthless.

## What it does

For each asset, two annual costs:

```
keep    = annual repair spend + (downtime days × what a day costs you)

replace = (replacement price - trade-in) / expected service years
            + the replacement's own annual repairs
            + (its expected downtime days × what a day costs you)
```

`replace` is an **equivalent annual cost** — the net capital that actually
leaves the business, spread straight-line over the years of service it buys,
plus what the new asset still costs to run. Replacing wins when `keep` is
larger; the difference is the annual saving.

Payback is a separate figure and a cash one:

```
payback = (replacement price - trade-in)
            / (keep - the replacement's own repairs and downtime)
```

Its denominator is the spend replacing *stops*, **not** the annual saving
above. The saving already has the capital spread through it, so dividing the
capital by it would charge the purchase for itself twice — which is what this
module did until the review on #4649 caught it (2.95 years reported against a
true 2.16 on the worked example, and assets pushed across the three-year
"strong case" threshold in the pessimistic direction).

Across assets it then ranks by **annual saving per dollar of capital** and
fills your stated budget in that order, reporting what deferring the rest
costs you per year so you can weigh it against what the extra capital would
cost to borrow.

It also tells you, per asset and fleet-wide, whether the repair spend or the
downtime is the larger number. That single comparison is the product.

## What it deliberately does not model

- **Financing interest and the time value of money.** Capital is spread
  straight-line and undiscounted, on purpose: a discount rate would move the
  answer by less than the input error on "what a day costs you" while making
  the result impossible to check on paper. If you would borrow, add your own
  cost of borrowing.
- **Tax and depreciation.** Write-offs can move a marginal case either way and
  depend on your position.
- **Guaranteed-optimal budget selection.** Filling a fixed budget is a
  knapsack problem; ranking by ratio is the standard heuristic, not a proof.
  With a handful of assets it is almost always best or near-best, and it has
  the property that matters more here — you can see why each asset sits where
  it does. The tool says so in a finding rather than leaving it implied.
- **Anything that is not money.** A vehicle the crew trusts, one still under
  warranty, a machine that cannot be delivered until spring.

## Running it

Open `index.html` in a browser. There is no build step, no dependency, and no
network request of any kind — the page is plain ES modules.

Tests:

```
node --test
```

`calc.mjs` is the arithmetic and the findings; `usage.mjs` is the anonymous
local event counter; `page.test.mjs` asserts the page still carries every
input, every label, the disclaimer and the privacy claim it makes — and pins
the explainer page's worked figures against what the module actually computes,
so changing the arithmetic without updating the prose turns the suite red.

## Privacy

Everything runs in your browser. Your figures are never uploaded; there are no
accounts, cookies, or analytics vendors. Anonymous feature events
(`row_added`, `row_removed`, `budget_changed`, `csv_exported`,
`example_loaded`) are counted only in your own browser's local storage and can
be deleted from the page. Do Not Track and Global Privacy Control are honoured.

## Disclaimer

> **No warranty.** This tool is provided free and as-is, without warranty of
> any kind, express or implied. It is not financial, tax, legal, or
> engineering advice, and it does not replace a qualified professional.
> **You are responsible for reviewing and verifying its output before relying
> on it**, and for any capital commitment it helps you prepare for. To the
> maximum extent permitted by law, the authors accept no liability for any
> loss or damage arising from its use.
>
> **Best-effort hosting, no SLA.** These tools are free, experimental, and may
> be slow, broken, moved, or taken offline without notice. We do not promise
> uptime, backups of anything you type, or that a URL will keep working. Do
> not use this as a system of record.

## Related tools

- [Equipment lease buyout calculator](../equipment-lease-buyout-calculator/) —
  one asset in more depth: buying out a lease against returning it and
  replacing. This planner decides which of several assets to act on at all.
- [Equipment rental break-even](../equipment-rental-break-even/) — pricing
  bookings on equipment you already own.

Free and open source under an [MIT licence](LICENSE).
[Sponsorship](https://github.com/sponsors/Duncan-Haywood) is entirely optional
and never changes what the tool does.
