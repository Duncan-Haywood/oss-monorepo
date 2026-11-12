# Research log: codesign-cant

Newest first. Write the hypothesis and the planned analysis before running an experiment, then the outcome.

## 2026-11-12 · Milestone 2: combined commands on one thrust polytope, and a price on hover power (predictions written and committed before `experiments/m2_polytope/run.py` was run)

- Why: milestone 1 kept the per-axis torque box: roll, pitch and yaw could each saturate at their pure-axis limit at the same time. A real mixer cannot do that. The roll, pitch, yaw and Fz rows of the canted-X wrench map are orthogonal sign patterns (a 4×4 Hadamard matrix), so with the collective held at hover the attainable set is |x ± y ± z|-type: per rotor, −Th ≤ (√2/4kr)(±τr ± τp) + (1/4ky)(±τy) ≤ Tmax − Th. At TWR 2 a full roll command alone uses all the thrust swing and leaves no yaw. Milestone 1 also found the cant optimum held up by an attitude-only objective that leaves hover power free up to the $300 cap.
- Built: `allocation.mix_priority`, an attitude-priority mixer (roll and pitch scaled together first, yaw gets what is left, as PX4 and Betaflight do; collective held at hover, or free as in airmode) with exact largest-scale solutions; tests check delivered torque against `layout`, thrust bounds, hover Fz, and that 0.1% more of either scaled part leaves the polytope. `aero.rollout(mixer=...)` and `aero.score(lam=...)`, J = −RMS − λ·P_hover/100 W.
- Plan: `experiments/m2_polytope/run.py`, the milestone-1 co-design (1920 evaluations, 5 seeds, 64 held-out episodes, c = 0.081, actuator `hover`, TWR 2) over mixer {`box`, `prio`} × cant bound {0, 80°} × λ {0, 0.1, 0.3, 1} deg per 100 W, plus `prio_free` (collective free) at λ {0, 0.3} × cant {0, 80°}. 100 CMA-ES runs. λ spans the range where the energy term goes from negligible (0.1: a 1.5 kW design pays 1.5°) to dominant (1: 15°); milestone-1 designs drew 160 W to 1.5 kW at near-equal RMS, so hover power was free to the optimiser.
- Predictions:
  - Q1 (reproduction): `box`, λ = 0 reproduces milestone 1's hover/TWR 2 arms (15.44° no cant, 10.63° cant ≤ 80°) exactly.
  - Q2: under `prio` the held-out RMS rises against `box` for both no cant and cant (combined commands lose authority), by more than 1° for no cant.
  - Q3: cant's paired advantage at λ = 0 is larger under `prio` than under `box` (more negative than −4.81°), because the larger ky needs less thrust swing per unit yaw torque, so yaw is starved less by roll and pitch.
  - Q4 (tests H1): with energy priced the chosen cant falls; at λ = 0.3 the median chosen cant is below 25° under `prio` (H1 predicts 5–20°).
  - Q5: hover power falls with λ in both arms; at λ = 0.3 the 5-seed mean hover power is below half its λ = 0 value.
  - Q6: cant still wins on the composite objective at λ = 0.3 under `prio` (paired composite better in at least 4 of 5 seeds), and at λ = 1 it no longer wins on RMS by more than 2°.
  - Q7: `prio_free` (airmode) beats `prio` on RMS at λ = 0 for both cant arms.
- Analysis: per-arm means and per-seed values of RMS, composite score, hover power, mass, chosen cant; paired cant-minus-no-cant differences in RMS and composite by seed with SD and sign count; mean share of steps in which the mixer scaled yaw (s_yaw < 1) on the held-out set. Five seeds, no test beyond the sign count.

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
### Outcome (`experiments/m1_allocation/results.txt`, 75 CMA-ES runs, about 9 minutes on 4 cores; simulated)
- **P1 held:** the `prior` arms reproduce the earlier numbers exactly (twrceil ceiling 6: 13.65° and 11.22°; propdata TWR 2: no cant 17.06°, bound 80° 12.46°).
- **P2 refuted:** with `hover` limits the no-cant design improves by 1.62° (17.06° to 15.44°), not more than 2°. Doubling yaw authority cuts no-cant yaw RMS only from 28.4° to 25.4°; yaw still dominates.
- **P3 refuted:** cant's advantage does not shrink. Paired by seed, cant ≤ 35° minus no cant is −4.81° (SD 0.12, 5 of 5) under `hover` against −4.62° under `prior` at TWR 2. With TWR free it is −4.81° (`hover`) and −2.77° (`free`) against −2.43° (`prior`).
- **P4 held:** cant helps in 5 of 5 seeds in every actuator model and TWR arm.
- **P5 refuted:** the chosen cant does not fall. At bound 80° under `hover` it is 35–37° (median 35°), the same plateau as before; at bound 35° it sits on or near the cap (31–35°).
- **P6 held:** with TWR free, `hover` limits make the optimiser pick TWR 2.0–2.3 (the earlier "interior optimum near TWR 5" disappears: above 2 the low rotors cannot go lower); `free` limits pick 3.3–4.7.
- Found, not predicted: the cant optimum is held up by the objective, not the physics. The cant ≤ 35° design under `hover`, TWR 2, weighs 3.17 kg and costs $273 against 1.74 kg and $143 without cant (5-seed means), and 35° of cant needs cos(35°)^−1.5 = 1.35× the ideal hover power. The score is attitude error alone, with cost only as a $300 cap, so the optimiser spends mass and power on cant up to the cap. Any claim about the *best* cant angle needs an objective that prices power or endurance.
- Reading: the earlier formulas were wrong in three places (yaw authority 2× to 2.8× too small, roll authority too large above TWR 2, side force √2 too large), but cant's attitude-error advantage, and its 35° plateau under this objective, survive the correction. What does not survive is the motor-headroom story of `-twr` and `-twrceil`: whether extra TWR helps depends on whether the mixer may give up altitude (`free`) or not (`hover`), which those projects did not model.
- Limits: per-axis box limits (combined commands share one polytope, milestone 2); attitude steps only; inherited assumed mass, cost and motor fits; five seeds; one κ (the median). Preliminary.
- Next: milestone 2, the attainable-torque polytope for combined commands and an attitude-priority mixer, plus an objective with an energy term (hover power or endurance at fixed battery), so the cant optimum is priced.
