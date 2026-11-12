# Research log: codesign-cant

Newest first. Write the hypothesis and the planned analysis before running an experiment, then the outcome.

## 2026-11-12 · Milestone 1: are the earlier cant results artefacts of the actuator model? (predictions written and committed before `experiments/m1_allocation/run.py` was run)

- Why: the seven `codesign-aero-cant*` projects gave the attitude simulator two hand-written per-axis torque limits, roll 4 (Tmax − Th) r cos α and yaw 2 (Tmax − Th)(κ cos α + r sin α), with r = L/√2 and L the arm length. Writing out the full 6×4 map from rotor thrusts to body wrench (`src/codesign_cant/allocation.py`) and maximising each pure torque with a linear programme (thrusts in [0, Tmax], other torques zero, no net side force) gives, with Δ = min(Th, Tmax − Th) at hover or Tmax/2 with free collective:
  - roll 4Δ (L cos α − κ sin α)/√2: the earlier formula is right at TWR 2 apart from a small κ sin α term, but grows without bound above TWR 2 because it lets the low rotors go below zero thrust;
  - yaw 4Δ (L sin α + κ cos α): the earlier formula has a factor 2 where 4 belongs (it raises one diagonal pair without lowering the other) and the tilt moment arm r = L/√2 where L belongs (the tangential force acts at the rotor, a distance L from the centre). At TWR 2 it understates yaw authority by 2× with no cant and up to 2√2× with cant;
  - side force per unit roll torque sin α / (L cos α − κ sin α); `codesign-aero-cant-poshold` used tan α / r, √2 too large.
  - Closed forms agree with the LP to 1e-15 on 300 random designs (`tests/test_allocation.py`).
- Plan: `experiments/m1_allocation/run.py` reruns the twrceil co-design (1920 evaluations, 5 seeds, 64 held-out episodes, c = UIUC median 0.081) with cant bound 0/35/80°, TWR fixed at 2 (as `-propdata`) or free in 1.5–6 (as `-twrceil`), and actuator model `prior` (the earlier formulas), `hover` (allocation, collective at hover) or `free` (allocation, collective free; TWR-free arms only).
- Predictions:
  - P1 (reproduction): the `prior` arms reproduce the earlier `results.txt` numbers for the matching cells (twrceil: c 0.081, ceiling 6: no cant 13.65°, cant ≤ 35° 11.22°) to within 0.01°.
  - P2: with `hover` limits the no-cant design improves by more than 2° RMS against `prior` at TWR 2 (its yaw authority doubles).
  - P3: cant's advantage at least halves under `hover` against `prior` (paired mean, TWR 2, bound 80°: −4.6° in `-propdata`).
  - P4: cant still helps under `hover` (paired mean below zero, better in at least 4 of 5 seeds at bound 35°, TWR 2).
  - P5: the chosen cant falls: median under 30° at bound 80° with `hover` (36–41° in `-propdata`), because each degree now buys more yaw.
  - P6: with TWR free and `hover` limits the optimiser picks TWR below 2.6 on average (authority stops growing at TWR 2); with `free` limits it picks more than with `hover`.
- Analysis: per-arm mean and per-seed held-out RMS; paired cant-minus-no-cant differences by seed with SD and sign count. Five seeds, no significance test claimed beyond the sign count.
