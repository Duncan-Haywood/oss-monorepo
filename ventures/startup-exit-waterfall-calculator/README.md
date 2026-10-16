# Startup Exit Waterfall Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/startup-exit-waterfall-calculator/>

A free browser tool for founders, employees and angels: **enter the sale price and your cap table (common, options,
preferred series with liquidation preference, participation caps, seniority and dividends) and see what each class
is paid, the sale price at which each series is better off converting, and a sweep across sale prices.** Nothing is
uploaded.

After using this, you can now **see what your shares or options are actually worth at a given exit, and how much
of the sale the preference stack takes first**, which used to take a lawyer, a cap table platform subscription, or a
spreadsheet with a circular reference.

## Model

- Net proceeds = sale price - debt - fees (% of price) - management carve-out (% of what is left).
- Non-converted preferred is paid `invested x multiple + invested x dividend x years` (simple, cumulative), by
  seniority; equal seniority shares a shortfall in proportion to the claims.
- The remainder is shared per share among common, converted preferred, participating preferred (up to its total cap)
  and options, which are paid `price - strike` when in the money. The per-share price is solved exactly (bisection).
- Every series picks convert-or-not to maximise its own payout; the tool iterates to a stable set and finds the
  breakpoints by searching sale prices.
- A sweep shows the same terms at 0.25x to 10x of the entered price.

Not modelled: escrows, earn-outs, taxes, warrants, unconverted notes and SAFEs, unvested equity, anti-dilution,
pay-to-play, any term not on the form.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of cap table platforms, law firms, investors and acquirers; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`waterfall_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
