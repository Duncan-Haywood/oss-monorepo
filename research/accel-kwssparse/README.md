# accel-kwssparse: does accel-sparse's "ternary and pruning drop the multipliers" result survive on real keyword-spotting features? (stylised, negative)

Track 8 (task-specific AI accelerators) in `PROJECTS.md`, milestone 5 re-run. `accel-sparse` swept pruning, int4/int8, ternary and binary MLPs but on scikit-learn's 8x8 digits, because Speech Commands was unreachable that day. On digits, a ternary pruned-50% MLP stayed within 1 point of float32 with no multiplier. Here the same 13 designs, the same training code and the same energy model run on the Speech Commands v0.02 MFCC features of `accel-kws`. **Headline: on this task no multiplier-free design comes within 5 points of float32.** The digits conclusion does not transfer. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/accel-kwssparse/

**Builds on.** `research/accel-sparse` (model, quantisers, pruning schedule and cost model are imported unchanged), `research/accel-kws` (MFCC front end, 11-class task, features from `prepare_features.py`). Ideas as cited in `accel-sparse`: Zhu and Gupta (2017) gradual pruning, Li and Liu (2016) ternary weight networks, Courbariaux et al. (2015) BinaryConnect. Those citations were not re-checked here. No CU Boulder group's work is built on or implied.

## Method
- **Data.** Speech Commands v0.02 (Warden 2018, arXiv:1804.03209; CC BY 4.0 per the mirror's card) from the same third-party Hugging Face mirror as `accel-kws`, not checked against the original archive. 11 classes, 33,895 train / 4,084 validation / 4,509 test clips, 0 speakers shared between splits (`experiments/data_summary.json`). Features: `accel-kws` MFCCs pooled into 7 segments, 70 inputs, standardised with train statistics.
- **Model.** 70-64-11 ReLU MLP; hidden activations fake-quantised to 8 bits at evaluation. Same 13 designs as `accel-sparse` (its README says 14; the code defines 13). 30 epochs (dense), pruned designs add a 10-epoch dense warm-up and a cubic sparsity schedule, batch 128, 5 seeds (different initialisation and batch order; the data split is the dataset's fixed one, so seed spread understates split-to-split variation).
- **Cost model.** `accel-sparse`'s, with every constant assumed and the multiplier energy varied 1x to 30x. Layer sizes and 8-bit input and hidden activations are the only changes.

## Reproduce
```bash
pip install numpy scipy pyarrow scikit-learn matplotlib
sh ../accel-kws/experiments/download.sh /tmp/sc            # about 3.3 GB; the host rate-limits (HTTP 429), retry
python3 ../accel-kws/experiments/prepare_features.py /tmp/sc /tmp/sc/feats.npz
python3 experiments/run.py /tmp/sc/feats.npz               # about 7 minutes; writes results.json and results.txt
python3 experiments/figure.py
python3 -m pytest tests
```

## Results
Test accuracy over 5 seeds; drop is paired against float32 (`experiments/results.txt`).

| design | test acc (sd) | drop vs float32 | energy nJ (assumed) |
|---|---|---|---|
| float32 dense | 0.726 (0.006) | 0 | 37.7 |
| int8 dense | 0.727 (0.006) | -0.001 | 14.7 |
| int4 dense | 0.694 (0.008) | +0.032 | 10.9 |
| int8 pruned 50% | 0.722 (0.003) | +0.004 | 10.2 |
| int8 pruned 75% | 0.687 (0.008) | +0.039 | 5.1 |
| int8 pruned 90% | 0.537 (0.005) | +0.189 | 2.0 |
| ternary | 0.538 (0.009) | +0.188 | 8.5 |
| ternary pruned 50% | 0.535 (0.010) | +0.191 | 4.2 |
| binary | 0.375 (0.011) | +0.351 | 7.9 |

- Cheapest design within 1 or 2 points of float32: int8 pruned 50% (10.2 nJ, 69% of dense int8). Within 5 points: int8 pruned 75% (5.1 nJ, 35%). **No ternary or binary design is within 5 points**; the best is 19 points down.
- Same questions on digits (`accel-sparse`): ternary pruned 50% was 0.6 points down, and binary 3 points. The accuracy slack that let digits drop multipliers does not exist on this 11-class audio task at this model size.
- Multiplier energy scaled 1x to 30x does not change which design is cheapest within 2 points (int8 pruned 50% throughout); no multiplier-free design enters the tolerance.

**Figure.** `experiments/frontier.png`: accuracy against modelled energy for all 13 designs.

## Limitations
- Accuracies (about 72% for float32) are those of a one-hidden-layer MLP on pooled MFCCs, far below published keyword-spotting models; a larger or convolutional model might tolerate ternary weights. Only hidden width 64 was run, so "ternary fails" is for this size.
- Ternary and binary were trained for the same 30 epochs as the others with the straight-through estimator and no tuning (no learning-rate, threshold or width search); a tuned or wider ternary net could close part of the gap. This is a negative result under an untuned recipe.
- Energy is modelled from assumed 45 nm constants, with no RTL, synthesis or silicon. Seeds vary initialisation only, not the data split.

## Next steps
Widen the hidden layer under ternary weights until it matches int8 accuracy and compare the energy at equal accuracy; add the lookup-table variant; synthesise the pruned int8 engine.

## Owner steps
None. Simulation only; nothing was bought or measured.

## Outside dependencies
NumPy, SciPy, PyArrow, matplotlib; Speech Commands data via a third-party mirror (about 3.3 GB, not committed).
