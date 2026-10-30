"""Milestone 3a: Michell + ITTC 1957 against one published Wigley tank point (Ju 1983, via Wang et al., OPEC 2017).

    PYTHONPATH=src python3 experiments/run_wigley_tank.py > experiments/results_wigley_tank.txt
"""
import math
from marine_hull.hull import cf_ittc57, G, RHO_FRESH
from marine_hull.michell import wave_resistance_wigley, wigley_wetted

L, B, D = 4.0, 0.4, 0.25     # assumed standard Wigley (L/B = 10, B/T = 1.6)
U, CT_EXP, CS = 1.67, 4.16e-3, 0.661
NUS = {10: 1.3059e-6, 15: 1.1386e-6, 20: 1.0034e-6, 25: 0.8927e-6}  # fresh water, m2/s (ITTC 7.5-02-01-03)
S_EXACT = wigley_wetted(L, B, D)
S_JU = CS * L * (2 * D + B)
RW = wave_resistance_wigley(U, L, B, D, rho=RHO_FRESH)
print(f"Fr {U / math.sqrt(G * L):.3f}; S exact {S_EXACT:.3f} m2, S Ju {S_JU:.3f} m2; Michell Rw {RW:.2f} N")
for tc, nu in NUS.items():
    cf = cf_ittc57(U * L / nu)
    for name, s in (("S_exact", S_EXACT), ("S_Ju", S_JU)):
        q = 0.5 * RHO_FRESH * U * U * s
        cw = RW / q
        # friction acts on the true surface; every coefficient is nondimensionalised on s
        row = []
        for k in (0.0, 0.10, 0.25, 0.40):
            ct = (1 + k) * cf * S_EXACT / s + cw
            row.append(f"k={k:.2f}: CT {ct * 1e3:.2f}e-3 ({(ct / CT_EXP - 1) * 100:+.0f}%)")
        k_imp = (CT_EXP - cw) / (cf * S_EXACT / s) - 1
        cr = CT_EXP - cf * S_EXACT / s
        print(f"{tc}C {name}: CF {cf * 1e3:.3f}e-3, Cw Michell {cw * 1e3:.3f}e-3, tank residual CT-CF {cr * 1e3:.3f}e-3; " + "; ".join(row) + f"; implied k {k_imp:+.2f}")
