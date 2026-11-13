# SPC Control Charts: Shewhart charts, the eight Nelson rules and Cpk, free in the browser

Has the process changed, or is it just noise? Paste measurements or defect counts in time order and get an **I-MR, X-bar R, X-bar S, p, np, c or u control chart** with **all eight Nelson run rules**, trial limits you can revise, a check on whether your subgroups hide batch-to-batch variation, and **Cp, Cpk, Pp and Ppk** when you add spec limits. Nothing is uploaded.

**Live tool:** https://marisstella.app/spc-control-charts/

After using this, you can **tell a real process shift from ordinary variation, see which run rule fired on which point, and know whether a capability figure means anything**, without buying statistical software or trusting a spreadsheet template that applies one rule.

## What it does

- **Charts:** individuals and moving range (I-MR); averages with ranges (X-bar R) or standard deviations (X-bar S) for subgroups of 2 to 25; subgroup averages as individuals (I-MR of the averages, for batch processes); proportion defective (p, varying sample sizes, per-point limits); number defective (np); defects (c); defects per unit (u). Guessed from the shape of the data, or chosen.
- **Rules:** Nelson's eight (1984), each switchable, on the location chart. Range, S and moving-range charts get rule 1 only (their distributions are skewed). p and u charts with varying sample sizes use per-point zones (z-scores).
- **Phase I:** leave named points out of the limits (still plotted), or revise automatically: drop points beyond 3 sigma and recompute until none remain (at most 10 passes; on I-MR only the individuals chart decides).
- **Subgroup check:** on X-bar charts, the ratio of how much the averages move from subgroup to subgroup (MR-bar of the averages / d2(2)) to what the within-subgroup spread predicts (sigma-within / sqrt(n)). Above 1.5 the summary says the X-bar limits are too tight for between-subgroup variation and suggests charting the averages as individuals. Descriptive, not a test.
- **Capability:** Cp, Cpk (within sigma), Pp, Ppk (overall sample sigma), Bissell's approximate lower 95% bound on Cpk, expected ppm outside spec under normality (within and overall), observed ppm. Warns when the chart shows signals.
- **Output:** a summary in words, SVG charts with zone lines, a signals table, capability table, CSV of every point with its limits and rules. CLI with the same engine (`node cli.mjs data.txt --json`; exit code 1 when a point signals).

## Verification

`node --test` (32 tests):

