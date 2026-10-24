# verifiable-training-mechanisms, milestone 4 (agent notes)

- Library `src/vtm/contract.py`: `optimal_contract(P, c, target, stake, basis)` is the hidden-action LP; `brute_force_two_signal` is its independent check. Needs numpy and scipy.
- `experiments/frontier/run.py` (about 1 minute) writes `actions.json`; `analyse.py` writes `results.json` and `results.txt` (about 2 minutes, run it in the background); `figure.py` is stdlib only.
- Gotcha: with unbounded pay, any audit probability above zero deters, so `audit.threshold` is where rent hits zero, not a feasibility cut-off. Audit-only is infeasible only when an action with the same signal and lower cost exists (tolerance above 0).
- Open: mixed action set (skip + half-batch + float16), H3 (peer prediction with audits), H5 lower bound on this LP, H6 prediction against measurement. Section C of `results.txt` was added post hoc (flagged in `LOG.md`).
