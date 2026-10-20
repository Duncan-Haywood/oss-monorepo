# Nanny Tax Calculator

A free browser tool: **type a nanny's rate and hours and see what employing them really costs, what they
take home, and the gross rate behind a take-home number.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/nanny-tax-calculator/

After using this, you can **budget the true hourly cost of a household employee and agree a pay rate**
instead of discovering the payroll taxes at filing time.

## Model

- Social Security 6.2% (up to the wage base) + Medicare 1.45%, each side, once cash wages reach the
  household-employee threshold. The employee share is withheld, or paid by you on top.
- FUTA 6.0% of the first $7,000 less the 5.4% state credit, when average quarterly wages reach $1,000.
- State unemployment = typed rate x min(wages, typed wage base). Workers' compensation = typed premium.
- Take-home = wages - withheld FICA - optional flat income-tax withholding. "Take-home" rate mode grosses a
  net hourly rate up by bisection.

Tax-year figures are inputs (defaults are the 2026 figures as understood at build time) - check IRS Pub 926.
Not modelled: state paid leave/disability, local taxes, overtime/minimum wage, dependent care credit.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
