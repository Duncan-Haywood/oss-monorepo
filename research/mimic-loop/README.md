# Can prompt search alone make a frozen 0.5B model look human to a prompted 0.5B detector? A small, noisy first run of the imitation game

Milestone 2 (`mimic-loop`) of track 11, adversarial human imitation. **Stylised toy run, one seed, 24 test pairs per point, and a weak detector: read the numbers as a working harness and a first look, not as a result about LLM detection.** Produced with AI assistance (Claude).

Two copies of one frozen model, Qwen2.5-0.5B-Instruct (Apache-2.0), play. The *imitator* writes a text for a context (a title in a family); the *detector* sees a human text and an imitator text for the same title, in both orders, and says which one a person wrote. Only each side's prompt changes. Rounds alternate: first the detector's prompt is optimised against the imitator's current texts, then the imitator's prompt against the new detector. Four proposers get the same budget (4 candidate evaluations per side per round, 3 rounds), on two families from `mimic-contexts`' suite (reddit posts, film reviews).

Numbers are in `results.txt` (all rounds, prompts and samples) and `results/*.json`; the figure is `results/figure.svg`.

## Results (what the code produced)

Detector paired accuracy on 24 held-out test titles (50% = chance; lower means a better imitator). `cur` is the round's evolved detector, `plain` the unadapted round-0 detector.

| family | proposer | round 0 | final cur | final plain | mean cur, rounds 1-3 |
|---|---|---|---|---|---|
| reddit | random | 0.12 | 0.38 | 0.21 | 0.38 |
| reddit | GA | 0.12 | 0.58 | 0.25 | 0.42 |
| reddit | GrIPS-style | 0.12 | 0.25 | 0.21 | 0.22 |
| reddit | LLM (OPRO-style) | 0.12 | 0.38 | 0.42 | 0.44 |
| reviews | random | 0.12 | 0.38 | 0.17 | 0.32 |
| reviews | GA | 0.12 | 0.25 | 0.25 | 0.15 |
| reviews | GrIPS-style | 0.12 | 0.25 | 0.25 | 0.18 |
| reviews | LLM (OPRO-style) | 0.12 | 0.12 | 0.12 | 0.22 |

- **The starting detector is worse than chance.** With plain prompts it picks the *imitator's* text as the human one in 88% of pairs (paired accuracy 0.12; its single-text AUROC is 0.76 on reddit but 0.49 on reviews, so on reviews it is no better than chance). A 0.5B model is a weak judge, and "the imitator wins" here mostly means "the detector moved from below chance toward chance". No cell reaches clearly above 0.5 for the detector except reddit/GA round 3 (0.58, interval 0.38 to 0.79).
- **Proposers cannot be ranked from this run.** Each cell has 24 pairs, so 95% bootstrap intervals are about ±0.2 wide (see `results.txt`), one seed per cell, and the proposer order flips between families. No difference in the table is established.
- **Length is a large confound.** Under a plain prompt the reddit imitator writes ~65 characters against ~396 for the human references. Where the imitator's texts grew (reddit GA 65 to 228, reddit LLM 65 to 343, reviews LLM 176 to 332), the detector's paired accuracy rose; where they stayed short (reddit random and GrIPS, ~45-68) the imitator never became "valid" under the length check (mean length at least 40% of reference, 4-gram copy rate at most 10%), and since every candidate failed it, the validity penalty gave the search no signal. Single-text AUROC drops below 0.5 in several runs (the detector rates imitator texts as more human than humans), which fits length and polish being what it keys on, though this was not isolated by an experiment.
- **Texts still respond to the title and do not copy.** A fixed judge prompt says yes for 75% to 100% of test texts; the 4-gram copy rate against human references stays under 0.01. Distinct-2 of generated text is 0.86 to 0.99 against 0.88 and 0.90 for human text, so no diversity collapse is visible at this size.
- **The LLM proposer here is the same 0.5B model**, and its free-text prompts were sometimes incoherent (e.g. a detector prompt beginning "The task has been resolved!"). It is a weak local stand-in for OPRO/TextGrad, not a test of them. No closed model was used.

## Reproduce

```bash
cd research/mimic-loop
python3 -m unittest discover -s tests -v        # 17 tests, no model needed
pip install torch transformers scikit-learn numpy scipy
./run_all.sh 0      # about 3.5 hours on 4 CPUs; writes results/*.json (log_a.txt, log_b.txt)
python3 report.py   # rebuilds results.txt and results/figure.svg
```

## Method

`core.py` holds contexts, fragment banks, metrics and the four proposers; `lm.py` the model; `game.py` the scoring; `run.py` the loop. Contexts are `mimic-contexts`' human items of one family at least 400 characters long, cut to 400 characters (generated texts are cut the same way); 12 optimisation titles, 24 test titles and 6 few-shot examples are disjoint. Paired score: the logit of "A" minus that of "B" in both orders; the margin is the difference, which cancels position bias, and positive means the human text was picked. The optimisation fitness mixes accuracy with a sigmoid term so 12 pairs still rank candidates. Proposers: random subsets of a fixed fragment bank (12 imitator, 10 detector fragments; the imitator may also add up to two human few-shot examples from the pool); a 4-individual GA over the bitmasks; GrIPS-style (Prasad et al. 2023) add/delete/swap edits without the paraphrase step; and an OPRO-style (Yang et al. 2024) loop where the model sees the top earlier prompts with scores and some failures and writes the next prompt. Each spends exactly 4 evaluations per step (asserted in code; the LLM proposer's own writing calls are extra and not counted). The imitator is penalised if invalid. Test numbers use fresh titles and fixed generation seeds.

## Builds on

Dugan et al. (2024), RAID, through `mimic-contexts`. Prasad et al. (2023), GrIPS; Yang et al. (2024), OPRO; Hu, Chen and Ho (2023), RADAR, and Lu et al. (2024), SICO, for the setting (here both sides adapt only through prompts). No lab's work is built on and none is affiliated with or endorses this project.

## Limitations

One seed; 12 optimisation and 24 test pairs; three rounds; 0.5B model as both players; a detector that starts below chance; length confound not controlled by design (the imitator is told to write about 60 words only in one fragment); the validity check can leave the search with no signal; the judge is the same small model; two families only; no cross-play matrix, no held-out families, no external detector (later milestones). Simulated texts only, nothing posted anywhere; all generated text is labelled as such in `results/*.json`.

## Next steps

Control length explicitly (match length bins or pad the detector's view); use a larger detector (1.5B to 3B) so the baseline is above chance; more seeds and test titles; then `mimic-crossplay`, the payoff matrix of every imitator prompt against every detector prompt.

## Owner steps

None.

## Outside dependencies

Qwen2.5-0.5B-Instruct weights (Apache-2.0), PyTorch, transformers. RAID-derived text via `mimic-contexts`.

MIT.
