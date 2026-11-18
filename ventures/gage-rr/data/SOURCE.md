# Data

## benchmark-timing.csv (real, measured)

Produced by `node eval/benchmark-study.mjs > data/benchmark-timing.csv` on
2026-11-18, in a cloud container (Node v22.23.5, 4 vCPUs, Linux).
Each reading is microseconds per call of sorting a copy of a
`Float64Array` of 400 to 4,000 seeded random numbers (the "part"), timed by
one of three harnesses (the "operator"): `single` (one call between two
`performance.now()` readings), `loop50` (fifty calls, total divided by fifty)
and `median15` (median of fifteen single calls timed with
`process.hrtime.bigint()`). Three trials each, 90 readings, run in a shuffled
order after a warm-up. The inputs are seeded, the timings are not: a rerun gives
different readings, and this file is the one measured for the page. MIT, like
the rest of the repository.

## destructive-simulated.csv (made up)

Produced by `node eval/simulate-nested.mjs > data/destructive-simulated.csv`.
Invented tensile strengths for a nested (destructive) study: 3 operators, 5
specimens each, 2 coupons per specimen. The variances in the script are
chosen, not measured; it exists to show the nested layout.
