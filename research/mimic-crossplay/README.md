# Does the imitation game settle or cycle? A payoff matrix over the `mimic-loop` prompts

Milestone 3 (`mimic-crossplay`) of track 11, adversarial human imitation. **Stylised toy study: one seed of the loop, one 0.5B model on both sides, a detector that is worse than chance to begin with, 48 titles per cell. Read the numbers as a first measurement of how `mimic-loop`'s prompts relate to each other, not as a result about LLM detection.** Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/mimic-crossplay/

`mimic-loop` printed, for each of its eight runs, only the *latest* imitator against the *latest* detector. This project scores every imitator prompt any run produced against every detector prompt any run produced (same frozen Qwen2.5-0.5B-Instruct, Apache-2.0, same paired A/B detector protocol), per family. That gives a full payoff matrix per family. It is a zero-sum game: the detector's payoff is its paired accuracy, so the imitator wants low numbers and 0.50 is chance. Then it asks three things: is there progress that cycles, does a prompt that wins against its latest opponent only fit that opponent, and what is the game's value?

Numbers are in `results.txt` (every matrix, mixture and per-run submatrix) and `results.json`; raw per-title margins and all generated texts (labelled generated, never posted anywhere) are in `results/*_matrix.json`; the heat maps are `results/figure.svg`.

## Results (what the code produced)

Prompts are numbered `I0..` (imitator) and `D0..` (detector) in `results.txt`, with the (proposer, round) each came from. Titles: the 24 test titles of `mimic-loop` plus 24 fresh titles of the same family that no loop step touched; the generation seeds are those `mimic-loop` used, and the regenerated texts equal its stored samples in 16 of 16 snapshots per family.

| family | imitators x detectors | Nash value (detector accuracy) | 95% title-bootstrap | largest single cell | equilibrium |
|---|---|---|---|---|---|
| reddit | 10 x 7 | 0.396 | 0.283 to 0.475 | 0.56 | pure: detector D6 (OPRO-style, round 1-3 prompt); imitators I0 (the plain prompt) and I6 (GrIPS-style) tie |
| reviews | 9 x 10 | 0.292 | 0.167 to 0.339 | 0.44 | pure: detector D2 (random search, round 2-3); imitator I0 (the plain prompt) |

- **The game "settles" only because the detector never gets above chance.** In both families the best pure strategies meet (max-min equals min-max), so there is a pure-strategy equilibrium and the Nash value is below 0.5: no detector prompt in either run guarantees even chance accuracy against the worst imitator prompt. No cell of either matrix exceeds 0.56. This says the 0.5B detector is weak, which `mimic-loop` already found, not that the imitators are good.
- **On reviews the unadapted plain imitator prompt is the equilibrium imitator.** Every evolved imitator prompt does at least as badly (detector accuracy at least as high) against the best detector prompt as the plain one does. Imitator-side search added nothing measurable on reviews against this detector pool.
- **Length drives the payoff, more on reddit.** The Spearman correlation across imitator prompts between mean generated length and the mean detector accuracy is 0.76 on reddit (ten prompts) and 0.30 on reviews (nine). The short plain prompt (about 55 characters against about 396 for human references) is the equilibrium imitator on reddit because the weak detector tends to pick the shorter text as the human one. That is the degenerate win `mimic-loop`'s validity check exists to flag. Restricted to the four reddit imitators that pass it (length at least 40% of reference, copy rate at most 10%), the value rises to 0.435 and the game is mixed (max-min 0.417, min-max 0.438). On reviews every imitator passes the check, so nothing changes.
- **Cycles: none measured at a noise margin, a few without one.** A *reversal* is a later imitator prompt that does better than an earlier one against a newer detector, and worse against an older one (within one run, all 36 time-ordered quadruples of a 4 x 4 submatrix). With a margin of 0.15 (about 1.5 standard errors of a difference of two 48-title accuracies near 0.5) there are 0 reversals in all eight runs. With no margin there are 9 (reddit random search), 3 (reddit OPRO-style) and 10 (reviews OPRO-style), none in the other five; given the noise, none of those can be told from sampling noise, and several come from repeated prompts: one random-search detector prompt is reused for three rounds.
- **Overfitting to the latest opponent is small and not established.** For each run's final imitator, accuracy against its own last detector against the mean over all detector prompts: reddit random 0.31/0.28, GA 0.46/0.39, GrIPS 0.25/0.28, LLM 0.42/0.38; reviews random 0.40/0.26, GA 0.21/0.28, GrIPS 0.19/0.22, LLM 0.17/0.19. The gaps are at most 0.14 and go both ways (a higher number against its own detector means the imitator is *not* specialised to it). The largest, reviews random search, is the detector that was adapted to the imitator doing better against it than against others. No run shows an imitator that beats its latest opponent but loses to earlier ones.
- **The bootstrap interval reflects only which titles were drawn.** One loop seed, one generation seed per prompt, so it excludes the variance across loop runs, which `mimic-loop` found to be large.

