# ambient-interject: when should an always-on assistant speak, and does the answer survive the gap between a simulator and a real room?

Track 2 (ambient AI assistant), milestone 2. I simulate listening windows in which help is
wanted or not, and compare interruption policies (wake word, keyword, score threshold, a learned
logistic classifier with an expected-utility rule) at **equal annoyance**: the same budget of
false interruptions per hour. Produced with AI assistance. **Stylised, simulated results only**:
every distribution below is chosen by me, nothing is fitted to real conversations, and nothing
is a claim about a real user, device or product.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/ambient-interject/

## Motivation

Milestone 1 (`ambient-pipeline`) measured how fast the pipeline can answer. This asks the
earlier question: whether to speak at all. An assistant in your ear that interrupts wrongly is
switched off, and one that never speaks is useless, so policies should be compared at a fixed
annoyance level, not at a fixed accuracy.

## Builds on (and does not claim affiliation with)

- Horvitz (1999), "Principles of mixed-initiative user interfaces", CHI. Source of the idea that
  the system should act when the expected utility of acting beats not acting; the rule in
  experiment 4 is that idea in its simplest form, not a reproduction of the paper.
- Lu et al. (2025), "Proactive Agent", ICLR, as listed in `PROJECTS.md`: motivates proactive
  assistance from observed context. I did not reproduce or run it, and I checked the citation
  only against `PROJECTS.md`, not against the paper itself.
- Green & Swets (1966), *Signal Detection Theory and Psychophysics*, Wiley: the equal-variance
  Gaussian score model and the sensitivity index d&prime; used for the intent score.

No research group from `prompt.md` is built on; there is no lab tag.

## Method

Time is cut into 10 s windows (360 per hour). Each window independently has a need with
probability 0.03 (about 11 per hour). The assistant sees four signals, drawn from class-conditional
distributions I set (defaults in `sim.py`, class `World`):

| signal | when help is wanted | when not |
|---|---|---|
| wake phrase said | 0.15 | 0.002 |
| trigger keyword present | 0.45 | 0.08 |
| intent score | N(2, 1) (d&prime; = 2) | N(0, 1) |
| other people talking | 0.30 in both | |

Annoyance = number of false interruptions, each weighted x2 if others are talking. Policies:
*wake* (speak on the wake phrase), *keyword* (wake or keyword), *threshold(&tau;)* (wake or
score &gt; &tau;), *learned* (wake or P(need) &gt; threshold, where P comes from a logistic
regression on score, keyword, wake, others, fitted by Newton iterations in numpy on 20 simulated
hours). Thresholds are tuned on the training world to a budget of false interruptions per hour
and evaluated on fresh 200 h worlds. 20 seeds; "+-" is the standard deviation over seeds.

## Reproduce

```bash
cd research/ambient-interject
PYTHONPATH=src python3 -m pytest -q tests       # 9 tests
PYTHONPATH=src python3 experiments/run.py       # about 45 s, writes experiments/results.txt
```

## Results (all from `experiments/results.txt`)

1. **Fixed policies.** Wake word: precision 0.69, recall 0.15, 0.72 false interruptions per
   hour. Keyword-or-wake: recall 0.53 but precision 0.17 and 28.7 false per hour. The keyword
   buys recall at an annoyance cost about 40 times larger.
2. **Check.** The simulated rates of the threshold policy match the closed form
   (1 &minus; (1 &minus; p<sub>w</sub>)&Phi;(&minus;&tau;), and the same with &tau; &minus; d&prime;
   for needs) to within 0.001 to 0.005 over 2000 h.
3. **Equal annoyance.** Recall at a budget of 0.5, 1, 2, 4 false per hour: threshold 0.15, 0.26,
   0.37, 0.46; learned 0.16, 0.33, 0.45, 0.55. The learned policy is ahead by 0.07 to 0.09 from
   1/h up and indistinguishable at 0.5/h. Both land near, and slightly above, the budget on the
   test world (1.05 and 1.12 per hour for a budget of 1; sd over seeds about 0.2) because 20
   training hours is a small sample. The learned policy's gain comes from using the keyword
   and the wake flag together with the score; the plain threshold ignores the keyword.
4. **Utility with context-dependent cost.** With utility = hits &minus; annoyance per hour and
   false-interruption cost c = 0.5, 1, 3: best threshold 2.58, 1.51, &minus;1.09; expected-utility
   rule 3.55, 2.28, &minus;0.47. At c = 3 both lose utility: speaking is net negative. The rule
   also uses the "others talking" flag, which the threshold does not, so the gap is not purely
   "learned beats hand-set".
5. **Classifier quality dominates.** Recall at 1 false per hour for the threshold policy,
   d&prime; = 0.5, 1, 1.5, 2, 3, 4: 0.15, 0.17, 0.20, 0.26, 0.52, 0.82. Below d&prime; = 1.5 almost all of the
   recall is the wake phrase.
6. **Twin gap.** Tuned to 1 false per hour in the default world, deployed where one thing
   differs. Changes on the *need* side (weaker classifier d&prime; = 1, needs three times rarer or
   twice as common) leave false interruptions at 1.0 to 1.1 per hour (they only change recall:
   0.26 to 0.17 for d&prime; = 1). Changes on the *no-need* side break the budget:
   wake false alarms 0.01 instead of 0.002 give 3.9 per hour, a noisier background score
   (sd 1.3 instead of 1) gives 3.6 (sd 1.1 over seeds), and more keyword noise raises the learned policy from 1.1 to 1.5 (the
   threshold policy does not use the keyword). The reason is simple: false interruptions are
   controlled by the distribution of the signals when nobody needs help, and a simulator of
   conversations is least likely to get that part right.
7. **Recalibration.** With the no-need background louder (sd 1.3), tuning on labelled hours from
   the deployment world brings false interruptions to 1.6, 1.5, 1.1, 1.0 per hour from 1, 4, 16,
   64 labelled hours (sd 1.1, 0.6, 0.3, 0.2), at a recall cost (0.26 to 0.17). With wake false
   alarms at 0.01 no threshold helps: the wake phrase alone causes 3.5 false per hour, so a budget
   of 1 is unreachable without changing the wake detector.

## What the simulated speakers leave out (limitations)

- Needs are independent across windows; real moments of need cluster, depend on topic and on the
  user's state, and may be defined differently by each user.
- The intent score is an equal-variance Gaussian and the signals are conditionally independent
  given the need. A real intent detector has correlated errors and heavier tails.
- The annoyance cost is a number I picked (1, x2 when others talk). Real tolerance varies by
  person and setting, and an interruption's harm depends on what is said, which is not modelled.
- Missed chances are scored as zero reward, not as a cost; no learning from the user's reaction,
  no cooldown or rate limit, no speech content.
- Prevalence, d&prime;, wake and keyword rates are illustrative round numbers. The ordering of policies
  is a property of this model; the sizes are not estimates for any product.

## Next steps

- Replace the independent windows with a two-state Markov or Hawkes-style process, so needs
  cluster, and test whether a cooldown helps.
- Label real dialogue transcripts that have a permissive licence (the owner's call, as it
  concerns data) and replace the Gaussian score with a real classifier's scores.
- Learn the interruption policy online from accept/dismiss feedback (a bandit) and measure how
  many dismissals it needs.
- Feed `ambient-pipeline`'s latency budget into the cost of a late reply.

## Outside dependencies

None beyond numpy (and pytest to run the tests). No pretrained model, dataset or service is used.

## Figure

`experiments/budget.svg` is drawn by `experiments/figure.py`, which parses the committed `results.txt` (no retyped numbers) and is the figure on the project's home page.
