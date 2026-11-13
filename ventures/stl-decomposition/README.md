# STL decomposition: trend, seasonality and remainder of a time series

**Is it the season, or the trend?** Paste a series with dates (monthly sales,
weekly sign-ups, daily website visits, hourly electricity load) and STL,
the Seasonal-Trend decomposition using Loess of Cleveland, Cleveland, McRae &
Terpenning (1990), splits it into:

- a **trend** that moves slowly;
- a **seasonal** pattern that repeats every cycle and may drift slowly from
  one cycle to the next;
- a **remainder**, what neither explains;

and from those gives the **seasonally adjusted** series (observed minus
seasonal), the **strength of trend and of seasonality** (Wang, Smith &
Hyndman 2006), the **seasonal profile** (which months, weekdays or hours are
high and low, in the latest cycle and on average), how the seasonal swing
has changed since the first cycle, and the **points that stand out** from
both. **Robust mode** (the paper's outer loop) down-weights spikes so they
do not bend the trend or the seasonal pattern. The period is read from the
dates: 12 for monthly, 4 for quarterly, 7 for daily, 52 for weekly, 24 for
hourly.

Live page: https://marisstella.app/stl-decomposition/ (runs in the browser;
nothing is uploaded).

```
node cli.mjs data/mauna-loa-co2-monthly.csv                 # period inferred: 12
node cli.mjs sales.csv --column sales --robust              # down-weight outliers
node cli.mjs visits.csv --period 7 --seasonal 13            # daily data, steadier weekly pattern
node cli.mjs load.txt --period 24                           # a bare list of numbers needs --period
node cli.mjs sales.csv --csv > components.csv               # every point: trend, seasonal, remainder, adjusted, weight
node ../../platform/agents/tools.mjs call stl-decomposition analyze --input '{"values":[...],"period":7}'
```

Input is a CSV with a header row or a bare list of numbers. The value column
defaults to the first numeric column that is not dates; the date column to
the first column of dates (`2024-03`, `2024-03-05`, `2024-03-05 13:00`,
`2024 Q3`, `2024-W10`, `3/5/2024`). Rows are sorted by date, duplicate dates
are refused, empty values at the ends are dropped, and empty values inside
the series are filled by a straight line between neighbours (and marked).

## Example: Mauna Loa CO₂, May 1974 to September 2026

The example is NOAA GML's monthly mean CO₂ at Mauna Loa (629 months;
`data/SOURCE.md`). With the defaults (seasonal window 7, trend 23, low-pass
13):

- seasonality strength **0.991** and trend strength **1.000**: the yearly
  cycle and the rise account for nearly everything;
- the seasonal high is **May** and the low **September** (October in some
  years), a swing of **6.85 ppm** in the latest year against **6.25** in the
  first;
- the trend rose **99.5 ppm** over the series and **1.78 ppm** in the last
  year;
- 3 months stand out at 3.5 robust standard deviations (2008-04 lowest).

**The seasonal swing has grown.** Averaging each calendar year's
peak-to-trough seasonal swing, the ten years 1975-1984 average **6.33 ppm**
and 2016-2025 **6.66 ppm**; a least-squares line through all 51 full years
rises **0.088 ppm per decade**. The finding does not hang on the smoothing
choice:

| Seasonal window | Robust | 1975-1984 | 2016-2025 | Slope, ppm/decade |
| --- | --- | ---: | ---: | ---: |
| 7 | no | 6.33 | 6.66 | 0.088 |
| 13 | no | 6.31 | 6.68 | 0.090 |
| 35 | no | 6.31 | 6.66 | 0.087 |
| 7 | yes | 6.25 | 6.68 | 0.110 |

Computed by the engine on the bundled file (the script is in the post
`docs/posts/2026-11-13-stl-decomposition-in-the-browser.md`). This is a
description of this one decomposition, not a climate claim.

**Against NOAA's own adjustment.** The file carries NOAA's deseasonalized
series, made by a different method. STL's seasonally adjusted series is
within **0.075 ppm** of it on average and **0.38 ppm** at most
(`engine.test.mjs` asserts under 0.1 and 0.5).

## Verification

`eval/reference.py` runs **statsmodels 0.15.0**'s `STL` on nine cases and
writes `eval/reference.json`; `engine.test.mjs` asserts that trend, seasonal,
remainder and robustness weights agree to 1e-9 on every point. Measured
agreement is 2.6e-11 or better. The cases cover:

