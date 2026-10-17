import random
from private_data_market import *

print("E1 expected payment = information: Monte Carlo of realised score gains (1,000,000 runs) vs (1/2)ln(1+tau/a)")
rng = random.Random(1)
for a, s, u in [(0.5, 1.0, 0.0001), (2.0, 1.0, 0.5), (2.0, 0.2, 3.0), (10.0, 1.0, 1.0)]:
    m, se = simulate_payments(a, s, u, 1000000, rng, m0=0.3)
    print(f" a={a:5.1f} sig2={s:.1f} u={u:.4f}: sim {m:.5f} +- {se:.5f}  exact {info(a, 1/(s+u)):.5f}")
w, m, ex = simulate_telescoping(1.0, [0.5, 0.2, 0.1, 0.05], 50000, random.Random(2))
print(f" telescoping over 4 agents: max pathwise |sum of gains - final+initial score| = {w:.1e}, mean total {m:.4f} vs exact {ex:.4f}")

print("\nE2 closed-form best noise vs log-grid search")
for a, s, k in [(0.5, 1, 0.3), (1, 0.2, 0.9), (0.1, 2, 5.0), (3, 0.5, 0.3), (0.05, 0.1, 0.2)]:
    u = best_noise(a, s, k)
    v, ug = best_noise_grid(a, s, k, lo=1e-4, hi=1e7, n=8000)
    print(f" a={a:5.2f} sig2={s:.2f} kappa={k:.2f}: closed {u:9.4f} grid {ug:9.4f}  payoff {payoff(u, a, s, k):.6f} (grid {v:.6f})")

print("\nE3 the cliff: best payoff over a wide noise grid as kappa*a crosses 1 (sig2=1)")
for ka in (0.5, 0.9, 0.99, 1.0, 1.01, 1.5):
    a = ka / 0.4
    u = best_noise(a, 1.0, 0.4)
    v, ug = best_noise_grid(a, 1.0, 0.4, lo=1e-3, hi=1e9, n=8000)
    print(f" kappa*a={ka:4.2f}: closed-form noise {'stay out' if u is None else f'{u:.3g}'}; best grid payoff {v:.3e}")

print("\nE4 sequential market, identical agents (sig2=1, a0=0.2): precision approaches the cap 1/kappa geometrically")
for k in (0.1, 0.5, 1.0):
    r = run_market([(1.0, k)] * 200, 0.2)
    fr = [agents_to_fraction(1.0, k, 0.2, f) if k < 1 else None for f in (0.5, 0.9, 0.99)]
    naive = 0.2 + 200 * 1.0
    print(f" kappa={k}: cap {cap(k):5.2f}, final a {r['a']:.4f}, agents to 50/90/99% of cap {fr}, ratio {approach_ratio(1.0,k):.3f}, "
          f"total pay {r['total_pay']:.4f} = 0.5 ln(a/a0), first/10th/50th noise {r['log'][0][1]:.2f}/{r['log'][9][1]:.2f}/{r['log'][49][1]:.1f}; no-privacy precision {naive:.1f}")

print("\nE5 welfare: sequential market vs planner with a common noise level (a0=0.2, sig2=1)")
for n in (2, 5, 20, 100):
    for k in (0.1, 0.5):
        wm, us = market_welfare(n, 0.2, 1.0, k)
        wp, up = planner_symmetric(n, 0.2, 1.0, k)
        print(f" n={n:3d} kappa={k}: market {wm:.4f}  planner {wp:.4f}  loss {100*(1-wm/wp):4.1f}%  first-agent noise {us[0]:.2f} vs planner {up:.2f}")

print("\nE6 order effects with heterogeneous data (n_i samples: sig2=1/n_i, kappa=4/n_i^2, a0=0.05)")
ag = [(1.0 / n, 4.0 / (n * n)) for n in (1, 2, 4, 8, 16, 32)]
rnd = random.Random(4)
orders = {"small first": list(range(6)), "large first": list(range(5, -1, -1))}
for name, o in orders.items():
    r = run_market(ag, 0.05, order=o)
    print(f" {name}: final a {r['a']:.3f}, participants {r['participants']}, total pay {r['total_pay']:.3f}")
vals = []
for _ in range(200):
    o = list(range(6)); rnd.shuffle(o)
    vals.append(run_market(ag, 0.05, order=o)["a"])
print(f" random orders (200): mean {sum(vals)/200:.3f}, min {min(vals):.3f}, max {max(vals):.3f}; no-privacy precision {0.05 + sum(1/s for s, _ in ag):.1f}")
