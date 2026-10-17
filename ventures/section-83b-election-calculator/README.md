# 83(b) Election Calculator

A free browser tool for founders and startup employees holding vesting restricted stock: **enter your
shares, the price you pay, the value per share at grant and at sale, and see the tax due at grant with an
83(b) election, the tax you would pay at each vest date without one, the break-even sale value, the tax
wasted if you leave before vesting, and your 30-day filing deadline.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/section-83b-election-calculator/

After using this, you can now **see that electing costs $0 in tax when you pay full value for the shares,
and how much tax you would put at risk if you had to pay on a spread and then left early**.

## Model

- Election: ordinary tax on (value at grant - price) x shares at grant; capital gain on the rise to the sale value.
- No election: each monthly tranche is ordinary income on its vest-day value less the price; the rise after is capital gain.
- Value moves steadily (geometric) from grant value to sale value. Gains held over 12 months use the long-term rate. Losses are not credited.
- Forfeiture: unvested shares are returned; grant tax already paid is not refunded.

Not modelled: state tax, AMT, NIIT, capital loss limits, QSBS, acceleration, repurchase prices other than cost, valuations.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of the IRS, law firms, incorporation services and equity platforms; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`election_calculated`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
