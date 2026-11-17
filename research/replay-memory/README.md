# Replay memory

Python (uses the sibling `forgetting-law` package; tests also import `replay-law`). Companion to `replay-law`, closing its open question about partial replay: if only `m` of an old task's `r` examples are replayed, replaying them with a fresh task is "project out their subspace, then take a plain step in dimension `d−m`". A fixed buffer (the same `m` examples every time) has an exact 3×3 mean-state law; a fresh subset (the whole task stored, `m` re-drawn per replay) has an exact 2×2 one; both interpolate between no replay (`m=0`) and `replay-law`'s full replay (`m=r`). One replay at its best step keeps a fraction of the full saving that is nearly linear in `m/r` (0.23–0.25 at `m/r=¼`). Under repeated replay a fixed buffer's saving stays linear in its size, and at a fixed budget of examples per step the whole task replayed rarely beats a small buffer replayed often by 2–50 points of total forgetting; re-drawing from a fully stored task closes most of that gap (0.1–6 points). Corrected 2026-11-14: earlier versions applied the 2×2 law to a fixed buffer (quality audit `portfolio/quality/audits/2026-11-08-replay-memory.json`). See `paper/whitepaper.md`.

**Live page:** https://marisstella.app/research/replay-memory/

```bash
cd research/replay-memory
PYTHONPATH=src:../forgetting-law/src:../replay-law/src python3 -m unittest discover -s tests -v   # 11 tests, ~12 s
PYTHONPATH=src:../forgetting-law/src python3 experiments/run.py                                  # ~1 min, output in experiments/results.txt
```
Linear regression with Haar-random task subspaces, exact-convergence training, one tracked task; MIT.
