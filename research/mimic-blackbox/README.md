# How many detector queries does an imitator need to evade a human-vs-machine text detector it cannot read?

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/mimic-blackbox/

Track 11 (adversarial human imitation), the black-box follow-up that `mimic-whitebox` listed under "Next steps". It is a new question, not a new seed: the white-box result assumed the imitator reads the detector's weights, which a deployed detector does not expose. **Preliminary, stylised: a scripted attack on a linear detector, one seed, held-out poetry, reviews and wiki only, and the edited text is not checked for fluency or meaning.** Produced with AI assistance (Claude). No LLM was run and no text was written by the session agent.

**Result.** Against the same word 1-2 gram detector (held-out AUROC 0.948), an imitator that only sees the score of each text it submits can nearly match the white-box attack. For each of its texts it deletes one candidate word type at a time, reads the score drop, then deletes the k types with the largest drop. With k=20: 25 queries per text give AUROC 0.873, 50 give 0.722, about 95 give 0.520 (white-box ceiling 0.487, chance 0.5) and about 126 (every word type in the text) give 0.454. With k=10: 100 queries give 0.732, matching the white-box 0.738. Blind deletion of k random types (0 queries) does nothing (0.945 and 0.948). So evasion costs roughly 100 detector calls per text, which makes a rate limit or a per-account query cap a real defence, and a hidden-weights detector is not safe by itself. Numbers: `results.txt`, `results.json`; plot: `experiments/figure.svg`.

```bash
cd research/mimic-blackbox
pip install numpy scipy scikit-learn
python3 -m unittest discover -s tests -v      # 5 tests
python3 blackbox.py && python3 figure.py      # about 5 minutes
```

## Motivation

`mimic-whitebox` showed ~10-20 edited word types evade a linear detector whose weights are visible. Real detectors expose at most a score, so the budget that matters is queries. It also sets the bar an optimised imitator (`mimic-loop`) must beat.

## Builds on

`research/mimic-whitebox` (detector and white-box attack, imported unchanged) and `research/mimic-contexts` (suite and train/held-out split). Dugan et al. (2024), RAID, for the text. Score-based black-box attacks on text classifiers, for example Gao et al. (2018), DeepWordBug, and Jin et al. (2020), TextFooler, rank words by the score change when each is removed; this uses that idea with a plain deletion. No lab's work is built on, and no lab is affiliated with or endorses this project.

## Method

`blackbox.py` fits the `mimic-whitebox` detector on the five training families. For each held-out machine text it draws Q word types at random (all of them if the text has fewer), queries the detector's score on the text with each one deleted, and deletes the k with the largest positive drop. The attacker calls only `score`. Q is in 0, 10, 25, 50, 100, 200 and k in 10, 20; Q=0 deletes k random types. Human texts are untouched. Reported queries are the mean actually used (one extra query for the unedited score), which saturates at about 126 because many texts have fewer than 200 word types.

## Limitations

Edited text is not read for meaning, and 20 deleted types will often be ungrammatical, so a human reader or perplexity detector would notice. Each deletion is scored alone, so interactions between words are ignored. The detector is linear, so single-deletion drops are close to exact; a nonlinear detector may need more queries. The detector is not retrained against the attack here (`mimic-whitebox` showed a refit recovers AUROC to 0.99+). One seed, one detector family, three RAID chat models, 900 machine texts, no confidence intervals.

## Next steps

Run the same budget against the zero-shot score where network access allows; a retrained-detector round with the black-box attack; let a local instruct model choose its own edits in `mimic-loop` under a fluency constraint and the same query budget.

## Owner steps

None.

## Outside dependencies

`mimic-contexts` suite (RAID text), `mimic-whitebox` detector, NumPy, SciPy, scikit-learn. MIT.
