# UK minimum wage checker (2026/27)

Free, private browser tool: enter one pay period — pay, hours actually worked, deductions for the employer's benefit and accommodation — and see the effective hourly rate against the National Living Wage or NMW for the worker's age band, any shortfall, and the arrears and HMRC penalty exposure.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/uk-minimum-wage-checker/

After using this, a UK small employer knows whether a worker is really above the minimum once unpaid hours and deductions are counted, which used to mean reading several GOV.UK pages and a spreadsheet.

Open `index.html`. Tests: `node --test 'ventures/uk-minimum-wage-checker/**/*.test.mjs'`.

**No warranty.** Free and as-is; not legal or payroll advice. Rates written from memory (the 2026/27 accommodation offset is an assumption); verify on GOV.UK. See `VENTURE.yaml`.
