# Replay memory

Python (uses the sibling `forgetting-law` package; tests also import `replay-law`). Companion to `replay-law`, closing its open question about partial replay: if only `m` of an old task's `r` examples are stored, replaying them with a fresh task is "project out the stored subspace, then take a plain step in dimension `d−m`", which gives an exact 2×2 mean-state matrix that interpolates between no replay (`m=0`) and `replay-law`'s full replay (`m=r`). One replay at its best step keeps a fraction of the full saving that is nearly linear in `m/r` (0.23–0.25 at `m/r=¼`); at a fixed budget of examples per step, a few large replays beat many small ones, but only by 0.1–6 points of total forgetting. See `paper/whitepaper.md`.

```bash
cd research/replay-memory
PYTHONPATH=src:../forgetting-law/src:../replay-law/src python3 -m unittest discover -s tests -v   # 8 tests, ~3 s
PYTHONPATH=src:../forgetting-law/src python3 experiments/run.py                                  # output in experiments/results.txt
```
Linear regression with Haar-random task subspaces, exact-convergence training, one tracked task; MIT.
