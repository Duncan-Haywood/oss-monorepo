# UK tax code checker (2026/27)

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/uk-tax-code-checker/>

Free, private browser tool: type the PAYE tax code from your payslip (1257L, BR, 0T, K475, S1257L, 1257L M1) with the pay and tax shown year-to-date. It decodes the code, works out the tax that code should have produced and the tax the standard code would have taken, and flags a likely overpayment (emergency tax, wrong code). A second section works out what your code should be from benefits, other income, underpaid tax, Marriage Allowance and the £100,000 taper.

After using this, a UK employee knows what their tax code means and whether they are probably being overtaxed, which used to mean reading several GOV.UK pages and waiting on an HMRC call.

Open `index.html`. Tests: `node --test 'ventures/uk-tax-code-checker/**/*.test.mjs'`.

**No warranty.** Free and as-is; not tax advice. Rates written from memory (verify on GOV.UK and your HMRC online account). See `VENTURE.yaml`.
