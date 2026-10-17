# accel-lutwide: does a wider hidden layer make weight-sharing product-table inference beat an int8 MAC engine?

**Why this was worth doing.** `accel-lut` found no win at 64-32-10 and predicted, analytically, a break-even near 128 outputs. This project tests that prediction on trained wide networks (64-32-10, 64-128-10, 64-512-10) instead of an analytic layer. **Result: mostly negative.** The best case is a 12-14% energy saving over int8 at width 128-512, and only if a table read costs a quarter of the weight-array read per bit (0.04 against 0.16 pJ/bit, an assumption). At the array-cost read the table engine is 2-3 times worse at every width.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/accel-lutwide/

**Builds on.** `research/accel-lut` (task, training recipe and energy model; `model.py` and `lut.py` are copied unchanged so the project is self-contained; a test checks the 3.56 nJ int8 baseline still matches). Idea used, not reproduced: weight sharing with a codebook, Han, Mao and Dally (2016), "Deep Compression", ICLR (citation from memory, **not re-verified in this run**). Energy constants are in the spirit of Horowitz (2014), ISSCC (not re-checked). No CU Boulder group's work is built on or implied.

## Method
- **Task and models.** scikit-learn's bundled 8x8 digits (a substitute for keyword spotting), ReLU MLP 64-N-10 with N = 32, 128, 512, 10 stratified 60/20/20 splits, 150 dense epochs, as in `accel-lut`. Everything after training is post-training; no retraining of shared values.
- **Designs.** float32 (reference for paired drops); int8; `shareK` (k-means codebook of K = 8, 16, 32 values per layer, table engine on both layers); `hybridK` (table engine on the wide first layer, int8 MAC on the 10-output second layer, since `accel-lut` showed the second layer cannot amortise a table).
- **Energy.** `accel-lut`'s model unchanged (all constants assumed), dense layers, activation read once per input for every design. Table read at 0.04 or 0.16 pJ/bit.
- **Not done.** No RTL or synthesis, no retraining, no pruning, no real keyword-spotting data, one dataset whose 64 inputs cap the first layer's fan-in.

## Reproduce
```bash
pip install numpy scikit-learn matplotlib
cd research/accel-lutwide
python3 -m unittest discover -s tests -v     # 6 tests, <1 s
python3 experiments/run.py                   # about 40 s; writes results.json, results.txt
python3 experiments/run.py --report          # rebuild results.txt from results.json
python3 experiments/figure.py                # writes experiments/frontier.png
```

## Results (from `experiments/results.txt`; mean over 10 splits; ratio is modelled energy over the same-width int8 engine)
| width | design | test acc. | drop vs float32 (se) | ratio @0.04 pJ/bit | ratio @0.16 pJ/bit |
|---|---|---|---|---|---|
| 32 | int8 | 0.972 | 0.000 | 1.00 | 1.00 |
| 32 | hybrid8 | 0.965 | +0.007 (0.002) | 0.96 | 2.34 |
| 128 | int8 | 0.977 | 0.000 | 1.00 | 1.00 |
| 128 | hybrid8 | 0.974 | +0.004 (0.003) | 0.88 | 2.06 |
| 128 | hybrid16 | 0.976 | +0.001 (0.001) | 1.00 | 2.25 |
| 512 | int8 | 0.980 | +0.001 | 1.00 (56.3 nJ) | 1.00 |
| 512 | hybrid8 | 0.979 | +0.002 (0.001) | 0.86 | 1.99 |
| 512 | hybrid16 | 0.980 | +0.001 (0.001) | 0.96 | 2.11 |
| 512 | share8 | 0.977 | +0.004 (0.001) | 0.88 | 2.33 |

(All K and both layouts are in `results.txt`.)

- **The prediction holds in direction, but the gain is small.** The best ratio at the cheap table read falls from 0.96 (width 32) to 0.88 (128) to 0.86 (512): a 14% saving at best, and it flattens because the first layer's 64 inputs cap how many outputs share one table.
- **Wider networks tolerate sharing better.** K = 8 costs 1.6 points at width 32 and 0.4 points at width 512, so the table engine's accuracy problem shrinks as width grows; its energy problem does not go away.
- **The hybrid beats the full table** at every width, confirming that the 10-output layer should stay a MAC engine.
- **Cost-model dependence.** With the table read priced like the weight array (0.16 pJ/bit) no design comes within a factor of 1.99 of int8. The verdict rests on a number this project cannot measure.

## Limitations
- Energy is modelled with assumed constants, not measured or synthesised; the table-read cost decides the outcome.
- Toy task, one architecture family, post-training sharing only; the same-width int8 comparison ignores that a wide network may be unnecessary for the task.
- Digits is a substitute for keyword spotting; results may not carry over.

## Next steps
An RTL product-table engine through Yosys to replace the assumed table-read cost (the one number that decides the verdict); a task with a wider input so the first layer has more fan-in; combine with `accel-lutft`'s fine-tuning at K = 4.

## Owner steps
None. Simulation and arithmetic only; nothing bought or measured.

## Outside dependencies
NumPy, scikit-learn (BSD-3, bundled digits data), matplotlib.

**Figure.** `experiments/frontier.png`: accuracy against modelled energy relative to int8, by hidden width.
