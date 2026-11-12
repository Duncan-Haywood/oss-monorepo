# Research log

## 2026-11-12 · Programme opened; milestone 1 (held-out SAD test) landed
- Opened from track 21's draw: no open programme covered the grid, and `infra-dcopf` had grown into a programme's worth of steps (DC error, loss factors, PGLib validation, successive linearisation). The question is narrowed to dispatch feasibility and repair budget on held-out benchmark sets, which the accuracy and optimised-linearisation literature (Stott et al. 2009; Dvijotham and Molzahn 2016; Misra et al. 2018; Chen and Singh 2025) does not report.
- Milestone 1: the API-tuned successive linearisation, run unchanged with linearised angle rows, is clean on 7 of 11 held-out SAD cases (prediction at least 8: refuted narrowly); angle-blind, 3. Plan, predictions and outcome in `research/infra-dcopf/LOG.md`, numbers in `research/infra-dcopf/experiments/results_sad.txt`.
- Next: milestone 2 (analytic sensitivities) or 3 (a non-oracle voltage schedule); 3 matters more for the claim, since every result so far holds voltages at the AC optimum's schedule.
