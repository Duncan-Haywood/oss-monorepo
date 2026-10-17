import math, random
from conformal_tolerance import *

print("E1 calibration runs n needed for ANY finite PAC tolerance (threshold = sample max): n = ceil(ln delta / ln(1-alpha))")
print(" alpha    delta=0.1  0.01   0.001")
for a in (0.05, 0.01, 0.001, 1e-4):
    print(f" {a:<8g}" + "  ".join(f"{min_n_pac(a, d):>7}" for d in (0.1, 0.01, 0.001)))

print("\nE2 plain split conformal k=ceil((n+1)(1-alpha)) is right on average but rarely PAC")
print(" alpha=0.01   n      k   marginal FPR   P(cond FPR<=alpha)   sd(cond FPR)   PAC rank k  (delta=0.01)")
for n in (500, 1000, 5000, 20000):
    k = cal_index(n, 0.01)
    kp = pac_index(n, 0.01, 0.01)
    print(f"  {n:>13} {k:>6}   {marginal_fpr(n, k):.5f}        {pac_prob(n, k, 0.01):.3f}              {math.sqrt(cond_fpr_var(n, k)):.5f}      {kp}")

print("\nE3 MC check of E2, alpha=0.01, delta=0.01, n=2000, uniform/lognormal/Pareto drift (400 calibration sets)")
n = 2000
kp = pac_index(n, 0.01, 0.01)
kc = cal_index(n, 0.01)
rng = random.Random(0)
draws = {"lognormal(0,1)": (lambda r: math.exp(r.gauss(0, 1)), lambda t: lognormal_sf(t, 0, 1)),
         "pareto(3)": (lambda r: pareto_sample(3, r), lambda t: t ** -3.0)}
for name, (draw, sf) in draws.items():
    okc = okp = 0
    infl = []
    q = {"lognormal(0,1)": math.exp(z_quantile(0.99)), "pareto(3)": 0.01 ** (-1 / 3)}[name]
    for _ in range(400):
        cal = [draw(rng) for _ in range(n)]
        tc, tp = conformal_threshold(cal, kc), conformal_threshold(cal, kp)
        okc += sf(tc) <= 0.01
        okp += sf(tp) <= 0.01
        infl.append(tp / q)
    infl.sort()
    print(f" {name:<15} plain PAC-rate={okc/400:.3f}  PAC-rank rate={okp/400:.3f}  median threshold/true-quantile={infl[200]:.3f}")
print(f" (exact plain PAC prob {pac_prob(n, kc, 0.01):.3f}, PAC-rank {pac_prob(n, kp, 0.01):.4f})")

print("\nE4 hiding-room inflation of the PAC threshold over the true 1-alpha quantile (Pareto tail index a), alpha=0.01, delta=0.01")
print(" n       a=1.5   a=3    a=6")
for n in (500, 1000, 2000, 5000, 20000, 100000):
    print(f" {n:<7} " + "  ".join(f"{pareto_inflation(n, 0.01, 0.01, a):.3f}" for a in (1.5, 3, 6)))

print("\nE5 plug-in Gaussian tolerance (exact mean, exact sd, t = mean + z sd) on lognormal(0,s) drift: TRUE false-slash rate")
print(" s      alpha=0.05   0.01    0.001   (nominal in header)")
for s in (0.25, 0.5, 1.0):
    print(f" {s:<6}" + "  ".join(f"{gauss_plugin_fpr_lognormal(a, s):.4f}" for a in (0.05, 0.01, 0.001)))

print("\nE6 pooled vs per-hardware calibration: 3 classes, median drift 1:2:4, lognormal s=0.5, mix (0.5,0.3,0.2), alpha=0.01")
pis, mus, s = (0.5, 0.3, 0.2), (0.0, math.log(2), math.log(4)), 0.5
t = pooled_threshold(pis, mus, s, 0.01)
print(f" pooled t={t:.3f}")
for name, m in zip(("fast", "mid", "slow"), mus):
    tc = math.exp(m + s * z_quantile(0.99))
    print(f"  {name}: pooled FPR={lognormal_sf(t, m, s):.5f}  per-class t={tc:.3f}  hiding room pooled/per-class={t/tc:.2f}x")
pis2 = (0.1, 0.3, 0.6)
print(f" marginal FPR under deployment mix {pis2}: {sum(p*lognormal_sf(t,m,s) for p,m in zip(pis2,mus)):.4f}  (calibration mix: 0.0100)")
print(" silent drift scaling c on the FAST class, pooled t: FPR = ", "  ".join(f"c={c}:{shifted_fpr(t,mus[0],s,c):.4f}" for c in (1.0, 1.5, 2.0, 3.0)))
print(" runs needed per class for PAC(alpha=0.01, delta=0.01):", min_n_pac(0.01, 0.01), "-> total 3 classes =", 3 * min_n_pac(0.01, 0.01),
      "; runs for the rare class (0.2) at the calibration mix to see that many:", math.ceil(min_n_pac(0.01, 0.01) / 0.2))

print("\nE7 measured float32 residuals (n=12 honest products), conformal tolerance alpha=0.02")
rng = random.Random(7)
ncal, nfresh = 199, 600
cal = [honest_residual(12, rng) for _ in range(ncal)]
fresh = [honest_residual(12, rng) for _ in range(nfresh)]
k = cal_index(ncal, 0.02)
tt = conformal_threshold(cal, k)
mean = sum(cal) / ncal
print(f" mean residual {mean:.3e}  conformal t (rank {k}/{ncal}) = {tt:.3e} = {tt/mean:.2f} x mean")
print(f" fresh false-slash rate {sum(x > tt for x in fresh)/nfresh:.4f}  (marginal {marginal_fpr(ncal, k):.4f}, se {math.sqrt(0.02*0.98/nfresh):.4f})")
print(f" Gaussian-fit t=mean+2.054 sd fresh FPR: ", end="")
sd = math.sqrt(sum((x - mean) ** 2 for x in cal) / (ncal - 1))
tg = mean + z_quantile(0.98) * sd
print(f"{sum(x > tg for x in fresh)/nfresh:.4f}  (t={tg:.3e})")
print(f" Freivalds (one Gaussian probe) misses a rank-one corruption of Frobenius norm t/1.483 = {tt/1.483:.3e} half the time = {tt/1.483/mean:.2f} x mean noise")
