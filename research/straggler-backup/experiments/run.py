import math, random
from straggler_backup import *

def mean(x): return sum(x) / len(x)

print("E1 exact round time, n=32, shift s=1, mu=1: exact vs simulation (20000 rounds, seed 1)")
rng = random.Random(1)
for k in (4, 16, 24, 28, 32):
    xs = simulate_round(32, k, 1.0, 1.0, rng, 20000)
    m = mean(xs); sd = math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))
    print(f"  k={k:2d}  E exact {exp_order_mean(32,k,1.0,1.0):.4f} sim {m:.4f}   sd exact {math.sqrt(exp_order_var(32,k)):.4f} sim {sd:.4f}")
print(f"  k=32 vs k=16 per-round: {exp_order_mean(32,32,1,1)/exp_order_mean(32,16,1,1):.3f}x ; k=32 vs k=28: {exp_order_mean(32,32,1,1)/exp_order_mean(32,28,1,1):.3f}x")

print("E2 heavy tails, Pareto(alpha), x_m=1, n=32: E[X_(k)] exact; simulation in brackets where the variance is finite (20000 rounds, seed 2)")
rng = random.Random(2)
for alpha in (0.8, 1.5, 2.5):
    row = []
    for k in (16, 28, 31, 32):
        e = pareto_order_mean(32, k, 1.0, alpha)
        if alpha == 2.5:
            xs = [sorted(math.exp(rng.expovariate(1.0) / alpha) for _ in range(32))[k - 1] for _ in range(20000)]
            row.append(f"k={k}: {e:.3f} [{mean(xs):.3f}]")
        else:
            row.append(f"k={k}: {e:.3f}")
    print(f"  alpha={alpha}  " + "   ".join(row))

print("E3 time to accuracy, n=64, mu=1, a=1, eta=0.2, sigma2=2, x0^2=1, eps=0.05 (k_min = %.2f)" % min_k(1.0, 0.2, 2.0, 0.05))
for s in (0.0, 0.5, 2.0, 8.0, 32.0):
    ks, ts = best_k(64, s, 1.0, 1.0, 0.2, 2.0, 1.0, 0.05)
    t_all = expected_time(64, 64, s, 1.0, 1.0, 0.2, 2.0, 1.0, 0.05)
    t_half = expected_time(64, 32, s, 1.0, 1.0, 0.2, 2.0, 1.0, 0.05)
    print(f"  s={s:5.1f}  k*={ks:2d} (rounds {sgd_rounds(ks,1.0,0.2,2.0,1.0,0.05)}, T {ks and ts:.1f})  wait-all T {t_all:.1f} ({t_all/ts:.2f}x)  k=n/2 T {t_half:.1f} ({t_half/ts:.2f}x)")

print("E3b same, Pareto(alpha=1.5,x_m=1) workers: expected time = rounds * E[X_(k)]; n=64")
best = min(((sgd_rounds(k,1.0,0.2,2.0,1.0,0.05) * pareto_order_mean(64,k,1.0,1.5), k) for k in range(1, 65)))
tall = sgd_rounds(64,1.0,0.2,2.0,1.0,0.05) * pareto_order_mean(64,64,1.0,1.5)
print(f"  k*={best[1]} T={best[0]:.1f}; wait-all T={tall:.1f} ({tall/best[0]:.2f}x)")

print("E4 joint (k, eta) optimum vs fixed eta=0.2, n=64, mu=1, sigma2=2, eps=0.05, a=1")
for s in (0.0, 2.0, 8.0):
    fixed = best_k(64, s, 1.0, 1.0, 0.2, 2.0, 1.0, 0.05)
    jb = min(((best_k(64, s, 1.0, 1.0, eta, 2.0, 1.0, 0.05)[1], best_k(64, s, 1.0, 1.0, eta, 2.0, 1.0, 0.05)[0], eta) for eta in [i / 100 for i in range(2, 100, 2)]))
    print(f"  s={s:4.1f}  fixed eta: k*={fixed[0]} T={fixed[1]:.1f}   joint: k*={jb[1]} eta*={jb[2]:.2f} T={jb[0]:.1f}  gain {fixed[1]/jb[0]:.2f}x")

print("E5 selection bias, n=16, mu_i=exp(0.7 z_i) (z_i evenly spaced quantiles), theta_i=-c*z_i (slow workers hold the large optima), noise sd 1")
n = 16
zs = [(i - (n - 1) / 2) / ((n - 1) / 2) * 1.5 for i in range(n)]
mus = [math.exp(0.7 * z) for z in zs]
for c in (0.0, 1.0):
    theta = [-c * z for z in zs]
    truth = mean(theta)
    print(f"  data-speed coupling c={c}")
    for k in (2, 4, 8, 12, 16):
        pis = inclusion_probs(mus, k, steps=1500)
        bias = sum(pis[i] * theta[i] for i in range(n)) / k - truth
        rng = random.Random(5)
        err = [[], [], []]
        for _ in range(6000):
            S = sample_fastest(mus, k, rng)[0]
            noise = [rng.gauss(0, 1) for _ in range(n)]
            for j, e in enumerate(estimators(theta, pis, S, noise)):
                err[j].append((e - truth) ** 2)
        rt = [sample_fastest(mus, k, rng)[1] for _ in range(3000)]
        print(f"    k={k:2d} E[T]={mean(rt):.2f} pi_min={min(pis):.3f}  bias {bias:+.3f}  MSE plain {mean(err[0]):.3f} HT {mean(err[1]):.3f} Hajek {mean(err[2]):.3f}  max HT weight {1/(n*min(pis)):.2f}")
