# Rental Rent Optimizer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/rental-rent-optimizer/>

A free browser tool for small landlords (1-50 units): **paste or upload your past listings as asking rent, days on
market and leased or still vacant, add today's market rent and your costs, and get the asking rent with the highest
expected net income after vacancy and turnover.** Nothing is uploaded.

After using this, you can now **see how many days each extra 5% of rent adds to your wait, which asking rent earns the
most once empty months are counted, and what asking 5% too high costs you**, which used to take a spreadsheet and a guess.

## Model

- Input: rows of `asking_rent,days_on_market[,leased][,market_rent]` (a header may reorder the columns by name).
  Leased is 1/0 or leased/vacant; a vacant row is right-censored at its days so far.
- Days to lease: constant-hazard (exponential) survival model, rate per day `exp(a + b·x)`, `x = ln(asking / market)`.
  Penalised maximum likelihood (Newton-Raphson with step halving) with a Gaussian prior on `b` centred on the stated
  elasticity ("+10% rent makes the wait N% longer"). Under 6 listings the prior is nearly fixed and only the intercept
  is learned; above that the data gradually takes over, and the page reports how much weight it carries.
- Objective: renewal-reward long-run average. One cycle = a vacancy (mean `mu` months) plus a tenancy of
  `term / (1 - renewal)` months. Net per month = `(rent·L - turnover - vacantCost·mu - riskChance·riskCost) / (mu + L)`.
  Costs paid either way (mortgage, taxes) are a constant and never move the best rent. With no other costs the best rent
  leaves a mean vacancy of `L / (|b| - 1)` months (tested).
- Best rent is searched only inside the premiums your history covers (±15% around market when it cannot be learned).
  300 seeded bootstrap resamples of the listings give the 80% range, the gain over your planned rent and how often it is positive.
- Also: cost of asking 5% above or below best, sensitivity table, hold-out back-test (first 75% fit, last 25% scored),
  CSV export.
- Verdicts: `usable`, `weak evidence`, `assumption-driven` (fewer than 6 listings) or `unidentified` (rents barely
  varied, or higher rents leased faster).

## Limits

Rent control, stabilisation, caps on increases and fair-housing law are not modelled. Season, listing quality, location and
amenities are not modelled. Correlation, not an experiment. Verified only against simulated listings. Statistical estimate
from your own data; not legal, tax, financial or fair-housing advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
