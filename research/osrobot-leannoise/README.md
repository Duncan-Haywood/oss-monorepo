# If the person being fed misjudges the spoon, or sees it late, can a blind feeding arm still do without a camera?

Follow-up to `osrobot-lean` (track 9, open-source purpose-built robots), taking the first "Next steps" item there: **noisy and delayed anticipation**. In the direction of the CAIRO Lab interest in human-robot collaboration; nothing here is affiliated with or endorsed by it. Produced with AI assistance (Claude). Pure Python standard library. **Every constant is an assumed round number (ASSUMED in `model.py`), including the lean speed, perception delay and misjudgement size, which are swept rather than measured from any person. No robot was built and nobody was tested.** All numbers are from `experiments/results.txt`. Simulation only; a stylised, preliminary study.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/osrobot-leannoise/

![Share of feeds with peak lip force at most 2 N against the user's misjudgement of the spoon position](experiments/bias_safe.svg)

- **Misjudgement hurts the blind arm much more than delay does.** At 30 mm sway, 0.20 m/s and a 100 mm/s lean, a perfectly aware user makes the blind arm 1.00 safe (fed with peak lip force at most the assumed 2 N). With a per-feed misjudgement of the spoon's lateral position of 10, 20 and 40 mm (standard deviation), the safe share falls to 0.83, 0.60 and 0.47, and the share of feeds that get the spoon in at all falls to 0.91, 0.70 and 0.50. The user leans toward where they think the spoon is, ends up offset from it by the error, and a blind arm cannot correct that.
- **A bad estimate trades contacts for failed feeds.** The passive-user blind arm is 0.21 safe with every feed completed; the 40 mm leaner is 0.47 safe but only 0.50 fed, so a feed that never reaches the mouth is not a success even though it makes no harmful contact.
- **A camera arm degrades more gently and never fails to feed.** Camera arm at 100 mm/s lean: safe 0.97 with no error, then 0.89, 0.78 and 0.69 at 10, 20 and 40 mm; fed stays 1.00. With 20 mm of misjudgement it is clearly ahead of the blind arm (0.78 against 0.60 safe).
- **Delay matters once it is a large part of the sway period.** With no misjudgement the blind arm at 100 mm/s goes from 1.00 safe at 0 and 0.2 s delay to 0.95 at 0.5 s and 0.46 at 1.0 s: above the passive-user 0.21 but below the camera arm's 0.91 at that delay. Short delays up to 0.2 s change almost nothing, so the lean's value hinges on the user's accuracy more than on their reaction time.
- **Conclusion for this model:** dropping the camera relies on the person judging the spoon's position to within about the mouth opening (12 mm) and not more than about half a second late. If that cannot be assumed, the camera earns its cost.
- With zero delay and zero misjudgement every row reproduces `osrobot-lean` (for example blind, 0.20 m/s, 50 mm/s lean: safe 0.69), and a test checks it.

## Reproduce
```bash
cd research/osrobot-leannoise
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 4 tests, under a second
PYTHONPATH=src python3 experiments/run.py                 # about 15 s; writes experiments/results.txt
python3 experiments/figure.py                             # experiments/bias_safe.svg, parsed from results.txt
```

## Motivation
`osrobot-lean` found that a user who leans toward the spoon can replace the camera, but it gave the user perfect knowledge of the spoon. Real anticipation is noisy and late. This project asks how much error the conclusion survives.

## Builds on
`osrobot-lean` and `osrobot-assist` (model copied into `src/osrobot_leannoise/model.py` and extended; same repository, MIT) and the Hunt and Crossley (1975) lip contact law, "Coefficient of restitution interpreted as damping in vibroimpact", *Journal of Applied Mechanics* 42(2), with assumed parameters. The task framing follows Erickson et al. (2020), Assistive Gym, *ICRA*, which was not run.

## Method
Same planar point-mass spoon, PD loop, swaying mouth, lip wall and lean as `osrobot-lean`. New: the user leans toward a perceived tip position instead of the true one. The perceived position is the tip's lateral position `perc_delay` seconds ago plus a fixed per-feed offset drawn from a Gaussian with standard deviation `perc_bias` (its own seeded stream, so all other random draws are unchanged and rows are paired). 200 seeded trials per row; delays 0, 0.2, 0.5, 1.0 s; misjudgement 0, 10, 20, 40 mm; lean 50 and 100 mm/s; blind and camera arms at 0.20 m/s and 30 mm sway.

## Limitations
- Misjudgement is a constant offset per feed, not a drifting or shrinking error as the spoon nears; a person who sees the spoon close to the mouth would judge better than one far away. A fixed lean start distance and an unlimited-duration chase of a wrong target are simplifications.
- The delay is a pure lag on the tip position; the user does not predict ahead, which a person might.
- Only 30 mm sway and 0.20 m/s were swept here (50 mm sway and 0.10 m/s were in `osrobot-lean`).
- A single assumed 2 N comfort limit that is not a standard. Everything in `osrobot-assist`'s limitations applies: planar point mass, no Assistive Gym or MuJoCo human, and no safety case. ISO 13482 and a risk assessment apply before any test with a person.

## Next steps
Error that shrinks with distance to the mouth; a user who stops leaning on contact; a 2-DOF against a 6-DOF arm with a priced bill of materials.

## Owner steps
Building a feeding arm and testing it with people are owner steps (risk assessment, consent, standards). Nothing was purchased or priced.

## Outside dependencies
Python 3 standard library only. The Assistive Gym and MuJoCo human models were not used.
