# garment-smart: which sensors in a smart garment recognise what you are doing, and how fragile is that to garment slip? (stylised, synthetic data)

Seventh milestone of the engineered-clothing track (`PROJECTS.md`, track 6). A generator of synthetic sensing-garment signals (three 3-axis accelerometers at chest, thigh and wrist; two strain channels at knee and elbow), window features, and a small softmax classifier for six activities. The output is a context label that track 2's ambient assistant could consume. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-smart/

**Not a result about real garments.** No public sensor dataset was used (none was available in this container) and no garment was measured. Every signal is a sum of sinusoids with assumed amplitudes and frequencies that I chose, so the near-perfect accuracies below say the synthetic classes are easy to separate, not that real activity recognition is easy. Treat the *relative* comparisons as the content, and even those as properties of my generator.

**Builds on.** The textile-sensing idea of Project Jacquard (Poupyrev et al., 2016); I read nothing beyond its title and venue for this run and take no number from it. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them. The consumer, the ambient assistant, is the repository's `ambient-*` projects. **Citation check.** The entry was copied from the reference list in `PROJECTS.md` (checked 2026-10-12); this run could not re-check it (no access to doi.org).

## Method
`src/garment_smart/model.py`:
- Six activities (sit, stand, walk, run, stairs, wave), each with assumed gait frequency, body bounce, thigh swing, arm swing, knee and elbow flexion, trunk tilt. IMUs include gravity rotated by tilt; strain channels are offset sinusoids.
- Eight simulated "people" per dataset with log-normal scale factors (sd 0.15) on frequency and amplitude. Train and test use *different* simulated people, drawn independently.
- Noise: additive Gaussian (std 0.3 m/s² for IMUs by default; strain noise is 5% of that figure).
- Slip: each IMU is rotated about its y axis by a random angle (std in rad) per window, a stand-in for a garment shifting on the body. Strain channels are unaffected **by construction**, which drives result D.
- Features per channel: mean, std, dominant frequency, spectral peak share. Classifier: multinomial logistic regression in numpy.

## Reproduce
```bash
python3 -m pip install numpy pytest
cd research/garment-smart
python3 -m pytest -q tests            # 8 tests
python3 experiments/run.py            # a few minutes; writes experiments/results.txt
```
5 seeds, 120 windows per class per set.

## Results (from `experiments/results.txt`; synthetic data, chance 16.7%)
- **Subsets (A).** Best subsets reach 100.0% (chest + wrist IMU, with or without others). The full 5-sensor set gets 99.9%. Single sensors: knee strain 84.4%, chest IMU 83.0%, wrist IMU 72.0%, thigh IMU 71.6%, elbow strain 64.2%. Two sensors can reach ~99% (wrist IMU + knee strain 99.1%; chest + elbow strain 99.9%), because one covers limb-specific activities (wave) and the other body-level ones.
- **Noise (B).** With the full set, accuracy only falls from 99.9% to 98.5% as IMU noise rises from 0.1 to 4.0 m/s² (trained at the same noise). The classes are too separable in my generator for this sweep to be informative about hard cases.
- **Slip (C), the one result with a real gap.** Trained on clean data and tested with IMU rotation of std 0.3 / 0.6 / 1.0 rad, accuracy drops from 99.9% to 81.0 / 60.5 / 45.2%. Training with slip at 0.6 rad recovers 98.6 / 97.7 / 94.4% at a cost of 0.9 points on clean data (99.0%). This is a sim-to-sim robustness test: augmenting with the perturbation helps when test shift is of the type that was augmented.
- **Slip (D).** At slip 1.0 trained clean, IMU-only gets 40.5% and strain-only 97.4%. That strain-only wins is built into the model (slip does not touch strain); in a real garment strain channels have their own failure modes (stretch drift, hysteresis, fit-dependent baseline) that I did not model.

## Limitations
- **Stylised.** Invented sinusoidal signals, six well-separated classes, a single noise model, a slip model that is only a rotation about one axis, no sensor drift, no transitions between activities, no clothing motion artefacts beyond slip, no between-day variability. Real datasets give far lower accuracies than 99%.
- No comparison with a nonlinear model or with learned features; only a linear classifier on four hand-made features per channel.
- Window length (2 s), sample rate (50 Hz) and the people-variation sd were fixed, not swept.
- No power, latency or on-device cost is modelled; nothing was run on a microcontroller.

## Next steps
Repeat on a public wearable-activity dataset (for example, one with IMUs at chest, thigh and wrist) once the container can fetch one; sweep window length and sample rate against battery cost; model strain-sensor drift and hysteresis; stream the label into `ambient-interject`'s policies as a context signal.

## Owner steps
None required. A physical prototype would need an IMU board and a stretch sensor, with a sourced, dated bill of materials; not done here and no prices are claimed.

## Outside dependencies (vitamins)
Python, numpy. All signal shapes and constants are assumed.

## References
- Poupyrev, I. et al. (2016). Project Jacquard: Interactive Digital Textiles at Scale. CHI '16, 4216-4227. https://doi.org/10.1145/2858036.2858176
