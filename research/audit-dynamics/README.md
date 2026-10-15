# Audit dynamics: no-regret learning in the inspection game of refereed verification

Stdlib-only Python. The equilibrium audit rate `y* = s/(s+S)` and cheat rate `x* = k/(λS+h)` from
[`verification-game`](../verification-game) are only meaningful if participants *find* them. Here solvers and
verifiers run Hedge / optimistic Hedge. See `paper/whitepaper.md`.

```bash
cd research/audit-dynamics
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests
PYTHONPATH=src python3 experiments/run.py
```
Results: conserved potential `KL(x*||x)+KL(y*||y)` for the flow (grows under Hedge); closed-form oscillation period
`2π/(η·C·√(x*(1-x*)y*(1-y*)))` matching simulation to <0.1%; time-averages converge but Hedge's per-round audit
probability collapses to ~0 for most rounds at moderate step sizes; optimistic Hedge converges last-iterate.
Stylised model; limitations in the paper. MIT.
