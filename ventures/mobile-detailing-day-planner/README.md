# Mobile Detailing Day Planner

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/mobile-detailing-day-planner/>

A free browser tool for mobile car detailers. List the jobs people want booked
(price, hours on site, drive minutes from the shop, supplies); it picks the
most profitable set that fits your hours, shows take-home per hour including
the drive, and names the price each job needs to earn your target. Entirely
client-side; nothing is uploaded.

After using this, you can **decide which jobs to take today and which to
reprice or move to another day**, instead of filling the calendar in booking
order.

## Try it

Open [`index.html`](index.html) and click **Load an example**.

## The model

All in [`calc.mjs`](calc.mjs), pure functions, no dependencies.

- `planDay`: tries every subset of up to 14 jobs, keeps those that fit the
  hours, and returns the best by take-home profit and the best by profit per
  hour.
- Drive is estimated as a round trip to the farthest job in the set (jobs are
  treated as lying along one road out from the shop). An extra-drive cushion
  covers zigzag days.
- Per-job price to hit target uses the time and vehicle cost the job adds to
  the best set.

## What this does not cover

Customer lifetime value, appointment windows, weather, water and power access,
insurance and tax. Planning arithmetic, not advice.

## License and privacy

MIT. No warranty; not legal, tax, accounting or financial advice. Nothing
leaves your browser; usage counts are local, opt-out-able and honour Do Not
Track.

## Run the tests

```
node --test
```
