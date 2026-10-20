# Which cheap printed gripper picks stylised strawberries fastest without bruising or dropping them under a 60 USD parts cap, and does a session agent beat CMA-ES and Bayesian optimisation at 40 evaluations?

Fourth milestone of the agentic co-design track (`research/PROJECTS.md`, track 14, `codesign`; agriculture domain, `codesign-agri`). A two-pad soft-fruit end effector on a cheap arm picks stylised berries. Five design variables (pad width, pad modulus, maximum grip force, finger opening, arm speed) are scored on 60 held-out berries, each design with its own force-and-speed policy. Produced with AI assistance (Claude). **Every constant is an assumed round number marked ASSUMED in `src/codesign_agri/agri.py`, not a measurement of any fruit, pad or robot, and nothing was built.**

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/codesign-agri/

![best objective vs evaluations](experiments/curves.png)

**Headline (simulated, stylised, one agent run, 20 seeds per baseline; numbers from `experiments/results.txt` and `experiments/noise.txt`).**
- **Median best J at 40 evaluations** (J = sellable value per minute / 20): session agent 1.054, Bayesian optimisation 0.825, CMA-ES 0.736, random search 0.692. The cost cap makes this a feasibility problem: 50% of random-search evaluations, 26% of CMA-ES and 16% of Bayesian-optimisation evaluations were over 60 USD and scored -1.
- **Evaluations to J of at least 0.85:** session agent 2, Bayesian optimisation 23.5 (median of the 10 of 20 seeds that reach it), CMA-ES 29 (6 of 20), random search 8 (1 of 20, one lucky draw).
- **The best design anywhere was a baseline's, and the difference is noise.** One Bayesian-optimisation seed found J = 1.069 (a 4.5 mm pad), against the agent's 1.054. Re-running only the policy search for a fixed design with 30 seeds gives J from 0.750 to 1.054 for the agent's design and 0.877 to 1.065 for the baseline's, so differences of 0.02 are not evidence.
- **Not a result about language models.** The agent is the Claude session that wrote this project. It wrote round 1 from the contact statics before scoring anything, but it had already scored about fifteen probe designs while debugging the model, and the model's author is the proposer. Treat the agent row as one worked example of "a proposer that reads diagnostics", not a benchmark.
- **The bruising term barely fires.** Above an 8 mm pad width nothing is bruised (`noise.txt`): the learned policy lowers force until just enough to hold, and pressure stays under the threshold. Width only matters below 8 mm. So the model's real trade-off is speed against the cost cap, with drops at low force and misses and knocks set by the opening. The "pick without bruising" half of the question is mostly untested here.
- **Residual losses are structural.** The best designs lose about 5 to 8% of berries to missed captures (large berry plus camera error) and 3 to 5% to knocked neighbours, which the opening can trade but not remove.

## What "agent" means here
The run environment has no model API key. The proposer is the **session agent itself**: 4 rounds of 10 designs, committed as `proposals/round1.json` to `round4.json`, each written after reading the previous round's diagnostics (outcome shares: ok, bruised, dropped, missed, knocked; picks per minute; cost) and each file carrying its notes. 40 proposals in all. The baselines get no hand-written prior and 20 seeds each; the agent has one run, so its spread is unknown.

