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
hourly. **Several periods at once** (24 and 168 for hourly data with a daily
and a weekly cycle; 7 and 365 for daily data with a weekly and a yearly one)
run **MSTL** (Bandara, Hyndman & Bergmeir 2021), with a seasonal component,
a strength and a profile for each cycle.

Live page: https://marisstella.app/stl-decomposition/ (runs in the browser;
nothing is uploaded).

```
node cli.mjs data/mauna-loa-co2-monthly.csv                 # period inferred: 12
node cli.mjs sales.csv --column sales --robust              # down-weight outliers
node cli.mjs visits.csv --period 7 --seasonal 13            # daily data, steadier weekly pattern
node cli.mjs load.txt --period 24                           # a bare list of numbers needs --period
node cli.mjs data/aep-hourly-load-2017.csv --period 24,168  # MSTL: a daily and a weekly cycle
node cli.mjs data/us-births-daily.csv --period 7,365 --csv  # adds seasonal_7 and seasonal_365 columns
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

## Several cycles at once (MSTL)

Give more than one period (`--period 24,168`, or `24, 168` in the page's
period box, or `"periods": [24, 168]` from code) and the engine runs MSTL as
Bandara, Hyndman & Bergmeir (2021) describe it and statsmodels implements it:
periods sorted ascending, each seasonal component in turn put back into the
deseasonalised series, refitted by STL at its own period and seasonal window
and taken out again, two passes by default (`--iterate`). Trend and weights
come from the last STL fit; the remainder is what is left. Default seasonal
windows are 11, 15, 19, ...; `--seasonal 13,21` sets one per period (one
number applies to all, which statsmodels would refuse). A period at least half
the series length is dropped with a note, as statsmodels does. No Box-Cox
transform: decompose the logarithm if the swing grows with the level.

`mstl()` in `engine.mjs` agrees with statsmodels 0.15.0's `MSTL` on seven
cases in `eval/reference.json` (trend, each seasonal component, remainder and
weights within 1e-8; the test allows 1e-7): the hourly load example with
periods 24 and 168, plain and robust; US daily births 1978-1988 with 7 and
365; three unsorted periods with their own windows and three passes; a period
dropped for length; one period; and jumps, degree 0 and a fixed trend window.

What it shows on the two bundled real series (`data/SOURCE.md`; numbers from
`analyze` at the defaults):

- **Hourly load, AEP zone of PJM, 12 weeks of spring 2017 (2,016 hours).**
  STL with period 24 alone lists 14 points as standing out: 13 on a Sunday
  or a Monday (12 of them between 07:00 and 10:00) and one Friday morning,
  the weekend that a daily cycle cannot hold. With 24 and 168, the daily cycle (strength 0.89, a swing of 4,980 MW
  from 04:00 to 17:00) and the weekly one (strength 0.58, 2,769 MW from
  Sunday 08:00 to Friday 08:00) are separate, and the list holds Memorial
  Day (Monday 29 May) and the evening of 12 June instead. The remainder's
  standard deviation is larger with MSTL (553 MW against 271), because the
  one-period fit, with its 7-cycle seasonal window, lets the daily shape
  follow the days around it and so soaks up part of the weekly cycle and the
  weather; MSTL's wider default windows keep the cycles steadier and leave
  more in the remainder. Neither is "right"; they answer different questions.
- **US daily births, 1978-1988 (4,018 days).** STL with period 7 lists 182
  days, including 8 of the 11 Christmas Days, New Year's Days, Fourths of
  July and Christmas Eves. With 7 and 365 the list falls to 88: fixed-date
  holidays move largely into the yearly component (its low is 24 December),
  leaving 3 Christmas Days and 2 New Year's Days (but still 6 Fourths of
  July), while moving holidays stay:
  all 11 Thanksgivings and all 11 Labor Days are still on it.

The loess weight `(1 - (r/h)^3)^3` is computed by multiplication rather than
`**`: in Node 22 that made plain STL 7 to 14 times faster (the hourly 24-step
reference case from 197 ms to 15 ms, CO₂ robust from 123 ms to 11 ms, medians
of five runs) with results unchanged to 1e-8, and MSTL on 4,018 days takes
about half a second.

## Limits

- **Evenly spaced steps.** Missing dates are not invented: a gap of a whole
  month shifts the cycle. Add the missing dates as rows with an empty value
  and they are interpolated. The tool warns when steps are irregular.
- **Whole-number periods.** A year of weeks is 52.18 weeks and a year of
  days 365.24, so a period of 52 or 365 drifts against the calendar (three
  leap days over the births example's eleven years). Several cycles go
  through MSTL; each still needs two full repeats in the data.
- **Holidays.** A fixed-date holiday is folded into a yearly component; one
  that moves (Memorial Day, Thanksgiving, Easter) lands in the remainder.
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
a statistician. FSL-1.1-MIT licence (`LICENSE`).
