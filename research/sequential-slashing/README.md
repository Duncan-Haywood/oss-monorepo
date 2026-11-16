# Sequential (anytime-valid) slashing of verifiers

Stdlib-only Python. How should a protocol decide, while checking outcomes as they arrive, that a verifier's reported fault probabilities are miscalibrated, without slashing honest verifiers more than α of the time? See `paper/whitepaper.md`.

**Live page:** https://marisstella.app/research/sequential-slashing/

```bash
cd research/sequential-slashing
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 19 tests
PYTHONPATH=src python3 experiments/run.py                  # ~4.5 min; output in experiments/results.txt
```
Results (exact, by dynamic program over the shipped decision rule, unless marked): re-running a fixed-sample z-test at every step falsely slashes 37.3% of honest verifiers within 2000 rounds (nominal 5%); a likelihood-ratio e-process holds 4.3% and a q-free mixture 3.1%, under Ville's 5%. The LR's mean detection delay is 5% above Wald's `ln(1/α)/KL` at α=0.05 (2 to 13% across settings) and grows only logarithmically in 1/α; not knowing the cheating rate costs a factor 1.43 at p=0.2 (1.16 to 1.93 for p from 0.02 to 0.4). When reports vary by round, pooling them into an average rate falsely slashes an honest drifting verifier every time, while the per-round mixture (`run_mixture_varying`, one- or two-sided) stays at 3.3% to 4.4% (Monte Carlo, Wilson intervals); it buys validity, not power, and only the two-sided test catches over-reporting. Illustrative rates (p=0.2, q=0.3, swept in E6), not taken from any deployed protocol; prior work and what is new are in the whitepaper's references. MIT.

**Known gaps** (from the [2026-11-07 quality audit](../../portfolio/quality/audits/2026-11-07-sequential-slashing.json), defect 2, still open): no composite null, no confidence sequence for the fault rate, no bet family matched to a cheater who scales its reports, and no adaptive (strategic) cheater or stake model.