- the CO₂ example with the defaults, robust mode, wide windows (35/61/13),
  and degree-0 loess with jumps (3/5/2);
- 210 days with 8 planted ±25 spikes and a weekly cycle, plain and robust;
- 21 days of hourly data, period 24, robust;
- a quarterly series of 40 with jumps longer than the window spacing;
- a 25-point series whose seasonal window (15) is longer than each
  cycle-subseries, which takes the widened-bandwidth path.

Property tests: the components add back to the series; adding a constant
moves only the trend; multiplying by -3 multiplies every component; a pure
repeating pattern on a line is recovered with zero remainder; a planted spike
is listed first and gets a robustness weight under 0.05. `cli.test.mjs`
covers the command line through a real process; `page.test.mjs` checks the
disclaimer, labels, JSON-LD against the visible FAQ, no network calls, and
that every element the script uses exists. The page was loaded in headless
Chromium at 1100 and 390 px wide, with the example run plain and robust, no
console errors and no horizontal overflow.

```
node --test *.test.mjs
python3 eval/reference.py > eval/reference.json   # needs numpy and statsmodels
```

## Method and citations

- Robert B. Cleveland, William S. Cleveland, Jean E. McRae, Irma Terpenning
  (1990). STL: A Seasonal-Trend Decomposition Procedure Based on Loess.
  *Journal of Official Statistics* 6(1), 3-73.
  [PDF](https://www.scb.se/contentassets/ca21efb41fee47d293bbee5bf7be7fb3/stl-a-seasonal-trend-decomposition-procedure-based-on-loess.pdf).
  The inner and outer loops, implemented from the paper's description.
- William S. Cleveland (1979). Robust Locally Weighted Regression and
  Smoothing Scatterplots. *JASA* 74(368), 829-836.
  doi:10.1080/01621459.1979.10481038. Loess with tricube weights and
  bisquare robustness weights.
- Xiaozhe Wang, Kate Smith, Rob Hyndman (2006). Characteristic-Based
  Clustering for Time Series Data. *Data Mining and Knowledge Discovery*
  13(3), 335-364. doi:10.1007/s10618-005-0039-x. Strength of trend and
  seasonality, in the form of Hyndman & Athanasopoulos, *Forecasting:
  Principles and Practice*, 3rd ed., section 4.3.

Where the paper leaves a choice, the engine follows statsmodels (BSD-3), which
was used only to produce the reference file; no code was copied. The defaults
(seasonal 7; trend the smallest odd integer at or above
`1.5 n_p / (1 - 1.5 / n_s)`; low-pass the smallest odd integer above the
period; 5 inner and 0 outer passes, or 2 and 15 when robust), the widened
bandwidth when a window is longer than the data, and returning the weights
used in the final pass all match it. The paper's optional post-smoothing of
the seasonal component is not implemented (statsmodels omits it too).
`PAPERS` in `engine.mjs` records each paper, what was implemented and the
deviations; `node ../../platform/agents/tools.mjs describe stl-decomposition`
prints it.

## Limits

- **Evenly spaced steps.** Missing dates are not invented: a gap of a whole
  month shifts the cycle. Add the missing dates as rows with an empty value
  and they are interpolated. The tool warns when steps are irregular.
- **One whole-number period.** A year of weeks is 52.18 weeks; daily data
  with a weekly and a yearly cycle has two seasonalities, and STL fits one
  (MSTL, Bandara, Hyndman & Bergmeir, is the multi-season extension and a
  natural next step here).
- **Additive.** If the seasonal swing grows with the level, decompose the
  logarithm.
- **Not a forecast.** The trend near the ends uses one side of the window
  and moves as data arrive.
- **"Stand out" is a screen, not a test.** In robust mode the remainder of
  ordinary points shrinks, so more points pass the 3.5 robust-z line (43 of
  629 on the CO₂ example, against 3 without robust mode).
- Not modelled: calendar effects (trading days, Easter), and the official
  X-13ARIMA-SEATS adjustment agencies publish.

## No warranty

Free and as-is, without warranty of any kind. Statistical output from the
data you supply; not legal, tax or financial advice, and not a substitute for
a statistician. MIT licence (`LICENSE`).
