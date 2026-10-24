# Which features let a human-vs-machine text detector carry over to a context family it never saw? Words, characters, function words, formatting or length

Track 11, adversarial human imitation. Why this one: the track's earlier detector projects (`mimic-anycontext-detect`, `mimic-evade`, `mimic-whitebox`) all use one n-gram detector, and the chain was drifting into variants of it. This asks a different question of the same data: **what is the detector actually reading when it transfers?** It also removes a limitation the earlier project listed (the vectoriser was fitted on all text, test items included) and adds bootstrap intervals. No language model is used (Hugging Face is blocked in the container), so nothing here tests an imitator; it measures the detector side only. **Stylised and preliminary:** plain-prompt machine text from three RAID chat models, eight families, one classifier (logistic regression), one run.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/mimic-featuretransfer/

## Results (`results.txt`, `results.json`)

Leave-one-family-out AUROC on the held-out family (human against machine, 300 + 300 items), with a 95% bootstrap interval over test items. Every vectoriser and scaler is fitted on the other seven families only.

| family | char | word | func | format | length | char+word | in-family char+word |
|---|---|---|---|---|---|---|---|
| abstracts | 0.864 [0.83, 0.89] | 0.912 [0.89, 0.93] | 0.786 [0.75, 0.83] | 0.439 [0.39, 0.49] | 0.444 [0.40, 0.49] | 0.896 [0.87, 0.92] | 0.995 |
| books | 0.989 [0.98, 0.99] | 0.990 [0.98, 1.00] | 0.892 [0.86, 0.92] | 0.753 [0.71, 0.79] | 0.414 [0.37, 0.46] | 0.993 [0.99, 1.00] | 1.000 |
| news | 0.950 [0.93, 0.96] | 0.959 [0.94, 0.97] | 0.845 [0.81, 0.88] | 0.853 [0.82, 0.88] | 0.524 [0.49, 0.56] | 0.969 [0.96, 0.98] | 0.993 |
| recipes | 0.855 [0.83, 0.88] | 0.807 [0.77, 0.84] | 0.627 [0.58, 0.67] | 0.397 [0.35, 0.44] | 0.696 [0.65, 0.74] | 0.867 [0.84, 0.89] | 1.000 |
| reddit | 0.939 [0.92, 0.96] | 0.932 [0.91, 0.95] | 0.811 [0.78, 0.84] | 0.801 [0.76, 0.84] | 0.585 [0.53, 0.64] | 0.953 [0.94, 0.97] | 0.980 |
| poetry | 0.904 [0.88, 0.93] | 0.958 [0.94, 0.97] | 0.747 [0.71, 0.79] | 0.789 [0.76, 0.83] | 0.885 [0.86, 0.91] | 0.946 [0.93, 0.96] | 0.994 |
| reviews | 0.966 [0.95, 0.98] | 0.986 [0.98, 0.99] | 0.860 [0.83, 0.89] | 0.717 [0.67, 0.76] | 0.518 [0.48, 0.56] | 0.984 [0.98, 0.99] | 0.998 |
| wiki | 0.859 [0.83, 0.89] | 0.908 [0.89, 0.93] | 0.812 [0.78, 0.84] | 0.751 [0.71, 0.79] | 0.155 [0.12, 0.19] | 0.895 [0.87, 0.92] | 0.937 |
| **mean** | **0.916** | **0.931** | **0.797** | **0.687** | **0.528** | **0.938** | **0.987** |

- **Content words carry most of the transfer.** Words alone (0.931) beat characters alone (0.916), and combining them (0.938) is best. Function words alone, with no content words at all, still reach 0.797 on average and 0.89 on books: much of the machine/human difference is in how common small words are used, which is not topic-bound.
- **Surface formatting and length do not transfer.** A fourteen-number summary (length, line breaks, punctuation, capital and digit rates) averages 0.687, below chance on abstracts and recipes (0.44 and 0.40, intervals under 0.5), so the direction it learns elsewhere reverses there. Length alone averages 0.528 but ranges from 0.155 on wiki to 0.885 on poetry: it is a strong cue inside a family and flips sign between families, so a universal detector cannot lean on it. This agrees with the length control in `mimic-anycontext-detect`.
- **The gap to an in-family detector is 0.05 and is not a feature artefact.** Char+word held out gives 0.938; the earlier project, which fitted the vectoriser on all text, reported 0.934 for the same recipe. Fitting on training families only does not change the picture, so that limitation did not bias the headline.
- **Which feature set wins depends on the family.** Words beat characters on abstracts and poetry (+0.05 each; intervals just touch or are apart) and by 0.02 on reviews; characters beat words on recipes (0.855 against 0.807, intervals overlap). Differences under about 0.03 are within the test-set noise. Char+word is within 0.02 of the best single set everywhere but is not always best (recipes 0.867 against 0.855 for characters; reddit 0.953 against 0.939).

## What this does and does not say

It localises where a prompt-free detector's transfer comes from, which is a yardstick for an LLM detector or for an imitator that tries to erase it: an imitator that matches function-word rates and drops chat formatting still leaves content-word cues. It does **not** show that a prompt-optimised detector behaves the same, nor anything about adversarial text (`mimic-evade` and `mimic-whitebox` cover scripted edits).

## Reproduce

```bash
cd research/mimic-featuretransfer
python3 -m pip install numpy scipy scikit-learn
python3 -m unittest discover -s tests -v      # 5 tests, one skippable data check
python3 featuretransfer.py                    # about 5 minutes on 4 CPUs; writes results.json, results.txt
```

It reads `../mimic-contexts/data/suite.jsonl.gz`.

## Method

`featuretransfer.py`: for each family, fit on the other seven (4,200 items) and score the held-out 600. Feature sets: `char` TF-IDF char_wb 1-4 grams; `word` TF-IDF word 1-2 grams; `func` relative frequencies of scikit-learn's 318 English stop words, standardised; `format` 14 hand-made surface statistics; `length` log character count; `char+word` both TF-IDF blocks. Logistic regression (C = 3 for n-gram sets, 1 otherwise). Intervals: 500 bootstrap resamples of the held-out items (the model is fitted once, so this is test-set noise only, not training-set or seed variance). In-family reference: two-fold cross-fit inside the family with the char+word recipe (300 items per fit, so a small-data fit).

## Builds on

`mimic-contexts` (this repository: data and the n-gram detector recipe) and `mimic-anycontext-detect`; Dugan et al. (2024), "RAID: A Shared Benchmark for Robust Evaluation of Machine-Generated Text Detectors", ACL (MIT licence). No lab's work is built on and none is affiliated with or endorses this project.

## Limitations

One classifier; stop-word list is scikit-learn's, not a stylometry-specific one; the `format` set is ad hoc and its failure may reflect those 14 features, not formatting in general; intervals cover test noise only (one train/test partition per family); the families, not individual items, are the unit of generalisation and there are eight; plain-prompt, non-adversarial machine text from three generators; the in-family reference uses half the data. No LLM was run.

## Next steps

Pair this with the prompted detector once a model is downloadable (`mimic-anycontext`). A cheaper step: leave-one-generator-out per feature set, to see whether function-word cues are generator-specific.

## Owner steps

None. (The model-based `mimic-anycontext` run needs Hugging Face access.)

## Outside dependencies

The `mimic-contexts` suite (from RAID); NumPy, SciPy, scikit-learn.
