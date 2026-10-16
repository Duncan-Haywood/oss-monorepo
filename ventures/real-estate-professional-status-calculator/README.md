# Real Estate Professional Status Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/real-estate-professional-status-calculator/>

A free browser tool for rental investors. Enter your real estate hours, your other
work hours, the hours you spend on the rentals, your income and your expected rental
loss. It checks the 750-hour and more-than-half tests, the material participation gate
on the rentals, applies the $25,000 allowance and its phase-out if you do not qualify,
and prices the difference in today's dollars over your holding period. Entirely
client-side; no taxpayer identifiers are asked for.

After using this, you can **see which gate keeps a rental loss passive, how many hours
short you are, and that status moves the deduction in time rather than creating it** —
which used to take a cost-segregation sales call or a spreadsheet you would have to trust.

## Try it

Open [`index.html`](index.html) and click **Check my status**.

## The model

[`calc.mjs`](calc.mjs), pure functions, no dependencies.

- Hours test: real estate hours must exceed 750 and exceed all other work hours (both strict).
- Material participation: the 500-hour test on the rentals is modelled; other tests and a
  grouping election are listed as not decided.
- Passive path: active participants deduct up to the allowance, reduced by 50 cents per dollar
  of MAGI over $100,000; the rest is suspended and released in the sale year.
- Value: tax saved at one marginal rate, discounted, REPS path versus passive path.

Every default is a placeholder. Run `node --test` in this directory for the suite.
