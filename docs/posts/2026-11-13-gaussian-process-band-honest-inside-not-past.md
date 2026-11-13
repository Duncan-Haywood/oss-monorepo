---
title: "A Gaussian process in a browser tab, and a band that was honest inside the data but not past it"
seo_title: "Free Gaussian process regression online: curve, band, forecast"
date: 2026-11-13
tags: [gaussian-process, kriging, forecasting, uncertainty, research-algorithms, browser, testing]
description: "A free Gaussian process tool fits seven kernels by marginal likelihood, checked against scikit-learn to 1e-9. On held-out CO2 months, its 95% band held 42%."
---

The question "fit a curve through my points, and tell me how sure you are"
has a textbook answer: **Gaussian-process regression**. The new
[Gaussian process tool](../../ventures/gaussian-process-regression/) does it
in the page. You paste an x column (numbers, or dates such as `2024-07`) and
a y column. The tool fits the kernel's settings by maximising the log
marginal likelihood (Rasmussen & Williams, *Gaussian Processes for Machine
Learning*, 2006, Algorithm 2.1 and section 5.4), tries seven kernels and keeps
the one the evidence favours. It then reports the settings in your own units:
the length scale, the period, the noise SD, and the slope of a straight-line
mean. You get a 95% band for the curve and for a new reading, a short
forecast, and a leave-one-out check of the band. Nothing is uploaded. The fit
runs in a Web Worker, and the same engine runs as a zero-dependency CLI and
as an agent call.

## Pinned to scikit-learn, kernel by kernel

The engine orders each kernel's settings as scikit-learn's `theta` does,
including one surprise: scikit-learn lists `RationalQuadratic`'s
hyperparameters alphabetically, alpha before length scale. That makes the
comparison one to one. On the bundled file (NOAA's Mauna Loa monthly CO2,
2010 to 2026), with scikit-learn 1.9.1 for all seven kernels:

- the log marginal likelihood and every component of its gradient agree to
  about 1e-12;
- the predictive mean and standard deviation at six x values, inside and
  beyond the data, agree to about 1e-12;
- given the same starting values and bounds, our projected L-BFGS reaches the
  same optimum in five kernels and a higher one in the quasi-periodic kernel
  (329.47 against 328.62).

The seventh kernel did not match, and the test records that instead of hiding
it. With the periodic kernel alone, our optimiser stops at the "everything
is noise" corner (−285.2), while scikit-learn's L-BFGS-B climbs to a
different peak (−58.4). Both are local optima of the same surface. The test
checks that ours satisfies the KKT conditions, so the gap is a real second
peak and not a bug. The page lists this under "Several peaks".

## The finding: calibrated inside, overconfident past the edge

Leave-one-out is the usual check that a GP's band is honest. Each point is
predicted from all the others, using a closed form that needs no refitting
(R&W eqs. 5.10–5.12). On the CO2 file, 96% of points fall inside their
leave-one-out 95% band, which looks well calibrated.

Then we held out the last 36 months. We fitted on January 2010 to September
2023, forecast October 2023 to September 2026, and scored the forecast
against what NOAA measured (`eval/holdout.mjs`):

| Mean function | RMSE (ppm) | Mean error (ppm) | Months inside the 95% band |
| --- | ---: | ---: | ---: |
| constant (scikit-learn's default behaviour) | 2.47 | +2.36 | 6% |
| straight line with a vague prior (R&W §2.7) | 1.08 | +0.99 | 42% |
| seasonal naive: last year's month + last year's rise | 1.07 | | |

These are the best-evidence kernel's forecasts. Two things stand out.

1. **With a constant mean, a stationary kernel's forecast drifts back toward
   the data's average.** For a rising series it lands below the measurements
   every time. Adding an explicit linear mean, with the line's own uncertainty
   carried into the band, more than halves the error. That is why the tool
   defaults to a linear mean.
2. **Even then, the forecast is no better than the naive one, and the band is
   far too narrow.** The mean error is positive: CO2 rose faster from 2023 to
   2026 than the 2010–2023 line implies. The marginal likelihood measures how
   well a model explains the data it has seen. It says nothing about whether
   the series will keep behaving that way.

So the page does what the numbers support. It shows leave-one-out coverage as
a check *inside* the data, gives the held-out result in its FAQ and limits,
and describes a forecast as a smooth continuation of the past, not a model of
what drives the series.

## Try it

- [The tool](../../ventures/gaussian-process-regression/) has a "Load example"
  button that loads the CO2 file.
- `node ventures/gaussian-process-regression/cli.mjs your.csv --predict 2027-01`
- The verification, the out-of-sample table and every deviation from the book
  are in the venture README and in `PAPERS` in `engine.mjs`.

Next, if people use it: several input columns with automatic relevance
determination, and a mean function whose forecast band is calibrated on
held-out data rather than on the fit.

*Produced with AI assistance. Statistical estimates from the data you supply,
not advice. Not affiliated with the authors of the cited works, NOAA or
scikit-learn.*
