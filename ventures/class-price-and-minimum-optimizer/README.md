# Class Price and Minimum Optimizer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/class-price-and-minimum-optimizer/>

A free browser tool for tutoring centers, music schools, studios and workshops: **enter the price and average sign-ups from past terms, plus seats, the minimum to run and what a class costs, and get the per-seat price with the highest expected profit per class offered.** It shows the chance the class runs, the chance it fills, break-even seats and the gain over your current price. Nothing is uploaded.

## Model

- Sign-ups at a price are Poisson with mean `a * price^(-e)`. `e` is fitted by least squares on `ln(sign-ups)` against `ln(price)` over the past terms. A term marked `+` filled the room, so its true demand is unknown; it is left out of the fit. You can instead enter `e` yourself.
- Expected profit per class offered is summed exactly over the Poisson distribution: a class with `n` sign-ups runs if `n >= minimum`, enrols `min(n, capacity)` students and earns `(price - cost per student) * enrolled - class cost`.
- The price grid (600 log-spaced steps from a third of the lowest tried price to three times the highest) is scanned for the maximum.

Not modelled: season, teacher, marketing, repeat students, discounts, refunds, and customers learning to wait for sales. Two price points fit any line exactly; the tool warns, and warns when the best price lies outside the tried range.

## Run

Open `index.html` through any static server. Tests: `node --test` (includes a cross-check of the exact sum against an independent factorial-based sum).

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, accounting, compliance, investment or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`, `report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
