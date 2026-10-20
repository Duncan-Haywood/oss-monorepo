# Appointment Overbooking Optimizer

A free browser tool for clinics, dentists, salons and studios: **enter your slots, what a visit earns and what an
over-full day costs, plus either your no-show rate or a history of booked and showed counts per day, and get the
profit-maximising number of extra bookings, the chance anyone is over capacity, and how sure the answer is.** Only
daily counts are used, never patient names. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/appointment-overbooking-optimizer/

After using this, you can now **decide how many extra appointments to book each day, see the risk of an over-full day,
and know whether your own history supports the plan**.

## Model

- Show-ups among B bookings: binomial(B, p), or beta-binomial when days cluster. Variance is inflated by
  `1 + (B-1)·rho`; `rho` is estimated from the dispersion of daily show rates around the overall rate (clamped 0 to 0.5).
- Profit of a plan is exact, summed over every possible show-up count: `margin·min(s, slots) - overflowCost·max(s - slots, 0)`;
  in overtime mode margin is earned on every patient seen.
- Uncertainty: Beta posterior for p from your counts, evidence divided by the design effect `1 + (n-1)·rho`, each plan
  averaged over a fixed 400-point grid (no random sampling). 80% range and the best plan at each end are reported.
- Optional cap: the largest plan whose chance of anyone being over capacity is at most your limit.
- Forecast check: fit on the first 75% of days, test the central 80% show-up range on the last 25%, and compare the
  log score with and without clustering.
- Refuses: fewer than 10 days or 60 appointments, showed above booked, or costs that make seeing a patient unprofitable.

## Limits

Early cancellations that free a slot, per-weekday or per-appointment-type rates, walk-ins and professional rules on
overbooking are not modelled. Verified against independent reference calculations and simulated histories only.
Planning estimate from your numbers, not advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
