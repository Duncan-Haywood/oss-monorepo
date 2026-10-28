# Research log: heavy-hydraulics

Newest first.

## 2026-10-28 · Milestone 1: do the three circuits order the way theory says, and by how much? (planned before running)
- Hypotheses and plan: see PROPOSAL H1 to H3. Grid: flow demand 3 x pressure spread 4 x pump flow 3 x dp_ls 3 x dp_spool 3 x dp_m 3 x pump efficiency 3 = 2,916 cases on one illustrative four-phase cycle (pressures and flows written from memory, not sourced).
- **Prediction (before running):** open-centre > load-sensing > metered in 100% of cases (this follows from the model's structure, so it is a check of the code, not a finding); load-sensing/open-centre falls as demand falls; metered/load-sensing falls as spread rises; at zero spread metered/LS is above 0.85.

### Outcome (`experiments/run.py`, under 5 s; `experiments/results.txt`; 6 tests pass)
- All three orderings held in 2,916 of 2,916 cases. Because each rung only removes a loss term from the one before it, this is a structural fact, not evidence about real machines.
- Median load-sensing/open-centre shaft energy 0.47 (0.22 to 0.81); by demand 0.31, 0.47, 0.63 for 0.5, 0.75 and 1.0 of the cycle flow: H2's direction held.
- Median metered/load-sensing 0.80 (0.68 to 0.97); by spread 0.88, 0.82, 0.78, 0.74 for 0, 0.5, 1, 1.5. At zero spread the median is 0.88 (prediction above 0.85 held), still a 12% saving from the smaller margin alone; H3's "under 15% at zero spread" held on medians, but no per-case check was made.
- Limits: the cycle is illustrative; no dynamics, no line losses, no leakage, no energy recovery; open-centre modelled as full pump flow at the highest load pressure, which is the pessimistic end (real open-centre bleed-off spools do better at partial lever); efficiency is one constant. These numbers say nothing yet about a real machine; H4 is the test.
- Next: a sourced duty cycle (milestone 2). Crossref was unreachable, so no citation was checked.
