# Junk Removal Bid Calculator

A free browser calculator for independent junk haulers. It prices a cleanout
the way the landfill actually bills one — each pile turned into estimated
tons — and shows the dump ticket, the loaded labor, and the walk-away number
before a half-truck special goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/junk-removal-bid-calculator/

**After using this, you can now see whether a quoted job covers the scale
ticket and the crew, which used to take a spreadsheet plus a guess from the
driveway photo.**

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/junk-removal-bid-calculator -p 8080
# Run the tests
cd ventures/junk-removal-bid-calculator && node --test
```

## The problem it solves

Most "junk removal cost calculator" results are lead forms. The operators
who do the work still bid from a truck-fraction rule of thumb: quarter,
half, full. That rule cannot see the material. Two yards of couches and two
yards of concrete occupy the same trailer and print dump tickets an order of
magnitude apart. Appliances, mattresses, and tires often carry a special fee
on top. Stairs and a long carry are labor that never appears on a "half
truck $199" flyer. The hauler who quotes the flyer on a basement full of
drywall is locked into a job that loses money at the scale.

## How it works

1. **Weight from the pile.** Each row is a material with quantity (cubic
   yards, or a count for appliances) and pounds per unit. Estimated tons =
   pounds ÷ 2,000.
2. **The dump ticket.** `max(minimum ticket, tons × fee per ton)`, plus the
   landfill surcharge, plus per-item special fees. That is the part of the
   job the scale will not negotiate.
3. **The carry.** On-site clock hours, plus stairs, plus a long carry, plus
   round-trip drive, plus one dump-run per truck-full. Multiplied by crew
   size so windshield time is loaded labor. Wage × (1 + payroll burden %).
4. **Overhead and margin.** Overhead is a markup on direct cost. Price is
   cost ÷ (1 − target margin %), because margin is a share of the
   customer's number. A posted minimum charge lifts that number; it does
   not change the walk-away cost.

It then reports volume, tons, truck loads, dump runs, price per cubic yard,
effective hourly rate, and the **walk-away price** — total job cost, below
which the job makes nothing. Entering a price already on the table scores it
against the same cost base. **Copy bid summary** turns the result into a
plain-text draft.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs). A longer explanation of
the method is in [`how-to-price-junk-removal.html`](how-to-price-junk-removal.html).

## Densities

The material list ships with common loose-density starting points. **They
are not a landfill tariff, a benchmark, or a guarantee.** Real weight
depends on how packed and how wet the load is. Every density and special
fee is editable, and picking a material never overwrites a figure the
hauler has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `junk-removal-bid-usage` — never the address, load,
dump rates, wages, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `pile_added`, `pile_removed`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no sales-tax handling; the hauler enters their own numbers.
- Weight is an estimate until a scale ticket prints.
- Hazardous waste, permits, and municipal dump-voucher programs are not modelled.
- One truck type; a second trailer is represented only as extra dump runs.

## Disclaimer

This free tool is not legal, tax, financial, or business advice, and it does not
tell anyone what to charge. Outputs are arithmetic on the user's own inputs.
Verify every figure against real dump tickets, payroll, insurance, and fuel
costs and against a qualified professional before relying on it or submitting
a bid. To the maximum extent permitted by law, the authors accept no liability
for loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
