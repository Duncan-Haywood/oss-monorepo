# Home Sale Exclusion Calculator

A free browser tool for people selling their main home: **enter the sale, purchase and ownership details and
see how much of the gain the $250,000 / $500,000 section 121 exclusion covers, the federal tax on the rest, and
what waiting a few months to reach two years would save.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/home-sale-exclusion-calculator/

After using this, you can now **time a home sale around the two-year test and know the tax before listing**,
which used to take a tax preparer working Publication 523 by hand.

## Model (tax year 2026, federal)

- Gain = price - selling costs - purchase price - improvements + depreciation claimed.
- Exclusion $250,000 ($500,000 MFJ or surviving spouse) with 24 months owned and used and no exclusion used in
  the last two years; partial (months/24 of the shorter of owned and used) with a qualifying reason.
- Depreciation is never excluded; taxed at ordinary rates capped at 25%. Nonqualified use after 2008 is
  allocated out of the exclusion by months.
- The rest is long-term gain stacked on other income into the 0/15/20% bands, plus 3.8% NIIT over the threshold.
- Wait-and-save and break-even price re-run the same model.

Not modelled: state tax, other gains, window suspensions, business use beyond depreciation, divorce and death
special cases, other years. Unverified against Publication 523 worksheets.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of the Internal Revenue Service, brokerages and real estate companies.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`sale_analyzed`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
