# Pest Control Bid Calculator

A free browser calculator for independent pest control operators. It prices a
route stop the way the route actually pays — on-site minutes, bait stations,
and the drive — and shows the margin before the price goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

Search page: [`how-much-to-charge.html`](how-much-to-charge.html).

```bash
# Serve it locally
npx http-server ventures/pest-control-bid-calculator -p 8080
# Run the tests
cd ventures/pest-control-bid-calculator && node --test
```

## The problem it solves

Small pest control operators are told to bid by house size: "$80 a quarter for
a 2,000 sq ft home." That rule cannot see the stop. Eight rodent stations take
longer than the exterior spray, and a 22-minute one-way drive is 44 minutes on
every visit — often more than a third of the stop. Two houses of identical
size can differ by 2× in labor, and labor plus drive is most of the cost.

The second thing that sinks these bids is giving away the initial. Knockdown
spray and station installs are a different job from the recurring check. On a
cheap quarterly, the first visit can cost more than a year of recurring
profit. Operators who "throw in the initial" lock themselves into a route they
cannot recover.

## How it works

1. **Per-service minutes.** Each row is a work item with minutes, a count
   (for stations), material cost, and whether it happens every visit or only
   on the initial. Hours = minutes × count ÷ 60.
2. **Drive.** One-way minutes × 2, added to every visit including the initial.
3. **Loaded labor.** Hourly wage × (1 + payroll burden %).
4. **Other direct cost.** Chemicals and station materials, plus vehicle and
   anything else billed to the stop.
5. **Overhead.** A percentage markup on that direct cost — office, admin, and
   sales recovery. It is not applied to itself or to profit.
6. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of the invoice, not a markup on cost.

It then reports the numbers an operator sanity-checks a bid against: initial
invoice, recurring invoice, year-one billed (initial plus every recurring
stop that year), hourly rate *with* the drive versus on-site only, the hour
split, the walk-away recurring price, and — if the initial is waived — how
many later stops recover it. Entering a recurring price already on the table
scores it against the same cost base. **Copy bid summary** turns the result
into a plain-text draft ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency, so it is testable and auditable on its own. See
[`calc.test.mjs`](calc.test.mjs).

## Starting times

The services ship with common ballpark minutes as a starting point. **They
are not an industry standard, a benchmark, or a guarantee.** Real times
depend on access, infestation pressure, product, and how much is actually
done on the stop. Every minute and material figure is editable, and picking a
service never overwrites a figure the operator has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `pest-control-bid-usage` — never the address, station
counts, wages, costs, or prices. It is opt-out from the footer, and it is
skipped automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `service_added`, `service_removed`,
`proposed_price_compared`, `waive_initial_toggled`, `summary_copied`.

## Limitations

- Single currency and no tax or sales-tax handling.
- One account at a time; it does not optimize a whole day's route density.
- Year-one billed assumes the initial is its own invoice *plus* a full year
  of recurring stops. Operators who fold the first stop into the initial
  should subtract one recurring invoice.
- Product choice, labels, and treatment recommendations are out of scope —
  this prices time and materials the operator already decided to use.
- Commercial accounts with multiple buildings are modeled as extra service
  rows, not as a property portfolio.

## Disclaimer

This free tool is not legal, tax, financial, pest-control, or business
advice, and it does not tell anyone what to charge. It is not a label, a
treatment recommendation, or a guarantee of control. Outputs are arithmetic
on the user's own inputs. Verify every figure against real payroll,
insurance, product labels, and a qualified professional before relying on it
or submitting a bid. To the maximum extent permitted by law, the authors
accept no liability for loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
