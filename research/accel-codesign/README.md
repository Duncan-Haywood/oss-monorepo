# accel-codesign: how much does choosing the model and the array together beat model-first? (stylised, table-based)

Second milestone of track 8 (task-specific AI accelerators) in `PROJECTS.md`, **only partly done**: it compares a model-first design flow with a joint one, but it does not train new models and it does not run NSGA-II or Bayesian optimisation (reasons below). The question: under a latency deadline, how much engine area does picking the most accurate model first cost, compared with choosing model and lane count together? Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/accel-codesign/

**Builds on.** `research/accel-kws` in this repository: its 40 trained, RTL-checked keyword-spotting MLPs (Speech Commands v0.02, Warden 2018, arXiv:1804.03209) supply every accuracy, energy and P=1 area number here. Hardware-software co-design as a search problem is the framing of Lin, Yang and Han (2021), "NAAS: Neural Accelerator Architecture Search", DAC; nothing is reproduced from that paper and no number is comparable with it. This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- **Model side.** The 40 configurations (7 or 12 time segments, 8 to 128 hidden units, 2/3/4/8-bit weights) from `accel-kws/experiments/results.json`: 3-seed mean validation and test accuracy, modelled energy per inference. **No model was retrained in this run**, because the Speech Commands mirror returned HTTP 403 from the container, so the model search space is the 40 measured points, not a continuous space.
- **Hardware side.** One knob, lane count P in {1, 2, 4, 8, 16, 32}: P multiply-accumulates per cycle. Cycles are analytic, `ceil(IN*H/P) + ceil(H*OUT/P) + 3`, which reproduces `accel-kws`'s measured cycles exactly at P=1 (checked in the tests) but is **not RTL-simulated for P>1**. Area is `accel-kws`'s measured Yosys cell count at P=1, plus the growth of a separately synthesised P-lane MAC datapath (`rtl/mac_dp.v`, Yosys 0.33, same generic-gate script as `accel-kws`; `experiments/synth_dp.py`, results in `experiments/datapath_area.json`). Energy per inference is `accel-kws`'s modelled value for every P.
- **Flows compared**, per deadline D in cycles (2,000 to 20,000):
  - *Model first* (`sequential`): take the model with the highest **validation** accuracy among those that can meet D at P=32, then the smallest P that meets D.
  - *Joint* (`joint_min_area`): over all 40 x 6 = 240 designs, the smallest-area design meeting D whose validation accuracy is within delta of the model-first pick (delta = 0 to 5 points). Because the space is only 240 points the search is **exhaustive**, so it is the exact answer that NSGA-II or Bayesian optimisation would only approximate. A heuristic search needs a space too big to enumerate.
  - Selection uses validation accuracy only; test accuracy is reported, never selected on.

## Reproduce
```bash
sudo apt-get install -y yosys                           # Yosys 0.33 (Ubuntu 24.04)
cd research/accel-codesign
python3 experiments/synth_dp.py                         # seconds; rewrites datapath_area.json
python3 experiments/run.py                              # instant; rewrites results.json / results.txt
python3 experiments/figure.py                           # needs matplotlib; rewrites front.png
python3 -m unittest discover -s tests -v                # 6 tests
```

## Results (from `experiments/results.txt`; areas are generic-cell counts)
The most accurate model (12 segments, 128 hidden units, 4 bits; validation 0.775, test 0.752, 35.1 nJ) wins model-first at every deadline, so only its lane count changes: P=1 at 20,000 cycles up to P=16 at 2,000, with area growing from 3,471 to 7,667 cells.

| deadline (cycles) | model-first area | joint, delta 1 pt | joint, delta 2 pts | joint, delta 3 pts |
|---|---|---|---|---|
| 2,000 | 7,667 | 5,553 (x0.72), test 0.749 | 4,483 (x0.58), test 0.738 | 3,352 (x0.44), test 0.722 |
| 5,000 | 4,409 | 4,079 (x0.93), test 0.749 | 2,644 (x0.60), test 0.738 | 2,451 (x0.56), test 0.720 |
| 8,000 | 4,409 | 3,714 (x0.84), test 0.749 | 2,644 (x0.60), test 0.738 | 2,414 (x0.55), test 0.722 |
| 20,000 | 3,471 | 3,377 (x0.97), test 0.749 | 2,404 (x0.69), test 0.738 | 2,258 (x0.65), test 0.720 |

- **Giving up 2 validation points saves 31 to 42% of area**, more when the deadline is tight, and the joint picks' test accuracy is 0.738 against 0.752 (14 test clips in 1,000). Giving up 3 points saves 35 to 56%. At delta 0 the two flows coincide by construction.
- **The deadline decides the hardware.** At 2,000 cycles the model-first pick needs 16 lanes, and the 16-lane datapath alone is 4,518 of its 7,667 cells (59%); the joint pick for delta 2 uses 8 lanes and a smaller model. The same trade is visible without any search: halving the hidden width halves the cycles and lets P halve.
- **Energy** (modelled, independent of P) falls with the area saving: 35.1 nJ to 17.6 nJ at delta 2.
- **Fronts.** The (validation accuracy, area, energy) Pareto set has 23 to 28 designs out of 176 to 240 feasible ones per deadline (`front.png`).
- **Noise.** `accel-kws` reports a 3-seed standard deviation of 0 to 1 point for 3- to 8-bit rows and test standard errors near 0.65 points, so deltas of 1 point are inside the noise and the delta 1 rows should not be read as real gains by themselves.

## Limitations
- **Not a full co-design search.** Models come from a fixed measured table and the hardware has one knob, so there is no continuous trade-off, no NSGA-II or Bayesian optimisation, and no equal-budget comparison with a search method. The result says how large the joint-vs-model-first gap is on this table, not how well any optimiser finds it.
- **Cycles for P>1 are analytic.** No RTL for a P-lane engine was written or simulated, so they ignore pipeline fill, weight-memory bandwidth (P weights and P activations per cycle need wider or banked memories, whose area is not counted) and the adder-tree latency. All three make wide arrays look cheaper than they are, so every wide-array cost is underestimated, and the model-first flow, which needs the widest arrays, is flattered most; the savings above are therefore, if anything, conservative on this point.
- **Area is generic gates**, not square microns, and the control logic and hidden-activation registers are held at their P=1 size. Energy is the assumed 45 nm model of `accel-kws` (constants not re-checked there) and ignores leakage, so wide arrays are not penalised in energy at all.
- The tolerance delta is picked after seeing the table; the deadlines are arbitrary round numbers, not derived from a use case.
- Everything inherits `accel-kws`'s limits: weak features, one hidden layer, a third-party dataset mirror.

## Next steps
Retrain a larger model grid (depth, width, segments) when the dataset is reachable and run a real NSGA-II against random search at equal budget on a space too large to enumerate; write and RTL-check a P-lane engine with banked memories; then `accel-dataflow`.

## Owner steps
None. Simulation only; no hardware was specified, bought or measured, so there is no bill of materials.

## Outside dependencies
The trained models and their accuracies (from `accel-kws`, which uses a third-party Speech Commands mirror); the assumed energy constants; no standard-cell library, memory macros or place and route. Open tools only: Yosys.
