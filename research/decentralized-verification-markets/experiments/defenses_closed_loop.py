"""Follow-up 8: defences against the closed-loop whitewash adversary.
Run: PYTHONPATH=src python3 experiments/defenses_closed_loop.py"""
from verification_markets import closed_loop as cl
from verification_markets.adaptive import brier
from verification_markets.simulation import SimulationConfig, run_simulation

CTLS = [("threshold", cl.threshold), ("prop(1,.1)", lambda: cl.proportional(1.0, 0.1)),
        ("prop(2,.2)", lambda: cl.proportional(2.0, 0.2))]
DEFS = [("public weights, symmetric", dict()), ("public, asym (r=.9)", dict(decay=0.2, recovery_decay=0.9)),
        ("noisy sd=.2", dict(observation_noise=0.2)), ("noisy sd=.4", dict(observation_noise=0.4)),
        ("hidden weights", dict(observation_noise=None)),
        ("hidden + asym", dict(observation_noise=None, decay=0.2, recovery_decay=0.9))]
print(f"{'controller':>11} | {'defence':>26} | lie rate | rolling Brier | missed fraud")
for cname, ctl in CTLS:
    for dname, kw in DEFS:
        acc = [0.0] * 3
        for seed in range(1, 6):
            r = run_simulation(SimulationConfig(n_tasks=1500, n_honest=14, n_lazy=0, n_colluding=0,
                n_adversarial=0, n_late_whitewash=8, whitewash_prob=0.0, seed=seed))
            adv = [v.id for v in r.verifiers if v.strategy == "late_whitewash"]
            o = cl.run_closed_loop(r, adv, ctl, block_size=100, **{"decay": 0.5, **kw})
            for k, x in enumerate((o.lie_rate, brier(o.prices, r, r.scoring_tasks), o.missed_fraud)):
                acc[k] += x
        print(f"{cname:>11} | {dname:>26} | {acc[0]/5:>8.3f} | {acc[1]/5:>13.4f} | {acc[2]/5:>12.4f}")
