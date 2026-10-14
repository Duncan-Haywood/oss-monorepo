"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import cmath
import math
from error_feedback_sync import *

s, V = 0.5, 0.2

print("== 1. Exact moment system vs literal simulation (one mode s=0.5, V=0.2; 300k rounds) ==")
print("N   alpha  rho    E x^2 exact  sim       ratio   E e^2 exact  sim       ratio")
for N, al, rho in ((4, 0.5, 0.25), (16, 0.8, 0.1), (8, 0.6, 0.5), (16, 1.5, 0.25)):
    th, rs = ef_var(s, V, al, N, rho), residual_var(s, V, al, N, rho)
    sx, se = simulate_ef(s, V, al, N, rho, 300000, 2000, seed=1)
    print("%-3d %.2f   %.2f   %.5f      %.5f   %.3f   %.4f       %.4f    %.3f" % (N, al, rho, th, sx, sx / th, rs, se, se / rs))

print("\n== 2. Closed forms: stability limit z_max = 2(2-rho)N rho/(N rho^2 + 4(1-rho)) (z = alpha s) and floor ==")
print("N     rho    z_max EF   z_max unbiased 2/(1+w/N)   uncompressed")
for N in (1, 4, 16, 64, 1000):
    for rho in (0.5, 0.25, 0.05):
        w = (1 - rho) / rho
        print("%-5d %-6.2f %-10.3f %-27.3f 2" % (N, rho, zmax_closed(N, rho), 2 / (1 + w / N)))
worst = max(abs(ef_var_closed(s, V, al, N, r) / ef_var(s, V, al, N, r) - 1)
            for N in (1, 2, 5, 16) for r in (0.5, 0.25, 0.1) for al in (0.01, 0.1, 0.3, 0.6) if al * s < zmax_closed(N, r) * 0.95)
print("max relative gap closed form vs solved 4x4 system over the grid: %.1e" % worst)
print("bisection z_max check (N=4, rho=0.25): %.6f vs closed %.6f" % (alpha_max_ef(s, 4, 0.25, hi=40 / s) * s, zmax_closed(4, 0.25)))

print("\n== 3. Floor at equal expected bytes, homogeneous quadratic (N=16), relative to uncompressed at the same alpha ==")
print("rho    alpha  unbiased  EF       dropped   dropped at alpha/rho (same mean speed as uncompressed)")
for rho in (0.25, 0.1):
    for al in (0.05, 0.2, 0.5):
        u0 = uncompressed_var(s, V, al, 16)
        a2 = al / rho
        print("%-6.2f %-6.2f %-9.2f %-8.3f %-9.3f %.3f (alpha/rho=%.2f)" % (
            rho, al, unbiased_var(s, V, al, 16, rho) / u0, ef_var_closed(s, V, al, 16, rho) / u0,
            dropped_var(s, V, al, 16, rho) / u0, dropped_var(s, V, a2, 16, rho) / uncompressed_var(s, V, al, 16), a2))

print("\n== 4. Bias: workers with optima b_i sending at unequal rates rho_i (s=0.5, V=0.05, 6 workers) ==")
b = [1.0, 0.0, 0.0, -1.0, 2.0, 0.5]
rho = [0.9, 0.5, 0.3, 0.1, 0.05, 0.7]
print("true mean of optima %.4f; rate-weighted mean %.4f" % (fixed_point_ef(b, rho), fixed_point_dropped(b, rho)))
print("alpha  dropped: mean   var      MSE      | EF: mean     var      MSE")
star = fixed_point_ef(b, rho)
for al in (0.4, 0.1, 0.03, 0.01, 0.003):
    md, vd = simulate_hetero(False, 0.5, 0.05, al, b, rho, 1500000, 20000, seed=3)
    me, ve = simulate_hetero(True, 0.5, 0.05, al, b, rho, 1500000, 20000, seed=3)
    print("%.3f  %.4f        %.5f  %.5f  | %.4f      %.5f  %.5f" % (
        al, md, vd, (md - star) ** 2 + vd, me, ve, (me - star) ** 2 + ve))

print("\n== 5. Top-k (state-dependent, no closed form) vs rand-k, D=8 modes with V_j = 0.02*2^(j/1.5), N=8, s=0.6, alpha=0.5, k=2 ==")
D, N, k, al = 8, 8, 2, 0.5
sl = [0.6] * D
Vl = [0.02 * 2 ** (j / 1.5) for j in range(D)]
unc = sum(0.5 * uncompressed_var(sl[j], Vl[j], al, N) for j in range(D))
rand_ef = sum(0.5 * ef_var_closed(sl[j], Vl[j], al, N, k / D) for j in range(D))
rand_unb = sum(0.5 * unbiased_var(sl[j], Vl[j], al, N, k / D) for j in range(D))
rand_drop = sum(0.5 * dropped_var(sl[j], Vl[j], al, N, k / D) for j in range(D))
tk_ef = sum(0.5 * x for x in simulate_topk_ef(sl, Vl, al, N, k, 120000, 3000, seed=1, feedback=True))
tk_nf = sum(0.5 * x for x in simulate_topk_ef(sl, Vl, al, N, k, 120000, 3000, seed=1, feedback=False))
print("loss (sum s/2 Var x, with s/2 weights): uncompressed %.5f" % unc)
for name, v in (("rand-k unbiased", rand_unb), ("rand-k dropped", rand_drop), ("rand-k + EF (exact)", rand_ef),
                ("top-k dropped (sim)", tk_nf), ("top-k + EF (sim)", tk_ef)):
    print("  %-22s %.5f  = %.2fx uncompressed" % (name, v, v / unc))

print("\n== 6. Speed: slow eigenvalue of the mean dynamics (N -> infinity), x' = x - alpha rho (e + s x), e' = (1-rho)(e + s x) ==")
print("alpha s  rho    dominant |eigenvalue|  1 - alpha s (uncompressed)   dropped: 1 - alpha rho s")
for z in (0.02, 0.1, 0.4):
    for rho in (0.25, 0.05):
        tr, det = 2 - rho - rho * z, 1 - rho
        disc = cmath.sqrt(tr * tr - 4 * det)
        lam = max(abs((tr + disc) / 2), abs((tr - disc) / 2))
        print("%-8.2f %-6.2f %-16.4f %-28.4f %.4f" % (z, rho, lam, 1 - z, 1 - rho * z))
