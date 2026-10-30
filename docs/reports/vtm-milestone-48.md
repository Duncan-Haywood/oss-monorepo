# verifiable-training-mechanisms milestone 48 (agent note)

- Milestone 47's `grad`/`eval` sites had the wrong sign (descent, not ascent); fixed in `experiments/bit_flips_worst/run.py`, old outputs kept in `wrong_sign/`. Anything citing "single-weight plants are a poor attack" is withdrawn.
- 48 (`experiments/bit_flips_multi/`): at K = 4 per-tensor bound, gradient-chosen k = 1/4/16/64/256 weights harm 0.45/0.70/0.95/1/1; random plants 0/0.10/0.20/0.85/1.
- Next: aggregate-update check (L2 norm / sparsity of submitted delta vs honest per-step movement) against this adversary; paper H4 paragraph is not yet updated for milestones 43 to 48.
- Torch install: `pyenv.py torch` took ~13 min because download.pytorch.org was unreachable (pulled the CUDA wheel from PyPI).
