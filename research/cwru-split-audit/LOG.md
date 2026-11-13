# Research log: cwru-split-audit

## 2026-11-13 · Outcome: 100% on random and time splits, 44 to 71% with a fault size held out

- Ran `audit.py` once with the pre-registered settings (41 s on 4 cores). Normal recordings
  confirmed 48 kHz (10.1 s each, mains harmonics at 360 and 720 Hz) and decimated; 98.mat and
  99.mat carry no RPM, nominal speeds used.
- Accuracy S1 / S2 / S3 / S4: M1 envelope 85.6 / 85.2 / 83.9 / 53.0%; M2 forest 97.5 / 97.0 /
  94.1 / 44.2%; M3 MLP 100.0 / 100.0 / 99.4 / 70.7%; M4 1-NN 100.0 / 100.0 / 96.6 / 54.6%.
- H1 partly refuted (M2 97.5%, under the 98% bar; M3 100%). H2 supported (M3 faulty-only S4
  68.1%). H3 refuted (M1 drops 32.6 points, M3 29.3).
- Held-out load (S3) barely moves anything: the same seeded bearing runs at all four loads, so
  it is not a generalisation test. Only the held-out fault size removes the bearing.
- Next: spectral-kurtosis band for M1, a 1-D CNN, and Paderborn (several bearings per class).

## 2026-11-13 · Pre-registration: four splits, three models, before any classifier is run

Question: the Case Western Reserve University (CWRU) bearing data is the most used benchmark in
vibration-based bearing diagnosis, and papers routinely report 99 to 100% accuracy on it. How much
of that survives when train and test share no recording, and when they share no damaged bearing?

Data: the 40 standard 12 kHz drive-end recordings (normal, and inner race, ball and outer race
@6:00 faults of 0.007, 0.014 and 0.021 in, each at 0 to 3 hp), downloaded from the CWRU Bearing
Data Center, SHA-256 of each file recorded in `data.py`.

Planned analysis (fixed before running):

- Windows of 2048 samples, 50% overlap. Normal recordings are checked for their true sample rate
  (shaft peak position) and decimated to 12 kHz if they turn out to be 48 kHz.
- Models: M1 envelope-spectrum features at the bearing's own defect frequencies (BPFI, BPFO,
  2×BSF, harmonics 1 to 3, band 1.5 to 5 kHz) + logistic regression; M2 ten time-domain statistics
  + random forest; M3 log FFT magnitude + MLP; M4 log FFT magnitude + 1-nearest-neighbour.
- Splits: S1 random window split 70/30 (the common practice, 5 seeds); S2 per-recording time
  split (first 70% of windows train, last 30% test, one-window gap); S3 leave one motor load out
  (10 classes); S4 leave one fault size out (4 classes: normal, inner, ball, outer; the only
  split where test faults come from bearings never seen in training).
- Intervals: S1 mean and range over seeds; S2 to S4 a 95% cluster bootstrap over recordings
  (windows from one recording are not independent).

Hypotheses:

- H1: under S1, M2 and M3 reach at least 98% accuracy (replicates the literature). Refuted if
  either is below 98%.
- H2: under S4, M3's accuracy on the faulty test windows (3 locations) is below 80%. Refuted if
  it is 90% or more.
- H3: M1 (physics features) loses fewer accuracy points from S1 to S4 than M3. Refuted if its
  drop is equal or larger.
