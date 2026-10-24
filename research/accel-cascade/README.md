# accel-cascade: does a tiny always-on keyword model that wakes a bigger one beat the best single model on energy?

Track 8 (task-specific AI accelerators) in `PROJECTS.md`, a new question rather than another variant of the `accel-nsga` chain: instead of choosing one model and engine at design time, can a small model answer the confident clips and escalate the unsure ones to a bigger model at run time? Produced with AI assistance (Claude).

**Headline.** Over 5 seeds, cascades cut the *classifier's* modelled energy by 0 to 28% against the cheapest single model at the same validation-accuracy target, but they give up 0.3 to 1.4 points of test accuracy, and the saving is below 1% of a whole always-on system because the MFCC front end costs about 50 times the classifier (`accel-frontend`). A small, real, mostly cosmetic effect.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/accel-cascade/

**Builds on.** `research/accel-kws` (model, quantisation-aware trainer, MFCC front end and cost model, imported unchanged), `research/accel-horowitzcheck` (the energy constants match Horowitz 2014 within 4%), `research/accel-frontend` (front-end cost). Speech Commands v0.02: Warden (2018), arXiv:1804.03209. Cascades of cheap and expensive classifiers: Viola and Jones (2001), CVPR, for the idea only; nothing is reproduced. No CU Boulder group is built on.

## Method
- **Data.** The original tarball (`storage.googleapis.com/download.tensorflow.org/data/speech_commands_v0.02.tar.gz`), not the Hugging Face mirror `accel-kws` used (403 from the container). Splits are the dataset's `validation_list.txt` / `testing_list.txt`; zero speaker overlap (checked, `experiments/prepare_features.py` output). Keywords kept, other words subsampled to a median keyword class, as in `accel-kws`. Test accuracy of the 128-hidden 4-bit model, 0.749 for seed 0 here against 0.752 in `accel-kws`, so the retrain reproduces it.
- **Models.** 40 per seed (segments 7/12 x hidden 8/16/32/64/128 x weight bits 2/3/4/8), 40 epochs, seeds 0 to 4, integer reference forward pass for every logit.
- **Cascade.** Stage 1 runs on every clip; if its top-1 minus top-2 integer logit is under a threshold, stage 2 runs on the same features and answers. Energy = E1 + escalated fraction x E2, with E from `accel-kws`'s MAC energy model. Thresholds: 60 quantiles of the stage-1 validation margins. Every ordered pair with E1 < E2 (about 41,000 cascades per seed).
- **Selection.** For each validation-accuracy target the cheapest single model and the cheapest single-or-cascade are picked on validation only; test accuracy is only reported.

## Reproduce
```bash
curl -fLO https://storage.googleapis.com/download.tensorflow.org/data/speech_commands_v0.02.tar.gz   # 2.4 GB
mkdir sc && tar xzf speech_commands_v0.02.tar.gz -C sc
cd research/accel-cascade
python3 experiments/prepare_features.py ../../sc ../../feats.npz    # about 1 min
python3 experiments/run.py ../../feats.npz                          # about 17 min on 4 cores; results.json / results.txt
python3 experiments/gap.py                                          # seconds; gap.txt
python3 -m unittest discover -s tests -v                            # 6 tests
```

## Results (`experiments/results.txt`, `experiments/gap.txt`; mean over 5 seeds, energy in modelled nJ per classification)
| val target | single energy (test acc) | single-or-cascade energy (test acc) | energy ratio, mean (min to max) | cascades picked |
|---|---|---|---|---|
| 0.55 | 2.1 (0.523) | 1.9 (0.520) | 0.92 (0.80 to 1.00) | 2 of 5 |
| 0.60 | 2.7 (0.592) | 2.7 (0.577) | 0.98 (0.92 to 1.00) | 2 of 5 |
| 0.65 | 4.2 (0.632) | 3.4 (0.620) | 0.82 (0.70 to 0.95) | 5 of 5 |
| 0.70 | 5.4 (0.686) | 5.3 (0.673) | 0.98 (0.95 to 1.00) | 4 of 5 |
| 0.72 | 8.7 (0.699) | 6.2 (0.696) | 0.73 (0.63 to 0.87) | 5 of 5 |
| 0.74 | 10.9 (0.722) | 8.4 (0.713) | 0.77 (0.70 to 0.82) | 5 of 5 |

(0.50 picks the same single model every seed.) The best single model has 0.755 test accuracy (35 to 47 nJ); the cascades above stay below about 0.72. Typical high-target winners escalate 4 to 35% of clips from a 32- or 64-hidden 4-bit model to a larger one. Validation accuracy runs about 0.03 above test for both kinds of pick, so searching 41,000 cascades did not widen the gap (winner's-curse check, `gap.txt`); but the cascades are about 0.3 to 1.4 points worse on test at the same validation target, comparable to the test set's standard error of about 0.7 points, so the accuracy loss is probably real but small and the energy saving is the clearer effect.

**Does it matter?** `accel-frontend` counts 7,532 multiplies per 20 ms frame for the MFCC front end against 5,184 MACs per classification and reports it at about 54 times the classifier's power (assumed constants). A 25% classifier saving is then under 1% of the always-on total. The result says that a cascade is a poor first lever here; it would matter on an engine where the classifier, not the front end, dominates.

## Limitations
- Modelled energy from MAC counts (constants checked against Horowitz 2014, 45 nm), not measured; the cascade's control and the second model's weight storage (area, leakage) are not charged.
- Clips are isolated one-second words. A real stream is mostly silence, where a cascade's first stage would skip almost everything; that case is not measured here and would favour cascades.
- One hidden layer, MFCC features, one task; five seeds; the test set is 4,509 clips.
- Threshold rule is a margin on integer logits only; learned gates or early exit inside one network were not tried.

## Next steps
Add a silence/noise class from `_background_noise_` and measure cascades on a stream-like mix; replace the margin rule with early exit from one shared network; price the cascade against the front end in one system model.

## Owner steps
None. Simulation only; no hardware specified, bought or measured, so no bill of materials.

## Outside dependencies
The Speech Commands v0.02 tarball (CC BY 4.0, Google); `accel-kws`'s trainer and cost model; assumed MAC energy constants. Python with numpy and scipy; no EDA tools.
