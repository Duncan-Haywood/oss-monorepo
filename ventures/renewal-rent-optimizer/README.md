# Renewal Rent Optimizer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/renewal-rent-optimizer/>

A free browser tool for small landlords and property managers: **paste or upload a CSV of past lease renewals
(current rent, the rent you offered, renewed or left), say what a move-out costs you, and get a renewal-chance
curve, the rent increase with the highest expected income over the next lease inside the range you have actually
offered, and a back-test that says whether the size of the increase explains who stayed at all.** Nothing is
uploaded.

After using this, you can now **see how much each extra point of rent increase costs you in tenants, what a
move-out really costs, and which increase earns the most**, which used to take a guess or a property-management
suite.

## Model

- Input: rows of `current,offered,renewed` (a header may reorder the columns by name). Renewed is 1/0,
  renewed/left, yes/no, stayed/moved out and similar; unreadable rows, and offers under half or over double the
  current rent, are skipped with a warning.
- `P(renew) = 1 / (1 + exp(-(a + b·x)))` with `x = ln(offered / current)`. Newton-Raphson with step halving and a
  tiny ridge (perfect separation stays finite and is flagged). 95% interval on the slope from the inverse Hessian.
- Value of a stay: the offered rent for every month of the term. Value of a departure: the new tenant's rent for
  the months after the vacant days, less the turnover cost. Expected income is the mix of the two by `P(renew)`.
- Best increase: expected income searched on a grid between the lowest and highest increase seen, never outside.
  300 seeded bootstrap resamples (stayers and leavers resampled separately) give the 80% range of the best
  increase and of the gain, and the share of resamples in which it beats the usual increase.
- Refuses: fewer than 25 offers, fewer than 6 renewals or 6 departures, offers that barely varied (sd of
  `ln(1 + increase)` under 1%), or fewer than 4 distinct increase levels.
- Flags: a non-negative slope (you raised rent most where tenants were likelier to stay), perfect separation, a
  best increase at the edge of the tested range, and an assumed market rent.
- Back-test: fit on the first 75% in the order given, score the last 25% by log-loss against the overall renewal
  rate.

## Limits

Correlation, not an experiment. The local market, rent control and notice rules, tenancy length, unit condition and
repairs owed are not modelled. Verified only against simulated renewals with known curves. Statistical estimate
from your data, not advice, and it does not know what your jurisdiction allows.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
