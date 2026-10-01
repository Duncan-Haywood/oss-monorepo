# When may a module choose to sleep?

Stdlib-only Python. Follow-up to `sleeping-ledger`, which left wake declarations exogenous. Proves the ledger pays each awake module exactly its leave-one-out saving (`η W_A (1−p_i) S_i`); shows that a module declaring sleep *after* seeing its loss gains wealth at rate `η p_B θ(1−θ)/2` (best `1/8`) and takes the market from an equal-skill honest rival in ~130 rounds while the router's loss is unchanged; that the same behaviour committed *before* the router serves is a real saving (`s·g`, `g` falling from 0.125 to 0.011 as signal noise grows 0→3); and that the deterring sleeping tax `η p_B/2` is a fixed-share rate that halves an honest specialist in 6 rounds. See `paper/whitepaper.md`.

```bash
cd research/sleeping-incentives
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, ~2 s
PYTHONPATH=src python3 experiments/run.py                  # ~1 min; output in experiments/results.txt
```
Two modules, iid U(0,1) losses, threshold strategies, mean-field share dynamics; MIT.
