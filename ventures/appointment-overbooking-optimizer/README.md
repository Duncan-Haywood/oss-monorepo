# Appointment Overbooking Optimizer

A free browser tool for clinics, salons, studios, tutors and repair shops: **paste or upload how many people were
booked and how many showed up in each past slot, and get the number of appointments to book per slot that earns the
most, the chance someone is turned away, a bootstrap range, and a back-test on your most recent slots.** Nothing is
uploaded.

After using this, you can now **see whether overbooking would actually pay for your schedule, by how much, and how
sure that is**, which used to take a spreadsheet and a guess about how no-shows behave.

## Model

- Input: one row per slot (`slot,booked,showed`, columns may be reordered by header name) or one row per appointment
  (`slot,status`, grouped by slot). Late cancels count as no-shows; early cancels are left out.
- Shows in a slot of `n` bookings ~ beta-binomial: a binomial whose show-up probability varies between slots, so
  no-shows cluster (storms, flu weeks). Two fitted numbers: mean show-up rate and intraclass correlation `rho`.
  Maximum likelihood by shrinking grid search (deterministic).
- Profit of booking `n` into `C` seats = `margin × E[min(S, C)] − overflowCost × E[(S − C)+]`, searched from `C` to
  `C + extra`, optionally subject to a cap on `P(S > C)`.
- 200 seeded bootstrap resamples of the slots give the 80% range of the no-show rate and of the gain, and the share of
  resamples that pick each booking level (each resample's choice is scored on the main fit).
- Refuses: fewer than 40 appointments, 5 no-shows or 15 slots. Warns when groups are large (group by session, not
  day), when no-shows look independent, and when the best level was never booked before.
- Back-test: fit on the first 75% of slots, compare predicted with observed no-shows in the last 25% (z-score), and
  compare log-likelihood with a plain binomial. A recent shift is reported as "rate has moved".

## Limits

Assumes demand exists to fill the extra booking and that a turned-away person can be rebooked at a known cost. Does not
model who cancels, notice given, customer type or loyalty effects. Verified only against simulated bookings with known
patterns. Do not use where an overflow could endanger someone. Statistical estimate from your data, not advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
