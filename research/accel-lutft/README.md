# accel-lutft: does fine-tuning the shared values rescue low-K weight-sharing tables?

**Why this was worth doing.** `accel-lut` found that a product-table engine did not beat an int8 MAC engine, but its shared values were never retrained, so it called its low-K accuracy a lower bound. This project tests that caveat directly. **Result: mixed, small, and assumption-dependent.** Fine-tuning rescues K = 2 and 4 in the 75%-pruned network, which brings the table engine 14% under int8 energy within 2 points of float32 when a table read costs 0.04 pJ/bit. It does not help the dense network at K = 8, where it was worse than no fine-tuning. At the 0.16 pJ/bit read cost the table loses everywhere.

**Builds on.** `research/accel-lut` (task, models, cost model; `model.py` and `lut.py` are copied from it so the project is self-contained, and its post-training rows reproduce `accel-lut`'s accuracies and energies to the printed precision). Idea: weight sharing with a trained codebook, Han, Mao and Dally (2016), "Deep Compression", ICLR (citation from memory, **not re-verified in this run**). The fine-tuning here is a simpler straight-through scheme than theirs. Energy constants are assumptions in the spirit of Horowitz (2014), ISSCC (not re-checked). No CU Boulder group's work is built on or implied. Produced with AI assistance.

## Method
- **Task and baseline.** scikit-learn's bundled 8x8 digits (a substitute for keyword spotting), 64-32-10 ReLU MLP, 10 stratified 60/20/20 splits, float model trained dense (150 epochs) or pruned to 75%, exactly as in `accel-lut`.
- **Fine-tuning.** Start from the trained float model. For 60 epochs (Adam, lr 1e-3, batch 64) the forward pass uses a k-means codebook of K values per layer, re-fit every step (5 Lloyd iterations) on the nonzero latent weights, and the gradient passes straight through to the latent weights (pruned weights stay 0). After fine-tuning the codebook is re-fit with 30 iterations and the model is evaluated with 8-bit activations. Not the centroid-gradient scheme of Deep Compression, which updates the K centroids directly with fixed assignments. That is still open.
- **Designs.** int8 post-training; `postK` (no fine-tuning, same as `accel-lut`); `ftK` (fine-tuned), for K = 2, 4, 8. Energy uses `accel-lut`'s product-table model unchanged, at table reads of 0.04 and 0.16 pJ/bit. Every energy constant is an assumption.
- **Not done.** No RTL or synthesis, no real keyword-spotting data, no K-sweep of the fine-tuning recipe (one lr and epoch count, chosen before looking at results), no input-table first layer.

## Reproduce
```bash
pip install numpy scikit-learn matplotlib
cd research/accel-lutft
python3 -m unittest discover -s tests -v     # 4 tests, <1 s
python3 experiments/run.py                   # about 2 min; writes results.json, results.txt
python3 experiments/run.py --report          # rebuild results.txt from results.json
python3 experiments/figure.py                # writes experiments/frontier.png
```

## Results (from `experiments/results.txt`; mean over 10 splits; drop is paired against the float32 model; energy in nJ per inference)
| design | dense acc. | dense drop (se) | dense nJ @0.04 | 75% pruned acc. | pruned drop (se) | pruned nJ @0.04 |
|---|---|---|---|---|---|---|
| int8 MAC | 0.972 | 0.000 | 3.56 | 0.969 | +0.001 (0.001) | 1.51 |
| K=2 post-training | 0.480 | +0.492 (0.029) | 2.30 | 0.905 | +0.065 (0.011) | 1.30 |
| K=2 fine-tuned | 0.761 | +0.211 (0.050) | 2.30 | 0.952 | +0.017 (0.004) | 1.30 |
| K=4 post-training | 0.895 | +0.077 (0.014) | 2.83 | 0.954 | +0.016 (0.005) | 1.55 |
| K=4 fine-tuned | 0.911 | +0.061 (0.005) | 2.83 | 0.955 | +0.015 (0.004) | 1.55 |
| K=8 post-training | 0.956 | +0.016 (0.004) | 3.51 | 0.966 | +0.004 (0.002) | 1.94 |
| K=8 fine-tuned | 0.940 | +0.032 (0.007) | 3.51 | 0.966 | +0.003 (0.001) | 1.94 |

- **Pruned network, K = 2.** Fine-tuning cuts the drop from 6.5 to 1.7 points, inside a 2-point tolerance, at 1.30 nJ against 1.51 nJ for int8 (14% lower) if a table read costs 0.04 pJ/bit. At 0.16 pJ/bit the same design costs 2.81 nJ, nearly twice int8. The 1.7-point drop sits close to the tolerance edge, so the "within 2 points" verdict is fragile (se 0.4 points).
- **Dense network.** Fine-tuning does not rescue the table: the best dense design within 2 points is still K = 8 post-training at 3.51 nJ, a near tie with int8 at 3.56 nJ, as in `accel-lut`. Fine-tuned K = 8 is worse (3.2 against 1.6 points). A plausible cause, untested here, is the noisy re-fit codebook under a constant learning rate; a different recipe might do better, so this is not evidence that fine-tuning cannot help the dense case.
- **Caveat on the one win.** It rests on an assumed table-read energy, on a 0.2 nJ margin (the K=4 pruned design at 1.55 nJ is no better than int8), and on a toy task. Treat it as a hypothesis for RTL-level checking, not a result about hardware.

## Limitations
Stylised task, assumed 45 nm-style constants, single fine-tuning recipe, no RTL, no hardware measurement. Simulated and modelled numbers say nothing about a physical device.

## Next steps
Centroid-gradient fine-tuning with fixed assignments; a recipe sweep (lr, epochs, codebook refit rate) on a validation split; an RTL product-table engine through Yosys to replace the assumed table-read cost; a wide-layer task.

## Owner steps
None.

## Outside dependencies
NumPy, scikit-learn (BSD-3, bundled digits data), matplotlib.

**Figure.** `experiments/frontier.png`: accuracy against modelled energy, post-training against fine-tuned shared values, with the int8 MAC point.
