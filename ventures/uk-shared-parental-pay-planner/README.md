# UK Shared Parental Pay planner (2026/27)

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/uk-shared-parental-pay-planner/>

Free, private browser tool: enter the due date, each parent's average weekly earnings and employment start, and how many weeks of maternity pay the mother takes first. It tests both parents' eligibility, prices the plan week by week, and shows the household statutory pay of every split of the shared weeks.

After using this, a couple knows what each shared week is worth with each parent, which used to mean reading several GOV.UK pages and building a spreadsheet.

Open `index.html`. Tests: `node --test 'ventures/uk-shared-parental-pay-planner/**/*.test.mjs'`.

**No warranty.** Free and as-is; not legal or payroll advice. Rates written from memory; verify on GOV.UK. See `VENTURE.yaml`.
