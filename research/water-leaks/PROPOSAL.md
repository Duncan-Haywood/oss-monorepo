# Programme proposal: water-leaks

**Leak detection and localisation on the BattLeDIM L-Town benchmark, scored against chance, with a false-alarm rate that can be certified.**

Opened 2026-11-12. Track 21 (`infra`), the water milestone that `infra-waterloss` had to run on Net3 because the BattLeDIM data host was unreachable then. AI-assisted research; no affiliation with the BattLeDIM organisers or any utility is implied.

## Question

On the one public benchmark with a realistic water network, two years of SCADA data and a published leak schedule (BattLeDIM's L-Town), how much of a leak detector's reported skill is above what alarms raised at random would score, and can a data-driven detector be built whose false-alarm rate is guaranteed in advance while it still finds and roughly localises the leaks that published entries find?

It is open because the published comparisons on L-Town (Vrachimis et al. 2022, as tabulated by Melnikov 2025; Barros et al. 2025) report true-positive rates and false-alarm counts without a chance level, and with 23 leaks running for weeks to months during one year, a matching window covers much of the calendar. Our step 1 measured that: 26 random alarms score a median 11 of the 19 leaks that start in 2019 under a 30-day window. And every entry we could read sets its alarm threshold by hand on 2018. None states a false-alarm rate that holds before the year is seen.

## Why it matters

Water utilities lose a large share of the water they treat to leaks, and a district-metered network like L-Town is where pressure and flow analytics would run. A leakage engineer acts on an alarm by sending a crew with acoustic loggers, so a false alarm costs a crew-day and a missed or late leak costs water and energy. The engineer needs two numbers a detector paper rarely gives: how often it will cry wolf on their network, set before deployment, and how far from the leak the crew will start. A detector with a certified false-alarm rate and an honest, chance-corrected score is something a utility could pilot on its own SCADA export (with the operator's approval; see guardrails). For benchmark authors, a chance-corrected protocol tells whether a leaderboard gap is real.

## Related work

Each work was opened or its record checked (`research/_shared/cite_check.py` on the README and this file; status below).

*Benchmark and its entries.*
- Vrachimis et al. (2022), "Battle of the Leakage Detection and Isolation Methods", *J. Water Resour. Plann. Manage.* 148(12), [doi:10.1061/(ASCE)WR.1943-5452.0001601](https://doi.org/10.1061/(ASCE)WR.1943-5452.0001601). The competition, L-Town, the scoring (a leak counts when reported within 300 m) and 18 teams' results. Does not report a chance level. (Paywalled; we read its numbers through Melnikov 2025's Table 2, not the paper itself.)
- Vrachimis et al., BattLeDIM dataset, Zenodo, [doi:10.5281/zenodo.4017659](https://doi.org/10.5281/zenodo.4017659), CC-BY-4.0. The data every step here uses.
- Daniel et al. (2022), "A Sequential Pressure-Based Algorithm for Data-Driven Leakage Identification and Model-Based Localization", *J. Water Resour. Plann. Manage.* 148(6), [doi:10.1061/(ASCE)WR.1943-5452.0001535](https://doi.org/10.1061/(ASCE)WR.1943-5452.0001535). LILA: linear regression between pressure sensors, residual changepoints, then model-based localisation. The closest data-driven baseline; thresholds set on 2018.
- Steffelbauer et al. (2022), "Pressure-Leak Duality for Leak Detection and Localization in Water Distribution Systems", *J. Water Resour. Plann. Manage.* 148(3), [doi:10.1061/(ASCE)WR.1943-5452.0001515](https://doi.org/10.1061/(ASCE)WR.1943-5452.0001515). Model-based dual model; 65% TP, 4 false alarms on 2019. Needs a calibrated hydraulic model.
- Romero-Ben et al. (2022), "Leak Localization in Water Distribution Networks Using Data-Driven and Model-Based Approaches", *J. Water Resour. Plann. Manage.* 148(5), [doi:10.1061/(ASCE)WR.1943-5452.0001542](https://doi.org/10.1061/(ASCE)WR.1943-5452.0001542). Localisation methods on L-Town; 43% TP, 1 false alarm.
- Barros et al. (2025), "Leak detection and localization in water distribution systems via multilayer networks", *Water Research X* 26, 100280, [doi:10.1016/j.wroa.2024.100280](https://doi.org/10.1016/j.wroa.2024.100280). 74% TP, 2 false alarms on 2019; thresholds by z-score and IQR.
- Melnikov (2025), "A Multivariate Statistical Framework for Detection, Classification and Pre-localization of Anomalies in Water Distribution Networks", [arXiv:2512.15685](https://arxiv.org/abs/2512.15685). Hotelling-type whitened statistic (SICAMS), 70% TP and 1 false alarm on 2019, missed leak-hours as a metric; the table of onsets and delays our ground truth is checked against. No chance level, no guarantee on the false-alarm rate.
- Irofti et al. (2022), "Data-driven Leak Localization in Water Distribution Networks via Dictionary Learning and Graph-based Interpolation", IEEE CCTA, [doi:10.1109/CCTA49430.2022.9966160](https://doi.org/10.1109/CCTA49430.2022.9966160). Localisation only, with known leak times.

*Reviews.*
- Wu and Liu (2017), "A review of data-driven approaches for burst detection in water distribution systems", *Urban Water J.* 14(9), [doi:10.1080/1573062X.2017.1279191](https://doi.org/10.1080/1573062X.2017.1279191). Burst detection methods and their evaluation; evaluation is mostly per-paper and simulated.
- Hu et al. (2021), "Review of model-based and data-driven approaches for leak detection and location in water distribution systems", *Water Supply* 21(7), [doi:10.2166/ws.2021.101](https://doi.org/10.2166/ws.2021.101).

*Sequential change detection and guarantees.*
- Page (1954), "Continuous inspection schemes", *Biometrika* 41, [doi:10.1093/biomet/41.1-2.100](https://doi.org/10.1093/biomet/41.1-2.100). CUSUM, the detector in step 1.
- Killick, Fearnhead and Eckley (2012), "Optimal Detection of Changepoints With a Linear Computational Cost", *JASA* 107, [doi:10.1080/01621459.2012.737745](https://doi.org/10.1080/01621459.2012.737745). PELT, used by SICAMS and by `infra-waterloss`.
- Ramdas, Grünwald, Vovk and Shafer (2023), "Game-Theoretic Statistics and Safe Anytime-Valid Inference", *Statistical Science* 38(4), [doi:10.1214/23-STS894](https://doi.org/10.1214/23-STS894). E-processes: the tool for a false-alarm guarantee that holds under continuous monitoring, which no L-Town entry uses.

*Tools.*
- Klise et al. (2017), "A software framework for assessing the resilience of drinking water systems to disasters with an example earthquake case study", *Environ. Model. Softw.* 95, [doi:10.1016/j.envsoft.2017.06.022](https://doi.org/10.1016/j.envsoft.2017.06.022). WNTR, for simulated leak-free years and localisation sensitivities.

*Our own prior work.* [`infra-waterloss`](../infra-waterloss) (CUSUM and PELT on Net3 with simulated leaks: demand error, not sensor noise, limits detection; averaging many sensors hurts), [`infra-leakpdd`](../infra-leakpdd) (demand-driven against pressure-driven simulation for leak signals), [`changepoint-detector`](../../ventures/changepoint-detector) (PELT and Bayesian online changepoints) and [`inference-substitution`](../inference-substitution) (a mixture e-process for detection valid under peeking).

## Gap

1. **A chance-corrected score for L-Town.** The same number of alarms at random times (respecting the detector's blind time) and from random sensors, scored by the same matching rule, for each published metric: detection count, false alarms, timeliness and the 300 m location rule. Step 1 shows the detection count alone is not distinguishable from chance for our baseline (P = 0.105), while the location-aware count is (P < 0.001). We found no L-Town paper that reports this.
2. **A certified false-alarm rate.** A residual detector whose alarm threshold comes from an e-process or a conformal bound, so its false-alarm rate on leak-free operation is fixed before the year is seen, measured on simulated leak-free L-Town years (WNTR on `L-TOWN_Real.inp`) and on the 2019 data.
3. **Data-driven detection with model-based localisation** on the nominal model, scored by the 300 m rule, against the published entries on the same harness.

Narrowly: claim 1 is new for this benchmark as far as the papers we could read go; claims 2 and 3 apply known tools (e-processes, sensitivity-based localisation) to a benchmark where they have not been reported together.

## Hypotheses

- **H1 (scoring).** On BattLeDIM 2019, a detection-only true-positive count under a 30-day matching window is within the 95% chance range for any detector that raises 20 or more alarms over 2018-19; location-aware counts are not. *Refuted* if a reimplemented published method (LILA or SICAMS) scores a detection-only count with P(chance ≥) < 0.05 at 20 or more alarms, or if our location-aware count falls inside the chance range. Step 1: D1 is consistent with H1 (P = 0.105 and P < 0.001). Step 2: refuted as written by LILA-auto (P = 0.019 at 26 alarms), thinly (2 of 13 grid settings with ≥ 20 alarms below 0.05; P = 0.265 under a norm tie-break); the location clause held in all 27 settings. To restate as a margin claim.
- **H2 (certified rate).** An e-process-calibrated residual detector keeps its false alarms on simulated leak-free L-Town years at or below the nominal rate α (e.g. one per 90 days) and still detects at least 80% of 2019's abrupt leaks above 10 m³/h peak within 24 h. *Refuted* if the simulated false-alarm rate exceeds 2α or abrupt detection within 24 h falls below 80%.
- **H3 (localisation).** Data-driven detection followed by sensitivity-based localisation on the nominal `L-TOWN.inp` puts at least half of the detected 2019 leaks within 300 m. *Refuted* below 30%.
- **H4 (incipient leaks).** For incipient leaks (peak under about 12 m³/h), a minimum-night-flow statistic on the three inlet flows detects with a shorter median delay than pressure CUSUM. *Refuted* if its median delay is not shorter on the 2019 incipient leaks.

## Method

- **Data.** BattLeDIM 2018 (tuning) and 2019 (test): 33 pressure sensors, 3 inlet flows, 1 tank level, 82 AMR demands, 5-minute steps; leak flows per pipe as ground truth. Fetched from Zenodo and checked by SHA-256, not copied into the repository.
- **Theory.** For claim 1, the chance distribution under random alarm times is computed exactly by Monte Carlo over spaced sets; where possible, a closed form for the expected matched count given the union of matching windows. For claim 2, a mixture e-process on standardised residuals (as in `inference-substitution`) with Ville's inequality bounding the probability of any false alarm in a leak-free period; what breaks the guarantee (residual autocorrelation, seasonal drift, absorbed leaks) is stated and measured.
- **Experiments.** One harness (`src/water_leaks/`) for every detector: a trailing-window residual CUSUM (D1, step 1), reimplementations of LILA and SICAMS from their papers, the e-process detector, minimum-night-flow; WNTR simulations of leak-free and leaky L-Town years for the guarantee and for localisation sensitivities.

## Evaluation

- **Baselines.** The published 2019 figures (Vrachimis et al. 2022 via Melnikov 2025; Barros et al. 2025), labelled as published with localisation; our reimplementations of LILA (Daniel et al. 2022) and SICAMS (Melnikov 2025) on the same harness; D1; the chance level for every one.
- **Metrics.** Detection count under the matching rule, false alarms, delay (median and range), detection within 72 h, alarming or localised point within 300 m, missed leak-hours (Melnikov 2025, eq. 4), leak volume lost before detection; each with its chance distribution.
- **Seeds and intervals.** The chance level from 1,000 or more seeded draws (2.5 to 97.5 percentiles and the tail probability); simulated years from 20 or more demand seeds; bootstrap over leaks for differences between detectors.
- **Ablations.** Matching window (14, 30, 60 days), flows in or out of the regressors, sensor subsets by area, training window and gap.
- **Protocol.** 2018 tunes, 2019 tests, once. Any 2019 look before a design change is written in `LOG.md`.

## Milestones

1. **Harness, D1 and the chance level** (done 2026-11-12, this PR): loader with checksums, ground truth, matching, distances, D1 tuned on 2018 and scored on 2019, chance level for five metrics.
2. **Reimplement SICAMS and LILA** on the harness from their papers, check against their published 2019 figures, and add their chance levels (H1). LILA done 2026-11-12 (automatic identification; 14 of 19, P = 0.019 on the count, P = 0.265 with a norm tie-break; MAS within 300 m for 7, P < 0.001); SICAMS open.
3. **Localisation** by WNTR sensitivities on the nominal model; the 300 m confusion matrix as BattLeDIM scored it (H3).
4. **Leak-free simulated years** from `L-TOWN_Real.inp` (177 MB, with real demands) for measuring false-alarm rates.
5. **E-process detector** and its measured false-alarm rate against α (H2).
6. **Minimum-night-flow** and the incipient leaks (H4).
7. **Ablations and statistics**; one command per figure.
8. **Paper** in the venue's format; submission is an owner step.

## Target venue

*Journal of Water Resources Planning and Management* (ASCE), where BattLeDIM and most of its entries were published: a full technical paper with data and code availability. Alternative: *Water Research* (main track) if the chance-corrected protocol stands as a benchmark-methods contribution; the WDSA/CCWI joint conference as an early venue. An aim, not a claim of acceptance.

## Deep-tech application

The system is a utility's district-metered water network with a pressure-and-flow SCADA feed, as L-Town models. The numbers it moves are leak volume lost before detection (step 1: 64% of 2019's new-leak volume falls after D1's alarms, so a same-day repair would save that share), false crew dispatches per year, and the start distance for an acoustic survey. A leakage engineer or a utility's analytics team acts on it. To try it on the real thing takes an operator-approved, read-only historical SCADA export from one district metered area and its repair log; no live system is touched by this programme.

## Guardrails

Models and benchmarks are not plants: L-Town is a simulated network with simulated leaks, and every result says so. No SCADA, OT or utility system is touched or probed. Drinking-water decisions need licensed engineers and the operator's approval; nothing here is an operational recommendation.

## Citation status

Every DOI and arXiv id above was checked with `research/_shared/cite_check.py` on 2026-11-12 (output in the run record). Vrachimis et al. (2022) was not opened (paywalled): its results are quoted from Melnikov (2025), Table 2, and labelled so.
