"""Deterministic experiments; output in results.txt."""
from score_recalibration import *

pi, mu = 0.5, 1.0
B0, U = brier(pi, mu), unc_brier(pi)
print(f"Setup: pi={pi}, mu={mu}; calibrated Brier {B0:.4f}, constant-prior Brier {U:.4f}")

print("\nE1  raw Brier overpays for miscalibration exactly E[(r-p)^2] (slope a, shift b)")
for a, b in ((1, 0), (0.5, 0), (0.25, 0), (2, 0), (4, 0), (1, 0.3), (1, 0.6), (2, 0.3)):
    x = brier(pi, mu, a, b)
    print(f"  a={a:4.2f} b={b:3.1f}  Brier {x:.4f}  excess {x-B0:.5f}  E[(r-p)^2] {rel_brier(pi, mu, a, b):.5f}  log excess {log_loss(pi, mu, a, b)-log_loss(pi, mu):.5f} = E[KL] {rel_log(pi, mu, a, b):.5f}")

print("\nE2  small-distortion law E[(pq)^2((a-1)L+b)^2]: ratio to exact excess -> 1")
for e in (1.0, 0.5, 0.2, 0.1, 0.05):
    a, b = 1 + e, 0.5 * e
    print(f"  eps={e:4.2f}  exact {rel_brier(pi, mu, a, b):.3e}  local {local_excess(pi, mu, a, b):.3e}  ratio {rel_brier(pi, mu, a, b)/local_excess(pi, mu, a, b):.4f}")

print("\nE3  a real signal scored below a constant forecaster: slope a above which raw loss exceeds the prior's (b=0)")
for m in (0.5, 1.0, 1.5):
    hb = worse_than_prior_slope(pi, m, 1.0, 400.0)
    hl = worse_than_prior_slope(pi, m, 1.0, 400.0, "log")
    print(f"  mu={m:3.1f}  Brier: {'never (bounded; hard 0/1 report still beats prior)' if hb > 399 else f'a > {hb:.2f}'}   log: a > {hl:.2f}")

print("\nE4  ranking reversal: A has higher resolution (mu=1.0) but slope a; B calibrated with mu=0.7")
for rule in ("brier", "log"):
    f = brier if rule == "brier" else log_loss
    tb = f(pi, 0.7)
    lo_c = crossing_slope(pi, 1.0, 0.7, 0.02, 1.0, rule)
    hi_c = crossing_slope(pi, 1.0, 0.7, 1.0, 400.0, rule)
    hi_s = "no upper crossing" if hi_c > 399 else f"{hi_c:.2f}"
    print(f"  {rule}: B loss {tb:.4f}, A calibrated {f(pi, 1.0):.4f}; raw score ranks A first only for a in ({lo_c:.3f}, {hi_s}); recalibrated always ranks A first")
    for a in (0.2, 0.5, 2.0, 4.0, 8.0):
        x = f(pi, 1.0, a)
        print(f"    a={a:3.1f}  A {x:.4f} vs B {tb:.4f}: raw picks {'A' if x < tb else 'B (wrong)'}")

print("\nE5  finite-sample cost of recalibrating: excess Brier of an n-sample logistic fit vs (1/2n)tr(H I^-1)")
for pi5, m in ((0.5, 1.0), (0.2, 1.0), (0.5, 0.5)):
    print(f"  pi={pi5}, mu={m}, calibrated Brier {brier(pi5, m):.4f}")
    for n in (50, 100, 200, 400):
        sim = simulate_recal(pi5, m, n, 300, seed=n)
        pr = predicted_excess(pi5, m, n)
        print(f"    n={n:4d}  simulated {sim:.5f}  predicted {pr:.5f}  ratio {sim/pr:.3f}")

print("\nE6  when does recalibrating beat paying raw? break-even n = predicted_excess constant / raw excess (pi=0.5, mu=1)")
c = predicted_excess(pi, mu, 1)
for a in (0.5, 0.7, 1.5, 2.0):
    ex = rel_brier(pi, mu, a)
    print(f"  a={a:3.1f}  raw excess {ex:.5f}  fitted excess ~ {c:.3f}/n  fitting wins for n > {c/ex:6.1f}")
