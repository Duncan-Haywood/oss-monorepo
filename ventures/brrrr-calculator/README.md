# BRRRR Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/brrrr-calculator/>

A free browser tool for real estate investors: **enter price, rehab, hard-money terms, after-repair value and refinance terms, and see
the cash you actually put in, the cash the refinance pays back, the cash left in the deal, cash flow and DSCR after the refinance, and
the highest purchase price that pulls every dollar out.** Stress tables show a low appraisal, a rehab overrun and a higher refinance
rate. Nothing is uploaded.

After using this, you can now **see how much cash a buy-rehab-rent-refinance deal really leaves in it and how far a low appraisal or a
rehab overrun moves that**, which used to take a spreadsheet you had to build and trust yourself.

## Model

- Hard-money loan = share of price + share of rehab. All-in cost = price + rehab + closing + points + interest-only hard-money interest
  for the hold + monthly holding costs. Cash invested = all-in cost minus the hard-money loan.
- Refinance loan = ARV x LTV, capped (if a minimum DSCR is entered) at the loan that rent supports: rent over debt service + tax +
  insurance + HOA at that minimum.
- Cash out = refinance loan - hard-money payoff - refinance closing costs. Cash left = cash invested - cash out, floored at zero.
- Highest price for zero cash left is solved by bisection over the whole deal. The 70% rule is shown for comparison only.

Not modelled: income tax, depreciation, lender seasoning rules, appraisal fees, lender cash-out limits, rent during rehab, rate
changes before the refinance, lender-specific rules.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of lenders, brokers, listing sites and property managers; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`brrrr_calculated`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
