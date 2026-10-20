# Can an imitator that changes its own code fool a human-vs-bot cursor detector, and does shared feedback help either side?

Milestone 9 (`mimic-cursor`) of track 11, adversarial human imitation: the first subject beyond writing, browser use. **Preliminary; results pending (the main run is in progress).** Produced with AI assistance (Claude). No model writes code here: both sides search a fixed library of code components.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/mimic-cursor/

Human references are cursor strokes from DUX (Bieber, Leppich, Harms and Schubert 2023, [Zenodo 7778612](https://zenodo.org/records/7778612), CC-BY-4.0): 46 people filling in a travel-expense web form. A stroke is a run of mouse-move events with no gap above 250 ms and no click or key in between; 7,695 strokes, split by person (24 people for the loop, 6 for the copy test, 16 held out).

## Method

- **Imitator (code is the free parameter).** A stroke generator from start to end point, assembled from components (`programs.py`): path (line, arc, S-curve, or a retrieved human template blended with a second one), speed profile, corrective submovements, noise, event clock (fixed, jittered, polled, a human clock, or the template's own), pixel rounding and a duration law. Search swaps components and changes their parameters.
- **Detector (code too).** Picks 3 of 11 feature functions (timing, straightness, speed, jerk, event intervals, pixel steps, submovements, heading changes and others) and fits a logistic regression.
- **Shared feedback.** Four conditions at the same budget of 4 candidates per side per round: *blind*; *d2i*, where the detector tells the imitator which features caught it and by how much, and the imitator uses that to choose which component to mutate; *i2d*, where the imitator shares its program, so the detector can draw 4 times more strokes; and *both*.
- **Scoring.** A reference detector the loop never sees (boosted trees on every feature, held-out people); the loop detector on held-out people; cross-play of every final detector against every final imitator.
- **No copying.** An imitator is invalid when more than 15% of its strokes are at least twice as close to the template pool as to six people it never saw (a data-copying test after Meehan et al. 2020).

## Found on the way

- The naive bot (a straight line at constant speed, fixed event interval, sub-pixel coordinates) is caught at AUROC 1.00, and so is every generator built from the hand-written kinematic components alone: the best of 150 random ones scored 0.996 against a plain logistic regression.
- Replaying a real person's stroke rotated and scaled onto a new start and end is still caught at AUROC 0.82, mostly by heading-change and pixel-step features: rotation breaks the screen-axis pixel quantisation of real mouse data. Tighter retrieval (within 3 degrees) reaches 0.56 but is close to copying (89% of strokes flagged).

## Reproduce

```bash
cd research/mimic-cursor
pip install numpy scipy scikit-learn
python3 -m unittest discover -s tests -v    # 9 tests
python3 data.py        # optional: rebuilds strokes.json.gz from Zenodo (319 MB download)
python3 run.py 30 8 4  # 4 conditions x 8 seeds x 30 rounds, about 90 minutes on 4 CPUs
python3 baselines.py && python3 report.py && python3 experiments/figure.py
```

## Builds on

`mimic-loop` and `mimic-crossplay` (the game and cross-play, on text). DUX for the data. Fitts (1954) and Flash and Hogan (1985) for the kinematic components; Meehan, Chaudhuri and Dasgupta (2020) for the data-copying test. No lab's work is built on and none is affiliated with or endorses this project.

## Guardrails

Generated strokes stay in this repository and are scored only offline by detectors built here. They are never replayed in a live site, CAPTCHA, login or bot filter, and the generator is not packaged for browser-automation tools. Every generator ships with the detector that answers it.

## Owner steps

None.

## Outside dependencies

DUX (CC-BY-4.0; `strokes.json.gz` is derived from it), NumPy, SciPy, scikit-learn. MIT.
