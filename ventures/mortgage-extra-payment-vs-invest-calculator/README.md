# Mortgage Extra Payment vs Invest Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/mortgage-extra-payment-vs-invest-calculator/>

A free browser calculator for homeowners with spare cash: **put the same money three ways (keep the mortgage
and invest, pay the loan down faster, or lump-sum and recast) and see what you hold after tax when the
original term ends**, plus the investment return at which investing and prepaying tie. Nothing is uploaded.

After using this, you can **see the break-even return behind "pay off the mortgage or invest"** on your own
loan, which used to mean a hand-built amortisation spreadsheet with an investment column.

## Model

- Monthly amortisation; the same total cash out every month (scheduled payment plus the extra) and the same
  lump sum today in all three paths.
- invest: scheduled payment; lump and extra invested. prepay: lump and extra go to principal; after payoff
  the whole payment is invested. recast: lump to principal, fee paid, payment re-amortised over the remaining
  term; the payment drop and the extra are invested.
- Investments grow monthly at return/12, contributions at month end; one flat tax on gains at the end;
  optional share of each month's interest returned as tax saved (itemisers), invested.
- Break-even: bisection on the pre-tax return where invest and prepay end level.
- Pinned property (`calc.test.mjs`): return equal to the mortgage rate, no tax, no interest benefit and no
  fee means all three paths tie to the cent; a recast fee costs exactly its future value.

Not modelled: ARMs, escrow, prepayment penalties, PMI, liquidity value, retirement-account tax treatment,
taxes on dividends along the way, return risk.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum
extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

Independent of brokers and tax authorities.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
