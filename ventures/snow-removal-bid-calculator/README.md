# Snow Removal Bid Calculator

A free browser calculator for independent snow-removal contractors. It prices
a winter the way the job actually costs money — minutes on the route, a loaded
truck, salt, and the storm count you expect — and shows the seasonal, the
per-push, and the storm count where a cheap quote dies.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/snow-removal-bid-calculator/

**After using this, you can now price a driveway route as per-push, seasonal,
and ice-event, and see how many storms a $350 seasonal actually survives,
which used to take guessing from last year's mess.**

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

Search page: [`how-much-to-charge.html`](how-much-to-charge.html).

```bash
# Serve it locally
npx http-server ventures/snow-removal-bid-calculator -p 8080
# Run the tests
cd ventures/snow-removal-bid-calculator && node --test
```

## The problem it solves

Homeowners and property managers shop a seasonal price. Contractors who start
from "what the driveway next door paid" quote $250–$400 a stop and lock it
in for the winter. That number often loses money on a quiet eight-storm
season once deadhead, a loaded truck, salt, and ice visits are counted — and
it is wrecked by a fourteen-storm year or an "unlimited ice" clause.

The second thing that sinks these bids is treating ice like a free extra. Ice
is usually salt and sidewalks, not a full plow, and there are often more ice
events than snow events. A seasonal that only priced the plow visits is
already short.

Late August through October is when HOAs and commercial lots lock next
winter. This tool exists for that bid window.

## How it works

1. **Per-stop minutes.** Each row is a site with plow minutes, sidewalk
   minutes, and salt bags. Deadhead minutes are added to every stop. Hours
   per pass = those minutes ÷ 60.
2. **Loaded hourly.** Operator wage × (1 + payroll burden %) + truck/plow/
   working-fuel hourly. That is the real cost of being on the route.
3. **Per-pass cost.** Loaded hourly × hours, plus salt, plus overhead as a
   markup on that direct cost.
4. **Ice as its own event.** Ice minutes and ice salt default to 65% of
   plow+walk time and 1.2× salt, then stay editable. They do not reuse the
   snow-event price.
5. **The winter.** Seasonal cost = snow events × cost per snow event (×
   passes per storm) + ice events × cost per ice event. Price is cost ÷
   (1 − target margin %), because margin is a share of price.
6. **The survival number.** How many snow events the seasonal can absorb
   after ice is already paid. That is the number a cheap seasonal dies on —
   not driveway size.

It then reports per-site seasonal and per-push (so you can quote a homeowner
or a property manager), walk-away prices, effective hourly, and a score of
any number already on the table. **Copy bid summary** turns the result into a
plain-text draft.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting minutes

Site types ship with common ballpark minutes and salt bags. **They are not
an industry standard, a benchmark, or a guarantee.** Real times depend on
equipment, depth, packing, and how far the next stop is. Every field is
editable, and picking a site type never overwrites minutes the contractor
has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `snow-removal-bid-usage` — never the route, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `site_added`, `site_removed`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the contractor enters their own numbers.
- No weather forecast and no NOAA feed — event counts are inputs.
- One truck / one route. A second crew or a loader is "other minutes," not a
  separate equipment model.
- Trigger depth is not converted from climate data; the contractor chooses
  the event count that matches their contract language.
- Starting minutes are ballpark figures for a typical push, not a depth
  curve (2" vs 8" is a different job — raise minutes or passes).

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial, engineering,
or business advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying
on it**, and for meeting any obligation it helps you prepare for. To the
maximum extent permitted by law, the authors accept no liability for any
loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
