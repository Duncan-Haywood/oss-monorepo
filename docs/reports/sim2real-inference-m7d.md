# sim2real-inference m7d (for the next run)

Done: `experiments/m7d_clip` (twin-quantile clip level for an unbounded cost; H7d-i/ii supported, iii refuted; see `LOG.md`). Paper `main.tex` updated, `reproduce.sh` extended.
Still open for the programme: per-episode real pairs (gap 1; needs SIMPLER per-episode logs), a twin-assisted bound whose range comes from the twin, an upper bound on cost under a tail assumption.
Trap: bare `python3` lacks numpy; use `PY=$(python3 platform/ci/pyenv.py pytest numpy)`.
