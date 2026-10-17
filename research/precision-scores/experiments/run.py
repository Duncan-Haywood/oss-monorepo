import math, random
from precision_scores import *

print("E1 exact gap moments (d=4, kappa=30, random A, D): Monte Carlo over 200000 tasks, Gaussian and Student-t(5) noise")
rng = random.Random(1); S = random_spd(4, rng, 30); A = random_spd(4, rng, 6); D = [.4, -.7, .2, .5]
L = cholesky(S); u = matvec(A, D)
for name, law in (("gaussian", sample_gaussian), ("student-t5", lambda L, r: sample_t(L, r, 5.0))):
    g = [quad(A, D) - 2 * sum(a * b for a, b in zip(u, law(L, rng))) for _ in range(200000)]
    m = sum(g) / len(g); v = sum((x - m) ** 2 for x in g) / len(g)
    print(f"  {name:10s} mean {m:.4f} (exact {gap_mean(A, D):.4f})  var {v:.4f} (exact {gap_var(A, S, D):.4f})")

print("E2 uniform optimality: min over 2000 random directions of efficiency, d=6, Sigma condition number kappa")
for kappa in (1, 10, 100, 1000):
    rng = random.Random(2); S = random_spd(6, rng, max(kappa, 1.0001)); P = inverse(S)
    print(f"  kappa={kappa:5d}  precision {worst_direction_search(P, S, rng, 2000):.4f}   identity {worst_direction_search(identity(6), S, rng, 2000):.4f}"
          f"   diag-precision {worst_direction_search(inverse(diag_of(S)), S, rng, 2000):.4f}   random SPD A {worst_direction_search(random_spd(6, rng, 10), S, rng, 2000):.4f}")

print("E3 Kantorovich price of an isotropic score (Sigma = diag(1, sqrt(kappa), kappa)): efficiency at the extremal direction and tasks ratio")
for kappa in (1, 4, 10, 100, 1000):
    lam = [1.0, math.sqrt(kappa), float(kappa)]; S = [[lam[i] if i == j else 0.0 for j in range(3)] for i in range(3)]
    D = extremal_direction(lam); e = efficiency(identity(3), S, D)
    print(f"  kappa={kappa:5d}  eff {e:.4f} = 4k/(1+k)^2 {kantorovich(kappa):.4f}   tasks: precision {tasks_needed(S, D):8.1f}  identity {tasks_needed(S, D, A=identity(3)):9.1f}  ratio {1/e:6.1f}")

print("E4 power at the precision score's predicted n (80% target), Sigma=diag(1,20,1), extremal D; 1000 trials")
S = [[1, 0, 0], [0, 20, 0], [0, 0, 1.0]]; D = extremal_direction([1.0, 20.0, 1.0]); n = int(math.ceil(tasks_needed(S, D))); rng = random.Random(4)
nI = int(math.ceil(tasks_needed(S, D, A=identity(3))))
print(f"  n_precision={n}, n_identity={nI}")
for noise in ("gauss", "t"):
    print(f"  noise={noise:5s} power at n={n}: precision {power_sim(inverse(S), S, D, n, 1000, rng, noise):.3f}   identity {power_sim(identity(3), S, D, n, 1000, rng, noise):.3f}   identity at n={nI}: {power_sim(identity(3), S, D, nI, 1000, rng, noise):.3f}")

print("E5 correlated layers: d=2, unit variances, correlation rho; efficiency of identity and diagonal-precision at the worst D (grid over angle)")
for rho in (0.0, 0.5, 0.9, 0.99):
    S = [[1, rho], [rho, 1.0]]; worst = {"identity": 1.0, "diag": 1.0}; Ad = inverse(diag_of(S))
    for k in range(3600):
        th = math.pi * k / 3600; D = [math.cos(th), math.sin(th)]
        worst["identity"] = min(worst["identity"], efficiency(identity(2), S, D)); worst["diag"] = min(worst["diag"], efficiency(Ad, S, D))
    print(f"  rho={rho:4.2f}  identity {worst['identity']:.4f} (Kantorovich {kantorovich((1+rho)/(1-rho)):.4f})   diagonal precision {worst['diag']:.4f}")

print("E6 estimated precision Sigma_hat^{-1} from m reference draws (independent of the verifier), d=6, kappa=30: mean efficiency over 300 draws")
rng = random.Random(6); S = random_spd(6, rng, 30); D = [rng.gauss(0, 1) for _ in range(6)]
print(f"  identity {efficiency(identity(6), S, D):.4f}   diag-precision {efficiency(inverse(diag_of(S)), S, D):.4f}   true precision 1.0000")
for m in (8, 12, 20, 40, 100, 400, 2000):
    es = []
    for _ in range(300 if m <= 400 else 100):
        Sh = cov_estimate(S, m, rng)
        es.append(efficiency(inverse(Sh), S, D))
    es.sort(); print(f"  m={m:5d}  mean {sum(es)/len(es):.4f}  10th pct {es[len(es)//10]:.4f}  (1-d/m = {1-6/m:.3f})")

print("E7 ridge (Sigma_hat + lam I)^{-1} with few draws: mean efficiency, m=12, d=6, kappa=30 (trace-normalised lam = c * tr/d)")
for c in (0.0, 0.05, 0.2, 0.5, 1.0, 3.0):
    es = []
    for _ in range(300):
        Sh = cov_estimate(S, 12, rng); lam = c * sum(Sh[i][i] for i in range(6)) / 6
        R = [[Sh[i][j] + (lam if i == j else 0.0) for j in range(6)] for i in range(6)]
        es.append(efficiency(inverse(R), S, D))
    print(f"  c={c:4.2f}  mean efficiency {sum(es)/len(es):.4f}")
