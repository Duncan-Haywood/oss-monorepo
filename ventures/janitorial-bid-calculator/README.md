# Janitorial Bid Calculator

A free browser calculator for commercial cleaning contractors. It prices a
recurring janitorial contract the way the trade actually bids one — each space
divided by the production rate the crew really hits — and shows the margin
before the price goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/janitorial-bid-calculator -p 8080
# Run the tests
cd ventures/janitorial-bid-calculator && node --test
```

## The problem it solves

Small cleaning contractors are told to bid by price per square foot. That rule
cannot see the shape of a building. A 8,000 sq ft office that is 600 sq ft of
restrooms spends about a fifth of its labor hours on 7% of its floor area,
because a restroom cleans at roughly 1,200 sq ft per hour and open office at
roughly 4,000. Two buildings of identical size can differ by 30% in labor, and
labor is most of the cost. A per-square-foot bid on the wrong one is a contract
the contractor is locked into for a year at a loss.

The second thing that sinks these bids is payroll burden. A cleaner paid $17
costs more like $22 once employer taxes, workers' compensation (expensive in
this trade), liability insurance, and paid time off are counted. Contractors
who price off the raw wage are short before they start.

## How it works

1. **Per-space labor.** Each row is a space type with its own cleanable square
   footage, production rate (sq ft per cleaner-hour), and cleanings per week.
   Hours per visit = square feet ÷ production rate. Monthly hours multiply that
   by the weekly frequency and by 52/12 weeks — not 4, which understates the
   month by about 8%, more than the margin on a typical contract. **Other
   space** rows take a custom name so a server room or vacant wing does not
   show up as `Area N`.
2. **Loaded labor.** Hourly wage × (1 + payroll burden %).
3. **Other direct cost.** Supplies per square foot per month, plus equipment,
   travel, and anything else billed to the job monthly.
4. **Overhead.** A percentage markup on that direct cost — office, admin, and
   sales recovery. It is not applied to itself or to profit.
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a share
   of price, not a markup on cost.

It then reports the numbers a contractor sanity-checks a bid against: price per
square foot per month, effective hourly billing rate, annual contract value,
the labor split across spaces, and the **walk-away price** — total monthly cost,
below which the job makes nothing. Entering a price already on the table scores
it against the same cost base and says plainly whether it is under water.

**One-time project work** — strip and wax, carpet extraction, an initial deep
clean, post-construction, or a named custom job — is priced with the same
loaded wage, overhead, and margin, then kept off the monthly contract. Hours
are square feet ÷ production rate × coats or passes, plus materials. The
result is a one-time project total and a **first-month invoice** (monthly
service + project work) so the contractor does not amortize a floor job across
eleven months they will never recoup. **Copy bid summary** turns the result
into a plain-text draft with the monthly price, the project lines, the
first-month invoice, and the service areas ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency, so it is testable and auditable on its own. See
[`calc.test.mjs`](calc.test.mjs).

## Production rates

The space types and project types ship with common ballpark rates as a starting
point. **They are not an industry standard, a benchmark, or a guarantee.** Real
rates depend on the crew, the equipment, the layout, soil, finish buildup, and
how much is actually done on each visit. Every rate is editable, and picking a
type never overwrites a rate the contractor has already changed — a rate timed
from their own crew is worth more than any published figure.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `janitorial-bid-usage` — never the building, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `area_added`, `area_removed`,
`proposed_price_compared`, `summary_copied`, `project_added`,
`project_priced`, `project_removed`.

## Limitations

- Single currency and no tax handling; the contractor enters their own numbers.
- Day porter or fixed-headcount contracts are not modelled; this prices from
  production rates, not from a scheduled shift.
- Project-work rates and coat counts are starter figures. Real strip, extract,
  and initial-clean times depend on soil, finish buildup, furniture, and access.

## Disclaimer

This free tool is not legal, tax, financial, or business advice, and it does not
tell anyone what to charge. Outputs are arithmetic on the user's own inputs.
Verify every figure against real payroll, insurance, and supply costs and
against a qualified professional before relying on it or submitting a bid. To
the maximum extent permitted by law, the authors accept no liability for loss
or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
