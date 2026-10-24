# Does a kernel MMD test catch the same wrong MuJoCo digital twins as a classifier two-sample test?

Track 11 (adversarial human imitation), side project: `mimic-mmd`'s next step, running the MMD on the MuJoCo twin of `mimic-mujocotwin`. **No LLM is used and no text is generated.** Stylised and simulated only. No lab's work is built on, and no lab endorses this project.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/mimic-mmdmujoco/

Numbers come from `experiments/results.txt`.

- **Setup.** The "real" system is a MuJoCo hinge pendulum (RK4, 0.002 s step, damping 0.025, dry friction 0.075, Student-t(3) sensor noise, sd 0.02 rad, 100 samples at 0.02 s, start angle uniform on [-2, 2]). Each twin changes one thing. Rejection means the statistic exceeds the 95th percentile of the same statistic for the exact twin at the same n, so the null rows are 0.05 by construction. Power is the share of replicates that reject (MMD: 100 replicates; C2ST: 20), with Wilson 95% intervals.
- **Integrator error: only the classifier sees it.** Semi-implicit Euler at 0.02 s: C2ST power 0.70 at n = 100 and 1.00 at n = 200; at 0.01 s 0.00 at n = 100 and 0.90 at n = 200. MMD, raw or on second differences, stays at 0.00 to 0.06, i.e. no power.
- **Noise-level error: only MMD on second differences (and the classifier) see it.** Noise sd +25%: MMD on second differences 0.95 at n = 100 and 1.00 at n = 200, C2ST 1.00; MMD on raw trajectories 0.02 to 0.03.
- **Noise-shape error (Gaussian vs Student-t, same sd): only the classifier sees it** (power 1.00 at both n); both MMDs stay near 0.03 to 0.07.
- **Friction error (-10%, -20%): nobody sees it at n <= 200.** All three detectors are at 0.00 to 0.05. Power below 0.05 here is noise around the null, not evidence of anything. `mimic-mujocotwin` found friction errors only with 800 trajectories per class.
- **So** on this twin the pattern of `mimic-mmd` (MMD with raw features is blind; second differences fix the noise-level case) holds, and MMD with a median-heuristic RBF kernel misses the dynamics errors and noise-shape error that boosted trees on raw plus second-difference features find.

```bash
cd research/mimic-mmdmujoco
pip install numpy scikit-learn mujoco
python3 -m unittest discover -s tests -v     # 8 tests
OMP_NUM_THREADS=1 python3 experiments/run.py # about 15 minutes on 4 CPUs, writes results.txt and results.json
```

Set `OMP_NUM_THREADS=1`: the boosted trees oversubscribe the CPUs under multiprocessing otherwise, and a first attempt without it did not finish in 30 minutes.

## Motivation

The portfolio's theme is simulation fidelity. A two-sample statistic is a fidelity score for any simulator, and track 11's detector is the same idea for text. This checks whether the kernel statistic of `mimic-mmd` carries over from a hand-written pendulum to a physics engine.

## Builds on

Gretton et al. (2012), "A Kernel Two-Sample Test", *JMLR* (unbiased MMD, median heuristic); Lopez-Paz and Oquab (2017), "Revisiting Classifier Two-Sample Tests", ICLR; Todorov, Erez and Tassa (2012), "MuJoCo", IROS. Code is copied from `mimic-mmd` and `mimic-mujocotwin` so this directory stands alone.

## Limitations

One toy system and one set of twins. Only 20 replicates for the C2ST, so its null threshold is a 95th percentile of 20 values and its intervals are wide (a power of 1.00 has a lower bound of 0.84). Two sample sizes only. The classifier's features were chosen in earlier projects after seeing the noise-shape result. The MMD kernel is the median-heuristic RBF with no tuning, and a learned kernel could do better. Friction power could not be separated from noise at these n. Nothing here is a claim about a physical pendulum.

## Next steps

Sweep n up to 800 so friction can be compared with `mimic-mujocotwin`; use more C2ST replicates; try a learned or classifier-feature kernel; use a multi-joint model with contacts.

## Owner steps

None.

## Outside dependencies

numpy, scikit-learn, mujoco. Produced with AI assistance (Claude). No LLM proposer was used.

MIT.
