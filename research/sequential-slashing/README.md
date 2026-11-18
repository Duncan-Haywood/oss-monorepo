# Sequential (anytime-valid) slashing of verifiers

How should a protocol decide, while checking outcomes as they arrive, that a verifier's reported fault probabilities are miscalibrated, without slashing honest verifiers more than α of the time? Stdlib-only Python; see `paper/whitepaper.md`. This is an application of established anytime-valid inference (Ville, Wald, Robbins; Arnold, Henzi and Ziegel's sequential calibration tests), not a new test; the whitepaper's "Position and novelty" says what it adds.

**Live page:** https://marisstella.app/research/sequential-slashing/

```bash
cd research/sequential-slashing
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 25 tests, ~20 s
PYTHONPATH=src python3 experiments/run.py                  # ~10 s, Monte Carlo; output in experiments/results.txt
python3 experiments/exact_and_tv.py                        # ~40 s, exact + time-varying; experiments/results_exact.txt
python3 experiments/drift.py                               # ~6 min, drifting reports + bet families; experiments/results_drift.txt
```

Results (p=0.2, q=0.3, α=0.05; exact unless marked):

- Re-running a fixed-sample z-test at every step falsely slashes **37.3%** of honest verifiers within 2000 rounds (nominal 5%), and 36% to 38% at every claimed fault rate from 1% to 50%.
- A likelihood-ratio e-process holds **4.3%** and a q-free mixture **3.1%**, both under α by Ville's inequality.
- Detection delay is **5%** above Wald's `ln(1/α)/KL` (111.8 vs 106.4 rounds; 3% to 14% across the α and q sweeps) and grows logarithmically in 1/α. That the LR test sits just above the bound follows from Wald's identity; it is a check, not a discovery.
- Not knowing the cheating rate costs a factor **1.42** (159.2 vs 111.8 rounds).
- **The bet grid matters at small fault rates:** at a claimed 1% fault rate, a uniform grid of bets detects only 26% of cheaters (true rate 1.5%) within 33,000 rounds; a log-spaced grid (`spacing="log"`) detects all at 1.40× the oracle delay.
- **Time-varying claims** (`run_mixture_tv`, p_t log-uniform on [0.01, 0.3], Monte Carlo): false slash 0.022±0.007 two-sided vs 0.345±0.024 for a peeking z-test; the two-sided version also catches verifiers that over-report faults (99.8%).
- **Pooling drifting reports into an average is invalid**, even for a valid e-process: an honest verifier reporting 0.4 then 0.1 is slashed with probability 1.000000 (exact) by a mixture at the average report, 4.5% by the per-round test.
- **Match the bet family to the misreport:** with reports from 1% to 30%, the per-round test with fixed bet fractions takes a median 1124 rounds to catch a cheater whose true rate is 1.5× each report; a `family="scale"` mixture takes 328 but misses 29% of a cheater who adds 0.02. `family="both"` (with `spacing="log"`) gets 388 rounds and 98% detection, false slash 3.5% (`experiments/drift.py`).

Assumed, not measured: the fault rates, effect sizes and the spread of claimed rates (swept where it matters). Exact values come from `src/sequential_slashing/exact.py`, a boundary dynamic programme that a test ties to the shipped stopping rules. Known gaps: no confidence sequence for the fault rate, no stake or incentive model, no strategic cheater, fixed bet grids rather than a Beta mixture or plug-in bet. MIT.
