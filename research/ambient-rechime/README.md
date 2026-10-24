# ambient-rechime: when is a second or third earbud tone worth it before a glance? (stylised utility model)

Track 2 (ambient AI assistant), follow-up to `ambient-urgency` (its "Next steps": "add repeated chimes").
Produced with AI assistance. **Stylised, simulated results only**: every parameter is a round figure I
chose, nothing is fitted to people or measured on a device, and nothing is a claim about a real user or
product.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/ambient-rechime/

**Headline.** Allowing up to four tones, instead of one, raises mean utility per message from 0.387 to
0.409 (best of plain glance or one tone, against best of 0 to 4 tones). The gain is nil for low urgency
(0.0002), 0.037 for normal and 0.062 for high urgency. Two tones are most of it (0.406 at most two).

## Motivation

In `ambient-urgency` a single tone prompts a look at the display, but in noise the tone is often missed.
Repeating it a few seconds later should help, and each repeat annoys. How many tones, and when?

## Builds on (and does not claim affiliation with)

- `research/ambient-urgency` in this repository: the urgency classes (120, 20, 6 s deadlines; weights
  0.5, 1, 2; mix 50/35/15%), the 48-context grid and the chime-plus-glance utility are re-implemented
  here (the project stays self-contained). Speech is left out, so numbers are not comparable with that
  project's 0.417.
- Horvitz (1999), "Principles of mixed-initiative user interfaces", CHI
  (<https://doi.org/10.1145/302979.303030>; citation as listed in `PROJECTS.md`, not re-read here).

No research group from `prompt.md` is built on; there is no lab tag.

## Method (`src/ambient_rechime/sim.py`)

Up to n tones, 3 s apart, starting at 0 s and only while before the deadline. Each is noticed
independently with probability 1 &minus; 0.5 &times; noise. The wearer looks at a spontaneous rate (0.1
per s, &times;0.1 when eyes are busy); after the first noticed tone the rate is raised by 0.5 per s
(&times;0.3 when busy). If the wearer's look is detected, the remaining tones are cancelled (switch
`stop_on_look`). Each played tone costs 0.04 &times; (1 + others talking). Utility is weight &times;
P(seen by deadline) &times; shown/words, minus tone and glance costs. P(seen) and the expected number of
tones played are closed form; a Monte Carlo simulation checks them. Choices: n = 0 (plain glance) to 4.

## Reproduce

```bash
cd research/ambient-rechime
pip install numpy pytest
PYTHONPATH=src python3 -m pytest -q tests        # 9 tests
PYTHONPATH=src python3 experiments/run.py > experiments/results.txt   # a few seconds
python3 experiments/figure.py
```

## Results (all from `experiments/results.txt`)

1. **Best number of tones.** Low urgency: plain glance 69%, one tone 27%, two 4%. Normal: one tone 35%,
   plain glance 19%, four 27%, two or three 18%. High: two tones 62%, one 38%, never plain glance.
2. **Fixed counts.** Mean utility per message: 0 tones 0.226, 1 tone 0.368, 2 tones 0.371, 3 tones 0.365,
   4 tones 0.359; choosing per context: best of 0 to 1 0.387, 0 to 2 0.406, 0 to 4 0.409. Always repeating
   is little better than one tone; the gain comes from choosing when.
3. **By urgency.** Gain of 0 to 4 over 0 to 1: low 0.0002, normal 0.037, high 0.062. The high figure is
   partly built in: high-urgency messages carry twice the weight.
4. **Check.** Closed form and Monte Carlo agree to 0.0016 at worst (54 cases, 200,000 draws, with and
   without cancelling on look).
5. **Gap and cancelling.** The gain of 0 to 4 over 0 to 1 is 0.026, 0.022, 0.014, 0.011 at gaps of 1, 3,
   6, 12 s with cancelling, and 0.022, 0.016, 0.008, 0.005 without. Cancelling on a detected look is
   worth up to 0.006 here, and needs the device to detect looks, which is an assumption.
6. **Masking.** For high urgency, allowing up to four tones adds 0 with no masking, 0.039, 0.062, 0.056
   and 0.036 at masking 0.25, 0.5, 0.75, 1.0 (see `experiments/chime_mask.svg`): repeats matter most when
   tones are missed some of the time, and fade when they are nearly always missed.

## Limitations

- All parameters are my round numbers; orderings follow from the model, sizes are not estimates. No
  human study, no device, no measured reaction times.
- Tones are noticed independently. In real noise a missed tone is likely followed by another miss
  (masking persists), which would shrink the benefit of repeating. Not modelled.
- Annoyance is a flat cost per tone with no growth for repeats, which real people may find worse than the
  first. Urgency is assumed known; there is no speech or haptic mode here, no queueing, one message at a
  time.
- The context grid is uniform, so shares describe the grid only.

## Next steps

Correlate misses across tones; make annoyance rise with each repeat; add a haptic mode; fit look and
reaction rates to published human-factors data (citations to be checked first) or an owner-run study.

## Outside dependencies

None beyond numpy (and pytest for the tests). No model, dataset, service or hardware is used.
