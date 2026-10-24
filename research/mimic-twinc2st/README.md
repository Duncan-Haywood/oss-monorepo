# Does a classifier two-sample test catch digital-twin errors that a paired trajectory error misses?

A side project of track 11 (adversarial human imitation), milestone 8's idea that a detector's score is a fidelity score for any simulator, applied to a physical twin. It was chosen because the track's main milestone (`mimic-loop`) needs local LLM weights, and Hugging Face was unreachable (HTTP 403) from this run's container. **No LLM is used and no text is generated.** Stylised and simulated only.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/mimic-twinc2st/

Numbers come from `experiments/results.txt`.

- **Setup.** The "real" system is a pendulum (RK4, dt 0.02 s, 100 steps, start angle uniform on [-2, 2] rad, released at rest) with viscous friction 0.1, Coulomb friction 0.3 and Student-t (3 d.o.f.) sensor noise, sd 0.02 rad. A twin is the same simulator with one thing changed. The C2ST trains a classifier to separate 800 real from 800 twin trajectories (independent start angles) and reports 5-fold cross-validated AUROC, mean and sd over 3 seeds. The conventional score is paired RMSE: the twin's noise-free trajectory against the real noise-free one from the same start angle.
- **Dynamics error.** Boosted trees on raw angles: AUROC 0.52 for the exact twin (the null), 0.72 when Coulomb friction is 10% too low (paired RMSE 0.0055 rad, about a quarter of the noise sd), 0.91 at 20% (0.011 rad), 0.98 at 33%, 1.00 with no Coulomb friction (0.057 rad).
- **Error the paired metric cannot see.** Exact dynamics but Gaussian noise of the same sd: paired RMSE is exactly 0, yet AUROC is 0.92 with boosted trees on raw angles plus second differences (0.59 on raw angles alone). A noise-level error of -25% or +25% reaches 0.86 and 0.81 with those features (0.59 and 0.57 on raw angles); -10% and +10% reach only about 0.62.
- **A weak detector fails silently.** Logistic regression on raw angles sits at 0.51 in every row, including a twin with no Coulomb friction at all. Start angles are symmetric about 0, so a linear rule on raw angles has no signal. A C2ST at chance means "this classifier found nothing", not "the twin is good".
- **Not a free lunch.** The C2ST's power depends on the classifier and features, and on sample size (800 per class here); the paired metric needs matched start states, which real data often lacks.

```bash
cd research/mimic-twinc2st
pip install numpy scipy scikit-learn
python3 -m unittest discover -s tests -v     # 8 tests
python3 experiments/run.py                   # about 7 minutes on 4 CPUs, writes experiments/results.txt
python3 experiments/figure.py                # experiments/c2st_vs_mismatch.svg
```

## Motivation

The portfolio's theme is simulation fidelity. Paired trajectory error is the usual score but needs the same initial state in simulation and reality, and measures only the mean. A classifier two-sample test compares the distributions, noise included, with no pairing. The imitation game of track 11 is the same test with a language model as simulator.

## Builds on

Lopez-Paz and Oquab (2017), "Revisiting Classifier Two-Sample Tests", ICLR: the C2ST. Goodfellow et al. (2014), "Generative Adversarial Nets", NeurIPS: a discriminator as a score for a generator. Pedregosa et al. (2011), scikit-learn, *JMLR*: the classifiers (`LogisticRegression`, `HistGradientBoostingClassifier`). No lab's work is built on, and no lab is affiliated with or endorses this project.

## Method

`twin.py` holds the simulator, the two noise models (variance matched, Student-t scaled by 1/sqrt(3)), the feature sets (raw angles; raw plus second differences, their maximum absolute value and mean fourth power) and the C2ST. `experiments/run.py` sweeps Coulomb friction, noise shape and noise level.

## Limitations

One toy system, one real parameter set, two noise families, three seeds and three classifier settings; the intervals are seed spread, not bootstrap intervals. Detection thresholds depend on the classifier (hyper-parameters were not tuned) and on sample size. Real and twin samples use different start angles, and real hardware would add effects absent here. Nothing here is a claim about a physical pendulum, and the noise features were chosen after seeing that raw angles missed noise-shape errors, so the second-difference result is exploratory. The true Coulomb term uses a smooth tanh, so "no Coulomb friction" is a different model, not a discretisation error.

## Next steps

Sweep sample size, add a Binoculars-style or sequence-model detector, and apply the same C2ST to a MuJoCo twin of the same system. Then use it as the fidelity score for the imitator in `mimic-loop` once model weights are reachable.

## Owner steps

Make a local small instruct model reachable (Hugging Face is blocked from the run container) so `mimic-loop` can run.

## Outside dependencies

numpy, scipy, scikit-learn. Produced with AI assistance (Claude). No LLM proposer was used.

MIT.
