# If a human-vs-machine detector's threshold is set for a 5% false-positive rate, does that rate hold on a kind of text it never saw?

Track 11 (adversarial human imitation), a by-product of `mimic-contexts` and `mimic-surface`. **Preliminary, stylised: RAID plain-prompt text only, one detector type (the `mimic-contexts` n-gram logistic regression), 8 families, 300 human texts each, one seed.** Produced with AI assistance (Claude). No LLM was run. Free-choice reason: every earlier project here reports AUROC, which ignores the threshold, but anyone *using* a detector must pick one, and accusing a person of being a machine is the costly error (Liang et al., 2023, on detectors' bias against some writers).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/mimic-threshold/

Numbers come from `results.txt` and `results.json`; the figure is `experiments/figure.svg`.

## Results (what the code produced)

Leave one family out. Fit the detector on the other seven families; set the threshold at the 95th percentile of human scores in out-of-fold (3-fold) scores on those seven, so it targets a 5% false-positive rate (FPR); apply both to the held family. Wilson 95% intervals over its 300 human texts.

| held family | AUROC | realised FPR (nominal 5%) | TPR at that threshold | TPR if the threshold were set on the family itself (FPR 5%) |
|---|---|---|---|---|
| abstracts | 0.896 | **0.540** (0.483 to 0.596) | 0.947 | 0.673 |
| books | 0.993 | **0.183** (0.144 to 0.231) | 1.000 | 0.960 |
| news | 0.969 | 0.020 (0.009 to 0.043) | 0.743 | 0.863 |
| poetry | 0.946 | 0.043 (0.025 to 0.073) | 0.753 | 0.780 |
| recipes | 0.867 | 0.000 (0.000 to 0.013) | 0.017 | 0.460 |
| reddit | 0.953 | 0.017 (0.007 to 0.038) | 0.463 | 0.813 |
| reviews | 0.984 | 0.057 (0.036 to 0.089) | 0.907 | 0.893 |
| wiki | 0.895 | 0.033 (0.018 to 0.060) | 0.533 | 0.623 |

- **The nominal 5% did not hold.** Realised FPR ran from 0.0 to 0.54. Only three of eight intervals contain 0.05 (poetry, reviews, wiki). On abstracts, more than half of human texts are called machine; on books, about one in five.
- **Error goes both ways.** On recipes the threshold is too strict: no human is flagged but only 1.7% of machine text is caught, though the detector's AUROC there is 0.867 and a family-specific threshold would catch 46%. Reddit and news lose 35 and 12 points of recall the same way.
- **AUROC hides this.** Books has the best AUROC (0.993) and the second-worst FPR. A ranking-quality number says nothing about whether a fixed cut-off transfers: scores shift between families, so each family needs its own calibration.
- **Reading.** A threshold calibrated on other text types does not give the false-positive rate it was set for. A detector inside the imitation game, or one used on people, needs its threshold re-set per context from a sample of human text in that context.

What this does not show: behaviour of a prompted or zero-shot detector, other target FPRs, other seeds (one 3-fold split), or non-RAID human text. The abstracts and books gaps may partly reflect those families' unusual vocabulary against the other seven; that was not isolated.

## Reproduce

```bash
cd research/mimic-threshold
pip install numpy scipy scikit-learn matplotlib pytest
python3 -m pytest tests          # 5 tests
python3 threshold.py             # about 5 minutes; writes results.json and results.txt
python3 figure.py                # experiments/figure.svg
```

It reads `../mimic-contexts/data/suite.jsonl.gz`.

## Method

Detector as in `mimic-contexts`: TF-IDF character 1-4 grams plus word 1-2 grams, logistic regression (C = 3). For each held family: fit on all other families; compute 3-fold out-of-fold scores on that training set; threshold = 95th percentile of the human texts' out-of-fold scores; score the held family with the fully fitted model. Out-of-fold scores keep the threshold from being set on texts the model memorised.

## Next steps

Calibrate per family from a small human sample (how few texts give FPR near 5%?); repeat with the zero-shot Binoculars-style score; use the realised FPR as a check in `mimic-loop`.

## Owner steps

None.

## Outside dependencies

The `mimic-contexts` suite (from RAID, MIT); NumPy, SciPy, scikit-learn, matplotlib (figure only).

MIT.
