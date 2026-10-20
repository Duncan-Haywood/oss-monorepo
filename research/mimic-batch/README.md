# How many texts from one source does a weak human-vs-machine text detector need before a batch verdict is reliable?

Track 11 (adversarial human imitation). **Preliminary: RAID plain-prompt text only, one detector (the `mimic-contexts` n-gram logistic regression), 8 families, batches of independent texts, no LLM run.** Produced with AI assistance (Claude). Why it seemed worth doing: the prompt-loop milestones need local model weights that this container cannot download (Hugging Face returned 307/403), and every project so far scores one text at a time. A moderator, an exam marker or a bot hunter usually sees many texts from one account. If one account posts k texts, how fast does the verdict sharpen, and what if only some of them are machine?

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/mimic-batch/

Numbers come from `results.txt` and `results.json`; the figure is `experiments/figure.svg`.

## Results (what the code produced)

For each held family, the detector is fit on the other seven (as `mimic-threshold`) and scores the held family once. A batch is k texts drawn with replacement; its statistic is the mean detector score. Mean over the 8 families (4,000 batches per cell; per-family rows in `results.txt`):

| k | AUROC, all machine | 50% machine | 25% machine | 10% machine | mean FPR at the nominal 5% |
|---|---|---|---|---|---|
| 1 | 0.935 | – | – | – | 0.074 |
| 2 | 0.979 | 0.876 | – | – | 0.069 |
| 4 | 0.997 | 0.941 | 0.805 | – | 0.075 |
| 8 | 1.000 | 0.982 | 0.878 | 0.732 | 0.087 |
| 16 | 1.000 | 0.998 | 0.944 | 0.805 | 0.112 |
| 32 | 1.000 | 1.000 | 0.985 | 0.822 | 0.150 |

- **A weak per-text signal becomes a strong batch signal fast.** Single texts separate at AUROC 0.935 here; four texts from an all-machine source reach 0.997. Even the weak family (recipes, 0.88 per text) is at 1.00 by k = 8.
- **Dilution costs about a factor of the machine share.** A source whose texts are half machine needs about 8 texts to reach AUROC 0.98; a quarter machine needs about 32. At 10% machine, 32 texts still give only 0.82: the mean is a poor statistic for a few outliers, and a max or a count above a cut-off would suit that case better (not tested).
- **The threshold, not the score, is what breaks.** The cut-off is the 95th percentile of batch means of a calibration half of the family's human texts (150 of them). Measured on the other half, the human batches flagged are 7.4% at k = 1 but 15% on average at k = 32, and 60% for books, 26% for poetry, 12% for wiki. As k grows the batch mean's spread shrinks like 1/√k, while the error in the calibration half's average does not, so a small gap between the two halves turns into a large false-accusation rate. The AUROC column is immune to this; a verdict at a fixed rule is not. This extends `mimic-recalib` (single texts, needs about 80 calibration texts) to batches: the bigger the batch, the more calibration texts the human baseline needs.
- **Per-text FPR at k = 1 already drifts** (7.4% against 5%, books 16.5%) because the halves of a family differ; that is the sampling noise of 150 texts, and it is the part that grows.

## Method

`batch.py`: leave-one-family-out fit of the TF-IDF (character 1-4 grams plus word 1-2 grams) logistic regression, as `mimic-contexts`. Per family the human scores are split at random into a calibration and a test half. Batches are k scores drawn with replacement (so they are independent given the pool); a p-machine batch holds round(p·k) machine texts and the rest human, in the same score pool of the test half. Threshold: 95th percentile of 4,000 calibration-half human batch means. Reported: FPR on 4,000 test-half human batches, TPR on 4,000 positive batches, and AUROC between the two sets of batch means. Seed 0. Cells where round(p·k) = 0 are skipped.

## Reproduce

```bash
cd research/mimic-batch
pip install numpy scipy scikit-learn matplotlib pytest
python3 -m pytest tests          # 7 tests
python3 batch.py                 # about 2 minutes; writes results.json and results.txt
python3 figure.py                # experiments/figure.svg
```

It reads `../mimic-contexts/data/suite.jsonl.gz` and imports `../mimic-threshold/threshold.py`.

## Limitations

Batches are drawn i.i.d. with replacement from at most 300 human and 300 machine texts per family, so duplicates occur at large k, and real accounts' texts are correlated (same author, topic and prompt), which would make batches less informative than here. Machine texts come from plain prompts, not an adapted imitator, so these AUROCs say how fast a prompt-free detector aggregates, not how fast it catches the best imitator. One statistic (the mean), one detector, one split per family, no confidence intervals beyond the 8 per-family rows. The p-machine batches draw the human part from the test half, the same pool as the human-only batches.

## Builds on

`mimic-contexts` (suite and detector), `mimic-threshold` and `mimic-recalib` (threshold calibration). The idea is the standard one of pooling evidence over independent observations, as in Wald (1945) for sequential tests; here it is only measured, not an optimal test. Related: Sadasivan et al. (2025) on how detectability depends on the number of tokens. No lab's work is built on, and no lab is affiliated with or endorses this project.

## Next steps

Replace the mean by a sequential probability-ratio test and by a max statistic and compare at the 10% case; calibrate with a held-out pool sized to k; repeat with correlated batches (same prompt) and with the adapted imitators of `mimic-loop`.

## Owner steps

None.

## Outside dependencies

The `mimic-contexts` suite (from RAID, MIT); NumPy, SciPy, scikit-learn, matplotlib (figure only).

MIT.

## References

- Wald, A. (1945). Sequential tests of statistical hypotheses. *Annals of Mathematical Statistics* 16(2).
- Sadasivan, V. S., Kumar, A., Balasubramanian, S., Wang, W. and Feizi, S. (2025). Can AI-generated text be reliably detected? *TMLR*.
