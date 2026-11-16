---
title: "A Kalman smoother in the browser found the 1983 seat-belt law without being told"
seo_title: "Kalman smoother online, checked against statsmodels to 1e-11"
date: 2026-11-16
description: "A new free Kalman smoother fits level, trend and seasonal models by maximum likelihood, matches statsmodels to 1e-11 and flags real breaks in Nile and UK data."
tags: [kalman-smoother, time-series, state-space, research-algorithms, verification]
---

The repository had tools that date a change in a series ([changepoint
detector](../../ventures/changepoint-detector/README.md)) and split trend from season
([STL](../../ventures/stl-decomposition/README.md)). It had nothing for the question an
analyst with a noisy series asks first: *what is the real level under this, and how sure
can I be?* [kalman-smoother](../../ventures/kalman-smoother/README.md) now answers it, in
the browser, from the command line and as an agent call.

It fits the structural time-series models of Harvey (1989): a level that drifts as a
random walk, plus an optional slope and seasonal, plus noise. The Kalman filter and
smoother follow Durbin & Koopman (2012). The unknown starting values get the exact diffuse
initialisation of Koopman (1997) instead of a huge made-up prior variance. The variances
are found by maximum likelihood, so the data decide how much to smooth. Missing values
are filled with a wider band. Outliers are told apart from level shifts with auxiliary
residuals (Harvey & Koopman 1992).

## How close to statsmodels

statsmodels' `UnobservedComponents` was the independent check, with its exact diffuse
option switched on (its default is the approximate one). Both programs were run at the
same variances on five cases:

- the Nile series fitted three ways: level only, with drift, and as a local linear trend;
- the Nile with seven values removed, two of them inside the diffuse start-up period;
- the log UK driver series with a 12-month seasonal (13 states).

Every quantity was compared at every period. The largest relative differences:

| Quantity | Largest relative difference |
| --- | --- |
| loglikelihood | 5.4e-16 |
| smoothed states | 1.5e-13 |
| smoothed state variances | 4.0e-12 |
| smoothed level disturbance | 1.1e-11 |
| one-step errors | 7.9e-12 |

`eval/agreement.mjs` prints this table from `eval/reference.json`.

The maximum likelihood fit reaches at least statsmodels' fitted loglikelihood in all five
cases. That needed a tight final polish: a loose stopping rule had left the Nile irregular
variance at 15,098.6 rather than 15,098.5, which a test pinned to the published figure
caught. One more thing turned up along the way. statsmodels' default fit of the Nile
local level model, with exact diffuse initialisation, stops at 15,067.6 and 1,484.8. That
is a likelihood 0.0001 below the optimum. The book's 15,099 and 1,469.1 are the optimum.

## What it found without being told

Each period is tested as an outlier (one value off the level) and as a level shift (the
level itself moved). Neither example tells the tool any date.

- **Nile flow at Aswan, 1871-1970.** The largest level shift is between 1898 and 1899
  (t ≈ −3), the drop usually linked to the first Aswan dam. The largest outlier is 1913
  (t ≈ −3.0).
- **UK car drivers killed or seriously injured, 1969-1984,** on logs with a 12-month
  seasonal. The largest level shift is between January and February 1983 (t ≈ −3.8). The
  front-seat belt law took effect on 31 January 1983. The next-largest shift is the month
  before (t ≈ −3.5). With no intervention variable in the model, one break gets spread over
  two adjacent disturbances.

## Making it fast enough for a page

The first version took 26 seconds on the UK series with the trend on automatic. That run
fits three trend forms of 12 to 13 states, with about a thousand likelihood evaluations
each. Three changes brought it to about 2.5 seconds:

- A likelihood-only filter on flat arrays.
- The state transition matrix is sparse (about two non-zeros per row), so the covariance
  update uses only those entries.
- Once the state variance stops changing, the filter skips its update (the steady-state
  shortcut).

The smoother still runs once, in full, at the estimate. A test checks that the fast
filter's likelihood equals the full filter's.

## Next

The next steps are the obvious modes: trigonometric seasonals, a cycle, and intervention
dummies, so the seat-belt law can be tested as a known date rather than found. Simulation
smoothing (Durbin & Koopman 2002) would give bands on any function of the level.
