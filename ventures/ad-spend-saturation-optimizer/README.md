# Ad Spend Saturation Optimizer

A free browser tool for online sellers and marketers who run several ad channels:
**drop in weekly (or daily) spend and revenue per channel and see where the next dollar still pays and where it
does not.** It fits a diminishing-returns curve to each channel's own history, reads the marginal return at today's
spend, finds the split of the same total budget that earns most, and back-tests itself on your last weeks. Nothing
is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/ad-spend-saturation-optimizer/

After using this, you can now **move budget from saturated channels to ones with headroom, see whether a channel's
next dollar loses money at your margin, and know how much to trust the advice before you act on it**.

## Input

One row per date and channel: a date, a channel (or source, platform, campaign), the spend, and the revenue you
credit to that channel. Columns are found by header name; a file without a channel column is treated as one channel.
Daily rows are summed into Monday weeks. Amounts in one currency.

## Model

- Per channel, two response curves are fitted by least squares (Nelder-Mead in log space, multiple starts):
  saturating exponential `a (1 - exp(-s/k))` and S-shaped Hill `a s^h / (k^h + s^h)` with `h` in [0.5, 3]. The Hill
  curve is chosen only when it beats the exponential by more than 2 on small-sample AIC.
- Carry-over (adstock): for channels with 12+ weeks, a geometric carry-over rate of 0, 0.2, 0.4, 0.6 or 0.8 is
  tried (`e = (1 - r) spend + r e_previous`, so steady spend is unchanged) and kept only if it beats no carry-over
  by more than 2 on small-sample AIC. The curve is then fitted on the carried spend and read at steady weekly spend;
  weeks missing from the file count as zero spend. The back-test re-picks the rate on its training weeks only.
- Marginal return at today's spend (mean of the last 8 weeks) is the curve's slope there.
- Allocation: exact dynamic programme over the channels on a 400-step budget grid, so S-shaped curves are handled
  properly. Each channel is limited to 0.25x to 2x its current spend and never beyond 1.25x its highest week.
- Uncertainty: 100 seeded resamples of the channel's own weeks give a 10th to 90th percentile range on marginal
  return and on the gain from the recommended split.
- Profit view: contribution = margin x revenue - spend; the tool reports where it peaks along the fitted frontier.
- Back-test: refit on the weeks before the last 4 to 12, predict revenue in those weeks from the spend that really
  happened, compare with a flat-ROAS line.
- Checked in unit tests by parameter recovery on simulated data with known curves, an analytic equal-marginal-return
  optimum, a brute-force check on S-shaped curves, and a check that the recommended split beats the current one
  under the true curves.

Not modelled: carry-over longer or shaped differently from a single geometric rate, seasonality, promotions and price changes, overlap or halo
between channels, attribution error (revenue is whatever the file credits to each channel, often platform-reported
and overstated), incrementality, and any channel with under 8 weeks or nearly constant spend (left where it is).
The resample range covers noise in the fit, not a wrong curve shape. Unverified against a published marketing
dataset.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of ad platforms and analytics vendors; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`, `file_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
