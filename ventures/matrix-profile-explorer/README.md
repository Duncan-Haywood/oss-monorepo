# Matrix Profile Explorer: find repeated patterns and anomalies in a time series

A free matrix profile tool that runs in your browser. Paste or upload a time series (a CSV with one numeric
column, or time,value columns) and it answers two questions: **which stretch of this series repeats** (the top
motifs: the most similar pairs of subsequences) and **which stretch is unlike anything else** (the top discords:
time series anomalies found without labels, training or thresholds). It computes the exact matrix profile with
the STOMP algorithm, draws the series with motifs and discords marked and the profile below it, and explains the
result in plain language. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/oss-monorepo/matrix-profile-explorer/

The same engine runs from the command line and for AI agents:

```sh
node cli.mjs series.csv --column value --window 12 --top 3          # text
node cli.mjs series.csv --json                                       # JSON, window suggested from the data
cat series.csv | node cli.mjs --window 24
node ../../platform/agents/tools.mjs call matrix-profile-explorer analyze --input '{"values":[1,2,3,2,1,2,3,2,1,5,1,2,3,2,1],"window":4}'
```

## What it computes

- **Distance:** z-normalized Euclidean distance between two length-m subsequences (each shifted to mean 0 and
  scaled to population standard deviation 1). It runs from 0 (same shape) to 2√m (opposite shape) and equals
  √(2m(1 − r)) for Pearson correlation r, so results also report r.
- **Matrix profile P and index I** (Yeh et al. 2016): for every subsequence, the distance to its nearest
  non-trivial neighbour and where that neighbour starts.
- **Exclusion zone:** neighbours must start more than ⌈m/4⌉ points away (Paper I used m/2; m/4 is the value used
  in Paper II and in common libraries).
- **Algorithm:** STOMP (Zhu et al. 2016). The first row of sliding dot products is computed directly (O(nm), no
  FFT); each later row by QT[i][j] = QT[i−1][j−1] − T[i−1]T[j−1] + T[i+m−1]T[j+m−1]. Only j > i is evaluated and
  both P[i] and P[j] are updated. O(n²) time, exact. The series is centred and window statistics are computed in
  two passes for accuracy. Float64Array buffers, no allocation in the inner loop. On the page it runs in a module
  Web Worker (falling back to the main thread when workers are unavailable, e.g. from `file://`).
- **Top-k motifs and discords:** motifs in order of increasing P (pair i, I[i]); discords in order of decreasing
  P. A result is skipped if it starts within m points of one already listed, so listed results do not overlap.
  The two members of one motif pair only need to be more than ⌈m/4⌉ apart.
- **Flat windows (zero standard deviation):** treated as all zeros after z-normalization. Two flat windows are at
  distance 0; a flat and a non-flat window are at distance √m. No NaN is produced. This is the same convention
  STUMPY uses, and the tests check it against STUMPY's output.
- **Suggested window** (when none is given): remove the least-squares quadratic trend, compute the autocorrelation
  for lags 3 to min(n/4, 1000), and take the first local peak after the autocorrelation first drops below zero,
  if that peak is at least 0.2: one period of the strongest cycle. Otherwise round(n/50), clamped to 8..100. Capped
  at n/4. On the CO2 example it finds 12 (autocorrelation 0.95 at lag 12).
- **CSV input:** comma, semicolon or tab; optional header; quoted fields; `#` comment lines; BOM. Pick a column by
  header name or 1-based number (default: the first mostly-numeric column after the first whose header is not a time or index name such as
  `year`, `month`, `date`, `time`). Empty or non-numeric cells
  inside the column are filled by linear interpolation and counted; leading and trailing ones are dropped. If the
  CSV has `year` and `month` columns, positions are labelled `YYYY-MM`; otherwise by the first column.
- **Optional:** remove a least-squares straight line before analysis (`--detrend`, page checkbox).
- **Size:** warns above 20,000 points; refuses above 200,000. Measured on this repository's cloud runner (4-core
  2.1 GHz Xeon, Node 22): 20,000 points with m = 100 took 1.2 to 2.8 s across runs; 5,000 points took under 0.2 s.

Not included: AB-joins of two series, multidimensional matrix profiles, approximate/anytime algorithms (SCRIMP++),
and streaming updates.

## Papers