- **Chart factors from first principles.** d2 and d3 come from numerically integrating the distribution of the range of n normal values (Simpson's rule on a 0.01 grid; E[R^2] via the range CDF), c4 from its gamma-function formula; A2, A3, D3, D4, B3, B4 follow. They match the published three-decimal (c4: four-decimal) tables for n = 2-10, 15, 20, 25, and a seeded simulation of 200,000 subgroups for n = 2, 5, 10:

  | n | d2 | d3 | c4 | A2 | D3 | D4 | B3 | B4 |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | 2 | 1.1284 | 0.8525 | 0.7979 | 1.8800 | 0 | 3.2665 | 0 | 3.2665 |
  | 5 | 2.3259 | 0.8641 | 0.9400 | 0.5768 | 0 | 2.1145 | 0 | 2.0890 |
  | 10 | 3.0775 | 0.7971 | 0.9727 | 0.3083 | 0.2230 | 1.7770 | 0.2837 | 1.7163 |
  | 25 | 3.9306 | 0.7084 | 0.9896 | 0.1526 | 0.4593 | 1.5407 | 0.5648 | 1.4352 |

- **Normal CDF** (Hart's rational approximation as given by West 2005) agrees with Python's `math.erfc` to 1e-14 at four points.
- **Run rules** agree with a separate, deliberately plain window-by-window implementation on 2,000 seeded random series with drifts; each rule also has a hand-built pattern test. That differential test caught an off-by-one in rule 4 (it was asking for 15 alternating points, not 14) before the first commit. Rule 1 alone false-alarms on 0.27% of 400,000 simulated in-control points.
- **Hand formulas** for every chart type (X-bar R and S limits from A2/D4 and A3/B4, p with varying n, np, c, u), exclusions, revision, capability (Cp = 1 centred gives 2,700 ppm).
- **Example data** is rebuilt from `data/LITHOGRA.txt` (NIST's LITHOGRA.DAT, byte for byte) value by value.
- **Page:** labels, rule text matching the engine, no network calls, citations, figures quoted on the page matching the engine and `bench/false-alarms.json`. Run in Chromium at 380 px and 1,100 px: the example, averages-as-individuals, a p chart, a parse error and capability all render with no console errors and no horizontal scroll.

## What the example shows (real data)

NIST/SEMATECH's lithography case study: line width at five sites on three wafers from each of 30 cassettes (450 values; `data/SOURCE.md`). With one wafer per subgroup, the X-bar R chart puts **25 of 90 wafers** outside the limits, and 47 wafers break at least one rule. The wafer averages move **1.9 times** as much from wafer to wafer as the spread across one wafer predicts. That spread is mostly site-to-site (the top site averages 3.05 µm, the centre 2.03), so it says nothing about wafer-to-wafer variation. Charting the 90 wafer averages as individuals, only the **three wafers of cassette 27** fall outside the limits. NIST's case study discusses the same multiple-sources-of-variation problem in batch processing.

## How often a stable process "fails" (bench/false-alarms.mjs)

20,000 simulated processes with no shift at all, limits computed from the same data as a first chart does (seed 2026; `bench/false-alarms.json`). Share of charts with at least one signal:

| Chart | Rule 1 only | Rules 1, 2 | Rules 1, 2, 5, 6 | All eight |
| --- | --- | --- | --- | --- |
| X-bar R, 25 subgroups of 5 | 15.4% | 16.7% | 21.8% | 28.6% |
| I-MR, 25 points | 17.7% | 18.4% | 24.0% | 28.9% |
| I-MR, 100 points | 62.5% | 66.6% | 76.3% | 84.4% |

Split by chart, most of the rule-1 alarms come from the dispersion chart: on I-MR with 100 points the moving-range chart alone signals in 57.5% of runs and the individuals chart in 23.4%. The reason is analytic: the moving range of two normal values exceeds D4(2)·MR-bar = 3.267·MR-bar, that is 2.606 sigma·sqrt(2), with probability 2Φ(-2.606) = 0.92% per point, against 0.27% for 3 sigma. Rigdon, Cruthis and Champ (1994) recommend against relying on the MR chart; the page lists its signals separately and says this.

## Model and limits

- Variable charts and capability assume roughly normal, independent data. Autocorrelated data (frequent readings of a slow process) will false-alarm; skewed data needs a transformation.
- Trial (Phase I) limits only; no Phase II mode with limits fixed from an earlier period yet. No CUSUM or EWMA, no multivariate charts, no unequal subgroup sizes on X-bar charts (split or trim them).
- Bissell's Cpk bound uses N measurements; with sigma from ranges the effective degrees of freedom are fewer, so it is somewhat optimistic.
- Up to 5,000 points.

Next, if it is used: Phase II (enter or carry fixed limits), EWMA and CUSUM for small shifts, and a three-way chart (between and within) as Wheeler describes for batch data.

## Citations

Shewhart (1931) *Economic Control of Quality of Manufactured Product*; Nelson (1984) "The Shewhart Control Chart: Tests for Special Causes", *JQT* 16(4); Tippett (1925) *Biometrika* 17(3/4); Bissell (1990) *JRSS C* 39(3); Rigdon, Cruthis & Champ (1994) *JQT* 26(4). BibTeX on the page; `PAPERS` in `engine.mjs`.

## Run

Open `index.html` through any static server. Tests: `node --test`. Bench: `node bench/false-alarms.mjs 20000`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, accounting, compliance, investment or financial advice, and not engineering, safety or quality-system advice, and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`chart_run`, `example_loaded`,
`csv_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
