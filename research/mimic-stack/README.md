# Does adding a zero-shot perplexity score to the n-gram detector help it catch machine text in families it never saw?

Track 11 (adversarial human imitation), a no-model slice of milestone 5 (`mimic-transfer`), built on `mimic-contexts`. It was chosen because the two reference detectors there look complementary (an n-gram classifier and a Binoculars-style score) but nobody had combined them. **Preliminary, stylised: RAID plain-prompt text only, three chat models, 1,200 training and 720 held-out texts, one split.** Produced with AI assistance (Claude). No LLM was run: the container cannot reach Hugging Face, so this reuses the stored suite and the stored Qwen2.5-0.5B scores from `mimic-contexts`.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/mimic-stack/

**Result.** The two detectors' scores are uncorrelated within each class (correlation −0.02 for human, 0.02 for machine text), yet combining them barely helps. On the held-out families (poetry, reviews, wiki) the n-gram detector alone gets AUROC 0.926. Averaging its z-score with the Binoculars-style score gets 0.935; the gain is +0.009 with a paired 95% bootstrap interval of −0.010 to +0.026, so it is **not distinguishable from zero**. Fitted logistic-regression stacks do no better (−0.003 and −0.019). The gain is uneven: it is largest on wiki (0.892 to 0.935) and on llama-chat (0.941 to 0.978), and it hurts on poetry (0.946 to 0.901) and mpt-chat (0.955 to 0.877), where the zero-shot score is weak (0.65).

All numbers are in `results.txt` and `results.json`; `experiments/figure.svg` plots the held-out AUROCs.

```bash
cd research/mimic-stack
pip install numpy scipy scikit-learn
python3 -m unittest discover -s tests -v      # 4 tests
python3 stack.py && python3 figure.py         # about 1 minute
```

## Motivation

A detector that is robust across contexts is the track's defence. If an imitator prompt is tuned against one signal, a detector that reads two independent signals should be harder to fool, so it is worth knowing how much two cheap signals add before spending model calls on a prompted detector.

## Builds on

`research/mimic-contexts` (suite, n-gram detector, stored zero-shot scores). Dugan et al. (2024), RAID, for the text. Hans et al. (2024), Binoculars, for the score (a small-model adaptation, not their models). Lopez-Paz and Oquab (2017) for reading a classifier as a two-sample test. No lab's work is built on, and no lab is affiliated with or endorses this project.

## Method

Only the zero-shot subset of `mimic-contexts` has zero-shot scores (120 texts per family and label, first 64 tokens): 1,200 rows from the five training families and 720 from the three held-out ones. The stacker needs n-gram scores that are not in-sample, so each training row is scored by an n-gram model fit on the other four training families (leave-one-family-out, over the whole suite's texts); held-out rows are scored by the model fit on all five training families. Features are the n-gram score, minus the observer log-perplexity and minus the perplexity/cross-perplexity ratio (signed so that higher means more machine-like, since machine text has lower perplexity; the sign is fixed by this prior and was not chosen on held-out data. An earlier run with the unsigned values gave AUROC well below 0.5 and is why the sign is documented). Features are z-scored on the training rows. Compared: each score alone, the sum of the z-scores of the n-gram and ratio scores, and logistic regressions on two or three features. Intervals are percentile bootstraps over rows (300 resamples; 500 for the paired differences).

## Limitations

The zero-shot rows are a 1,920-text subset with wide intervals; a stack gain of a few hundredths could not be detected. Three chat models, with family and model partly confounded (see `mimic-contexts`). The stacker is fit on 1,200 rows and five families, which may be too few to learn weights that transfer; the plain average, which has no fitted weights, did best. Qwen2.5-0.5B is a small, weak scorer, and a stronger observer pair could make the zero-shot signal worth combining. None of this measures an optimised imitator, which will be the real test.

## Next steps

Repeat with a stronger observer pair and a longer window where a model can be downloaded; add the prompted detector of `mimic-loop` as a third signal; check whether an imitator prompt that evades the n-gram detector also moves the zero-shot score.

## Owner steps

None.

## Outside dependencies

`mimic-contexts` data and stored scores (RAID, Qwen2.5-0.5B), NumPy, SciPy, scikit-learn. Produced with AI assistance (Claude). No LLM proposer was used and no text was written by the session agent.

MIT.
