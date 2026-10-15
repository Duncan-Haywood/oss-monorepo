# Does a classifier two-sample test see the sim-to-sim gap of a MuJoCo digital twin: integrator, timestep and friction?

A side project of track 11 (adversarial human imitation). It applies the classifier two-sample test (C2ST) of `mimic-twinc2st`, a detector's AUROC used as a fidelity score for a simulator, to a pendulum simulated in MuJoCo instead of a hand-written RK4. It was chosen because `mimic-loop` needs local LLM weights that this container cannot reach, and MuJoCo (pip) was the named next step of `mimic-twinc2st`. **No LLM is used and no text is generated.** Stylised and simulated only; builds on none of the labs in `prompt.md`.

Numbers come from `experiments/results.txt` (800 real + 800 twin trajectories, 3 seeds).

- **Setup.** "Real" is a MuJoCo hinge pendulum (point mass 1 kg at 0.5 m, joint damping 0.025, dry friction `frictionloss` 0.075) integrated with RK4 at 0.002 s, sampled every 0.02 s for 100 samples, with Student-t (3 d.o.f.) sensor noise of sd 0.02 rad. A twin changes one thing: the integrator or timestep, or the friction. The paired RMSE compares noise-free trajectories from the same start angle; the C2ST uses independent start angles.
- **Timestep gap.** Semi-implicit Euler at 0.02 s (a typical coarse simulation step): paired RMSE 0.028 rad, AUROC 0.977. At 0.01 s: 0.014 rad, 0.901. At 0.005 s: 0.007 rad, 0.672. At 0.002 s: 0.003 rad, 0.530, which is within about 1.3 sd of the null (0.506 ± 0.019) and so not distinguishable from it with 3 seeds. RK4 at 0.02 s (RMSE 0.001) sits at 0.514.
- **Friction gap.** `frictionloss` 10% low (RMSE 0.004): 0.524, not distinguishable from the null. 20% low (0.009): 0.608. No dry friction (0.044): 0.997.
- **The gap a paired error cannot see.** Exact dynamics but Gaussian noise of the same sd: paired RMSE is exactly 0, AUROC 0.920. This reproduces, in a different simulator, the finding of `mimic-twinc2st` (0.92 there).
- **Reading.** For this setup the C2ST starts to see a deterministic twin error once its paired RMSE exceeds roughly a third of the noise sd (0.007 rad of 0.02), and is at chance below about a seventh. This is a description of these runs, not a general threshold: it depends on the classifier, features, sample size and noise.

```bash
cd research/mimic-mujocotwin
pip install numpy scikit-learn mujoco
python3 -m unittest discover -s tests -v     # 6 tests
python3 experiments/run.py                   # about 10 minutes on 4 CPUs (do not run other heavy jobs alongside)
python3 experiments/figure.py                # experiments/c2st_vs_error.svg
```

## Motivation

The portfolio's theme is simulation fidelity. The cheapest sim-to-sim gaps in practice are a bigger timestep or a different integrator, and a model's dry-friction constant. `mimic-twinc2st` showed that a detector's AUROC sees more than a paired error on a toy pendulum. This project asks whether that holds for a real physics engine's own numerical gaps.

## Builds on

Lopez-Paz and Oquab (2017), "Revisiting Classifier Two-Sample Tests", ICLR: the C2ST. Todorov, Erez and Tassa (2012), "MuJoCo: A physics engine for model-based control", IROS: the simulator (Apache-2.0, installed with pip, not vendored). Pedregosa et al. (2011), scikit-learn, *JMLR*: the classifier. The project follows `mimic-twinc2st` in this repository, whose simulator it replaces. No lab is affiliated with or endorses this project.

## Method

`twin.py` builds the MuJoCo model from an XML string, runs it with a chosen integrator (`mjINT_RK4` or `mjINT_EULER`) and timestep, adds noise, computes features (raw angles, second differences, their maximum absolute value and mean fourth power) and the 5-fold cross-validated boosted-tree AUROC. `experiments/run.py` sweeps the twins above.

## Limitations

One toy system, one real parameter set, one classifier and feature set, 3 seeds (the spread is seed spread, not an interval) and 800 samples per class. Detection thresholds depend on all of these, and the null's sd (0.019) means differences below about 0.03 in AUROC are not resolved. `frictionloss` is a soft constraint in MuJoCo, so its numerical error interacts with the timestep; this was not separated. The "real" system is itself a simulation, with a finer timestep standing in for reality, so nothing here is a claim about a physical pendulum. The noise features were chosen in `mimic-twinc2st` after seeing that raw angles miss noise-shape errors.

## Next steps

Sweep sample size per twin (see `free-c2stpower` for the pendulum), add a sequence-model detector, a multi-joint MuJoCo model with contacts, and use the C2ST as the fidelity score for the imitator in `mimic-loop` once model weights are reachable.

## Owner steps

None for this project. (`mimic-loop` still needs a reachable local small instruct model.)

## Outside dependencies

MuJoCo (Apache-2.0), numpy, scikit-learn. Produced with AI assistance (Claude). No LLM proposer was used.

MIT.