## What this does not answer

The milestone also asks who wins when the two sides' model sizes differ. That needs a larger model as detector (a Qwen2.5-1.5B pass over the saved texts, `larger_detector.py`, is written but was not run: the 0.5B pass alone took 2.4 and 3.5 hours on 2 CPUs). The question is open here, and there is no claim about it.

## Reproduce

```bash
cd research/mimic-crossplay
python3 -m unittest discover -s tests -v          # 12 tests, no model needed
pip install torch transformers scikit-learn numpy scipy
python3 crossplay.py --family reddit --threads 2   # about 2.4 hours on 2 CPUs; writes results/reddit_matrix.json
python3 crossplay.py --family reviews --threads 2  # about 3.5 hours; run both in parallel
python3 report.py                                  # rebuilds results.txt, results.json, results/figure.svg
```

It reads `../mimic-loop/results/*.json` (prompts only) and `../mimic-contexts/data/suite.jsonl.gz`.

## Method

`crossplay.py` collects the unique imitator prompts (text plus few-shot indices) and detector prompts of a family from the eight `mimic-loop` runs, regenerates each imitator's texts for the 48 titles with the loop's generation seed, and scores each (imitator, detector) cell with the loop's paired margin (both orders of human and imitator text, logit of "A" minus "B"; position bias cancels), recording the margin per title. The payoff of a cell is the share of titles where the margin is positive. `analysis.py` solves the zero-sum game by linear programming (the same meta-solver PSRO uses, Lanctot et al. 2017), checks that no pure deviation helps either side at the returned mixture, and counts reversals. Equilibrium mixtures need not be unique (on reddit two imitator prompts tie). The bootstrap resamples titles 300 times and re-solves the game.

## Builds on

`mimic-loop` and `mimic-contexts` (this repository). Lanctot et al. (2017), "A unified game-theoretic approach to multiagent reinforcement learning", NeurIPS, for solving the empirical game; Balduzzi et al. (2019), "Open-ended learning in symmetric zero-sum games", ICML, for the question of cycles in non-transitive games. Dugan et al. (2024), RAID, through `mimic-contexts`. No lab's work is built on and none is affiliated with or endorses this project.

## Limitations

One loop seed; 48 titles per cell; 0.5B model on both sides and as the only detector model; a detector that is below chance against most imitators; the game is over only the 7 to 10 prompts these runs happened to produce, so an equilibrium here says nothing about prompts nobody wrote; the payoff is accuracy over paired texts truncated to 400 characters; the text-length confound is measured (correlation) but not removed by design; two families; no model-size comparison. Simulated texts only; nothing posted anywhere, and all generated text is in `results/*_matrix.json` labelled as generated.

## Next steps

Control length by design (length-matched pairs) and rerun; a larger detector (`larger_detector.py`) to answer the model-size question; more loop seeds so the prompt pool is richer; then `mimic-anycontext`.

## Owner steps

None.

## Outside dependencies

Qwen2.5-0.5B-Instruct weights (Apache-2.0) from Hugging Face, and `mimic-contexts`' suite, which comes from RAID (MIT). PyTorch, transformers, NumPy and SciPy.
