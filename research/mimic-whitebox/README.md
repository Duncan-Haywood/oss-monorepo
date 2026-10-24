# How many words must an imitator change to evade a word n-gram human-vs-machine detector that it can read?

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/mimic-whitebox/

Track 11 (adversarial human imitation), a no-model slice between `mimic-evade` (blind surface edits) and `mimic-loop`. It was chosen because `mimic-evade` showed blind edits barely move the detector; the question left open is how cheap evasion becomes once the imitator knows the weights. **Preliminary, stylised: a scripted white-box attack on a linear detector, one seed, held-out poetry, reviews and wiki only, and the edited text is not checked for fluency or meaning.** Produced with AI assistance (Claude). No LLM was run and no text was written by the session agent.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/mimic-whitebox/

**Result.** The detector here (TF-IDF word 1-2 gram logistic regression, fit on the five training families) has held-out AUROC 0.948. If the imitator deletes the *k* word types that add most to the machine score of each of its texts: k=5 gives 0.852, k=10 gives 0.738, k=20 gives 0.487 (chance) and k=40 gives 0.150 (the detector is inverted). Swapping those words for one human-ward filler word is faster: k=10 gives 0.625 and k=20 gives 0.317. A defender who refits on training machine text attacked the same way wins it all back and more: adaptive AUROC stays between 0.94 and 1.00 at every k, at 0.994 or higher once k reaches 20. So a visible-weights linear detector is evaded with ~10-20 edited word types per text, and it is only safe if the defender retrains against that exact attack. Numbers: `results.txt`, `results.json`; plot: `experiments/figure.svg`.

```bash
cd research/mimic-whitebox
pip install numpy scipy scikit-learn
python3 -m unittest discover -s tests -v      # 5 tests
python3 whitebox.py && python3 figure.py      # about 1.5 minutes
```

## Motivation

`mimic-evade` applied blind rules and the best one cost the detector 0.05 AUROC. An adversary who can query or read a deployed detector does far better, and the budget needed sets how much an optimised imitator (`mimic-loop`) must gain over a plain rule.

## Builds on

`research/mimic-contexts` (suite, train/held-out split, imported unchanged) and `research/mimic-evade` (edits applied to the machine side only, adaptive refit). Dugan et al. (2024), RAID, for the text. Attack idea: greedy feature deletion against linear text classifiers, as in the adversarial-text literature (for example Li et al. 2019, TextBugger). No lab's work is built on, and no lab is affiliated with or endorses this project.

## Method

`whitebox.py` fits the word-only variant of the `mimic-contexts` detector (no character grams, so weights map to words; its baseline 0.948 differs from the 0.927 of the full detector). For each held-out machine text it ranks the word types present by weight times tf-idf value (positive = machine-ward) and edits the top k, either deleting all occurrences (*delete*) or replacing them with the single most human-ward unigram, `is` (*swap*). Human texts are untouched. The adaptive detector is refit on training texts whose machine side was attacked the same way against the original detector. k is in 0, 1, 2, 5, 10, 20, 40.

## Limitations

Edited text is not read for meaning: deleting or swapping 20 word types makes some text ungrammatical, and a human reader or a perplexity detector would notice (`mimic-contexts` has a zero-shot score, but the model download is blocked in this environment, so the edits were not run against it). The attack uses unigram contributions only and no query budget limit, so it is stronger than a black-box imitator and weaker than a per-text optimum. AUROC below 0.5 means the ordering flipped, not that the detector is "worse than chance" to a defender who knows. One seed, one detector family, three RAID chat models, 900 machine texts. The adaptive result trains on one attack and is not a guarantee against a different one.

## Next steps

Black-box version with a query budget; run the same edits against the zero-shot score where network access allows; let a local instruct model choose its own edits in `mimic-loop` under a fluency constraint.

## Owner steps

None.

## Outside dependencies

`mimic-contexts` suite (RAID text), NumPy, SciPy, scikit-learn. MIT.
