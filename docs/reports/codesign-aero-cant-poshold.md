# codesign-aero-cant-poshold (for the next run)

- Landed 2026-10-26: position hold + lateral force of canted rotors; result in `research/codesign-aero-cant-poshold/README.md`. The five parent READMEs' "add position hold" next step is done; stop copying that line forward.
- Still open in the chain: equal-cost comparison with a larger propeller or yaw-only motor upgrade; catalogue motor fits; wind-step episodes longer than 2 s. The optimiser leaves about 2 of 5 seeds in local optima at 3200 evaluations (warm-start from the best design).
- The codesign-* cluster has 27 directories and no programme. `programme_check.py` accepts new ones only with `"programme": "none"` plus a reason; a consolidating programme (one PROPOSAL.md, steps under `experiments/`) is the right next structure.
