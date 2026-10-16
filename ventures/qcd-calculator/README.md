# QCD Calculator

A free browser tool: **type your IRA distribution, Social Security and other income and the gift you plan to make,
and see whether a qualified charitable distribution (QCD) beats giving the same cash.** It shows AGI, taxable
Social Security, the senior deduction, federal and state tax for each route, what the gift really costs after tax,
and how much of the required minimum distribution the QCD covers. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/qcd-calculator/

After using this, you can **decide how much of this year's giving to send straight from the IRA** before the
custodian's year-end deadline, instead of finding out at filing time.

## Model

- A QCD is excluded from AGI, counts toward the RMD and needs no itemizing (IRC 408(d)(8), age 70 1/2 or older).
- A cash gift leaves the IRA withdrawal in AGI; it is deducted only if itemizing (above the 0.5% AGI floor from 2026)
  or through the capped non-itemizer deduction.
- Taxable Social Security uses the statutory provisional-income tiers; the senior deduction phases out with AGI.
- Ordinary-income brackets only (no preferential gain rates). Tax-year figures sit in `FIGURES` in `calc.mjs`.

Not modelled: Medicare IRMAA (it uses AGI from two years earlier; the AGI line tells you the number to compare),
NIIT, AMT, gifts of appreciated stock, donor-advised funds (a QCD cannot go to one), state rules that differ from
federal, the 35% cap on itemized benefit at the top bracket, and each spouse's separate QCD limit.

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