- Chin-Chia Michael Yeh, Yan Zhu, Liudmila Ulanova, Nurjahan Begum, Yifei Ding, Hoang Anh Dau, Diego Furtado
  Silva, Abdullah Mueen and Eamonn Keogh (2016). *Matrix Profile I: All Pairs Similarity Joins for Time Series: A
  Unifying View That Includes Motifs, Discords and Shapelets.* IEEE 16th International Conference on Data Mining
  (ICDM), 1317–1322. [doi:10.1109/ICDM.2016.0179](https://doi.org/10.1109/ICDM.2016.0179)
- Yan Zhu, Zachary Zimmerman, Nader Shakibay Senobari, Chin-Chia Michael Yeh, Gareth Funning, Abdullah Mueen,
  Philip Brisk and Eamonn Keogh (2016). *Matrix Profile II: Exploiting a Novel Algorithm and GPUs to Break the One
  Hundred Million Barrier for Time Series Motifs and Joins.* IEEE ICDM, 739–748.
  [doi:10.1109/ICDM.2016.0085](https://doi.org/10.1109/ICDM.2016.0085)

Bibliographic details checked against Crossref on 2026-10-20. BibTeX is on the page ("Method and citation") and
the papers are in `engine.mjs` as `PAPERS` (printed by `node platform/agents/tools.mjs describe
matrix-profile-explorer`) and in `node cli.mjs --help`. Further reading: the
[UCR Matrix Profile page](https://www.cs.ucr.edu/~eamonn/MatrixProfile.html) by Eamonn Keogh's group.

Implemented from the papers' mathematics. No code was copied from any matrix profile library. STUMPY
(BSD-3-Clause) was run only to produce reference outputs for the tests; no STUMPY code is in this directory.

## Example data

NOAA Global Monitoring Laboratory, Mauna Loa Observatory monthly mean CO2, March 1958 to September 2026 (823
months), retrieved 2026-10-20 from https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_mm_mlo.csv. A US Government
work; March 1958 to April 1974 from the Scripps Institution of Oceanography. Credit, as NOAA asks: Dr. Xin Lan,
NOAA/GML (gml.noaa.gov/ccgg/trends/) and Dr. Ralph Keeling, Scripps Institution of Oceanography
(scrippsco2.ucsd.edu/). Full provenance, hash and licence notes: [`data/SOURCE.md`](data/SOURCE.md).

## Verification

`node --test` in this directory runs 36 tests in four files:

- **Against an independent brute force** (`engine.test.mjs`): five seeded series (white noise, a random walk,
  m = 3, a noisy sine with m = 50, and a series at level 10,000 with spread 0.01 as a precision check). The
  reference z-normalizes every window explicitly and takes plain Euclidean distances, O(n²m). Every P[i] agrees
  within 1e-6; where I[i] differs, the test checks that it is a tie (equal distance, outside the exclusion zone).
- **Against STUMPY 1.14.1** (`fixtures/stumpy-reference.json`, generated by `fixtures/make_stumpy_reference.py`
  with `stumpy.stump(T, m)`): the CO2 series with m = 12, a random walk of 500 points with m = 20, and noise with
  two flat segments with m = 10. Largest absolute differences in P: 3.6e-11, 1.6e-12 and 2.9e-14. Indices agree
  exactly on the first two; on the flat-segment series 32 indices differ, all ties between flat windows at
  distance 0, which the test confirms.
- **Planted patterns:** a decaying-sine shape inserted twice into Gaussian noise (n = 1000, m = 50) is the top
  motif at exactly the planted positions 180 and 690 (correlation above 0.99); one corrupted cycle in a noisy
  sine wave (n = 1200, m = 40) is the top discord, at a distance more than 3 times the median.
- **Properties and edges:** no neighbour within ⌈m/4⌉ for m = 3, 4, 5, 12, 31; listed motifs and discords do not
  overlap; flat windows give 0 and √m and never NaN (including an all-constant series); CSV parsing (header, no
  header, `;` and tab, quotes containing commas, `#` comments, BOM, CRLF, interpolated gaps, dropped edges,
  unknown column, empty input); input validation; window suggestion recovers a period of 37 in a trended noisy
  sine and 12 for CO2.
- `page.test.mjs` (disclaimer, no network calls in page or modules, every input labelled, JSON-LD parses, FAQ
  questions and answers match the visible `<h3>`s, imports resolve, element ids exist, citations and limits
  present), `usage.test.mjs` (counters, opt-out, Do Not Track), `cli.test.mjs` (help with citations, file,
  stdin, JSON, errors).

**Result on the CO2 data**, copied from `node cli.mjs data/co2_mm_mlo.csv --column average --top 3` on
2026-10-20 (window suggested: autocorrelation 0.95 at lag 12; exclusion zone 3; 812 subsequences; positions count
from 0 at March 1958):

```
Motifs (most similar pairs):
  #1  678 (2014-09)  and  798 (2024-09)   distance 0.1394   correlation 0.9992
  #2  437 (1994-08)  and  557 (2004-08)   distance 0.1540   correlation 0.9990
  #3  570 (2005-09)  and  642 (2011-09)   distance 0.1722   correlation 0.9988

Discords (most unusual subsequences):
  #1  790 (2024-01)   distance 0.7474 to nearest 562 (2005-01)
  #2  778 (2023-01)   distance 0.7088 to nearest 478 (1998-01)
  #3  0 (1958-03)   distance 0.6368 to nearest 132 (1969-03)
```

Matrix profile over all 812 windows: minimum 0.1394, median 0.3075, maximum 0.7474 (largest possible 6.93). The
minimum and maximum match STUMPY's output on the same series to 1e-10. Reading: the seasonal cycle repeats
almost exactly (motifs correlate 0.999). The two most unusual 12-month stretches start in January 2024 and
January 2023. The 2023 window includes the months NOAA measured at Maunakea after the Mauna Loa eruption
(December 2022 to July 2023); the matrix profile says these shapes are unusual, not why. The third discord is
the first year of the record (March 1958), which was obtained by the Scripps program. Discord distances of
0.64–0.75 are 2.1 to 2.4 times the median, so these are mild departures in shape, not breaks in the record.

## Run

Open `index.html` through any static server (module workers need `http://`; from `file://` it computes on the
main thread). Tests: `node --test`. Regenerate the example module: `node data/build-example.mjs`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Not affiliated with NOAA, the Scripps Institution of Oceanography, the University of California, Riverside, or
the papers' authors.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`, `file_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).

## What you use today, and what this does differently

- **STUMPY, matrixprofile or tsfresh in Python:** the full toolbox, fast and well tested, but you need a Python
  environment and code. This page is for trying the method on a CSV in a minute, and for checking a result.
- **A threshold or z-score on the values:** catches spikes, misses unusual shapes inside the normal range.
- **Eyeballing the chart:** works for one series of a few hundred points, not for "which year looks least like
  the others".
- **What this adds:** the exact matrix profile, motifs and discords with a plain-language summary and a chart, a
  suggested window, and a CSV of the profile, in the browser with no upload; plus a CLI and an agent-callable
  engine giving the same numbers.
