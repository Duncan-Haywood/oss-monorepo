# Does a human-vs-machine text detector hold up on context families it never saw? Detector side of `mimic-anycontext`, with no LLM

Track 11, adversarial human imitation. This is the part of milestone 4 (`mimic-anycontext`) that can run without a language model: the cloud container could reach neither Hugging Face (HTTP 403) nor a GPU, so the prompt-optimising loop and its imitator side are **not** run here. **Stylised and preliminary: one detector family (TF-IDF n-grams with logistic regression), eight families from RAID's plain-prompt generations, three generators. It says nothing about prompt-only detectors or about adaptive imitators.** Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/mimic-anycontext-detect/

The question is the detector half of "any context". If you fit a detector on some contexts, how much do you lose on a context it never saw, compared with fitting inside that context, and how many labelled examples from the new context close the gap?

## Results (what the code produced; `results.txt`, `results.json`, `experiments/figure.svg`)

AUROC of the n-gram detector on the target family, mean over 5 random half-splits (two-fold cross-fit for the per-family detector), human text against RAID's plain-prompt machine text:

| family | universal (family unseen) | + 10 target items | + 40 | + 160 | per-family (half the family) |
|---|---|---|---|---|---|
| abstracts | 0.886 | 0.896 | 0.927 | 0.973 | 0.990 |
| books | 0.993 | 0.994 | 0.996 | 0.998 | 1.000 |
| news | 0.971 | 0.974 | 0.981 | 0.991 | 0.992 |
| recipes | 0.843 | 0.907 | 0.974 | 0.998 | 1.000 |
| reddit | 0.955 | 0.960 | 0.971 | 0.982 | 0.978 |
| poetry | 0.942 | 0.950 | 0.970 | 0.990 | 0.995 |
| reviews | 0.984 | 0.989 | 0.994 | 0.998 | 0.998 |
| wiki | 0.896 | 0.903 | 0.920 | 0.946 | 0.926 |
| **mean** | **0.934** | | | | **0.985** |

- **The seen/held-out gap is +0.05 AUROC on average, and uneven.** A detector that never saw the family loses most on recipes (0.843), abstracts (0.886) and wiki (0.896), and almost nothing on books, reviews and news (all above 0.97). So against plain-prompt machine text the universal detector is already strong, and the weak families are the ones whose human text is least like the others.
- **Forty labelled target items close most of the gap on recipes** (0.843 to 0.974) and about half of it on poetry (0.942 to 0.970); abstracts (0.927) and wiki (0.920) still trail and need about 160 items to get to 0.973 and 0.946. The adapted rows give target items five times the weight of the others, an untuned choice.
- **On reddit and wiki the in-family detector is no better than the universal one plus 160 items** (reddit 0.978 against 0.982; wiki 0.926 against 0.946). The per-family detector sees only half a family (150 human plus about 150 machine texts), so it is a small-data fit, not an upper bound.
- **A held-out generator costs little here.** Training on human text plus machine text from the other generators only, and scoring human against the unseen generator, gives AUROC 0.90 to 1.00 across 20 family/generator cells (lowest: wiki/mistral-chat 0.899, abstracts/mistral-chat 0.949). Caveat: the detector also saw half of the target family's human text, and the generators are three similar instruction-tuned chat models from one benchmark.
- **Length does not explain it.** Raw length alone scores AUROC 0.12 to 0.85 depending on the family (wiki 0.845, poetry 0.115, i.e. the machine text is shorter, which is as informative as longer). Restricted to the length band shared by both classes (10th to 90th percentile of each), the universal detector's AUROC is 0.001 lower on recipes and reddit and 0.002 to 0.023 higher on the other six, so the detector is not just reading length.

## What this does and does not say for `mimic-anycontext`

The milestone's main claim, a universal *prompt* that holds up on held-out families, needs the imitator and detector LLMs and is **not tested here**. What this adds is a model-free baseline for the detector side: a prompt-free detector of this kind already transfers across families with a 0.05 AUROC loss against plain-prompt text, so a prompted 0.5B detector has to beat that to be interesting. It does not show that a *prompt-optimised imitator* stays undetected on held-out families; the n-gram detector's 0.93 to 1.00 AUROC on plain generations was the starting point `mimic-contexts` already reported (leave-one-family-out 0.87 to 0.99).

## Reproduce

```bash
cd research/mimic-anycontext-detect
python3 -m unittest discover -s tests -v      # 5 tests, no data download needed except one skippable check
pip install numpy scipy scikit-learn
python3 anyctx.py                              # about 8 minutes on 4 CPUs; writes results.json, results.txt
python3 figure.py                              # writes experiments/figure.svg
```

It reads `../mimic-contexts/data/suite.jsonl.gz`.

## Method

`anyctx.py` uses the `mimic-contexts` suite (300 human and 300 machine items in each of eight families; machine text is RAID's plain-prompt generations from llama-chat, mistral-chat and mpt-chat). The detector is logistic regression (C = 3) on TF-IDF character 1 to 4 grams and word 1 to 2 grams, the same recipe as `mimic-contexts`' `ngram` detector, with the vocabulary capped at 100,000 features per block. For speed the vectoriser is fitted once over the whole suite: this uses no labels, but the vocabulary and IDF weights do see target-family text, which slightly favours the universal regime. Regimes: *universal* (fit on the other seven families), *per-family* (fit on half of the target family, score the other half, both ways), *adapted* (universal training set plus k labelled items from one half, scored on the other half, five seeds). The generator hold-out fits on other families, the other generators' machine text in this family and half the family's human text, and scores the other half of the human text against the held-out generator's text. Differences between regimes of under about 0.01 are within the seed standard deviations stored in `results.json` and should not be read as a ranking.

## Builds on

`mimic-contexts` (this repository, data and the n-gram detector recipe); Dugan et al. (2024), "RAID: A Shared Benchmark for Robust Evaluation of Machine-Generated Text Detectors", ACL (MIT licence). No lab's work is built on and none is affiliated with or endorses this project.

## Limitations

One detector type; plain-prompt (non-adversarial) machine text only; three generators of one kind; eight families; half-family training sets for the per-family regime; vectoriser fitted on all text; no confidence intervals beyond seed spread; no prompt-based detector, no imitator optimisation.

## Next steps

Run the real `mimic-anycontext` (universal vs per-family vs self-written prompts) where a model can be downloaded; use this table as the prompt-free yardstick for the held-out-family gap.

## Owner steps

Run the model-based part of `mimic-anycontext` somewhere with Hugging Face access and CPU time (the `mimic-loop` code is the starting point).

## Outside dependencies

The `mimic-contexts` suite (from RAID); NumPy, SciPy, scikit-learn.
