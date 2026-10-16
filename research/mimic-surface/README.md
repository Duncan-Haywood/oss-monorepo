# How much text does a prompt-free detector need, and what does it key on?

Track 11 (adversarial human imitation), a by-product of `mimic-contexts` and `mimic-crossplay`. **Preliminary, stylised: plain-prompt RAID text only, one detector type, one train/held-out split.** Produced with AI assistance (Claude). No LLM was run; the container cannot reach Hugging Face, so this uses only the stored suite.

`mimic-crossplay` found that text length drives the imitation game's payoff, and `mimic-contexts` showed length alone is at chance for held-out families. Both leave open how much *text* a detector needs and *which surface features* carry its signal. A game whose texts are short (the loop truncates to 400 characters) or whose imitator controls formatting is playing against a weaker detector than the headline AUROC 0.927. This project measures that, so later milestones can read their numbers against a known yardstick.

Numbers come from `results.txt` and `results.json`; the figure is `experiments/figure.svg`.

## Results (what the code produced)

Detector: `mimic-contexts`' TF-IDF character 1-4 and word 1-2 gram logistic regression, fit on five families (abstracts, books, news, recipes, reddit) and scored on poetry, reviews and wiki, never seen in fitting. AUROC with 95% bootstrap interval over texts (200 resamples).

| characters kept | fit and scored on the prefix | fit on full text, scored on the prefix |
|---|---|---|
| 50 | 0.653 (0.625 to 0.674) | 0.580 (0.551 to 0.604) |
| 100 | 0.753 (0.727 to 0.772) | 0.700 (0.674 to 0.723) |
| 200 | 0.780 (0.757 to 0.800) | 0.757 (0.735 to 0.776) |
| 400 | 0.838 (0.819 to 0.855) | 0.809 (0.786 to 0.827) |
| 800 | 0.893 (0.877 to 0.908) | 0.875 (0.860 to 0.892) |
| 1500 | 0.927 (0.916 to 0.940) | 0.927 (0.916 to 0.940) |

- **Length of text matters a lot.** At the 400 characters `mimic-loop` and `mimic-crossplay` show the detector, the same detector would reach 0.84, not 0.93, and at 100 characters 0.75. A detector's headline number belongs to a text length.
- **Re-fitting on short text recovers only a little.** The matched column beats the fit-on-full-text column by 0.02 to 0.07 at lengths up to 800, so most of the loss is information that is not there, not a mismatch.
- **Wiki is the slowest to separate.** Matched AUROC at 400 characters: poetry 0.88, reviews 0.87, wiki 0.77; at 1500: 0.95, 0.98, 0.89.
- **Formatting is not what it reads.** Lowercasing, stripping punctuation and flattening whitespace change held-out AUROC by at most 0.004 (0.927 to 0.930). Two of those three views are no-ops by construction: scikit-learn's vectoriser already lowercases and splits on whitespace, so the rows `lowercase` and `whitespace flattened` equal the raw row and say nothing beyond that. Stripping punctuation is a real change, and it did not hurt (0.930).
- **Word order is a small part.** Shuffling the words inside each text, which keeps every word and character n-gram within words but destroys word bigrams across positions, costs 0.014 (0.913 against 0.927 matched; 0.914 fit on raw). The detector is mostly reading vocabulary, not syntax. Each held-out family loses 0.01.

What this does not show: that an imitator could not defeat this detector (RAID's plain chat generations are the easy end), or anything about neural or prompted detectors, whose dependence on length may differ.

## Reproduce

```bash
cd research/mimic-surface
pip install numpy scipy scikit-learn
python3 -m unittest discover -s tests -v   # 4 tests, a few seconds, no suite needed
python3 surface.py                         # about 5 minutes on 2 CPUs; writes results.json, results.txt
python3 figure.py                          # writes experiments/figure.svg
```

It reads `../mimic-contexts/data/suite.jsonl.gz`.

## Method

Each view is a function of the text. The "matched" protocol refits the detector on the view of the training families and scores the view of the held-out ones. The "clean-fit" protocol keeps the detector fit on raw full-length text and scores views of the held-out texts. The shuffle view seeds its permutation from the text, so it is deterministic. The bootstrap resamples held-out texts; it excludes variance from the choice of split, which `mimic-contexts` showed to be real (leave-one-family-out AUROC 0.87 to 0.99).

## Builds on

`mimic-contexts` (this repository) and, through it, Dugan et al. (2024), RAID (MIT). The question of how much text detectors need follows Sadasivan et al. (2025) on limits of detection and Hans et al. (2024), Binoculars, which report AUROC by text length. No lab's work is built on and none is affiliated with or endorses this project.

## Limitations

One split (five families fit, three held out); texts capped at 1,500 characters, so the table cannot say whether AUROC keeps rising; three RAID chat models; the n-gram detector only; perturbations are mechanical, not what an optimised imitator would do; the shuffle view still leaves within-word character n-grams. Simulated text only; nothing is posted anywhere.

## Next steps

Repeat on the zero-shot Binoculars-style score and on a prompted detector once a model is reachable; add imitator-controlled perturbations (paraphrase) in `mimic-transfer`; extend to text longer than 1,500 characters.

## Owner steps

None.

## Outside dependencies

The `mimic-contexts` suite (from RAID, MIT); NumPy, SciPy, scikit-learn.

MIT.
