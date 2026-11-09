# changepoint-detector: Mauna Loa CO2 trial (2026-11-09)

Added `data/co2-mauna-loa.csv`, `eval/co2-mauna-loa.mjs` (+ `.out.txt`) and
`co2-mauna-loa.test.mjs`. Result: smooth acceleration is over-cut by every
setting (18 to 126 steps); slope-bend dates are unstable across `--ar1`.
Next run on this venture: build a curvature (quadratic) trend option and
measure it on this series and on synthetic smooth curves. Flagship `next:`
updated. Data host raw.githubusercontent.com answered; Rdatasets `co2.csv` 404s.
