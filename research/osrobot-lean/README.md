# If the person being fed leans toward the spoon, can a blind feeding arm do without a camera?

Follow-up to `osrobot-assist` (track 9, open-source purpose-built robots), taking the first "Next steps" item that stayed open there after `osrobot-lipsweep`: **anticipation by the user**. In the direction of the CAIRO Lab interest in human-robot collaboration; nothing here is affiliated with or endorsed by it. Produced with AI assistance (Claude). Pure Python standard library. **Every constant is an assumed round number (ASSUMED in `model.py`), including the lean speed, which is swept rather than measured from any person. No robot was built and nobody was tested.** All numbers are from `experiments/results.txt`. Simulation only; a stylised, preliminary study.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/osrobot-lean/

![Share of feeds with peak lip force at most 2 N against user lean speed](experiments/lean_safe.svg)

- **In this model a user who leans fast enough replaces the camera.** At 30 mm sway and 0.20 m/s, the blind arm's safe share (fed with peak lip force at most the assumed 2 N) rises from 0.21 with a passive user to 0.28, 0.33, 0.69 and 1.00 at lean speeds of 10, 20, 50 and 100 mm/s; at 100 mm/s it never touches the lips. The camera arm goes from 0.71 to 0.75, 0.77, 0.86 and 0.97.
- **A slow lean helps little.** At 10 to 20 mm/s the blind arm's touch share falls only from 0.80 to 0.73 and 0.68 (0.20 m/s). Leaning pays once it is comparable to the sway's own speed, which is about 50 mm/s or more at 30 mm amplitude.
- **At 50 mm sway even 100 mm/s is not enough for the blind arm at 0.20 m/s** (safe 0.62, touch 0.43); the camera arm reaches 0.68. Camera and lean are partial substitutes there, and the two are not combined to a large gain: the camera arm at 100 mm/s lean is still only 0.68 safe.
- **Peak force is unchanged by leaning.** The worst peak stays at 4.0 N at 0.20 m/s and 2.0 N at 0.10 m/s wherever any contact happens, as in `osrobot-assist` (it is set by the controller's lead and speed). Leaning removes contacts; it does not soften them.
- **Leaning also shortens the feed**, for the blind arm at 0.20 m/s and 30 mm sway from 1.19 s to 0.71 s, because the tip no longer waits against the lips.
- With a passive user (lean 0) every row reproduces `osrobot-assist` (for example camera, 0.20 m/s, 30 mm: safe 0.71), and a test checks the extension changes nothing at lean 0.

## Reproduce
```bash
cd research/osrobot-lean
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 4 tests, under a second
PYTHONPATH=src python3 experiments/run.py                 # about 10 s; writes experiments/results.txt
python3 experiments/figure.py                             # experiments/lean_safe.svg, parsed from results.txt
```

## Motivation
A purpose-built feeding arm saves cost by dropping sensors. Real people do not sit passively: they move toward the food. If that behaviour is reliable, a cheaper blind arm might be safe enough; if it is not, the camera earns its cost. This project asks how fast the person must lean for the camera to stop mattering, in the same model as `osrobot-assist`.

## Builds on
`osrobot-assist` (its model is copied into `src/osrobot_lean/model.py` and extended; same repository, MIT) and its Hunt and Crossley (1975) lip contact law, "Coefficient of restitution interpreted as damping in vibroimpact", *Journal of Applied Mechanics* 42(2), with assumed parameters. The task framing follows Erickson et al. (2020), Assistive Gym, *ICRA*, which was not run.

## Method
Same planar point-mass spoon, PD loop, swaying mouth and lip wall as `osrobot-assist`. New: once the tip is within 40 mm of the lip plane (ASSUMED), the mouth centre shifts sideways toward the tip's lateral position at up to `lean` m/s, added to the sway. The camera senses the delayed sway plus the current lean offset (a simplification: the lean offset itself is not delayed). 200 seeded trials per row, seeds shared across rows so rows are paired.

## Limitations
- The user knows where the spoon is exactly and moves straight at it; real anticipation is noisy, late and can overshoot, and a person may also pull back or turn away. The lean speeds are swept, not taken from data.
- The camera arm does not know the user is leaning, so combining them is not tuned (for instance, it does not slow its wait for alignment).
- The lean starts at a fixed distance; its trigger distance and the 12 mm mouth opening were not swept.
- Everything in `osrobot-assist`'s limitations applies: planar point mass, no Assistive Gym or MuJoCo human, a single assumed 2 N comfort limit that is not a standard, and no safety case. ISO 13482 and a risk assessment apply before any test with a person.

## Next steps
Noisy and delayed anticipation (lean toward a sensed or remembered spoon position); a user who also pulls back on contact; a 2-DOF against a 6-DOF arm with a priced bill of materials.

## Owner steps
Building a feeding arm and testing it with people are owner steps (risk assessment, consent, standards). Nothing was purchased or priced.

## Outside dependencies
Python 3 standard library only. The Assistive Gym and MuJoCo human models were not used.
