# water-leaks: does a water-leak detector on the BattLeDIM benchmark beat random alarms?

A research programme ([`PROPOSAL.md`](PROPOSAL.md), [`LOG.md`](LOG.md)) on leak detection and localisation in water distribution networks, run on the real **BattLeDIM 2020 L-Town benchmark**: 33 pressure sensors, 3 inlet flows and a tank level at 5-minute steps for 2018 and 2019, and the published leak schedule (Vrachimis et al. 2022; dataset on Zenodo, CC-BY-4.0). Track 21 (`infra`); it picks up the L-Town milestone that [`infra-waterloss`](../infra-waterloss) had to run on Net3 because the data host was unreachable then.

**Live page:** https://marisstella.app/research/water-leaks/

**Headline (steps 1 and 2, 2026-11-12; a simulated benchmark network, not a utility).** Two data-driven detectors with no hydraulic model, each tuned on 2018 only and scored once on 2019, raise 26 alarms over the two years. Our residual CUSUM (D1) detects **13 of the 19 leaks that start in 2019 with 2 false alarms**; an automatic reimplementation of the published **LILA** method (Daniel et al. 2022) detects **14 with 1 false alarm**. **The same 26 alarms placed at random detect a median 11** (95% range 8 to 13): D1's count is within chance (P = 0.105) and LILA's just outside it (P = 0.019), but a disclosed change of LILA's tie-break rule puts it back inside (13 of 19 with 28 alarms, P = 0.265), and only 2 of the 13 LILA settings with 20 or more alarms clear P < 0.05. Where both clearly beat chance is location: the sensor that raises the alarm is within 300 m of the leak along the pipes for **5 of 13 (D1) and 7 of 14 (LILA), against a chance median of 0** (P < 0.001 in every one of the 27 LILA settings). On L-Town, a detection count says little; the location-aware score is the one that separates methods from luck.

