"""Milestone 3m: (a) is michell.py's Wigley Cw right (an independent fine integral), and
(b) how does Michell + ITTC 1957 compare with a six-point Wigley CT curve (Kajitani et al. 1983)?

    PYTHONPATH=src python3 experiments/run_wigley_kajitani.py > experiments/results_wigley_kajitani.txt

(a) The reference is a re-implementation, in numpy, of the original Michell integral in the lambda
form with the lambda = 1 + w^2 substitution (the method of Archibald's examples/01 - Validation/
michell_wigley.py, MIT, J. Richeux; no code is copied, the idea is). Dense trapezoid grids.
(b) The six (Fn, CT) points are Kajitani et al. (1983) as tabulated in Table 5 of Ahmed, Yaakob,
Rashid and Elbatran, J. Transport System Eng. 2(1), 2015, **read through Archibald's transcription**
(its michell_wigley.py), not from the source. The model size is not given there, so CF is swept.
"""
import math
import numpy as np
from marine_hull.hull import cf_ittc57
from marine_hull.michell import wave_resistance_wigley, wigley_wetted, G

L, B, T = 1.0, 0.1, 0.0625          # L/B = 10, L/T = 16, the Ahmed et al. hull
RHO, NU = 1000.0, 1.0e-6            # Archibald's choice; CF depends weakly on both
FN = np.array([0.250, 0.267, 0.289, 0.316, 0.354, 0.408])
CT = np.array([5.92, 5.84, 6.16, 6.32, 6.12, 6.91]) * 1e-3


def michell_ref(fn, n_l=3001, n_x=4001, n_z=2001, depth=100.0):
    u = fn * math.sqrt(G * L)
    k0 = G / u ** 2
    w = np.sqrt(np.sqrt(depth / (k0 * T)) + 1.0) * np.linspace(0, 1, n_l)
    lam = 1.0 + w ** 2
    x = np.linspace(-L / 2, L / 2, n_x)
    z = np.linspace(-T, 0, n_z)
    sx = -B / 2 * 8 * x / L ** 2
    sz = 1 - (z / T) ** 2
    amp = np.empty(n_l)
    for i, li in enumerate(lam):
        j = np.trapezoid(sx * np.sin(li * k0 * x), x)
        d = np.trapezoid(sz * np.exp(li ** 2 * k0 * z), z)
        amp[i] = (j * d) ** 2
    wt = lam ** 2 / np.sqrt(lam + 1.0) * 2.0
    return 4 * RHO * G ** 2 / (math.pi * u ** 2) * np.trapezoid(amp * wt, w)


S = wigley_wetted(L, B, T)
print(f"Wigley L/B 10, L/T 16, L = {L} m: exact wetted area {S:.4f} m2 (Ahmed et al. list 0.135)")
print("\n(a) marine_hull.michell against the fine integral, Cw x 1000 on the exact area")
print(f"{'Fn':>6} {'fine':>9} {'module':>9} {'diff %':>8}")
worst = 0.0
for fn in (0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.50, 0.60, 0.80, 1.00):
    u = fn * math.sqrt(G * L)
    q = 0.5 * RHO * u * u * S
    ref = michell_ref(fn) / q
    mod = wave_resistance_wigley(u, L, B, T, rho=RHO) / q
    d = (mod / ref - 1) * 100
    worst = max(worst, abs(d))
    print(f"{fn:6.2f} {ref*1e3:9.4f} {mod*1e3:9.4f} {d:+8.2f}")
print(f"largest |diff| {worst:.2f}%")

print("\n(b) CT curve, Michell Cw + CF(1+k) S_exact/S; implied k = (CT - Cw)/CF - 1; CF swept over model length")
for length in (1.0, 2.0, 4.0):
    print(f"-- CF at model length {length:g} m (Re = U L / nu, ITTC 1957)")
    print(f"{'Fn':>6} {'CT exp':>8} {'Cw Mich':>8} {'CF':>8} {'(CT-Cw)/CF-1':>13} {'CT(k=0.1)':>10}")
    ks = []
    for fn, ct in zip(FN, CT):
        u = fn * math.sqrt(G * L)
        q = 0.5 * RHO * u * u * S
        cw = wave_resistance_wigley(u, L, B, T, rho=RHO) / q
        cf = cf_ittc57(fn * math.sqrt(G * length) * length / NU)  # same Fn at model length `length`
        k = (ct - cw) / cf - 1
        ks.append(k)
        print(f"{fn:6.3f} {ct*1e3:8.3f} {cw*1e3:8.3f} {cf*1e3:8.3f} {k:+13.2f} {(1.1*cf+cw)*1e3:10.3f}")
    print(f"   implied k: mean {np.mean(ks):+.2f}, range {min(ks):+.2f} to {max(ks):+.2f}")

# (c) Milestone 3n: the primary table (Ahmed et al. 2015, Table 1 and Table 5, opened from
# jtse.utm.my/index.php/jtse/article/download/35/26) confirms the six experimental CT values above
# and gives the model length, L = 1.00 m (Table 1). It lists a wetted area of 0.135 m2, but the CFX
# columns of Table 5 (Force, Velocity, Ct) are consistent only with one reference area, found below.
print("\n(c) primary table: reference area implied by Table 5 (CFX columns), rho = 998")
V = np.array([0.7830, 0.8363, 0.9052, 0.9897, 1.1088, 1.2779])
F = np.array([0.1422, 0.1591, 0.1845, 0.2277, 0.2828, 0.4088])
CT_CFX = np.array([6.0275, 5.9109, 5.8522, 6.0410, 5.9786, 6.5061]) * 1e-3
s_impl = F / (0.5 * 998.0 * V ** 2 * CT_CFX)
print("   L implied by V and Fn:", np.round(V ** 2 / (G * FN ** 2), 3), "m")
print("   area implied by F/(0.5 rho V^2 Ct):", np.round(s_impl, 4), "m2")
print("   listed 0.135, exact full-hull %.4f, exact half-hull %.4f" % (S, S / 2))
print("\n   implied k at the stated L = 1.00 m, CT_exp re-based to the exact area S_exact if it was quoted on:")
for name, s_ref in (("0.135 (listed)", 0.135), ("exact 0.1488", S), ("0.0771 (CFX-implied)", float(s_impl[0]))):
    ks = []
    for fn, ct in zip(FN, CT):
        u = fn * math.sqrt(G * L)
        q = 0.5 * RHO * u * u * S
        cw = wave_resistance_wigley(u, L, B, T, rho=RHO) / q
        cf = cf_ittc57(u * L / NU)
        ks.append((ct * s_ref / S - cw) / cf - 1)
    print(f"   CT quoted on {name:22s}: k mean {np.mean(ks):+.2f}, range {min(ks):+.2f} to {max(ks):+.2f}")
