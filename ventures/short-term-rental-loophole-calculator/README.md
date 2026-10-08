# Short-Term Rental Loophole Calculator

A free browser tool: **enter a short-term rental's price, income and your hours, and see whether the loss
would be non-passive, the year-one tax saved with cost-segregation bonus depreciation, and what you pay back
at sale.** Nothing is uploaded.

After using this, you can **decide whether a short-term rental's depreciation will offset your W-2 income
and how many logged hours it takes**, which used to take a CPA consultation or a spreadsheet of guesses.

## Model

- Average stay <= 7 days: not a "rental activity" for the passive-loss rules (Treas. Reg. 1.469-1(e)(3)(ii)).
  8-30 days is flagged as a facts question (significant personal services).
- Material participation: more than 500 hours, or more than 100 hours and more than any other single person.
- Year-one depreciation = bonus on the cost-segregated share + 7-year first-year on the rest of that share +
  straight line on the remaining building (39 or 27.5 years).
- Non-passive loss is capped by the excess-business-loss limit (typed; anything above carries forward).
  Passive loss gets the $25,000 special allowance only below the income phase-out.
- Recapture at sale: ordinary rate on the cost-segregated share, up to 25% on straight-line depreciation.

Tax-year figures are inputs (defaults are placeholders) - confirm with a professional. Not modelled: state
conformity, NIIT, QBI, 1031 exchanges, passive income from other properties, mid-month conventions.

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
