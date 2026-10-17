# ESPP Tax Calculator

A free browser tool for employees in an employee stock purchase plan: **enter your offering and purchase
prices, discount and lookback and see the after-tax result of selling at purchase, holding a year, or
holding to a qualifying sale, plus the price below which waiting loses.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/espp-tax-calculator/

After using this, you can now **decide sell-now versus hold with the tax and the price risk on one
page**, and fix the 1099-B cost basis that otherwise taxes the discount twice, which used to take a
spreadsheet and a read of IRS Publication 525.

## Model

- Price paid: discount off the lower of the offering-date and purchase-date prices (lookback) or off the
  purchase-date price.
- Disqualifying sale: ordinary income = purchase-date price - price paid; capital result = sale price -
  purchase-date price; long-term only past 12 months from purchase.
- Qualifying sale (24 months from offering start and 12 from purchase): ordinary income = max(0,
  min(actual gain, offering-date discount)); the rest is long-term capital gain or loss.
- Capital losses offset other gains, then $3,000 of wages; the remainder carries forward, valued at zero.
- Breakeven price by bisection: sale price at which holding to the qualifying date equals selling at
  purchase after tax.
- 1099-B warning: the ordinary income must be added to the reported basis (Form 8949, code B).
- $25,000 yearly limit check at the offering-date price.

Not modelled: state rules, AMT, wash sales, non-US or non-qualified plans, changing brackets. Unverified
against Form 8949 or a preparer.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum
extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

Independent of the Internal Revenue Service, employers, brokers and plan administrators.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`espp_analyzed`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
