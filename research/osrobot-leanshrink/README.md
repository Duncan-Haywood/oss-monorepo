# If the person being fed judges the spoon better as it nears the mouth, how much of a camera's value does a blind feeding arm get back?

Follow-up to `osrobot-leannoise` (track 9, open-source purpose-built robots), taking the first "Next steps" item there: **a misjudgement that shrinks with distance to the mouth**. In the direction of the CAIRO Lab interest in human-robot collaboration; nothing here is affiliated with or endorsed by it. Produced with AI assistance (Claude). Pure Python standard library. **Every constant is an assumed round number (ASSUMED in `model.py`), including the lean speed, misjudgement size and the linear shrink law, all swept or assumed rather than measured from any person. No robot was built and nobody was tested.** All numbers are from `experiments/results.txt`. Simulation only; a stylised, preliminary study.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/osrobot-leanshrink/

![Share of feeds with peak lip force at most 2 N against the user's misjudgement of the spoon, constant or shrinking](experiments/shrink_safe.svg)

- **How fast the error shrinks matters more than how big it starts.** At 30 mm sway, 0.20 m/s and a 100 mm/s lean, a blind arm's share of feeds with peak lip force at most 2 N (the assumed limit) is 0.83, 0.60, 0.47 and 0.41 for a constant misjudgement of 10, 20, 40 and 80 mm (standard deviation, drawn once per feed). If the same error shrinks linearly to zero over the last 40 mm before the lips, the shares are 0.99, 0.95, 0.84 and 0.70.
- **Feeding no longer fails.** With a constant 40 mm error only 0.50 of blind feeds reach the mouth; with the error shrinking to zero at the lips every blind feed is completed (1.00 at 20, 40 and 80 mm), because the user's lean converges on the true spoon position before the lip plane.
- **Halfway helps, but not enough.** Halving the error at the lips (shrink 0.5) lifts the blind arm only from 0.60 to 0.80 safe at 20 mm and from 0.47 to 0.58 at 40 mm.
- **The camera arm gains too, and keeps its lead where the error is big.** Camera arm safe share at 40 mm: 0.69 constant, 0.78 half-shrunk, 0.95 fully shrunk. At 80 mm the fully shrunk camera arm (0.93) is still ahead of the blind arm (0.70). At 10 mm and 20 mm the blind arm with fully shrinking error (0.99, 0.95) is within 0.02 of the camera arm (0.97).
- **Conclusion for this model:** the "does the user misjudge the spoon?" worry of `osrobot-leannoise` mostly concerns the error left *near the lips*, not the error at a distance. If a person's judgement is good within a few centimetres, a blind arm is about as safe as the camera arm up to roughly 20 mm of far-field misjudgement. If it stays poor near the mouth, the camera still earns its cost.
- With shrink 0 every row reproduces `osrobot-leannoise` (for example blind, 10, 20, 40 mm: 0.83, 0.60, 0.47), and a test checks the equivalence.

## Reproduce
```bash
cd research/osrobot-leanshrink
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 4 tests, about a second
PYTHONPATH=src python3 experiments/run.py                 # a few seconds; writes experiments/results.txt
python3 experiments/figure.py                             # experiments/shrink_safe.svg, parsed from results.txt
```

## Motivation
`osrobot-leannoise` gave the user a fixed per-feed offset in judging the spoon. A person watching a spoon come toward their mouth sees it better the closer it is, so the offset should fall. This project asks how much of the earlier penalty is an artefact of the fixed offset.

## Builds on
`osrobot-leannoise`, `osrobot-lean` and `osrobot-assist` (model copied into `src/osrobot_leanshrink/model.py` and extended; same repository, MIT) and the Hunt and Crossley (1975) lip contact law, "Coefficient of restitution interpreted as damping in vibroimpact", *Journal of Applied Mechanics* 42(2), with assumed parameters. The task framing follows Erickson et al. (2020), Assistive Gym, *ICRA*, which was not run.

## Method
Same planar point-mass spoon, PD loop, swaying mouth, lip wall and lean as `osrobot-leannoise`, with no perception delay. New parameter `shrink` in 0..1: the offset the user applies to the perceived tip is `bias * ((1 - shrink) + shrink * d / 40 mm)`, with `d` the tip's distance to the lip plane, capped at the 40 mm lean-start distance. So 0 is the constant offset and 1 falls linearly to zero at the lips. 200 seeded paired trials per row (same sway and bias draws across shrink values); misjudgement 0, 10, 20, 40, 80 mm; shrink 0, 0.5, 1; blind and camera arms at 0.20 m/s, 100 mm/s lean, 30 mm sway.

## Limitations
- The linear shrink law, and its shrinking to exactly zero at the lips, are assumptions chosen for simplicity, not a fit to human vision. A person's error may floor at some millimetres; shrink 0.5 is a rough stand-in for that.
- Only one lean speed (100 mm/s), one sway amplitude and one approach speed. No perception delay here (see `osrobot-leannoise`).
- The offset is still fixed per feed apart from the shrink factor; no drift or learning across feeds.
- A single assumed 2 N comfort limit that is not a standard. Everything in `osrobot-assist`'s limitations applies: planar point mass, no Assistive Gym or MuJoCo human, and no safety case. ISO 13482 and a risk assessment apply before any test with a person.

## Next steps
A user who stops leaning on contact; a floor on the error instead of zero; a 2-DOF against a 6-DOF arm with a priced bill of materials.

## Owner steps
Building a feeding arm and testing it with people are owner steps (risk assessment, consent, standards). Nothing was purchased or priced.

## Outside dependencies
Python 3 standard library only. The Assistive Gym and MuJoCo human models were not used.
