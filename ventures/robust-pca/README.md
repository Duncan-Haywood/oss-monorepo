# Robust PCA: find the cells that break a table's pattern

**Which cells of this table break the pattern the rest share?** Paste a table
whose rows repeat the same measurements (days by hours of load, stores by
weeks of sales, sensors by readings, students by test items) and robust PCA,
here as **principal component pursuit** (Candès, Li, Ma & Wright 2011), splits
it into two tables that add back up to it:

- a **low-rank part** L: the few shapes every row is a mix of, with how much
  of the table each one holds;
- a **sparse part** S: the cells no mix of those shapes explains, ranked by
  row and by cell, with what the pattern predicted and how far off each one is;
- **empty cells filled** from the low-rank part (PCP with missing entries);
- a **duality certificate**: how close the split is to the best possible,
  computed from the solver's own dual variable, not assumed.

Live page: https://marisstella.app/robust-pca/ (runs in the browser; nothing
is uploaded).

```
node cli.mjs data/aep-2017-day-by-hour.csv
node cli.mjs series.csv --fold 24          # one long hourly column, folded into days
node cli.mjs mixed-units.csv --scale robust --sensitivity 1.5 --csv
```

Agents: `node platform/agents/tools.mjs describe robust-pca` prints the
papers; `call robust-pca analyze --input '{"csv": "..."}'` runs it.

## How it works

PCP solves `minimise ||L||_* + λ ||S||_1 subject to L + S = M` on the observed
cells, with the paper's universal `λ = 1/sqrt(max(rows, columns))` (the page's
sensitivity multiplies it). The nuclear norm rewards few shared patterns, the
l1 norm few nonzero cells. The solver is the inexact augmented Lagrange
multiplier method (Lin, Chen & Ma 2010, Algorithm 5): singular value
thresholding for L, soft thresholding for S, a multiplier step, and μ growing
by 1.05 each iteration until `||M − L − S||_F ≤ 1e-7 ||M||_F`. The SVD is a
one-sided Jacobi SVD (Hestenes 1958) warm-started from the previous
iteration's right singular vectors, so it is exact to rounding with no
library. The multiplier Y, scaled until `||Y||_2 ≤ 1` and `max|Y_ij| ≤ λ`, is
dual feasible, so `<Y, M>` is a lower bound on the optimum; the gap to the
split's objective is reported.

Real tables carry small noise everywhere, and PCP puts some of it in S. The
tool calls a cell flagged when |S| exceeds three robust standard deviations
(1.4826 × MAD) of S over the observed cells. That line is the tool's, not the
paper's (it is in `PAPERS[0].deviations`); rows are ranked by the total |S| of
all their cells, which does not depend on it.

### Deviation from the paper: a slower μ

Lin et al. grow μ by 1.5 per iteration. Here that met the stopping test
before the split had settled: on the tests' 60 × 40 case the result differed
from TensorLy's by up to 0.04 (entries up to 1.5), and on the example the
certified gap was 2.6%. With 1.05 the same case agrees to 1e-9 and the
example's gap is under 0.01%, for about twice the iterations (201 on the
example, a third of a second in Node).

## Example: AEP's 2017 load, day by hour

The example is the hourly load of the AEP zone of PJM for every day of 2017
(365 × 24, CC0; `data/SOURCE.md`). The first shared pattern holds 99.6% of
the low-rank part: most of the year is one daily shape at different levels.
At the default λ the low-rank part has rank 12 and 1,165 of the 8,759
observed cells (13.3%) sit above the noise line of 148 MW.

- **The top row is 2017-08-21**: hours ending 10 to 14 run up to 1,286 MW
  above what that day's own mix of shapes predicts, and hours ending 17 to 19
  and 21 run 300 to 390 MW above. That was the day of the total
  solar eclipse across the US, but the excess starts at 9 am, before the
  eclipse began, so the table alone cannot say why; weather is the obvious
  thing to check. The tool reports the cells, not a cause.
- **Second is 2017-03-12, the day clocks went forward.** The pattern is
  what a one-hour shift in the evening peak looks like: hours ending 18 and 19
  are 482 and 667 MW below the pattern and hours ending 21 to 24 are 423 to
  628 MW above it. The table was never told about daylight saving. The day
  clocks went back, 2017-11-05, does not stand out (178th of 330 rows with a
  flagged cell); we have not looked into why the two changes differ.
- **Holidays mostly do not rank high** (4 July 120th, Christmas 85th,
  Thanksgiving 42nd), and that is the method working as designed: a day that
  is lower in every hour is still a mix of the shared shapes, so it lands in
  L. Robust PCA finds hours that break their own day's shape, not days with
  a low total.
