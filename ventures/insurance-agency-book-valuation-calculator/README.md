# Insurance Agency Book Valuation Calculator

A free browser tool for independent insurance agents and agency buyers: **enter a book's revenue, retention,
servicing cost and required return, and see what keeping it is worth, how a purchase offer with an upfront
share and a retention-tested holdback compares, the break-even price, and what one point of retention adds.**
Nothing is uploaded.

**Live tool:** https://marisstella.app/insurance-agency-book-valuation-calculator/

After using this, you can now **tell whether an offer for your book is above or below what the book is worth
to you, and which assumption moves the answer most, before you sign**.

## Model

- Revenue in year `t` = annual revenue x retention^t. The owner keeps revenue x (1 - payout - servicing).
- Keep value = present value of that cash at the required return over the horizon.
- Offer value = upfront share at close + holdback share discounted to today x min(1, expected retention /
  required retention), less transaction costs on the whole price.
- Break-even multiple = the offer multiple at which offer value equals keep value.

Not modelled: taxes and the tax treatment of a sale, new business, contingent commissions, carrier
appointments, non-compete terms, transition cost, E&O exposure, earn-outs tied to new sales.

## Known gaps

From quality audit round 49 (`portfolio/quality/audits/2026-11-12-insurance-agency-book-valuation-calculator.json`):

- The holdback is cut in proportion (`retention / required`). Many agency purchase agreements instead adjust dollar for dollar: the multiple times the revenue lost below the threshold. At 81% retention against 90% required on the sample book that cuts $33,750, not $11,250, and the offer is overstated by about $19,600. A choice of adjustment rule is planned.
- The retention test ignores the holdback period: a 24-month holdback is tested against one year's retention, not two years of lapses.
- The sample book has no producer payout and 25% servicing, so the owner's own work is unpaid and the break-even multiple (2.83x) is high. Enter your own payout and servicing before reading the comparison.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of carriers, aggregators, brokers and valuation firms; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`valuation_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
