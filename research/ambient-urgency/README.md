# ambient-urgency: does urgency, and a chime-plus-glance mode, change how an always-on assistant should deliver a message? (stylised utility model)

Track 2 (ambient AI assistant), follow-up to `ambient-glance` (its "Next steps": urgency, a deadline
distribution and a combined chime-plus-glance mode). Produced with AI assistance. **Stylised,
simulated results only**: every parameter is a round figure I chose, nothing is fitted to people or
measured on a device, and nothing is a claim about a real user or product.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/ambient-urgency/

## Motivation

`ambient-glance` fixed one 20 s deadline for every message. Real messages differ: a reminder can
wait two minutes, a "your train leaves in five" cannot. A short tone in the earbud that prompts a
look at the display is a fourth option between a silent buzz and a spoken sentence.

## Builds on (and does not claim affiliation with)

- `research/ambient-glance` in this repository: the speech and glance utilities are re-implemented
  here (the project stays self-contained) with a per-class deadline and value weight added.
- Horvitz (1999), "Principles of mixed-initiative user interfaces", CHI
  (<https://doi.org/10.1145/302979.303030>; citation as listed in `PROJECTS.md`, not re-read here):
  the idea of choosing an action, including doing nothing, by expected utility.

No research group from `prompt.md` is built on; there is no lab tag.

## Method (`src/ambient_urgency/sim.py`)

Urgency classes (deadline, value weight, share of messages): low (120 s, 0.5, 50%), normal (20 s,
1.0, 35%), high (6 s, 2.0, 15%). Contexts as in `ambient-glance` (noise, others talking, eyes busy,
message length), here a 48-context grid: words {3, 6, 12, 24} &times; noise {0, 0.5, 1} &times;
others {0, 1} &times; eyes {free, busy}. Value is weight &times; P(message gets through before the
deadline), minus annoyance.

- **Speech, glance, none**: as in `ambient-glance`, with deadline and weight per class.
- **Chime+glance**: a tone (cost 0.04 &times; (1 + others), not noticed with probability 0.5 &times;
  noise) then a display glance. If noticed, the wearer looks at an added rate of 0.5 per s (0.3&times;
  that when eyes are busy) on top of the spontaneous rate; if missed, only the spontaneous rate.
  Shows at most 8 words; glance reading costs as before.
- Utilities are closed-form; a Monte Carlo simulation checks them. Ties go to the quieter mode.

## Reproduce

```bash
cd research/ambient-urgency
pip install numpy pytest
PYTHONPATH=src python3 -m pytest -q tests        # 9 tests
PYTHONPATH=src python3 experiments/run.py > experiments/results.txt   # about a second
```

## Results (all from `experiments/results.txt`)

1. **Best mode by urgency.** Low urgency: glance 58%, chime+glance 29%, none 12%, speech never.
   Normal: chime+glance 62%, glance 19%, speech 12%. High: chime+glance 62%, speech 33%, plain
   glance never. Urgency pushes the choice from the silent display toward chime and speech.
2. **Value of the new mode.** Mean utility per message over the urgency mix rises from 0.351 (best
   of none, speech, glance) to 0.417 with chime+glance (+0.066); the gain is 0.015 for low, 0.092 for
   normal and 0.175 for high urgency. The gain is partly built in: high-urgency messages carry twice
   the value weight, so the size of this number is a property of my weights, not an estimate.
3. **Check.** Closed form and Monte Carlo agree to 0.0017 at worst (36 cases, 200,000 draws).
4. **Sensitivity.** Halving or doubling one parameter changes the best mode in 7% to 22% of
   (context, urgency) cells; the largest are the spontaneous look rate (22% when doubled) and the
   chime-masking factor (22% when doubled).
5. **Twin gap.** Choosing with an assumed boosted look rate of 0.5 per s when the true one is 0.1
   loses 0.018 utility per message; true 0.2, 1.0, 2.0 lose 0.005, 0.004, 0.010. Assuming a
   spontaneous look rate of 0.10 when it is 0.02, 0.05, 0.2 or 0.4 loses 0.016, 0.006, 0.008, 0.016.
   Assuming chime masking 0.5 when it is 0 or 1 loses 0.011 and 0.013. As in `ambient-glance`, the
   human look and reaction rates are the least knowable inputs.
6. **Dependence on reaction.** In one context (6 words, noise 0.5, others talking, eyes free,
   high urgency), chime+glance beats plain glance as soon as the reaction rate is 0.02 per s
   (0.835 vs 0.822); at zero it is worse than plain glance (0.742 vs 0.822), because the tone then
   costs without helping.

## Limitations

- All parameters are my round numbers; the ordering is a property of the model, the sizes are not
  estimates. No human study, no device, no measured reaction times.
- Urgency classes and their mix are invented; a message's urgency is assumed known to the
  assistant. Utilities can exceed 1 because of the value weight of 2.
- Glance value is linear in words shown (as in `ambient-glance`); no repeated chimes, no haptic-only
  mode, no queueing, no learning from dismissals, one message at a time.
- The grid is uniform over contexts, so shares and regrets describe the grid only.

## Next steps

Fit look and reaction rates to published human-factors data (citations to be checked first) or an
owner-run study; let the assistant infer urgency with error; add repeated chimes and a haptic mode.

## Outside dependencies

None beyond numpy (and pytest for the tests). No model, dataset, service or hardware is used.