- The one empty cell (hour ending 03 on 2017-03-12, the hour lost to
  daylight saving in the source) is filled at 13,818 MW, below the readings on
  either side of it (14,361 and 14,320). (A filled
  value for a moment that never happened on the clock is a reading of the
  pattern, not a measurement.)

Building the example caught a data-convention bug: an earlier draft laid
each day out as clock hours 00 to 23, but the extract stamps readings by the
hour they *end*, so its "00:00" belongs to the previous day. Robust PCA
flagged that one column in 103 of 365 rows; `eval/extract_example.py` now
reads the stamps as hour ending.

## Verification

`node --test` in this folder (41 tests):

- **The paper's own experiment** (Candès et al. 2011, §4.1): `L0 = XYᵀ/n`
  with Gaussian X, Y of rank 0.05 n, plus ±1 errors in 5% of cells at random,
  n = 100 and 150. L and S are recovered to a relative error under 1e-5, the
  rank exactly, every corrupted cell found and no other, and the certified
  gap is under 1e-5.
- **An independent implementation**: TensorLy 0.10.0's `robust_pca`
  (BSD-3-Clause; an ALM on the same convex problem), run by
  `eval/reference.py` into `eval/reference.json`. On a 60 × 40 rank-3 case
  with 5% gross errors and 2% missing cells, every cell of L and S agrees to
  1e-6. On the example, this tool's objective is at or below TensorLy's
  (1,533,905.2 against 1,533,905.9) and every cell of S is within 30 MW of
  it; the solutions of real data are nearly flat near the optimum, so
  near-optimal splits can differ by a few tens of MW in single cells.
- **The certificate** is a valid lower bound at every tolerance and tightens
  as the solver converges.
- **The SVD** reconstructs tall, wide and square matrices to 1e-12 with
  orthonormal factors, and a warm start gives the same singular values in
  fewer sweeps.
- **Properties**: scale equivariance (S scales with M), transpose
  equivariance, missing cells filled to within 1e-3 of the true low-rank
  value, a larger λ flags fewer cells, an exactly low-rank table with one bad
  cell flags that cell alone, folding, robust scaling, input errors.
- `page.test.mjs` checks the disclaimer, FAQ JSON-LD against the visible
  text, labels, no network calls, the example verbatim, citations;
  `cli.test.mjs` runs the CLI from a pipe.

## Limits

- **A flagged cell is unusual, not wrong.** Check the source before you
  correct or drop anything.
- **Whole-row shifts are not anomalies here** (see holidays above). For rows
  whose level changed, use `isolation-forest` on the rows or
  `changepoint-detector` on a series.
- **Columns must line up**: every cell in a column means the same thing.
  Columns in different units need `--scale robust`.
- **The exact-recovery guarantee assumes random corruption** and an
  incoherent low-rank part; a whole bad column can be split either way.
- **Size**: up to 250,000 cells with the shorter side at most 400; each
  iteration is a full SVD.
- Not modelled: stable PCP with an explicit noise level (Zhou et al. 2010),
  order within a row, tensors, per-cell weights.

## Files

| File | What it holds |
| --- | --- |
| `engine.mjs` | Jacobi SVD, PCP by inexact ALM, the duality certificate, CSV parsing, `analyze()`; exports `PAPERS`, `DEFAULTS` |
| `cli.mjs` | Zero-dependency CLI |
| `index.html` | The page: heat map of S, one row against its pattern, tables, CSV download |
| `data/` | The example table and `SOURCE.md` |
| `eval/` | `extract_example.py` (builds the example), `reference.py` / `reference.json` (TensorLy reference) |

## Citation

- Emmanuel J. Candès, Xiaodong Li, Yi Ma, John Wright (2011). Robust
  Principal Component Analysis? *Journal of the ACM* 58(3), 11.
  doi:10.1145/1970392.1970395
- Zhouchen Lin, Minming Chen, Yi Ma (2010). The Augmented Lagrange
  Multiplier Method for Exact Recovery of Corrupted Low-Rank Matrices.
  arXiv:1009.5055
- Magnus R. Hestenes (1958). Inversion of Matrices by Biorthogonalization
  and Related Results. *J. SIAM* 6(1), 51-90. doi:10.1137/0106005

Implemented from the papers' mathematics; no third-party code was ported.
TensorLy was used only to produce `eval/reference.json`.

**No warranty.** Free and as-is, FSL-1.1-MIT licensed. Statistical output from the
data you supply, not legal, tax, financial or professional advice; a flagged
cell is unusual against the table's pattern, not proof of an error or a
cause. Not affiliated with the papers' authors, PJM, AEP, Kaggle or TensorLy.
