# UK State Pension NI years checker (2026/27)

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/uk-state-pension-ni-years-checker/>

Free, private browser tool: enter your birth date and the qualifying years on your GOV.UK State Pension forecast. It works out your State Pension age (66 to 68), the years you will reach, and whether buying voluntary Class 3 National Insurance years for recent gaps pays back: cost, extra weekly pension, payback period, the 10-year minimum cliff and the six-year deadline for each gap year.

After using this, someone with gaps in their National Insurance record knows whether paying to fill them is worth it and by when, instead of reading several GOV.UK pages and phoning the Future Pension Centre blind.

Open `index.html`. Tests: `node --test 'ventures/uk-state-pension-ni-years-checker/**/*.test.mjs'`.

**No warranty.** Free and as-is; not tax or financial advice. Rates written from memory (verify on GOV.UK). See `VENTURE.yaml`.
