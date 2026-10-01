"""Experiments for local-sgd-bias. Deterministic quantities are exact; E5 is Monte Carlo (seeded)."""
from local_sgd_bias import *

eta = 0.05
n = 8
a = [4.0, 3.0, 2.0, 1.0, 0.5, 0.5, 0.25, 0.25]
c = [1.0, 0.5, -0.5, 1.5, -2.0, -1.0, 3.0, 2.0]
print(f"Setup: n={n} workers, curvatures a={a}, optima c={c}, eta={eta}. Global optimum (a-weighted) = {optimum(a, c):.4f}, unweighted mean of c = {sum(c)/n:.4f}")

print("\nE1. Fixed-point bias of plain averaging vs local steps H")
Hs = (1, 2, 5, 10, 20, 50, 100, 500, 5000)
print("H        " + "".join(f"{h:>9d}" for h in Hs))
print("bias     " + "".join(f"{bias(a, c, h, eta):9.4f}" for h in Hs))
print(f"H->inf limit (unweighted mean - optimum) = {saturation_bias(a, c):.4f}; range of c = {max(c) - min(c):.2f}")
print("worker weights w_i at H=1 / 20 / 500:")
for h in (1, 20, 500):
    print(f"  H={h:<4}" + " ".join(f"{w:.4f}" for w in weights(a, h, eta)))

print("\nE2. Corrected aggregation p_i ~ a_i / w_i (needs curvature knowledge): bias and contraction")
for h in (5, 50, 500):
    p = corrected_p(a, h, eta)
    print(f"H={h:<4} plain bias {bias(a, c, h, eta):8.4f}  corrected bias {bias(a, c, h, eta, p):9.2e}  contraction plain {contraction(a, h, eta):.4f} corrected {contraction(a, h, eta, p):.4f}")

print("\nE3. Wall-clock optimal H under a bias tolerance (t_step=1, t_comm=C, contract error by 1e-3)")
for comm in (5.0, 20.0, 100.0, 500.0):
    row = []
    for tol in (0.01, 0.05, 0.2):
        r = best_H(a, c, eta, 1.0, comm, tol, Hmax=1000)
        row.append(f"tol={tol}: H*={r[0]} t={r[1]:.0f}" if r else f"tol={tol}: infeasible")
    h1 = time_to_eps(a, 1, eta, 1.0, comm)
    print(f"C={comm:<6}" + " | ".join(row) + f" | H=1 t={h1:.0f}")

print("\nE4. Heterogeneous speeds: fixed wall-clock window W, worker i does H_i = s_i * W steps (speeds s = 1..); bias and inflation")
s = [4, 4, 2, 2, 1, 1, 1, 1]
W = 5
Hh = [si * W for si in s]
print(f"steps per round {Hh}; bias {bias(a, c, Hh, eta):.4f}; same total steps spread evenly (H={sum(Hh)//n}) bias {bias(a, c, sum(Hh)//n, eta):.4f}")
base = fixed_point(a, c, Hh, eta)
for i in (4, 6):
    Hl = list(Hh)
    print(f"worker {i} (a={a[i]}, c={c[i]}): claims steps", end=" ")
    for claim in (Hh[i], 20, 100, 1000):
        Hl[i] = claim
        print(f"{claim}->x*={fixed_point(a, c, Hl, eta):.4f}", end="  ")
    print()

print("\nE5. Monte Carlo check of the noise formulas (sigma=0.5, 40000 rounds; 15000 at H=30)")
for h in (1, 6, 30):
    mu, var = simulate(a, c, h, eta, 0.5, rounds=40000 if h < 30 else 15000, burn=200, seed=1)
    print(f"H={h:<3} mean sim {mu:8.4f} vs exact {fixed_point(a, c, h, eta):8.4f}; var sim {var:.5f} vs exact {stationary_var(a, h, eta, 0.5):.5f}")
