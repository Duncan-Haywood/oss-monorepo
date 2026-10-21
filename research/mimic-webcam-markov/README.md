# Can a learned per-person Markov chain over webcam frames fool a detector where a hand-written generator could not? No: it is caught at AUROC 1.000

Follow-up to `mimic-webcam-persongen` (track 11, adversarial human imitation), whose "Next steps" asked whether a learned, non-parametric per-person model could reach the copying generators (AUROC 0.57 to 0.65) where a hand-written parametric one stayed at 1.000. **Negative result, preliminary and stylised: 46 people filling in one web form, one context, 3 seeds.** Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/mimic-webcam-markov/

**Result.** A first-order Markov chain over 32 k-means frame states, counted from one person's first-half windows, generates windows that a boosted-tree detector separates from that person's later real windows at AUROC 1.000, whether it emits a real frame of the state or the centroid plus Gaussian noise, whether the chain is the person's own or pooled over the other 45 people, and with or without the person's profile (pooled, frame emission: 0.999). The K sweep (4, 8, 32, 128 states, one seed) is 1.000 throughout. Every one of the eight feature groups alone catches the own chain: level 0.969, spread 0.967, extremes 0.996, roughness 0.996, autocorrelation 0.999, holds 0.998, floor 0.900, cross-channel 0.793.

![AUROC of single-feature-group detectors against the Markov generators](experiments/markov.svg)

## Method

Data, features, split and detector are those of `mimic-webcam-persongen` (imported; nothing copied): 100-frame windows at 10 Hz, 12 channels, each person's windows in file order split in half (fit, held), detector trained on real fit windows against generated fit-half windows and scored on real held against generated held-half windows. `markov.py` is the new generator: k-means (K=32) on the fit frames, a transition matrix counted within windows (add-0.1 smoothing), the start state from the first frames, and a random walk of 100 states. Emissions: `frame` (a random real frame of the state) and `gauss` (centroid plus the state's per-channel standard deviation). `own` fits on the person's fit windows, `pooled` on 400 windows sampled from the other people. `diag.py` runs one-feature-group detectors (3 seeds) and the K sweep (seed 0).

## Results (`results/markov.txt`, `results/diag.txt`)

| generator | population detector | profile-aware detector |
|---|---|---|
| own markov frame | 1.000 | 1.000 |
| own markov gauss | 1.000 | 1.000 |
| pooled markov frame | 0.999 | 0.999 |
| pooled markov gauss | 1.000 | 1.000 |

- The chain is worse than a copy of the same frames: 50-frame blocks of the person's own windows were 0.654 and whole windows 0.593 in `mimic-webcam-persongen`. The frames are the same; what differs is that a window-long walk loses window-scale structure (a person's level and spread within a window, long holds). Level alone separates it at 0.97, which fits a walk that drifts toward the chain's stationary mix of states rather than staying near one window's level.
- Real-frame emission is not safer than Gaussian emission (0.969 against 0.992 on level alone, otherwise within 0.02), so the giveaway is the order, not the invented values.
- Quantising finer does not help (K up to 128): the missing structure is longer than one step, so a first-order chain cannot hold it.

## Limitations

- First-order chains only; no higher order, no hidden state, no per-window level variable, and no sequence network. The result says nothing about those.
- K was swept once, with one seed; the main table has 3 seeds (all within 0.001 of each other).
- One context, 46 people, a chronological half split, a boosted-tree detector. No human judges, no pixels, no faces; signals stay in this repository.

## Next steps

Give the chain a per-window latent (a level and spread drawn per window from the person's history, then a chain on residuals), or a hidden-state model, and see which single feature group falls first; the diagnosis here says level and spread are the cheapest to fix.

## Reproduce

```bash
cd research/mimic-webcam-markov
pip install numpy scipy scikit-learn
python3 -m unittest discover -s tests -v   # 4 tests
python3 run.py 3        # about 10 minutes, writes results/markov.{json,txt}
python3 diag.py         # about 1 minute, writes results/diag.{json,txt}
python3 experiments/figure.py
```

Run one at a time: two at once oversubscribed the 4 cores and slowed both many times over.

## Builds on

`mimic-webcam-persongen` (split, detector, scoring), `mimic-webcam` (data, features). DUX (Bieber et al. 2023, [Zenodo 7778612](https://zenodo.org/records/7778612), CC-BY-4.0). No lab's work is built on and none is affiliated with or endorses this project.

## Owner steps

None.

## Outside dependencies

numpy, scipy, scikit-learn. Produced with AI assistance (Claude).

MIT.
