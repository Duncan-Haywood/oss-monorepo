import math, random
from compute_shirking import *

Z = z_of(0.05)

print("E1 hidden fraction f* (detected w.p. 1/2, alpha=0.05), power law, beta=0.5: rows sigma', cols reducible share r")
rs = (1.0, 0.5, 0.2, 0.05, 0.01)
print("  sigma' \\ r  " + "  ".join(f"{r:6.2f}" for r in rs))
for s in (0.02, 0.05, 0.10, 0.20):
    print(f"  {s:8.2f}     " + "  ".join(f"{hide_fraction_powerlaw(s, 0.5, r):6.3f}" for r in rs))
print("  small-noise law f* ~ z sigma'/(beta r):  sigma'=0.02, r=0.5 ->", round(Z * 0.02 / (0.5 * 0.5), 3), " exact", round(hide_fraction_powerlaw(0.02, 0.5, 0.5), 3))
print("  r=1 closed form 1-exp(-z sigma'/beta) at sigma'=0.10:", round(1 - math.exp(-Z * 0.10 / 0.5), 4), " general formula", round(hide_fraction_powerlaw(0.10, 0.5, 1.0), 4))

print("\nE2 eval samples m needed so hidden fraction <= 5% (beta=0.5, k=5 reference runs, alpha=0.05, detection 1/2); '--' = impossible (seed floor)")
print("  seed floor f_inf = hidden fraction with unlimited eval data")
print("  rho_seed  r      m needed     f_inf")
for rho in (0.0, 0.02, 0.05):
    for r in (1.0, 0.5, 0.2, 0.05):
        m = eval_size_for_cap(0.05, 0.5, r, rho, 5)
        print(f"  {rho:6.2f}  {r:5.2f}  {('--' if m is None else f'{m:,.0f}'):>10}   {seed_floor(0.5, r, rho, 5):7.3f}")

print("\nE3 exact quadratic GD (d=1000, lam_i=i^-1.5, w0~N(0,I)), m=2000 eval samples, k=5 reference runs, alpha=0.05, 4000 trials")
gd = QuadraticGD(1000, 1.5)
rng = random.Random(1)
for T in (100, 1000, 5000):
    m, k = 2000, 5
    sig = sigma_total(m, gd.seed_rel_sd(T), k)
    fh = hide_fraction_curve(gd.mean_loss, T, sig)
    loc = math.log(gd.mean_loss(0.9 * T) / gd.mean_loss(T)) / -math.log(0.9)      # local exponent between 0.9T and T
    r_share = 1.0                                                                   # Linf = 0 here
    fp = hide_fraction_powerlaw(sig, loc, r_share)
    print(f"  T={T}: rho_seed={gd.seed_rel_sd(T):.3f} sigma'={sig:.4f}  local exponent {loc:.2f}  f* exact-curve {fh:.3f}  f* power-law@local {fp:.3f}")
    for mult in (0.0, 0.5, 1.0, 2.0):
        f = mult * fh
        sh = math.log(gd.mean_loss((1 - f) * T) / gd.mean_loss(T))
        print(f"      f={f:.3f}  predicted P(detect) {detect_prob(sh, sig):.3f}  simulated {simulate_test(gd, T, f, m, k, 0.05, 4000, rng):.3f}")

print("\nE4 cheater economics: job cost K=1; best skip fraction and minimum deterring stake S* = K max_f f/p(f), power law beta=0.5, r=0.2, k=5")
for m in (200, 2000, 20000, 200000):
    sig = sigma_total(m, 0.02, 5)
    pdet = lambda f, sig=sig: detect_prob(log_shift_powerlaw(f, 0.5, 0.2), sig)
    Sstar = max(f / pdet(f) for f in [i / 2000 * 0.999 for i in range(1, 2001)])
    fh = hide_fraction_powerlaw(sig, 0.5, 0.2)
    row = f"  m={m:>7,}  sigma'={sig:.3f}  f*(1/2)={fh:.3f}  S*/K={Sstar:5.2f}"
    for S in (1.0, 3.0, 10.0):
        f, v = best_skip(1.0, S, pdet)
        row += f"   stake {S:>4.1f}: skip {f:.3f} profit {v:.3f}"
    print(row)

print("\nE5 loss test + random step audits (T=1000 steps, beta=0.5, m=2000, k=5, rho_seed=0.03): hidden fraction at detection 1/2")
sig = sigma_total(2000, 0.03, 5)
print(f"  sigma'={sig:.4f}")
print("  r      audits=0   5      20     100    (spot-only closed form 1-0.5^(1/n) for n=5,20,100: " + ", ".join(f"{1 - 0.5 ** (1 / n):.3f}" for n in (5, 20, 100)) + ")")
for r in (1.0, 0.3, 0.1, 0.03, 0.01):
    print(f"  {r:4.2f}   " + "  ".join(f"{hybrid_hide(1000, n, 0.5, r, sig):7.3f}" for n in (0, 5, 20, 100)))
print("  audit-equivalent of the loss test (audits alone that hide the same fraction at detection 1/2):")
for r in (1.0, 0.3, 0.1, 0.03, 0.01):
    print(f"    r={r:4.2f}: f*={hide_fraction_powerlaw(sig, 0.5, r):.3f}  ~ {audit_equivalent(hide_fraction_powerlaw(sig, 0.5, r)):.2f} audits")
