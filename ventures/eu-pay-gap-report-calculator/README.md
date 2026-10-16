# EU Pay Gap Report Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/eu-pay-gap-report-calculator/>

A free browser tool for HR and payroll teams: **paste one row per worker and get the pay gap indicators the EU Pay Transparency
Directive (2023/970, Art. 9) requires employers with 100 or more workers to report**: mean and median hourly pay gap, variable
pay gap, share of women and men receiving variable pay, women and men in each pay quartile, and the gap per job category with
the Art. 10 five-percent joint-pay-assessment flag. Nothing is uploaded.

After using this, you can now **see your pay gap indicators and which job categories cross the 5% line before the first report
is due (7 June 2027 for employers with 150 or more workers)**, which used to be a payroll-spreadsheet exercise redone by hand.

## Use

1. Open `index.html`, paste rows `gender, category, base, bonus, hours` (header optional), click Calculate the indicators.
2. Pure logic is in `calc.mjs` (`analyze()`, `parseRows()`); tests: `node --test`.

Modelled: gap = (men - women) / men on gross hourly pay; variable-pay gaps among recipients; quartiles by rank; category gaps
with a |gap| >= 5% flag. Not modelled: equal-value job evaluation, benefits in kind, national transposition detail and filing
formats, non-binary categories. Not legal advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
