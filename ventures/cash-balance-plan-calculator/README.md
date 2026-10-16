# Cash Balance Plan Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/cash-balance-plan-calculator/>

A free browser tool for self-employed, S-corp and small-practice owners aged 40+ (doctors, dentists,
consultants): **estimate a range for a 2026 cash balance plan contribution by age, stacked with a 401(k) and
profit sharing, and see the tax it could save, what employee contributions cost, and a multi-year
projection.** Nothing is uploaded.

After using this, you can now **walk into an actuary conversation knowing roughly how much you could deduct
and what it costs for staff**, which used to take a sales call.

## Model (illustrative)

- Benefit limit = lesser of the 2026 415(b) dollar limit and 100% of pay (capped at the 401(a)(17) limit),
  scaled by min(years to retirement, 10) / 10.
- Contribution = benefit limit x annuity factor (three rate scenarios) / future-value factor of a level
  yearly payment to retirement. Shown as a conservative / central / generous range.
- Stack = 401(k) deferral + age catch-up + 6% profit sharing, capped by 415(c).
- Tax saved = deductible amount (capped by business income) x the marginal rate you enter, plus employee
  contributions (default 3% of their pay).
- Projection = central contribution recomputed at each age, grown at a credited rate.

2026 assumptions (stated in `calc.mjs`, confirm against the IRS notice): 415(b) $290,000; 415(c) $72,000;
deferral $24,500 (+$8,000 or $11,250 catch-up); compensation limit $360,000.

Not modelled: actuarial valuation, minimum funding, PBGC premiums, plan fees, nondiscrimination testing
outcomes, state rules, SE or payroll tax effects, QBI interaction.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace an enrolled actuary or a
qualified professional. **You are responsible for reviewing and verifying its output before relying on
it.** To the maximum extent permitted by law, the authors accept no liability for any loss or damage
arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`plan_estimated`, `example_loaded`) are kept
only in local storage, can be switched off on the page, and honour Do Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
