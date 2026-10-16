# Charity Bunching Planner

A free browser tool for donors whose itemized deductions sit below the standard deduction: **enter what you
give each year and your deductions, and see exactly which years to fund a donor-advised fund (DAF) so the
same giving saves the most tax**, next to giving directly every year and the regular every-k-years cycles.
Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/charity-bunching-planner/

After using this, you can **pick the years to bunch gifts into a DAF and know what it saves**, which used to
mean rebuilding the itemize-or-standard comparison in a spreadsheet for every schedule you could think of.

## Model

- Charities receive the same planned amount every year; only the timing of the deduction moves.
- Itemizing: other itemized deductions plus gifts above a 0.5%-of-AGI floor (capped at 60% of AGI); only the
  excess over the standard deduction pays.
- Not itemizing: direct cash gifts up to a typed cap are deductible; DAF deposits are not.
- A bunch year deposits this year's gift plus the DAF-funded part of each following year until the next
  bunch year; covered years send `min(gift, cap)` directly and the DAF grants the rest.
- Optimum: exhaustive over all 2^N deposit-year schedules (N <= 15) whose gaps respect the typed limit,
  verified against an independent brute force in `calc.test.mjs`. Giving directly competes as a schedule.
- Deduction amounts and AGI grow at a typed inflation rate; the DAF grows at a typed rate (reported as money
  left for charity, never as tax saving). Optional line for tax avoided by funding deposits with appreciated
  stock.

Not modelled: a progressive bracket schedule (one flat rate), AMT, the high-earner cap on itemized benefit,
the lower AGI limit for stock gifts and the five-year carryforward, state rules, fund fees. Embeds no tax
table.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum
extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

Independent of charities, fund sponsors and tax authorities.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
