# Does giving a webcam-signal generator real heavy tails and bursts fool a detector? No: it still separates at AUROC 1.000

Follow-up to `mimic-webcam` (track 11, adversarial human imitation), the "heavy-tailed, zero-inflated component" next step. **Preliminary, stylised: 46 people filling in one web form, one context, six hand-built generators plus one baseline, 8 seeds.** Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/mimic-webcam-tails/

**Result.** A generator that takes each channel's marginal from the training people (a Gaussian copula through the pooled empirical quantiles, or a quiet/burst two-state sampler) does not fool a boosted-tree reference detector on 14 held-out people: all-groups AUROC is 1.000 for every variant (lowest single seed 0.999). Single feature groups tell more: the plain empirical-marginal generators are *easier* to catch on level and spread (0.99 to 1.00) than the Gaussian baseline (0.91, 0.94), because the baseline drew each window's level and spread from a real window and the new ones do not. Adding that back (G5) drives level to 0.54 and spread to 0.57, near chance, but extremes (0.995), holds (0.995) and autocorrelation (0.94) still give it away. G6 then matches each window's whole value distribution to a real window (ranks from the copula, values from a training window), which puts level, spread, extremes and floor at chance (0.44 to 0.46) yet all-groups AUROC is still 0.998: holds (0.999), autocorrelation (0.89), roughness (0.75) and cross-channel structure (0.83) carry the detection.

## Method

Same data, person split, feature groups and reference detector as [`mimic-webcam`](../mimic-webcam) (imported from it; no data is copied). Per seed: 24 people to fit the generator and train the detector, 14 held-out people to score. Generators (`tails.py`):

| id | generator |
|---|---|
| G0 | the best fixed generator of `mimic-webcam` (Gaussian AR(1), channel correlation, window levels, holds, spikes) |
| G1 | Gaussian copula: AR(1) latent per channel, channel correlation, mapped through each channel's pooled empirical quantile function |
| G2 | G1 plus holds at the training repeat rate |
| G3 | regime: per channel a quiet state (values at or below the 60th percentile) and a burst state, Markov switching fitted from training, values drawn from the training pools |
| G4 | G3 plus holds |
| G5 | G2 with each channel's window mean and spread reset to a random training window's |
| G6 | copula dynamics, then each channel's sorted values replaced by a random training window's, in the copula's rank order (so the window's level, spread, max, min and floor match exactly), then holds |

The detector is gradient-boosted trees on all eight groups (the "all groups" column), and on one group at a time (the other columns).

## Results (mean reference AUROC of 8 seeds, `results/tails.txt`)

| generator | all | level | spread | extremes | roughness | autocorr | holds | floor | cross |
|---|---|---|---|---|---|---|---|---|---|
| G0 baseline | 1.000 | 0.907 | 0.937 | 1.000 | 0.936 | 0.954 | 0.995 | 0.914 | 0.772 |
| G1 copula | 1.000 | 0.991 | 0.989 | 0.999 | 1.000 | 0.998 | 1.000 | 0.970 | 0.968 |
| G2 copula + holds | 1.000 | 0.989 | 0.984 | 0.999 | 0.997 | 0.981 | 0.995 | 0.964 | 0.952 |
| G3 regime | 1.000 | 0.999 | 0.999 | 1.000 | 1.000 | 1.000 | 1.000 | 0.999 | 0.990 |
| G4 regime + holds | 1.000 | 0.998 | 0.997 | 1.000 | 0.999 | 1.000 | 0.994 | 0.997 | 0.986 |
| G5 copula + window level/spread + holds | 1.000 | 0.539 | 0.567 | 0.995 | 0.720 | 0.942 | 0.995 | 0.823 | 0.823 |
| G6 copula ranks through a real window's values + holds | 0.998 | 0.456 | 0.447 | 0.445 | 0.750 | 0.886 | 0.999 | 0.464 | 0.828 |

- Matching marginals is not what was missing. The window-to-window variation in level and spread is a structure the pooled marginals wash out, and a window's extremes remain a giveaway even when level and spread are matched.
- G6 shows the extremes giveaway was a per-window max/min effect: copying a real window's value set removes it (0.445, slightly below chance, which with 14 test people is noise-level). What remains is temporal: the copula's AR(1) rank order and the hold mechanism (a held frame repeats exactly, which the holds group sees at 0.999 even at the training rate).
- Fixing one group is not enough because the reference detector uses all eight; every group would need to be near chance at once.
- The replay ceiling of `mimic-webcam` (0.61) says even real people from the training set are not at chance against this reference detector, so near-0.5 is not reachable for any generator.

## Limitations

- The generators are written by hand, not found by a loop; no model writes code (that is `mimic-codeloop`, still to do). G5 was added after seeing G1 to G4 fail on level and spread, so it is a post-hoc probe, not a pre-registered one.
- One context, one coding tool, short windows, 46 people, windows biased toward input activity (see `mimic-webcam`).
- Per-group AUROCs are of a single-group detector and are not additive.
- A regime generator edge case (a channel with no burst values, such as constant Neutral) was fixed after the 8-seed run by falling back to the quiet pool; it did not occur in the real data, so the results stand.
- No human judges, no pixels, no faces. Generated signals stay in this repository, are not sent anywhere as signals from a person, and the detector (`run.py`) ships with them. No fairness breakdown: DUX records no group labels.

## Next steps

Per-window max/min matching is done (G6). The remaining giveaways are temporal: take roughness, autocorrelation and holds as the target (e.g. resample whole real hold/run-length patterns), or let a loop (or a code model, `mimic-codeloop`) choose among the components.

## Reproduce

```bash
cd research/mimic-webcam-tails
pip install numpy scipy scikit-learn
python3 -m unittest discover -s tests -v   # 5 tests
python3 run.py 8                           # about 4 minutes on a few CPUs, writes results/tails.{json,txt}
```

## Builds on

`mimic-webcam` (data, features, detector). DUX (Bieber et al. 2023, [Zenodo 7778612](https://zenodo.org/records/7778612), CC-BY-4.0). No lab's work is built on and none is affiliated with or endorses this project.

## Owner steps

None.

## Outside dependencies

numpy, scipy, scikit-learn. Produced with AI assistance (Claude).

MIT.
