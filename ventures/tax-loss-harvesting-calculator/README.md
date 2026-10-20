# Tax-Loss Harvesting Calculator

A free browser tool for investors with taxable accounts: **enter the gains you have realized this year, any
loss carried from last year, and the positions sitting at a loss, and see the tax saved this year, the
$3,000 ordinary-income deduction, the carryforward and which losses a wash sale would disallow.** Nothing is
uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/tax-loss-harvesting-calculator/

After using this, you can now **see whether selling losers before year end is worth doing, and how much**,
which used to mean rebuilding Schedule D netting by hand.

## Model

- Short-term and long-term gains and losses net separately, then against each other.
- A remaining net loss reduces ordinary income by up to $3,000 ($1,500 married filing separately), short-term
  first; the rest carries forward.
- Tax = taxable short-term x (ordinary + state + NIIT) + taxable long-term x (long-term + state + NIIT).
- Positions marked as bought back within 30 days are excluded as wash-sale risk.
- Harvesting defers tax by lowering basis; the tool shows the deferred amount.

Not modelled: bracket shifts, the NIIT threshold, state differences, cross-account and spouse wash sales,
dividend-reinvestment wash sales, crypto rules, AMT.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of brokers, robo-advisors and tax authorities.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`harvest_analyzed`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
