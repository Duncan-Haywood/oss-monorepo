# Adjunct Course Offer Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/adjunct-course-offer-calculator/>

A free browser tool for adjunct and part-time instructors: **type each offer's pay, weeks, hours, class size, travel and costs, and see what the course really pays per hour of your time.** It ranks up to three offers, shows the per-course pay that would reach your target hourly rate, the largest class worth accepting at the pay on offer, and annual totals. Nothing is uploaded.

After using this, you can **say yes, no or "not at that class size" to an adjunct contract with the real hourly figure in hand**, which used to take a spreadsheet and a guess at how long grading would take.

## Model

- Hours per course = weeks x (class + prep + office hours + email + students x grading minutes / 60) + unpaid training and meetings + travel time.
- Net per course = expected pay - driving, parking and fees, where expected pay = pay x (1 - cancellation chance) + cancellation fee x chance.
- Real hourly = net / all hours; the contract rate = pay / hours in the room.
- Pay for a target rate and the largest class at the target are solved from the same formula.

Not modelled: tax, benefits eligibility, loan-forgiveness rules, raises, pay for added hours.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, accounting, compliance, employment or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
