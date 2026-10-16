# Hard Money Loan Cost Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/hard-money-loan-cost-calculator/>

A free browser tool: **type a fix-and-flip deal and two hard money term sheets and see what each loan really costs** — interest on money actually drawn, points on the whole commitment, flat fees, a fee per draw, minimum-interest clauses and extension fees — as an effective annual rate, a profit figure and a return on your cash. It also shows what a late flip costs and the hold length at which the cheaper lender changes. Nothing is uploaded.

After using this, you can **pick the lender whose total cost is lowest for your expected hold**, which used to mean comparing a headline rate against points in your head.

## Model

- Purchase advance is funded at closing; the rehab advance is released in equal draws across the rehab period, and interest accrues only on drawn money (interest-only, simple, 12-month rate).
- Minimum-interest clauses charge the full commitment for at least N months.
- Points apply to purchase plus rehab commitment. Extension fees apply once per extension block after the term ends.
- Effective annual rate = total finance cost / average balance / years held.
- Profit = after-repair value less selling costs, purchase, rehab, holding costs and finance cost. Return is on closing cash plus unfunded rehab.

Not modelled: qualification, ARV caps and appraisals, compounding or per-diem conventions, rate bumps, prepayment penalties, taxes.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, lending, tax, or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
