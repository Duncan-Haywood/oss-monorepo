# Which collision-avoidance planner obeys the rules of the road? COLREGs encounters for a small boat

**Status: preliminary, simulation only; milestone 1 of `marine-colregs` (track 23), a sub-study of the
[`marine-hull`](../marine-hull/PROPOSAL.md) programme.** A planner that merely avoids collision can still break
COLREGs (turning to port, crossing ahead). This compares three planners on scripted encounters, scored on closest
point of approach (CPA), rule compliance and detour. A COLREGs-aware planner here is research, not a certified system.

**Live page:** https://marisstella.app/research/marine-colregs/

## Result (own boat 4 m/s, target on constant course, safe = CPA of at least 100 m)

| planner | safe | safe and compliant | median detour |
|---|---|---|---|
| none | 8.7% | 4.3% | 0 m |
| rule-based (35 deg starboard) | 77.4% | 77.4% | 95 m |
| velocity obstacle (starboard-only if give-way) | 95.7% | 95.7% | 19 m |
| sampling MPC (untuned weights) | 84.3% | 79.1% | 23 m |

- **Sensing error costs the velocity obstacle most.** With target-velocity error of 0.3 / 0.6 m/s it falls to
  84.6% / 82.0% safe (minimum CPA 2 m); sampling MPC is 92.8% / 89.0% but its compliance falls to 79% / 76%.
- **The stand-on vessel's action range decides the failures.** Safe share (rule / VO / MPC) at 200 m: 70 / 91 / 75%;
  600 m: 89 / 99 / 89%. Most rule-based failures are stand-on crossings from port with a fast target, where
  holding course until 300 m leaves too little time (Rule 17 allows earlier action).
- Per-kind counts: [`experiments/results.txt`](experiments/results.txt).

## Method and reproduce

```bash
cd research/marine-colregs
PYTHONPATH=src python3 -m pytest tests -q          # 5 tests
PYTHONPATH=src python3 experiments/run.py > experiments/results.txt   # about 6 minutes
```

`core.py`: encounter geometry (target placed to meet own track at 250 s, shifted by an offset), role classifier
(Rule 13 overtaking sector, Rule 14 reciprocal within 6 deg, Rule 15 target on starboard bow), planners, scoring.
Compliance: give-way and head-on turn to starboard first, a give-way crossing passes astern of the target, a
stand-on vessel changes heading by no more than 5 deg while the range exceeds 300 m. Tests include the analytic
check that a straight-course CPA equals the lateral offset.

## Limitations

Kinematic ship (constant speed, turn-rate limit only); the 100 m safe distance, speeds, 6 deg/s and the action
ranges are chosen, not sourced; the target never manoeuvres and never gives way; planners know the roles from
perfect classification; MPC weights tuned only in milestone 2 (3 weights, one effective lever); no real AIS
geometry; no wind, waves or Fossen dynamics (see `marine-path`). The ranking is a property of this model.

## Milestone 2: tuning the MPC weights (CMA-ES against random search, equal budget)

Tuned on offsets +-50 m, tested on held-out offsets -100/0/+100 m (`experiments/run_tune.py`, `experiments/results_tune.txt`). Both tuners cut mean held-out loss from 0.260 (default weights) to 0.159-0.176, and CMA-ES does not beat random search at 90 evaluations (0.1655 against 0.1651, 3 runs each). The gain is compliance (76.8-84.1% to 85.5-95.7%) from a 10 to 300 times larger port-turn penalty; safe share barely moves (84-90%). Three weights, one effective lever, so the equal-budget comparison cannot separate the optimisers here. Needs `pip install cma`.

## Next steps

AIS-derived encounter geometries; a cooperative target; Fossen
dynamics; the effect of the detector's miss rate (`marine-detect`).

## Citations

- IMO (1972), Convention on the International Regulations for Preventing Collisions at Sea (COLREGs), Rules 13-17 (not fetched).
- Fiorini, P., Shiller, Z. (1998), Motion planning in dynamic environments using velocity obstacles, *IJRR* 17(7) (not fetched).
- Kuwata, Y. et al. (2014), Safe maritime autonomous navigation with COLREGS, using velocity obstacles, *IEEE J. Oceanic Eng.* 39(1) (not fetched).
