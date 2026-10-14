# Twin ladder: which rungs of a multi-fidelity ladder of digital twins are worth running?

Pure Python, no dependencies. Follow-up to `twin-evaluation` and `twin-pilot` (one biased twin as a control variate for real policy evaluation) to a *ladder* of twins of decreasing cost and fidelity (e.g. coarser simulation timesteps). With correlations `ρ_i` to the real return and costs `c_i`, the nested multifidelity estimator has exact variance `σ²Σ(ρ_i²−ρ_{i+1}²)/m_i`, optimum `σ²(Σ√((ρ_i²−ρ_{i+1}²)c_i))²/C`, and a cheaper rung pays below a twin already in use iff `ρ_2/ρ_1 > ρ*(c_2/c_1)=2√r/(1+r)`: the same threshold as a single twin against reality, applied to the step correlation (0.943 for halving cost, 0.575 for a 10× drop). Using every rung is not best (geometric ladder, `q`=0.99, `r`=0.5, 6 rungs: 0.284 of real-only variance vs 0.196 for the best 2 rungs; `q`=0.9 makes all-rungs 1.41× *worse* than real-only while the best subset gets 0.83), and 10 of 336 paying grid points are infeasible (redundant parent). On a saturated PD mass-spring timestep ladder the best ladder (steps 2 and 4 × 1/160 s) has 0.156 of real-only variance vs 0.204 for the best single twin (simulated 0.156 / 0.217, sim/exact 1.005 / 1.06); with only 90% / 70% disturbance replay the ladder collapses to the cheapest twin (0.52 / 0.89 simulated). One coarser rung (0.2 s) diverged in 2 of 20,000 contexts. See `paper/whitepaper.md`.

```bash
cd research/twin-ladder
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 5 tests, ~5 s
PYTHONPATH=src python3 experiments/run.py                 # ~1 min; output in experiments/results.txt
```

**Builds on.** The sim-to-real and manipulation-in-simulation direction of the HIRO group (<https://hiro-group.ronc.one/>), the perception/field-robot simulation direction of ARPG (<https://arpg.colorado.edu/>) and the safe-autonomy and UAV simulation direction of RECUV (<https://www.colorado.edu/recuv/>), where policies are evaluated in simulators of several fidelities before real trials. No specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. The estimator is multifidelity Monte Carlo (Peherstorfer, Willcox & Gunzburger 2016; cf. multilevel Monte Carlo, Giles 2008). Sequel to `twin-evaluation` and `twin-pilot`; related to `timestep-twin` and `crn-twin` in this repository.

Stylised: Gaussian chains for the variance law; one plant with a "real" system that is itself the finest-step simulation; correlations and costs treated as known; costs are step counts. Preliminary. MIT.
