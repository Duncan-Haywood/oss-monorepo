# Does co-designing an arm's link lengths and controller beat tuning the controller on a fixed body?

Pure Python, no dependencies. Second milestone (`osrobot-morph`) of track 9, open-source purpose-built robots. It asks, in the spirit of Ha (2019) and RoboGrammar (Zhao et al., 2020), whether searching the body together with the controller helps at the same search budget. The smallest version: a planar two-link arm, a fixed total reach (the same material), a tray offset from the base, and a search over the split of the reach between the two links. **Every mass, torque and friction value is an assumption in `model.py` (marked ASSUMED), not a measurement of any product.** All numbers below come from `experiments/results.txt`. Simulation only; **this is a small, preliminary and mostly negative result.**

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/osrobot-morph/

- **Reachability sets the body; inside that, the split barely matters.** With a 0.50 m total reach and a tray 0.15 to 0.35 m in x and &minus;0.10 to 0.10 m in y, splits of 0.30, 0.35, 0.65 and 0.70 cannot reach the whole tray. Splits from 0.40 to 0.60 can, and their held-out mean move time (each with its own tuned controller) lies between 0.275 and 0.293 s, across three search seeds.
- **Co-design gained 1.9% over a tuned fixed body, within seed noise.** Held-out mean move time is 0.289 s for the equal-link body with a tuned controller (seeds: 0.286, 0.291, 0.289) and 0.283 s for the co-designed body (0.289, 0.275, 0.286). The ranges overlap; three seeds cannot separate them. Seed 2 chose a split of 0.40 and got 0.275 s, the best single result, but seeds 1 and 3 chose splits of 0.50 and 0.45 and gained nothing.
- **Tuning the controller mattered far more than the body.** Hand-set gains (10, 0.5, 10, 0.5) on the equal-link body take 0.460 s; tuning them cut that to 0.289 s (about 37%). The co-designed result is 38.5% below the hand-set baseline, and almost all of that comes from the controller.

```bash
cd research/osrobot-morph
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, under a second
PYTHONPATH=src python3 experiments/run.py                 # about 4.5 minutes; output in experiments/results.txt
```

## Motivation

Track 9 lets the task decide the body. Once a body type is chosen (an arm), the remaining freedom is its dimensions and its controller. Co-design work argues these should be searched together because a controller tuned on the wrong body hides what the right body could do. This project checks whether that matters in the simplest setting where a body dimension has a physical effect: link split changes inertia, the reach envelope and the coupling between joints.

## Builds on

Ha (2019), "Reinforcement learning for improving agent design", *Artificial Life* 25(4), and Zhao et al. (2020), "RoboGrammar: graph grammar for terrain-optimized robot design", *ACM Transactions on Graphics* 39(6), for the idea of searching body and controller together. The companion project `research/osrobot-bodysearch` (another run, same milestone) searches joint count, link lengths and mount with a kinematic controller; this one uses simulated dynamics but searches only the link split. Nothing is reproduced: those works use learned policies on legged and walking bodies in richer simulators, whereas this uses a hand-written planar arm with PD control. The arm dynamics are the textbook two-link rigid-body equations; the track's lab list (ARPG, CAIRO, HIRO) is not built on and no lab is affiliated with or endorses this work.

## Method

`src/osrobot_morph/model.py`. Two rod links with mass 1 kg/m, an elbow motor of 0.15 kg at the end of link 1, and a 0.05 kg payload at the tip. Equations of motion in the horizontal plane (no gravity) with viscous joint friction, integrated with semi-implicit Euler at 2 ms. The controller is a joint PD on a step in the inverse-kinematics joint targets, saturated at 0.6 N m per joint. A move is the time until the tip stays within 2 mm of the goal for 50 ms (1.5 s cap). The controller has four gains, tuned by random search then a shrinking Gaussian local search on the mean move time over 40 training moves. Method B tunes the equal-link body with 1,980 evaluations. Method C splits the same 1,980 evaluations over nine body splits (220 each), and keeps the split with the best training score. Both are scored on 200 held-out moves that the search never saw. Splits whose body cannot reach the tray's corners, edge midpoints and centre count as unreachable and are dropped. Tests check IK/FK, energy conservation with no torque and friction, mass-matrix positivity, torque saturation, determinism and the reachability rule.

## Limitations

Stylised and preliminary. Only one body parameter is searched (the link split, with total reach fixed), and joint count, link shape, actuator size and motor placement are not. The torque limit is the same for every body, so a longer proximal link does not get a bigger shoulder motor. Gains are tuned for a step response, not a planned trajectory, so the controller is crude and may mask body effects. Three search seeds, one tray and one set of assumed masses; a different tray offset or torque limit could give a larger or smaller gain. No gravity, backlash, vibration, vision or gripper. The 2 mm settle test uses the tip position only. Simulated results are not claims about physical arms. The 1.9% difference is not a significant result.

## Next steps

Add joint count (a third link) and per-joint motor sizing to the search so the body has more to give. Use a trajectory-based or computed-torque controller so the controller does not cap what the body can do. Run more seeds and report a confidence interval. Move to a MuJoCo model of an open arm once it is available, and add a cost term so the body search trades speed against bill of materials as `osrobot-specialise` does.

## Owner steps

None for this run.

## Outside dependencies

None (standard library only). Produced with AI assistance (Claude). No language-model proposer was used.

MIT.
