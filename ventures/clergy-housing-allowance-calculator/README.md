# Clergy Housing Allowance Calculator

A free browser tool for ministers, pastors and church treasurers: **enter your salary, the housing allowance your church designated and your housing costs,
and see the income-tax exclusion, the tax it saves, the self-employment tax it does not, and what to designate next year.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/clergy-housing-allowance-calculator/

After using this, you can now **set next year's designation on purpose and hand your board a ready resolution**, which used to be guessing at a number and
hoping it matched the rule (the least of designated, actual cost and fair rental value).

## Use

1. Open `index.html`, pick own, rent or parsonage, enter pay, designation, fair rental value and one housing cost per line, click Calculate my allowance.
2. Pure logic is in `calc.mjs` (`plan()`, `seTax()`, `resolution()`); tests: `node --test`.

Modelled: section 107 exclusion for owned, rented and parsonage housing, taxable excess, missed exclusion, income tax saved, simplified SE tax with the wage base,
suggested designation with a cushion, resolution text. Not modelled: Form 4361 exemption, state rule differences, Additional Medicare tax, retirement plans.
Not tax advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
