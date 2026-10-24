# Does refitting a human-vs-machine text detector on attacked text stop a black-box evader?

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/mimic-retrain/

Track 11 (adversarial human imitation), the "retrained-detector round with the black-box attack" that `mimic-blackbox` listed under "Next steps". **Preliminary, stylised: a scripted attack on a linear detector, one seed, held-out poetry, reviews and wiki only, and the edited text is not checked for fluency or meaning.** Produced with AI assistance (Claude). No LLM was run and no text was written by the session agent.

**Result.** Against the word 1-2 gram detector of `mimic-whitebox` (held-out AUROC 0.948), a black-box attacker with 50 score queries per text (deleting the 20 best word types) drops AUROC to 0.719. Each round the detector is refit on the clean training texts plus every attacked training machine text so far, and the attacker attacks the new detector afresh with the same budget. The game settles after one refit instead of cycling or recovering: the fresh attack leaves AUROC at 0.809, 0.798, 0.805 and 0.809 in rounds 1 to 4, and the cost is paid on clean text, where AUROC falls from 0.948 to about 0.90. Edits made against the round-0 detector transfer to the refit ones at 0.85. So adversarial refitting recovers 0.09 of the 0.23 AUROC the attack removed and no more here, and the attacker's budget (50 queries) is unchanged. Numbers: `results.txt`, `results.json`; plot: `experiments/figure.svg`.

```bash
cd research/mimic-retrain
pip install numpy scipy scikit-learn
python3 -m unittest discover -s tests -v      # 4 tests
python3 retrain.py && python3 experiments/figure.py      # about 5 minutes
```

## Motivation

`mimic-whitebox` found that a refit recovers AUROC to 0.99+ against a fixed attack, and `mimic-blackbox` priced evasion at about 100 queries. A defender who retrains faces an attacker who re-attacks, so the question is where the arms race ends and what it costs the defender on clean text.

## Builds on

`research/mimic-blackbox` (the attack, imported unchanged), `research/mimic-whitebox` (detector) and `research/mimic-contexts` (suite and train/held-out split). Dugan et al. (2024), RAID, for the text. Adversarial training of detectors: Hu, Chen and Ho (2023), RADAR, updates weights of a paraphraser and detector against each other; this uses a deletion attacker and a refit linear detector. No lab's work is built on, and no lab is affiliated with or endorses this project.

## Method

`retrain.py` fits the detector on the five training families (3,000 texts). Round r: the attacker (Q=50 random candidate types scored by deletion, delete the k=20 largest drops; about 51 queries including the unedited score) edits every held-out machine text (900 of 1,800) against D_r, and AUROC is measured on attacked, clean, and round-0-edited held-out sets. Then the attacker edits the training machine texts against D_r, those edits join the pool (earlier rounds' edits stay), and D_{r+1} is fit on the pool. Four refits.

## Limitations

One seed, one linear detector family, three RAID chat models, no confidence intervals; the round-to-round differences of about 0.01 should not be read as a trend. The attacker's random candidate draw differs per round. Edited text is ungrammatical and a fluency or perplexity detector would catch it; the detector here is never given that signal. A nonlinear detector or an attacker that adapts its budget could behave differently. Simulated results say nothing about deployed detectors.

## Next steps

Give the attacker a fluency constraint and let a local instruct model choose edits in `mimic-loop`; add a perplexity feature to the refit detector; run the arms race with a nonlinear detector.

## Owner steps

None.

## Outside dependencies

`mimic-contexts` suite (RAID text), `mimic-whitebox` detector, `mimic-blackbox` attack, NumPy, SciPy, scikit-learn. MIT.
