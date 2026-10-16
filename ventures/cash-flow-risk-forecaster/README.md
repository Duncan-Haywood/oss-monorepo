# Cash Flow Risk Forecaster

Free, private browser tool for small businesses and freelancers: paste the invoices you expect and the bills you owe, and a seeded Monte Carlo run (invoices paid on time, late or never) gives the chance your balance drops below a floor, the cushion that would cover 9 in 10 outcomes, a week-by-week balance band, and the single invoice or bill that moves the odds most.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/cash-flow-risk-forecaster/

After using this, you can see which week your cash gets thin and which one overdue invoice to chase first, which used to mean a spreadsheet that assumed everyone pays on time.

Open `index.html`. Tests: `node --test 'ventures/cash-flow-risk-forecaster/**/*.test.mjs'`.

**No warranty.** Free and as-is; not legal, tax or financial advice. The on-time share, days late and never-paid share are your inputs. See `VENTURE.yaml`.
