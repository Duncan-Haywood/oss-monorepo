"""Milestone 3o: a second, independent Wigley tank point (Ju 1983, 4 m model) against Michell + ITTC 1957.

    PYTHONPATH=src python3 experiments/run_wigley_ju.py > experiments/results_wigley_ju.txt

Source: Wang, Belibassakis et al., "Wave-resistance computation via CFD and IGA-BEM solvers: a
comparative study", OPEC 2017, Zenodo 10.5281/zenodo.1169033 (CC BY-NC-ND 4.0; read only, nothing
copied). It quotes the tank result of Ju (1983) for the Wigley hull: L = 4.0 m, B = 0.4 m,
T = 0.25 m, Fn 0.267 (U0 = 1.67 m/s), Aw = Cs L (2D + B) with Cs = 0.661, CT = 4.16e-3.
Ju (1983) itself was not opened: this is a second-hand value, like the Kajitani points.
Fresh water, 15 C assumed (rho 999.1, nu 1.139e-6): the paper does not state the temperature.
"""
import math
import numpy as np
from marine_hull.hull import cf_ittc57
from marine_hull.michell import wave_resistance_wigley, wigley_wetted, G

L, B, T = 4.0, 0.4, 0.25
FN, U_PAPER, CT_JU, CS = 0.267, 1.67, 4.16e-3, 0.661
S_PAPER = CS * L * (2 * T + B)
S_EXACT = wigley_wetted(L, B, T)
print(f"(a) tow speed: Fn sqrt(gL) = {FN*math.sqrt(G*L):.3f} m/s against the paper's {U_PAPER} m/s")
print(f"(b) wetted area: Cs L (2D+B) = {S_PAPER:.4f} m2; exact Wigley integral {S_EXACT:.4f} m2 ({(S_PAPER/S_EXACT-1)*100:+.2f}%)")
print(f"    Ahmed et al. 1 m hull x 16 = {0.1488*16:.3f} m2 (their exact), x16 of their 0.135 = {0.135*16:.3f}")
print("\n(c) Michell + ITTC 1957, implied form factor k = (CT - Cw)/CF - 1, over the temperature the paper omits")
print(f"{'T C':>5} {'rho':>7} {'nu e6':>6} {'Re':>9} {'Cw e3':>7} {'CF e3':>7} {'k':>7}")
for tc, rho, nu in [(10, 999.7, 1.307e-6), (15, 999.1, 1.139e-6), (20, 998.2, 1.004e-6), (25, 997.0, 0.893e-6)]:
    u = FN * math.sqrt(G * L)
    q = 0.5 * rho * u * u * S_PAPER
    cw = wave_resistance_wigley(u, L, B, T, rho=rho) / q
    cf = cf_ittc57(u * L / nu)
    print(f"{tc:5d} {rho:7.1f} {nu*1e6:6.3f} {u*L/nu:9.3e} {cw*1e3:7.3f} {cf*1e3:7.3f} {(CT_JU-cw)/cf-1:+7.3f}")
print("\n(d) the same Fn 0.267 on the 1 m hull (Kajitani CT 5.84e-3 via Ahmed et al.): CT ratio 1 m / 4 m")
print(f"    measured CT ratio {5.84e-3/CT_JU:.2f}; ITTC CF ratio {cf_ittc57(0.267*math.sqrt(G*1)*1/1.139e-6)/cf_ittc57(0.267*math.sqrt(G*4)*4/1.139e-6):.2f}")
