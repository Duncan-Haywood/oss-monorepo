# Rental Property DSCR Calculator

A free browser tool for rental investors: **enter price, rent, loan terms and operating costs, and see DSCR
two ways (rent over PITIA, and NOI over debt service), cash-on-cash, cap rate, break-even occupancy, the largest
loan a lender's minimum DSCR allows, and how a higher interest rate cuts coverage.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/rental-dscr-calculator/

After using this, you can now **see whether a deal clears a DSCR loan's minimum and how big a loan it supports**,
which used to take a spreadsheet you had to build and trust yourself.

## Model

- NOI = effective income (rent + other income, less vacancy) minus management and maintenance as a share of
  income, minus the yearly tax, insurance, HOA and utilities entered.
- DSCR (rent / PITIA) = scheduled gross rent / (debt service + tax + insurance + HOA). DSCR (NOI) = NOI / debt service.
- Largest loan = the loan whose payment leaves exactly the target ratio, solved for both definitions.
- Year table grows rent and costs, sells at the end net of selling costs and loan balance; IRR by bisection.

Not modelled: income tax, depreciation, lender fees and points, prepayment penalties, rate resets after
interest-only periods, refinancing, lender-specific rules. Lender minimums are a number the visitor enters.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of lenders, brokers, listing sites and property managers; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`dscr_calculated`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
