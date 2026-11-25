# Gage R&R: is this gauge good enough? ANOVA method, crossed or nested, with intervals

**How much of what you measure is the part, and how much is the gauge and the
person holding it?** Paste a gauge study (parts, operators, repeat readings) and
get a Gage R&R by the ANOVA method: repeatability, reproducibility and
part-to-part variation as %study variation, %contribution, %tolerance and
%process, the number of distinct categories, and a confidence interval for
every component. Crossed studies, or nested ones for destructive tests. In the
browser, from the command line, or from an agent.

**Live:** <https://marisstella.app/gage-rr/>

Who it is for: quality and manufacturing engineers running the measurement
system analysis for a PPAP or a new gauge; metrology and lab technicians;
students in a quality or Six Sigma course; anyone who wants to know whether a
measurement (a caliper, a CMM program, a test rig, a benchmark harness) can tell
their parts apart. Free, FSL-1.1-MIT licensed, nothing uploaded.

## What it computes

| Piece | Source | What you get |
| --- | --- | --- |
| Crossed two-factor random-effects ANOVA | Montgomery & Runger 1993 | SS, MS, F and p for part, operator, part × operator and repeatability |
| Interaction pooling | common practice, threshold yours | pools part × operator into repeatability when its p exceeds the threshold (0.05 by default), shows both tables |
| Nested ANOVA (destructive) | Montgomery & Runger 1993 | operator, part within operator, repeatability |
| Variance components | expected mean squares | repeatability, reproducibility, operator, interaction, gauge R&R, part-to-part; a negative estimate is reported as zero, with a note |
| %contribution, %study var, %tolerance, %process | AIAG MSA 4th ed. 2010 | with a 6 or 5.15 SD multiplier; %tolerance with its interval |
| Number of distinct categories | AIAG MSA 4th ed. 2010 | ⌊1.41 × σ<sub>part</sub> / σ<sub>GRR</sub>⌋ |
| Intervals | exact chi-square; Graybill & Wang 1980; Ting et al. 1990; Burdick, Borror & Montgomery 2003 | modified large-sample (MLS) intervals for every component |
| Verdict | AIAG MSA 4th ed. 2010 | under 10%, 10 to 30%, over 30%, on %tolerance when limits are given, else %study variation; ndc ≥ 5 |

## The example: is a JavaScript benchmark a capable gauge?

A stopwatch is a gauge. Ten workloads (sorting copies of arrays of 400 to 4,000
numbers) were each timed three times by three harnesses: one call between two
`performance.now()` readings (`single`), fifty calls divided by fifty
(`loop50`), and the median of fifteen calls timed with `process.hrtime.bigint()`
(`median15`), in shuffled order (`eval/benchmark-study.mjs`, `data/SOURCE.md`).
From `node cli.mjs data/benchmark-timing.csv --interaction keep`:

- **Gauge R&R is 22.5% of study variation**, 6 distinct categories: marginal.
  Repeatability 15.7%, reproducibility 16.1%, part × operator p = 0.143.
- **The reproducibility is one harness.** `single` reads 101.5 µs on average;
  `loop50` 83.4 and `median15` 85.0. Timing one short call adds the timer's own
  cost to every reading.
- **Drop `single`** and gauge R&R falls to 14.7% with 9 distinct categories.
- The 95% interval for the gauge R&R standard deviation is 11.6 to 64.1 µs
  against an estimate of 14.7: three operators give two degrees of freedom for
  reproducibility, and the interval says so.

These are one container's timings on one day, not a claim about Node or any
machine in general.

## Use it from code

```sh
node cli.mjs data/benchmark-timing.csv
node cli.mjs study.csv --lsl 9.95 --usl 10.05            # adds %tolerance
node cli.mjs tensile.csv --nested --json                  # destructive study
node cli.mjs study.csv --part wafer --operator probe --measurement ohm_cm --interaction keep
```

Agents: `node platform/agents/tools.mjs describe gage-rr` prints the papers;
`node platform/agents/tools.mjs call gage-rr analyze --input '{"text":"part,operator,measurement\n..."}'`
(or `{"obs":[{"part":"1","operator":"A","y":10.1}, ...]}`).

## Verification

- **Independent reference** (`eval/reference.py`, statsmodels 0.15.0, numpy
  2.5.3, scipy 1.18.1): on eight generated studies (five crossed, three nested,
  some with zero operator or interaction variance), every sum of squares matches
  statsmodels' OLS ANOVA, every variance component matches numpy solving the
  expected-mean-square equations, the pooled residual matches the additive
  model's, every F p-value matches `scipy.stats.f.sf`, and the repeatability
  interval matches the chi-square formula, all to 1e-9; chi-square and F
  quantiles match scipy to 1e-9 over 49 (p, df) pairs (`reference.test.mjs`).
- **Hand-worked study:** a 2 × 2 × 2 crossed study whose sums of squares,
  components, pooling and ndc are worked by hand in `engine.test.mjs`.
- **Interval coverage** (`eval/coverage.mjs`, output in
  `eval/coverage-output.txt`): 2,000 simulated studies for each of seven designs
  (10 × 3 × 3 down to 5 × 3 × 2, crossed and nested, with zero operator or
  interaction variance in some), the 95% intervals covered the true value 94.5%
  to 97.7% of the time for every component. MLS intervals are known to be
  slightly conservative; that is what this shows.
- **One deliberate departure:** the gauge R&R interval's lower end is not
  allowed below repeatability's, because gauge R&R variance cannot be below
  repeatability variance. This can only raise coverage.

```sh
node --test *.test.mjs
node eval/coverage.mjs 2000
python3 eval/reference.py > eval/reference.json   # needs numpy, scipy, statsmodels, pandas
```

## Limits

- Balanced studies only. Unbalanced ones need REML or a different ANOVA; the
  tool names the short cells instead of guessing.
- Operators are treated as random. With two or three operators the
  reproducibility interval is wide.
- Not here yet: the average-and-range method, attribute agreement (see
  `inter-rater-agreement`), bias and linearity studies, one-sided tolerances.
- The 10% / 30% / ndc ≥ 5 bands are the AIAG manual's guidelines, not a law; a
  customer may require others.

## Files

`engine.mjs` (all statistics, no imports), `cli.mjs`, `index.html`,
`example-data.mjs` (copies of `data/*.csv`), `usage.mjs` (local-only counters
with an opt-out), tests `*.test.mjs`, `eval/` (reference, coverage, example
generators).

No warranty. A statistical estimate from the readings you give, not engineering
certification, a quality-system audit or professional advice. Not affiliated
with the cited authors, the AIAG or any software vendor. FSL-1.1-MIT licence.
