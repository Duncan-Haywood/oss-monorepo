# Merchant Cash Advance True Cost Calculator

A free browser tool for small-business owners offered a merchant cash advance or an invoice-factoring deal:
**enter the quote and see the annualised cost of the money you actually receive, what paying it off early does
to that cost, how the same payback behaves over a different term, and how it compares with a bank loan.**
Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/merchant-cash-advance-true-cost-calculator/

After using this, you can now **turn a factor rate or a factoring fee into a comparable yearly cost before you
sign**, which used to take a spreadsheet and an IRR function most owners do not have.

## Model

- Advance: funded = advance minus fees on day 0; payback = advance x factor (or payment x payments); equal
  daily (252 a year) or weekly (52) payments. The periodic rate is the IRR of those flows, found by bisection;
  annualised simple = rate x periods a year, compounded = (1+rate)^periods - 1.
- Early payoff assumes no discount (whole payback settled at that payment), so the annualised cost rises.
- Factoring: advance rate x invoice up front, reserve back on collection minus fees; each started fee period
  is billed in full; annualised = fees / advance x 365 / days to collect.

Not modelled: variable card-sales holdbacks, personal guarantees, default and reconciliation terms, stacked
advances, taxes, state disclosure rules.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of funders, brokers, factors and lenders; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`cost_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
