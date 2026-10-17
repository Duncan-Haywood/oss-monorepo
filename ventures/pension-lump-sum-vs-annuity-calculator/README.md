# Pension Lump Sum vs Monthly Pension Calculator

A free browser tool for anyone offered a pension buyout. Type the monthly pension, its start age and
cost-of-living increase, the lump sum, your age, the age you have a 50/50 chance of reaching, and the
return you expect on invested money. It returns what the pension is worth today counting your
lifespan, the yearly return the lump sum must earn to match it, the break-even age and the chance of
reaching it, a spouse survivor benefit, what the lump sum could pay each month until a planning age,
and a return by lifespan grid. Entirely client-side.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/pension-lump-sum-vs-annuity-calculator/

After using this, you can **see what return you are being asked to give up the pension for**, instead of
comparing two dollar figures.

## Try it

Open [`index.html`](index.html) and click **Compare the two**.

## The model

[`calc.mjs`](calc.mjs), pure functions, monthly steps to age 110. Survival is a Gompertz curve
(dispersion 9.5 years) set so you have exactly a 50% chance of reaching the age you type. A spouse gets
their own curve and keeps the typed share of the pension if you die first. Present value discounts each
expected payment at your return; the required return is the rate (bisection) at which the expected
pension equals the lump sum after the typed tax. The sustainable monthly figure is the level, COLA-grown
withdrawal that runs the lump sum to zero at the planning age.

## Limits

Defaults are placeholders, not a real offer. Stylised survival curve, not a life table; constant return;
before tax on pension and withdrawals. No plan-insurance analysis, no lump-sum rate derivation, no
Social Security interaction. Not legal, tax or financial advice.
