# FERS Retirement Planner

A free browser tool for federal employees under FERS: **enter birth month, service start, pay, sick leave and TSP and see the pension, Special Retirement Supplement and TSP income at every retirement age, the month each kind of retirement first opens, and what one more year of work adds.**

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/fers-retirement-planner/

After using this, you can **see whether waiting for 62 (the 1.1% multiplier) or for 30 years (the supplement) beats retiring at your minimum retirement age**, which used to be an OPM estimate request or a spreadsheet per scenario.

## Model

- Annuity = multiplier x high-3 x service. Multiplier 1.0%, or 1.1% at 62+ with 20+ years. High-3 is projected from current pay and an assumed raise (average of the last 36 months).
- Unused sick leave converts at 2,087 hours per year and adds to annuity service, never to eligibility.
- Immediate retirement: age 62 with 5 years; minimum retirement age (by birth year) with 30; 60 with 20; MRA with 10 (cut 5% for each year under 62, prorated by month).
- Survivor election: partial costs 5%, full 10%.
- Supplement = your age-62 Social Security estimate x 12 x FERS years / 40, paid before 62, for MRA+30 and 60+20 only. Sick leave is not counted in the supplement's service (conservative).
- TSP: balance grows monthly at your return with your contribution plus the agency's 1% automatic and up to 4% match; draw is the share you choose.
- COLA from 62 only: CPI up to 2% passes through, 2-3% pays 2%, above 3% pays CPI minus 1.

Not modelled: law enforcement, firefighter, ATC and CBP provisions, CSRS, part-time or military service, disability, involuntary or early-out retirement, deferred retirement, the Social Security earnings test, taxes. Rules were written from the author's memory of OPM guidance and have not been checked against an OPM estimate; the page says so.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, retirement, investment or financial advice and does not replace a qualified professional or your HR office.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Independent of OPM, the Thrift Savings Plan and any agency. Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
