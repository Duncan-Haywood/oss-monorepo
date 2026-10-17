# accel-lut: does weight-sharing lookup-table inference beat a MAC engine at this size?

**Why this was worth doing.** `accel-sparse` left the lookup-table variant of milestone 5 open. This project tests the standard form of it, a k-means weight-sharing codebook with a per-input product table, on the same stylised digits task and under the same assumed cost model. **Result: negative.** At 64-32-10 the table engine does not beat an int8 MAC engine within a 2-point accuracy tolerance. An analytic sweep shows it needs wide layers and cheap table reads to win.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/accel-lut/

**Builds on.** `research/accel-sparse` (task, training recipe, energy constants; `model.py` is copied from it unchanged to keep this project self-contained). Idea used, not reproduced: weight sharing with a small codebook, Han, Mao and Dally (2016), "Deep Compression", ICLR (citation written from memory, **not re-verified in this run**). Energy figures are in the spirit of Horowitz (2014), ISSCC (not re-checked). No CU Boulder group's work is built on or implied. Produced with AI assistance.

## Method
- **Task and models.** scikit-learn's bundled 8x8 digits (a substitute for keyword spotting), 64-32-10 ReLU MLP, 10 stratified 60/20/20 splits, as in `accel-sparse`. A float model is trained dense (150 epochs) or pruned to 75% (60 dense + 180 pruning epochs, magnitude, cubic schedule). Everything below is post-training.
- **Designs.** float32 (reference for paired drops); int8 per-tensor; weight sharing with K = 2, 4, 8, 16, 32 shared values per layer (1-D Lloyd k-means over the unpruned weights; pruned weights stay 0). No retraining after sharing. Activations are quantised to 8 bits at evaluation, as in `accel-sparse`.
- **Product-table engine** (`src/accel_lut/lut.py`). For each input activation, form its K products with the shared values (K multiplies) and write them to a small 16-bit table. Each nonzero weight is then an index read (log2 K bits, plus a column index if sparse), a table read and an add, with no multiplier. The activation is read once per input. The table read energy per bit is not known; it is the main assumption, swept at 0.04 pJ/bit (assumed 4x cheaper than an array read) and 0.16 pJ/bit (same as an array read). Product-table correctness is unit-tested against a direct MAC.
- **Baselines.** The `accel-sparse` int8 serial engine, with its convention that the activation is read once per weight, and a stricter variant that reads each activation once per input like the table engine. Comparing the table engine with the second is the like-with-like one.
- **Not done.** No RTL or synthesis, no retraining of the shared values (so low K is a lower bound on accuracy), no input-table first layer, no real keyword-spotting data.

## Reproduce
```bash
pip install numpy scikit-learn matplotlib
cd research/accel-lut
python3 -m unittest discover -s tests -v     # 6 tests, <1 s
python3 experiments/run.py                   # about 30 s; writes results.json, results.txt
python3 experiments/run.py --report          # rebuild results.txt from results.json
python3 experiments/figure.py                # writes experiments/frontier.png
```

## Results (from `experiments/results.txt`; mean over 10 splits; energy in nJ per inference, assumed constants)
| design | test acc. | drop vs float32 (se) | MAC, act read once | table @0.04 pJ/bit | table @0.16 pJ/bit |
|---|---|---|---|---|---|
| dense int8 | 0.972 | 0.000 | 3.56 | | |
| dense share 8 | 0.956 | +0.016 (0.004) | | 3.51 | 9.53 |
| dense share 16 | 0.968 | +0.004 (0.001) | | 4.48 | 11.97 |
| dense share 32 | 0.970 | +0.002 (0.001) | | 6.05 | 16.49 |
| 75% pruned int8 | 0.969 | +0.001 (0.001) | 1.51 | | |
| 75% pruned share 4 | 0.954 | +0.016 (0.005) | | 1.55 | 3.42 |
| 75% pruned share 8 | 0.966 | +0.004 (0.002) | | 1.94 | 4.55 |
| 75% pruned share 16 | 0.967 | +0.002 (0.001) | | 2.63 | 6.71 |

(K = 2 and 32 rows, dense K = 4,, and the `accel-sparse` per-weight-read baseline, are in `results.txt`. Its int8 numbers, 5.20 and 1.85 nJ, match `accel-sparse`.)

- **No win within 2 points.** The cheapest table design within 2 points of float32 is dense share 8 (1.6 points down) at 3.51 nJ, a near tie with dense int8 at 3.56 nJ (0 points down, like-with-like baseline); pruned, the cheapest within 2 points is share 4 (1.6 points down) at 1.55 nJ against 1.51 nJ for pruned int8, again a near tie, and the 0.04 pJ/bit table read is the favourable case. At the pessimistic table-read cost every table design is 2 to 3 times worse.
- **Against `accel-sparse`'s per-weight activation read, the table looks better** (e.g. dense share 8, 3.51 nJ against 5.20 nJ). That gap is the activation-read convention, not the table, which is why the like-with-like baseline matters.
- **Why it fails here.** The table spends K multiplies and K table writes per input, which only amortises when the layer has many more outputs than K. The second layer has 10 outputs, fewer than any useful K, so its table costs more than the multiplies it saves.
- **Crossover.** For one dense 64xN layer with K = 16 (analytic, same constants), the table/MAC energy ratio is 1.90 at N = 8, 1.06 at N = 64, 0.99 at N = 128 and 0.94 at N = 1024 with the cheap table read, and never below 2.28 with the array-cost read. So even at 1024 outputs the gain is about 6% under the favourable assumption.
- **Accuracy.** K = 8 costs 1.6 points dense and 0.4 pruned; K = 2 is unusable dense (48% accuracy). With no retraining, small K is pessimistic.

## Limitations
- Energy is modelled with assumed constants, not measured or synthesised; the table-read cost decides the outcome and is unknown. A real implementation could use a register file, a mux tree or a different multiplier, none of which is modelled.
- Toy task, one tiny architecture, post-training sharing only, activation read convention chosen by me (both versions shown).
- Digits is a substitute for keyword spotting and results may not carry over.

## Next steps
Retrain with shared values (centroid-gradient finetuning); a wide-layer task (the analytic crossover says N of 128 or more); an RTL product-table engine through Yosys to replace the assumed table-read cost; the input-table first layer for 4-bit inputs.

## Owner steps
None.

## Outside dependencies
NumPy, scikit-learn (BSD-3, bundled digits data), matplotlib.

**Figure.** `experiments/frontier.png`: accuracy against modelled energy, MAC against product table, dense and pruned.
