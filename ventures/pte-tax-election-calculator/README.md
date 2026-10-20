# PTE Tax Election Calculator

A free browser tool for S corporation and partnership owners in states with a
pass-through entity tax (PTET) election. Enter your pass-through income, the
state's PTET rate and credit, your other state and local taxes, your other
deductions and the SALT cap. It compares federal plus state tax with and without
the election, splits the difference into its causes, and finds the income at
which the election starts to pay. Entirely client-side; no taxpayer identifiers
are asked for.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/pte-tax-election-calculator/

After using this, you can **tell whether the election saves you money, why, and
what it costs you if it doesn't** — which used to take a CPA's engagement-letter
hour or a spreadsheet you would have to trust.

## Try it

Open [`index.html`](index.html) and click **Compare with and without the election**.

## The model

[`calc.mjs`](calc.mjs), pure functions, no dependencies. One flat federal
marginal rate is applied to the change in taxable income.

- With the election the entity pays `income x PTET rate`, deducts it (uncapped),
  and the state credits a share of it against your personal tax on that income.
  A credit larger than that personal tax is treated as lost.
- Without it, your state tax on the income joins your other state and local tax
  as a personal itemized deduction, limited by the SALT cap.
- The cap shrinks by a percentage of MAGI over a threshold down to a floor. The
  election lowers MAGI, so it can raise the cap.
- The 20% pass-through deduction is taken on income net of the PTET payment, so
  the election shrinks it.
- Savings = (federal + state tax without) - (federal + state tax with). The page
  splits the federal part into the deduction change, the AGI drop and the lost
  20% deduction, and searches a grid for the first income at which it pays.

The worked examples in `calc.test.mjs` are hand-computed: at $400,000 of income
with the cap not binding the election *costs* $1,680 (only the 20% deduction
shrinks); at $1,000,000 with the cap at its floor it saves $16,800.

## Not decided

Eligibility, true state rates and credit rules, deadlines, whether the election
is binding, multi-state and non-resident owners, losses, AMT, the 20% deduction's
wage and property limits, and the exact federal bracket. Defaults, including the
cap figures, are placeholders — check them for your tax year. Not tax advice.

## Tests

`node --test` (28 tests: hand-worked examples, edge cases, page and privacy
checks, usage counters).
