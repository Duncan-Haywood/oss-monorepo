# Shared Kitchen Rate Planner

A free browser tool for shared and commissary kitchen owners. Enter monthly
costs, stations, open hours, hourly rate and memberships; it returns profit,
the utilization you need to break even and to hit a profit goal, the hourly
rate that gets you there, the effective hourly price of a membership, and a
profit grid across rates and utilization. Entirely client-side; nothing is
uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/shared-kitchen-rate-planner/

After using this, you can **set an hourly rate and membership fee from your
own costs** instead of copying the kitchen down the road.

## Try it

Open [`index.html`](index.html) and click **Plan my rates**.

## The model

All in [`calc.mjs`](calc.mjs), pure functions, no dependencies. Capacity is
stations x hours x days x 52/12. Members pay a flat fee for included hours;
other used hours sell at the hourly rate; fees come off all revenue; costs are
fixed per month.

## What this does not cover

Peak/off-peak pricing, churn, deposits, permits, lease escalators and tax.
Planning arithmetic, not advice.

## License and privacy

MIT. No warranty; not legal, tax, accounting or financial advice. Nothing
leaves your browser; usage counts are local, opt-out-able and honour Do Not
Track.

## Run the tests

```
node --test
```
