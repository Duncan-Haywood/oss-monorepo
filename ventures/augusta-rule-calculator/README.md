# Augusta Rule Calculator

A free browser tool for small-business owners who own their home: **enter the days you would rent it to your
own business, a fair daily rent and your tax rates, and see the rent excluded from your income, the federal,
self-employment and state tax saved, the net after costs, and what happens if the daily rate is cut back.**
Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/augusta-rule-calculator/

After using this, you can now **see in dollars what the 14-day home-rental rule (IRC section 280A(g)) is worth
to you and whether the paperwork is worth the saving**, which used to take a spreadsheet and a guess at how
each entity type is taxed.

## Model

- Rent = days x daily rate, at most 14 days a year (more is refused: the rent would be taxable).
- Federal saving = rent x federal rate, x 80% if the qualified business income deduction applies (not for a
  C corporation).
- Sole proprietor, single-member LLC or general partner: also saves self-employment tax on 92.35% of the rent.
  S corporation: income tax only. C corporation: deducts at the corporate rate.
- State saving = rent x state rate. Net = saving less yearly cost; multi-year net also subtracts setup cost.
- Every rate is an input, not an embedded rule.

Not modelled: whether the days and business purpose qualify, whether the rate is a fair market price, the
deduction for half of self-employment tax, QBI limits, state differences, other taxes and audit risk.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of the Internal Revenue Service and any tax authority.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`estimate_calculated`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
