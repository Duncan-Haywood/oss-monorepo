# Self Assessment Tax Calculator

Free, private browser tool: put your job, a side business, rental income, savings interest and dividends into one 2025/26 estimate. It stacks income tax in HMRC order, adds Class 4 National Insurance and student loan, subtracts the PAYE already paid, and shows the 31 January balance plus the payments on account that follow.

**Live tool:** https://marisstella.app/uk-self-assessment-tax-calculator/

After using this, you know what to set aside for 31 January 2027, and whether a pension contribution or Gift Aid would cut it, without a spreadsheet or waiting for HMRC's own calculation.

Open `index.html`. Tests: `node --test 'ventures/uk-self-assessment-tax-calculator/**/*.test.mjs'`.

**No warranty.** Free and as-is; not tax advice. Written from memory of the published 2025/26 rules in a session without network access, so every result names the GOV.UK pages to verify against. See `VENTURE.yaml`.

## Known gaps

The [2026-11-17 census quality audit](../../portfolio/quality/audits/2026-11-17-uk-self-assessment-tax-calculator.json) found four errors. All four are fixed, each with a test in `calc.test.mjs`:

- The finance-cost credit limit leaves out savings and dividends (fixed in the audit's own PR).
- The property allowance and the actual-expenses route (with the 20% mortgage-interest credit) are both priced, and the lower bill wins. Before, the allowance was taken whenever it beat expenses, even when that gave up a larger credit (red-team run, 2026-11-17).
- Student loan leaves out unearned income (savings, dividends and property profit) of £2,000 or less. Above £2,000 all of it counts. GOV.UK's wording is "unearned income in excess of £2,000", and the tool reads that as a threshold, not an allowance taken off the top. Check your own case against HMRC's calculation (red-team run, 2026-11-17).
- Plan 5 collects nothing for 2025/26, because repayments start in April 2026 (red-team run, 2026-11-17).

Still not modelled: Scotland, losses, the marriage allowance and the other items listed on the page.