## Method
- **Design** (`src/codesign_agri/agri.py`): pad width `W` 4 to 30 mm, pad modulus `E` 0.05 to 3 MPa (searched on a log scale), maximum grip force `F` 0.5 to 12 N, finger opening `S` 30 to 90 mm, arm speed `V` 0.1 to 1.0 m/s. Parts cost follows from these; designs over 60 USD score J = -1 and still use an evaluation.
- **Fruit** (`make_fruit`): diameter Gaussian (30 mm, SD 5, clipped 18 to 44), ripeness uniform 0 to 1 (sensed with SD 0.1), camera position error half-normal (SD 5 mm), stem pull force Gaussian (2 N, SD 0.6), and a clutter draw for neighbouring fruit and leaves. 20 training fruit train the policy; 60 held-out fruit score the design.
- **Pick physics, stated plainly:** capture needs the berry radius plus the camera error to fit inside the opening, and wide openings knock neighbours with probability `(S - d - 15 mm)/75`. The pad indents by `min(0.6 t, t sigma/E)` and its contact patch grows with the fruit radius until the pad bottoms out; pressure is force over patch area plus a stress-wave impact term `v_close sqrt(E rho)`. A berry bruises above a threshold that falls with ripeness (0.09 MPa unripe, 0.035 MPa ripe, ASSUMED). It is held if `2 mu F` exceeds 1.5 times stem pull plus weight plus acceleration load, with softer pads gripping better. Value: unbruised 1.0, bruised 0.4, missed, knocked or dropped 0. Cycle time is travel plus closing plus 0.8 s.
- **Policy, not PPO:** three numbers per design (force scale `a - b x ripeness`, speed fraction) found by a small evolution-strategies search, 6 iterations of 8 candidates, on the 20 training fruit. **This is not deep RL**, and the search noise is real (above). A PPO policy in a physics engine is the part of the milestone this does not do.
- **Objective** `J = sellable value per minute / 20`.
- **Baselines** (`optimisers.py`, no language model): random search; CMA-ES (`cma`, population 6); Gaussian-process Bayesian optimisation (Matern 5/2, 8 Sobol points, then expected improvement). 40 evaluations, 20 seeds.
- **Cost:** one evaluation is about 10 ms of pure Python; the whole comparison runs in about 8 s.

## Reproduce
```bash
cd research/codesign-agri
PY=$(python3 ../../platform/ci/pyenv.py pytest numpy scipy cma matplotlib)
PYTHONPATH=src "$PY" -m unittest discover -s tests      # 9 tests
"$PY" experiments/run.py                                  # ~8 s -> results.txt, results.json
"$PY" experiments/noise.py                                # -> noise.txt
"$PY" experiments/figure.py                               # -> curves.png
```

## Bill of materials (assumed, unsourced)
The cost model in `cost_usd` is a placeholder written for this study: servo 6 + 2.5 per newton + 8 per m/s USD, 10 + 22 per m/s USD for a share of a cheap arm, filament 0.025 USD per gram, a soft-elastomer pad surcharge, and 8 USD for camera share and wiring. None of these prices comes from a supplier quote or a dated source. The 60 USD cap is a modelling choice, not a priced build. Pricing real parts is an owner step.

## Limitations
- Quasi-static contact model with a closed-form bruise threshold; no fruit mechanics, no dynamics engine, no contact solver, no stem-twist mechanics, no occlusion. A screening model, not a safety case or an agronomic result. Real bruise thresholds depend on cultivar, temperature and contact duration, and the 0.035 to 0.09 MPa band here is an assumption.
- Bruising almost never binds (above), which weakens the "gentle handling" half of the question; making it bind (a harder-to-hold, lighter-pull fruit, higher closing speed, a pad cost that does not fall with width) is the next step.
- Policy-search noise (J down to 0.75 for a design whose median is 1.054) is as large as the differences between methods near the top. Several-policy-seed averaging per design would cost 10x.
- One agent run, an agent with a calibration-time prior that also wrote the model.
- Camera error, ripeness sensing and clutter are random draws, not an image pipeline.

## Lab tags
Builds loosely on the field-robot interests of ARPG (<https://arpg.colorado.edu/>) and RECUV (<https://www.colorado.edu/recuv/>) in motivation only: no paper of theirs is reproduced and nothing here is affiliated with or endorsed by them. Companion projects here: `osrobot-field` (weeding), `codesign-sar`, `codesign-gripper`, `codesign-diagnose`. Prior work: Ha, Xu and Song (2020), Fit2Form, on learning gripper form (not reproduced); Lehman et al. (2022) on evolution through large models; Tobin et al. (2017) on domain randomisation (not used). Open soft-fruit-harvesting systems and their bruise data were not used.

## Next steps
Make bruising bind (see Limitations) and re-run; average the policy search over seeds; swap the evolution-strategies policy for PPO in MuJoCo once contact is simulated; then `codesign-logistics` and `codesign-transfer` (widen friction, pad stiffness and mass randomisation and see whether the ranking of designs changes).

## Owner steps
Price a real bill of materials with dated sources, print the top design with a soft TPU pad, and measure bruising and drop rate on real berries against the simulated shares.

## Outside dependencies (vitamins)
Open-source Python packages (numpy, scipy, cma, matplotlib). No model API is called. A real servo, arm, camera and soft elastomer would be bought.

MIT.
