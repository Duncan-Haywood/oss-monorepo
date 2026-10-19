# How many human texts does it take to re-set a detector's threshold for a 5% false-positive rate on a new kind of text?

Track 11 (adversarial human imitation), the "Next steps" item of `mimic-threshold`. **Preliminary, stylised: RAID plain-prompt text only, one detector type (the `mimic-contexts` n-gram logistic regression), 8 families, 300 human texts each, 500 random calibration draws per cell. No LLM was run.** Produced with AI assistance (Claude). Why it seemed worth doing: `mimic-threshold` showed that a threshold set on other families gives a false-positive rate (FPR) of 0.00 to 0.54 instead of 5%, and said to re-set it per context from a sample of human text. This measures how big that sample must be, and what the cheap way of choosing the cut-off costs.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/mimic-recalib/

Numbers come from `results.txt` and `results.json`; the figure is `experiments/figure.svg`.

## Results (what the code produced)

For each held family, fit the detector on the other seven (as `mimic-threshold`), score the held family once, then draw k of its 300 human texts as a calibration sample, set the threshold from them and measure FPR on the other human texts of that family and TPR on its machine texts. "Plain" is the empirical 95th percentile of the k scores; "conformal" is the ceil((k+1)·0.95)-th smallest score, which keeps expected FPR at or under 5% when calibration and test scores are exchangeable. Mean over the 8 families (each 500 draws; per-family rows in `results.txt`):

| k | plain: mean FPR | plain: 10th–90th pct | plain: P(FPR > 10%) | plain TPR | conformal: mean FPR | conformal: 10th–90th pct | conformal: P(FPR > 10%) | conformal TPR |
|---|---|---|---|---|---|---|---|---|
| 5 | 0.184 | 0.029–0.379 | 0.66 | 0.846 | 0 (never flags) | – | 0 | 0 |
| 10 | 0.117 | 0.025–0.248 | 0.48 | 0.809 | 0 (never flags) | – | 0 | 0 |
| 20 | 0.090 | 0.021–0.176 | 0.36 | 0.788 | 0.047 | 0.004–0.108 | 0.12 | 0.663 |
| 40 | 0.071 | 0.023–0.130 | 0.22 | 0.771 | 0.049 | 0.010–0.099 | 0.09 | 0.706 |
| 80 | 0.061 | 0.025–0.102 | 0.10 | 0.762 | 0.049 | 0.017–0.088 | 0.05 | 0.730 |
| 160 | 0.055 | 0.021–0.091 | 0.05 | 0.759 | 0.049 | 0.021–0.082 | 0.03 | 0.741 |

- **Twenty human texts are not enough, eighty roughly are.** With the plain rule, 20 texts give an average FPR of 9% and a one-in-three chance of exceeding 10%; at 80 the mean is 6.1% and the chance is 10%. The order is the same in every family.
- **The plain rule is biased high at small k; the conformal rule is not.** It holds the mean at 4.7 to 4.9% from k = 20 up. The price is TPR: 0.66 at k = 20 against 0.79 for the plain rule, closing to 0.74 against 0.76 at k = 160. A rule that stays within the false-accusation budget on average gives up recall to do it.
- **Below k = 19 the conformal rule cannot flag anything** (it needs at least 19 calibration texts to have a 95th-percentile rank), so a 5% target needs at least 19 human texts, 99 for a 1% target by the same arithmetic.
- **Spread, not bias, is what is left at k = 80.** A single calibration draw of 80 still lands anywhere from about 1.7% to 8.8% (conformal, 10th to 90th percentile). Re-setting the threshold from a sample is a sampling estimate, and its error is worth reporting next to the detector's accuracy.
- **Families differ only in TPR.** After recalibration, recipes catches under half of machine text (0.46 at k = 160) and books 0.96, the same ordering as the family-matched numbers in `mimic-threshold`. Recalibration repairs the false-accusation rate; it does not make a weak detector strong.

## Method

Detector as `mimic-contexts` and `mimic-threshold`: TF-IDF character 1-4 grams plus word 1-2 grams, logistic regression (C = 3), fitted on the seven other families. Scores for the held family come from that single fitted model. Per k and family: 500 draws without replacement of k human scores; the remaining 300 − k human scores give FPR and all machine scores give TPR (seed 0). The conformal rank rule is the split-conformal quantile of Vovk et al. and Lei et al. (2018) applied to one-sided detection.

## Reproduce

```bash
cd research/mimic-recalib
pip install numpy scipy scikit-learn matplotlib pytest
python3 -m pytest tests          # 5 tests
python3 recalib.py               # about 2 minutes; writes results.json and results.txt
python3 figure.py                # experiments/figure.svg
```

It reads `../mimic-contexts/data/suite.jsonl.gz` and imports `../mimic-threshold/threshold.py`.

## Limitations

The conformal guarantee is about expected FPR over exchangeable draws; with k = 160 of 300 human texts the held-out pool shrinks, so the FPR estimate itself is noisy (and slightly dependent across draws). One detector, one fit per family, plain-prompt RAID text, no prompted or zero-shot detector, a single target of 5%. The calibration texts are drawn from the same 300 as the test texts, so this assumes the calibration sample is drawn from the same population as the people being judged; a sample from different writers would break it.

## Next steps

Repeat with the zero-shot Binoculars-style score; test a calibration sample from different sources than the evaluated texts; use the recalibrated threshold as the FPR check inside `mimic-loop`.

## Owner steps

None.

## Outside dependencies

The `mimic-contexts` suite (from RAID, MIT); NumPy, SciPy, scikit-learn, matplotlib (figure only).

MIT.

## References

- Lei, J., G'Sell, M., Rinaldo, A., Tibshirani, R. J. and Wasserman, L. (2018). Distribution-free predictive inference for regression. *Journal of the American Statistical Association* 113(523).
- Liang, W., Yuksekgonul, M., Mao, Y., Wu, E. and Zou, J. (2023). GPT detectors are biased against non-native English writers. *Patterns* 4(7).