**Step 6 (2026-11-13): minimum night flow does not catch the small leaks earlier.** The leakage engineer's standard statistic for slow, incipient leaks, the night's minimum district inflow (p227 + p235 less the tank's storage change), tuned on 2018 the same way, **detects only 3 of the 9 leaks of 2019 under 12 m³/h, against 7 for the pressure CUSUM D1 and 7 for LILA**, and is earlier than D1 on 1 of the 9 (pre-registered H4 refuted). The reason is in the data: the nightly minimum moves by a robust sd of about **11 m³/h** from one night to the next, as large as the leaks themselves. It finds 10 of all 19 with 6 false alarms (chance with 25 alarms: median 11, P = 0.80). On L-Town, the 33 pressure sensors carry the small-leak signal; the district meter alone does not.

**Step 7 (2026-11-13): fixing night flow's noise does not fix it, and the small leaks pressure "found" were luck.** Correcting the nightly minimum for its weekday pattern and subtracting the 82 smart (AMR) meters' night use halves its spread, from 10.7 to **5.1 m³/h**, yet the corrected statistic (M4, declared primary) still **detects 3 of the 9 small leaks**, earlier than the pressure CUSUM on 2 (H4 refuted again; the AMR-only variant finds 6 of 9 but with a median delay of 473 h). The ground-truth leak flows say why: **five of the nine are slow ramps that leak under 0.5 m³/h at night for their first week and 1.3 to 6 m³/h by day 30**, below any district-meter statistic inside the 30-day matching window. And the pressure detectors' credited hits on those ramps came when the leak was carrying **0.01 to 0.22 m³/h**: chance matches, not detections. A detection-only score on L-Town should credit an alarm only once the leak's own flow passes a stated level.

![The 9 small 2019 leaks' own flow over their first 30 days, M4's spread and D1's credited hits](experiments/step7-mnf2/small_leaks.svg)

We also found that **the released LILA identification code is not a blind detector**: its notebook writes in, for each known 2019 leak, the pipe, its most affected sensor and the calibration windows, and then dates that one leak (it prints a 0 h delay for p523). Our automatic version runs LILA's identification over a whole year without those inputs; we know of no earlier such run.

![D1 and automatic LILA against random alarms on the 2019 new leaks](experiments/step2-lila/lila_vs_chance.svg)

## Why this question

Every L-Town result we could read reports true-positive rates and false-alarm counts (Melnikov 2025, Table 2, gathers the top BattLeDIM teams: 43 to 74% of 23 leaks, 1 to 4 false alarms) and none a chance level. L-Town's 2019 has 23 leaks, many running for months, so a generous matching window covers much of the year. The competition's own rule needed a reported pipe within 300 m, which is what gives its score teeth; our step 1 measures how much. The programme then asks for a detector whose false-alarm rate is fixed before the year is seen (an e-process threshold), and for localisation on the nominal model ([`PROPOSAL.md`](PROPOSAL.md), H1 to H4).

**Builds on.** The BattLeDIM benchmark (Vrachimis et al. 2022, [doi:10.1061/(ASCE)WR.1943-5452.0001601](https://doi.org/10.1061/(ASCE)WR.1943-5452.0001601); data [doi:10.5281/zenodo.4017659](https://doi.org/10.5281/zenodo.4017659)); the data-driven entries LILA (Daniel et al. 2022, [doi:10.1061/(ASCE)WR.1943-5452.0001535](https://doi.org/10.1061/(ASCE)WR.1943-5452.0001535)) and SICAMS (Melnikov 2025, [arXiv:2512.15685](https://arxiv.org/abs/2512.15685)), whose leak-onset table our ground truth matches; Page's (1954) CUSUM ([doi:10.1093/biomet/41.1-2.100](https://doi.org/10.1093/biomet/41.1-2.100)). LILA's released identification code ([SWN-group-at-TU-Berlin/LILA](https://github.com/SWN-group-at-TU-Berlin/LILA), GPL-3.0), read for step 2. Our own [`infra-waterloss`](../infra-waterloss) and [`infra-leakpdd`](../infra-leakpdd). Full related work: [`PROPOSAL.md`](PROPOSAL.md).

## Method (step 1)

![D1 against random alarms on the 2019 new leaks](experiments/step1-baseline/chance.svg)

- **Data (`src/water_leaks/data.py`).** Fetched from Zenodo record 4017659 (or, when Zenodo is unreachable, from two public GitHub copies pinned to a commit, accepted only if the SHA-256 matches Zenodo's) into a cache (`$WATER_LEAKS_CACHE`, default `~/.cache/water-leaks`), checked by SHA-256; not copied into the repository. Hourly means of the 5-minute data.
- **Ground truth (`score.py`).** A leak's onset is the first non-zero flow in `<year>_Leakages.csv` (it matches the onsets in Melnikov 2025's appendix table; the configuration file's start times differ for incipient leaks). The four leaks running from 2018 into 2019 (p257, p427, p654, p810) keep their 2018 onset, so 2019 has 19 new leaks.
- **Detector D1 (`detect.py`).** For each pressure sensor and day, least squares on 48 hour-of-day × weekday/weekend indicators, the tank level and (variant F) the three inlet flows, fitted on the days [d − 21, d − 7) so a new leak is not absorbed for a week; residuals standardised by the window's residual sd; a one-sided CUSUM per sensor on the negative residuals (k = 0.5); an alarm resets every CUSUM and re-anchors the window at the alarm day, so the declared leak becomes baseline, and scoring resumes once the window holds 7 days (14 days blind after an alarm).
- **Tuning.** On 2018 only: the threshold h with the most 2018 detections at no more than 2 false alarms (13 values from 10 to 480). 2018's labels are used, which BattLeDIM's competitors did not have (they had repair times).
- **Matching.** An alarm counts for the running, unmatched leak with the latest onset if it falls within 30 days of that onset; any other alarm is false. Detection only: no pipe is reported, so this is not the competition's score.
- **Chance level.** The same number of alarms over the same 2018-19 period, at random hours at least 14 days apart (D1's blind time; drawn uniformly over such spaced sets), each from a random sensor, scored identically; 1,000 seeded draws.
- **Distances (`network.py`).** From the alarming sensor's node to the leak pipe's midpoint, straight and along the pipe graph (pumps and valves as zero-length links), from `L-TOWN.inp`.

## Results (`experiments/step1-baseline/results.txt`; deterministic)

| 2019, 19 new leaks | D1-F (with flows, h = 240) | chance, same 26 alarms: median (95%) | P(chance ≥ D1) |
|---|---|---|---|
| detected (30-day window) | 13 | 11 (8 to 13) | 0.105 |
| false alarms | 2 | 2 (0 to 4) | 0.778 |
| detected within 72 h | 4 | 2 (0 to 5) | 0.145 |
| alarming sensor ≤ 300 m along pipes | 5 | 0 (0 to 2) | < 0.001 |
| both | 3 | 0 (0 to 1) | < 0.001 |

- **Per leak.** The first big burst is caught within a day (p523, 28 m³/h peak, at +22 h by n506, 86 m away), and the small abrupt p680 (5.4 m³/h) at +11 h by a sensor 288 m away. The second burst, p827 (26 m³/h), starts 9 days after p523's alarm, inside the 14-day blind time the re-anchoring costs, and is caught only at +146 h: the price of that design, and a target for the next one. Median delay over the 13 is 104 h (11 to 341). Missed: p277, p586, p653, p710, p721, p762 (5.6 to 20.5 m³/h peak). Full table in `results.txt`.
- **On BattLeDIM's 23-leak count**, adding the 3 of 4 carried-over leaks D1 found in 2018: 16 of 23 detected, without localisation. The published 15 to 17 of 23 (Steffelbauer et al. 2022, SICAMS, Barros et al. 2025, as tabulated by Melnikov 2025) required a pipe within 300 m, so they are not comparable with this number.
- **Without flows (variant L, h = 80):** 10 of 19 with 3 false alarms, below chance on the count (P = 0.878) but 6 within 300 m (P < 0.001).
- **Water.** 64% of the 2019 new leaks' volume (285,791 of 444,340 m³) flows after D1's alarms: the share an instant repair on alarm would save. An upper bound on value, since repairs take days.
- **Pre-registered H1-step1** (at least 9 of 19 with at most 4 false alarms): held, and is uninformative, since chance alone reaches 11. Logged in [`LOG.md`](LOG.md) with the design change made after a first look at 2019.

### Checks (`tests/`, 18)
Decimal-comma SCADA parsing; leak list from the configuration file; hourly means; weekday/weekend columns; a synthetic 10-sd step on one of three sensors gives residuals below −5 and one alarm within a day (and the old hold-off version alarms twice); CUSUM ignores upward shifts; matching picks the latest onset and closes the 30-day window; carried-over leaks keep their 2018 onset; graph and straight distances on a three-link network. Step 2: pairwise models reconstruct leak-free data and predict each sensor itself exactly; a 1 m drop at one sensor gets every model's vote, while other sensors tie with it in more than half the steps and the norm tie-break finds it every time; automatic LILA raises one alarm for a step, at that sensor, within a day; a sensor rarely the MAS keeps a finite sd. Step 6: the water balance removes the tank's storage change; the night minimum uses hours 00 to 05 only; a 5-sd step in synthetic night minima alarms once within three nights and is then absorbed. Step 7: weekday offsets recover a planted weekly pattern and ignore nights outside the training set.

## Step 2: LILA, automatic (`src/water_leaks/lila.py`, `experiments/step2-lila/`)

**Method.** LILA's leakage identification (Daniel et al. 2022) reimplemented under MIT from the paper and from reading the authors' GPL-3.0 code (no code copied): LI-1, for every ordered pair of the 33 pressure sensors, a regression of p<sub>j</sub> on p<sub>i</sub> and the main inlet flow PUMP_1; LI-2, at each hour the most affected sensor (MAS) is the one the most models find lower than predicted, and its reconstruction error (MRE) is the norm of its errors; LI-3, Montgomery's tabular CUSUM on each sensor's MRE with slack delta/2 sd and threshold C_thr sd. To run it blind, the reference period is D1's trailing window (two weeks ending a week back, re-anchored after each alarm). One change from the released code, fixed before any score: a sensor rarely the MAS in its window gets the median sd, not NaN, which would switch it off for good. Grid: delta in {1, 2, 4} by C_thr in {3 ... 300} and the 2018 selection rule of step 1, written in [`LOG.md`](LOG.md) before any score was seen.

**Results** (`experiments/step2-lila/results.txt`, deterministic). Chosen on 2018: delta = 1, C_thr = 20 (2018: 11 of 13, 0 false alarms).

| 2019, 19 new leaks | LILA-auto | D1-F (step 1) | chance, 26 alarms: median (95%) | P(chance ≥ LILA) |
|---|---|---|---|---|
| detected (30-day window) | 14 | 13 | 11 (8 to 13) | 0.019 |
| false alarms | 1 | 2 | 2 (0 to 4) | 0.964 |
| detected within 72 h | 3 | 4 | 2 (0 to 5) | 0.341 |
| alarming sensor ≤ 300 m along pipes | 7 | 5 | 0 (0 to 2) | < 0.001 |
| both | 2 | 3 | 0 (0 to 1) | 0.005 |

- **Per leak.** p523 (28 m³/h) and p680 (5.4 m³/h) at +2 h, each with the MAS within 300 m; median delay 138 h (2 to 301). Missed: p123, p142, p193, p586, p653 (9 to 27 m³/h). On BattLeDIM's 23-leak count, 16 of 23 with the 2 carried-over leaks found in 2018, the same as D1 and, again, without a reported pipe.
- **H1 (pre-registered) is refuted on its letter**: the 2018-chosen LILA setting raises 26 alarms and its detection count has P = 0.019. The refutation is thin. Across the grid, 2 of the 13 settings with 20 or more alarms have P < 0.05 (300 draws each), and the margin is one leak above chance's 97.5th percentile.
- **LI-2's vote ties often.** In 46% of the hours from 15 January to 14 February 2018, more than one sensor has the top vote count: the inlet flow drives every sensor, so all models agree on the sign of a sensor's own noise. The pre-registered rule takes the lowest sensor index (an argmax). **Ablation added after seeing 2019:** breaking ties by the largest error norm, same grid and 2018 rule, gives 13 of 19 with 2 false alarms and 28 alarms, P = 0.265 on the count, 6 within 300 m (P < 0.001). The count's significance depends on a tie-break; the location result does not.

## Step 6: minimum night flow (`src/water_leaks/mnf.py`, `experiments/step6-mnf/`)

Plan, set before any night-flow series was computed: [`LOG.md`](LOG.md), 2026-11-13.

**Question (H4).** For incipient leaks, does a minimum-night-flow (MNF) statistic on the district water balance detect sooner than pressure CUSUM? MNF is how water-loss practitioners track leakage between surveys: at night, legitimate use is lowest, so a rise in the minimum flow is read as new leakage.

**Method.** From `L-TOWN.inp`: reservoirs R1 and R2 feed the network through the metered pipes p227 and p235, and PUMP_1 lifts water into tank T1 (16 m diameter), which drains back into the network, so the pump flow is internal. District demand plus leakage is Q = p227 + p235 − 201.06 · dL/dt (hourly means). Each night's statistic is the least hourly Q from 00:00 to 06:00, time-stamped 06:00. Detector M1 standardises it by the median and 1.4826 × MAD of D1's trailing window (two weeks ending a week back, re-anchored after an alarm) and runs an upward CUSUM (k = 0.5) with threshold h from {1, 2, 3, 5, 8, 12, 20, 30, 50}, chosen on 2018 by step 1's rule. The incipient set is the 9 new 2019 leaks with peak under 12 m³/h (the leak-type list in the configuration file was unreachable). Misses count as infinite delay.

**Results** (`experiments/step6-mnf/results.txt`, deterministic). Chosen on 2018: h = 3 (8 of 13, no false alarm).

| 2019, 9 leaks under 12 m³/h | M1 (MNF) | D1-F (pressure CUSUM) | LILA-auto |
|---|---|---|---|
| detected | 3 | 7 | 7 |
| median delay (misses infinite) | missed | 154 h | 142 h |
| M1 earlier / later / both missed | | 1 / 6 / 2 | 1 / 6 / 2 |

- **H4 refuted.** M1's median delay on the 9 is a miss; a bootstrap over the leaks puts it below D1's in 0.3% of 2,000 resamples. Its one win is p331 (11 m³/h): 20 h against D1's 71 h.
- **Why.** The nightly minimum's robust sd over a two-week window is 10.7 m³/h at the median in 2018 (5 to 95%: 5.6 to 20.5), so a 5 m³/h leak is half a standard deviation and a 10 m³/h leak about one. Rough CUSUM arithmetic (not a measurement): at a shift of k = 0.5 sd the statistic has no drift, so the 5 m³/h leaks are not expected to be found at all, and at 1 sd it gains about 0.5 a night and needs about 6 full-size nights to pass h = 3. **Diagnostic, after the 2019 scores** (`experiments/step6-mnf/weekly.py`, 2018 only): the nightly minimum has a strong weekday pattern. Against a 7-night running median, Friday and Saturday early mornings sit +9.6 and +14.6 m³/h higher and Monday to Thursday 3 to 6 m³/h lower; removing the weekday means takes the spread from 10.1 to 7.1 m³/h. M1's median baseline does not model this, so that is the first fix to try, though 7 m³/h is still larger than the smallest leaks.
- **All 19 new leaks.** 10 detected, 6 false alarms, 25 alarms over both years; chance with 25 alarms detects a median 11 (P = 0.80), and its false-alarm count is above chance's (P = 0.003). On the 10 leaks of 12 m³/h and above, M1 finds 7 (median 211 h), D1 6 (134 h), LILA 7 (229 h).
- **Without the tank term** (ablation declared in the plan): the spread rises to 13.9 m³/h, the 2018 rule picks h = 5, and it detects 7 of 19 with 3 false alarms and the same 3 of the 9 small leaks. The tank correction is needed but does not rescue MNF.

![Nightly minimum flow over 2018-19, M1's 2019 alarms and the 2019 leak onsets](experiments/step6-mnf/night_flow.svg)

## Step 7: weekday and AMR-net night flow (`experiments/step7-mnf2/`)

Plan, set before either variant was computed and before any AMR value was read: [`LOG.md`](LOG.md), 2026-11-13 (step 7). It was written after step 6's 2019 scores and its post-hoc weekday diagnostic had been seen; 2019 has now been looked at through four night-flow detectors, and the results say so.

**Method.** Three series, each into step 6's detector, grid and 2018 selection rule unchanged. M2: the nightly minimum less weekday offsets fixed from 2018 (`mnf.weekday_offsets`: each night minus the median of the 7 nights centred on it, averaged by weekday). M3: the night balance net of the 82 AMR demands of `<year>_SCADA_Demands.csv` (hourly means, L/h to m³/h; a units check fixed in the plan: their 2018 median must be below the district balance's, and it is, 17.9 against 216.6 m³/h, 8.2%). M4: both, declared primary. Both Demands files came from Zenodo (reachable this time; the GitHub mirrors do not carry them) and are checked by SHA-256.

**Results** (`experiments/step7-mnf2/results.txt`, deterministic; reran byte-identical apart from one relabelled line).

| | M1 (step 6) | M2 weekday | M3 AMR-net | **M4 both** | D1-F | LILA-auto |
|---|---|---|---|---|---|---|
| night-to-night robust sd, 2018 median (m³/h) | 10.7 | 6.43 | 9.48 | **5.13** | | |
| h chosen on 2018 | 3 | 12 | 3 | 3 | | |
| 9 leaks < 12 m³/h detected | 3 | 2 | 6 | **3** | 7 | 7 |
| median delay on the 9 (misses infinite) | missed | missed | 473 h | **missed** | 154 h | 142 h |
| all 19: detected / false alarms | 10 / 6 | 7 / 1 | 13 / 5 | 10 / 4 | 13 / 2 | 14 / 1 |
| P(chance ≥ detected) | 0.80 | 0.56 | 0.32 | 0.80 | 0.105 | 0.019 |

- **H4 refuted for all three**, M4 by the pre-registered test (bootstrap: M4's median below D1-F's in 7.4% of resamples). Three tries were made; none held.
- **Why (post-hoc, `visible.py`, using the leak flows; not a detector).** Five of the nine are incipient ramps (p123, p193, p277, p455, p879): their own night flow is 0.1 to 0.5 m³/h a week in and 1.3 to 6.0 m³/h at day 30, so the largest step a trailing-baseline detector can see inside the 30-day window is 0.07 to 0.39 of M4's local spread. The four abrupt ones (p280, p331, p680, p710, 5.3 to 10.9 m³/h) are 0.3 to 2.4 local spreads; M4 finds two of them, D1-F three, LILA all four.
- **The comparator's hits on the ramps are luck.** At the hour they were credited, the leak carried 0.10 (p123), 0.22 (p193) and 0.02 m³/h (p455) for D1-F, and 0.21 (p277) and 0.01 (p455) for LILA: far below anything a pressure sensor resolves on a network drawing 200 m³/h. D1-F's 154 h median on the 9 rests on them. Under a 30-day match, the incipient leaks of BattLeDIM reward chance, which is the programme's H1 in miniature.

## Reproduce

```bash
pip install numpy matplotlib pytest
cd research/water-leaks
python -m pytest -q tests                                    # 18 tests, no network
PYTHONPATH=src python experiments/step1-baseline/run.py      # downloads ~75 MB once; about 4 min (the chance draws)
python experiments/step1-baseline/figure.py                  # experiments/step1-baseline/chance.svg
PYTHONPATH=src python experiments/step2-lila/run.py          # about 5 min
python experiments/step2-lila/figure.py                      # experiments/step2-lila/lila_vs_chance.svg
PYTHONPATH=src python experiments/step6-mnf/run.py           # under a minute
python experiments/step6-mnf/figure.py                       # experiments/step6-mnf/night_flow.svg
PYTHONPATH=src python experiments/step7-mnf2/run.py          # downloads the 2 x 56 MB AMR files once (Zenodo); about a minute after
PYTHONPATH=src python experiments/step7-mnf2/visible.py      # post-hoc: each small leak's visible step and its flow when credited
PYTHONPATH=src python experiments/step7-mnf2/figure.py       # experiments/step7-mnf2/small_leaks.svg
```

## Limitations

- L-Town is a **simulated** network with simulated leaks and sensor noise; nothing here is a field result or an operational recommendation (drinking-water decisions need licensed engineers and the operator).
- Detection only. The 300 m figure uses the alarming sensor (LILA's MAS) as a crude location, not a localisation method; LILA's model-based localisation (LL-1 to LL-3) is not reimplemented yet.
- LILA-auto is our automation of LILA's identification, not the authors' procedure, which used per-leak inputs; its numbers are not the paper's. Hourly means, not 5-minute data. The paper's own 2019 figures were not read (paywalled), so this step does not check against them.
- One detector, one tuning rule, one matching window. The chance level depends on the window (14 and 60 days are next) and on the alarm count.
- MNF (steps 6 and 7) is tested with a two-week median/MAD baseline, a fixed 2018 weekday profile and the 82 AMR meters; other baselines (seasonal, regression on temperature) are untried. The H4 comparison is on 9 leaks, defined by peak flow, not the configuration file's leak types, and 2019 has now been seen through four night-flow detectors. The step-7 diagnosis of why uses the ground-truth leak flows and was done after the scores.
- 2019 results were seen once before the re-anchoring fix (`LOG.md`); the fix came from a unit test, and its one new parameter (7-day minimum window) was not tuned.

## Next steps

H4 is closed for this network as stated: the corrected night flow (5.1 m³/h spread) still misses the small leaks, and the ramps among them are invisible to every detector inside a month. Next in the harness: a **flow-gated match** (an alarm credits a leak only once its own flow passes a stated level, such as 1 m³/h; pre-registered, then D1, LILA and M1 to M4 rescored) and the matching-window ablation (14 and 60 days), which turn step 7's diagnosis into the chance-corrected protocol the paper proposes. Milestone 2 continues with SICAMS (Melnikov 2025; arXiv was unreachable from earlier sessions) and a paired bootstrap between detectors. Then localisation on the nominal model with the 300 m confusion matrix as BattLeDIM scored it, and leak-free simulated years for an e-process threshold ([`PROPOSAL.md`](PROPOSAL.md), Milestones). H1 should be restated as a claim about margins: detection counts sit within about one leak of chance's upper range, location-aware counts far above it.

AI-assisted research (Claude); no affiliation with the BattLeDIM organisers is implied. Code MIT; BattLeDIM data CC-BY-4.0 (Vrachimis et al.), not redistributed here.
