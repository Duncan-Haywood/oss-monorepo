# eda-adaptplaced: how many placed designs from a new family does an area surrogate need, and does the answer change when the target is placed area instead of a synthesis cell count? (follow-up to `eda-adapt`, track 7)

Every `eda-adapt*` project scored a cell-count target from Yosys and listed "repeat with a post-route target once OpenROAD is available" as a next step. `eda-postplace` found that `pip install openroad` gives a working OpenROAD in seconds, so this does it: all 133 designs of `eda-surrogate` are mapped to SKY130 HD and placed, and the same few-shot curves are fitted to the placed numbers. **Headline:** with word-level features alone, an unseen family's placed area is predicted to about 39% median error by a ridge model (60% by the non-negative linear model), one placed design from the new family cuts that to 23% (linear 27%), and about 3 designs reach the 20% bar for most families, the same order as for cell counts (1 to 3). Produced with AI assistance (Claude). **Preliminary:** 133 small designs, one ABC target, placement only (no routing, no clock tree).

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/eda-adaptplaced/

**Builds on.** `eda-adapt` (curves, models and the 30 draw seeds, copied; the `cells` rows here reproduce its published table exactly, a check on the port), `eda-surrogate` (designs, features), `eda-postplace` (OpenROAD wheel flow, `or_driver.py`) and `eda-clocksweep` (ABC script). Tools: Yosys 0.33, ABC, OpenROAD 0.0.1 PyPI wheel, SKY130 HD platform files from OpenROAD-flow-scripts at commit `e5cc6e7` (Apache-2.0, fetched). Models: scikit-learn (Pedregosa et al., 2011, *JMLR* 12:2825-2830). No CU Boulder lab's work is built on and no affiliation is implied.

## Method
Each of the 133 designs is mapped with Yosys + ABC (`map -D 8000; upsize; dnsize`) onto SKY130 HD and placed with OpenROAD (40% utilisation, global and detailed placement, placement-based parasitics, then `repair_design` and `repair_timing -setup` against 8 ns). Targets: **cells** (Yosys generic gates, as in `eda-adapt`), **area** (repaired design area, um^2) and **period** (placed period in ns before repair = 8 ns minus worst slack, I/O delay 0, ideal clock). For each held-out family, k in {0,1,2,3,5,8,12,16} and 30 draws, the `zero`, `scratch` and `pooled` surrogates (linear, ridge, gbr) are scored by median APE on the remaining designs of the family. Ranges over the 133 designs: area 220 to 31,991 um^2, period 1.17 to 13.88 ns (coefficient of variation 1.07 for area, 0.39 for period). Log cells and log area correlate at 0.99.

## Reproduce
```bash
sudo apt-get install -y yosys && pip install numpy scikit-learn
python3 -m venv /tmp/orv && /tmp/orv/bin/pip install openroad
cd research/eda-adaptplaced
PYTHONPATH=src python -m unittest discover -s tests          # 8 tests
OPENROAD_PYTHON=/tmp/orv/bin/python python experiments/place.py   # ~10 min on 4 cores; writes placed.jsonl (committed)
python experiments/run.py      # ~20 min; writes results.txt and results.json
python experiments/figure.py   # adapt_area_ridge.svg
```

## Results (`experiments/results.txt`, section S per target and model)
Median over the four held-out families of the median APE, percent:

| k | cells linear: zero / pooled | area linear: zero / scratch / pooled | area ridge: zero / scratch / pooled | area gbr: pooled | period gbr: zero / pooled | period ridge: pooled |
|---|---|---|---|---|---|---|
| 0 | 48.6 / 48.6 | 60.1 / - / 60.1 | 39.2 / - / 39.2 | 46.1 | 20.4 / 20.4 | 36.1 |
| 1 | 48.3 / 18.4 | 59.8 / - / 27.2 | 38.0 / - / 23.0 | 30.8 | 21.0 / 16.6 | 21.4 |
| 3 | 48.6 / 13.3 | 61.0 / 20.0 / 22.6 | 39.7 / 14.8 / 16.8 | 25.1 | 20.8 / 12.1 | 13.2 |
| 8 | 48.6 / 8.2 | 60.1 / 4.1 / 12.9 | 38.7 / 5.9 / 7.7 | 17.9 | 20.5 / 8.9 | 8.3 |
| 16 | 48.6 / 6.8 | 58.6 / 3.8 / 9.9 | 39.1 / 4.9 / 6.1 | 12.7 | 21.1 / 6.7 | 7.1 |

- **Placed area behaves like cell count.** Per-family break-even (pooled median APE at most 20%): linear alu 5, fir 1, mac 3, sorter never within 16; ridge 3, 3, 3, 0; against 3, 1, 0, 2 (linear) and 3, 3, 3, 0 (ridge) for cells. Ridge is slightly better on area than on cells at k = 0 (39% against 47%), linear clearly worse (60% against 49%): the non-negative linear model has no way to express the repair step's extra buffers.
- **Forgetting the old families wins from about k = 3 to 5 for the linear and ridge models**, as for cells (scratch passes pooled at k = 3 for both linear and ridge area; cells: between 2 and 3 for linear).
- **Boosted trees are the slowest on area** (pooled 25% at k = 3, 12.7% at k = 16; break-even 12, 3, 12, 2), the same ordering as `eda-adapt`.
- **Period is a different problem.** Without any new-family design, gbr is already at 20% (the period spread is narrow, CV 0.39, so predicting near the middle is hard to beat); the error roughly halves with 8 designs. Treat the period numbers as a weak guide: the target is the placed period of a netlist ABC mapped at a loose 8 ns, not the fastest the design can run, and 10 of 133 designs still miss 8 ns after repair.
- Figure: `experiments/adapt_area_ridge.svg`.

## Limitations
- Placement only: no routing or clock tree (the wheel's Tcl floorplan segfaults, see `eda-postplace`), ideal clock, I/O delay 0, 40% utilisation, tt 25 C, one run per design; determinism across machines untested.
- One ABC target (8 ns). A tighter target would make area and period depend on the timing recipe.
- Four hand-written generator families and 133 designs; k = 16 leaves only 9 test designs for the sorter family. No confidence interval over designs, only the spread over 30 draws (full tables in `results.txt`).
- Features are word-level counts from the generic flow; the `period` target depends on structure (carry chains, depth) they do not hold.

## Next steps
Add depth-like features and test whether `period` becomes predictable; repeat at several ABC targets; add routing once the wheel's track commands work; feed the adapted surrogate into an `eda-proposers` screen with the k placements charged to the budget.

## Owner steps
None.

## Outside dependencies
Yosys 0.33 (apt); `openroad` wheel (PyPI, not vendored); SKY130 HD platform files (fetched); NumPy, scikit-learn. All other code original, MIT.
