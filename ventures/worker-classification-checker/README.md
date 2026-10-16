# Worker Classification Checker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/worker-classification-checker/>

A free browser tool for small business owners who pay people on a 1099. Answer
sixteen yes/no questions about how the work really happens; it reads them
against the IRS common-law test, the DOL economic reality test and the state
ABC test, lists the facts pushing toward employee status, and estimates back
payroll tax and unpaid overtime as a range. Entirely client-side; nothing is
uploaded.

After using this, you can now **see whether a contractor relationship would
survive the tests an auditor applies, which facts to fix first, and what being
wrong could cost**, which used to take a lawyer's intake call.

## Try it

Open [`index.html`](index.html) and click **Load an example**.

## The model

All in [`calc.mjs`](calc.mjs), pure functions, no dependencies.

- Each question is a fact with a direction (`pointsTo`), a weight and the tests
  it feeds. `unsure` is never counted in the hirer's favour.
- IRS and DOL: weighted share of answered facts pointing to employee; 60%+
  leans employee, 35% or less leans contractor, otherwise mixed.
- ABC: a contractor only if all three prongs are shown. Prongs A and B fail on
  any employee-pointing fact; prong C is a cluster and fails at half the weight.
- `exposure`: employer FICA plus the reduced Section 3509 rates (1.5% / 20% of
  employee FICA if 1099s were filed, 3% / 40% if not), FUTA on the first
  $7,000, half-time overtime premium over 40 hours with a 2-year (3 if willful)
  look-back, and an equal amount in liquidated damages in the high case.

## What this does not cover

State-specific tests and industry carve-outs, VCSP, Section 530 relief, state
unemployment and workers' comp, penalties and interest, the Social Security
wage base, minimum wage and joint employment. A screening aid, not legal advice.

## Run the tests

```
node --test
```
