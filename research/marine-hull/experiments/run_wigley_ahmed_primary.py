"""Milestone 3n: the primary Table 5 of Ahmed et al. (2015) against the transcription used in 3m.

    PYTHONPATH=src python3 experiments/run_wigley_ahmed_primary.py > experiments/results_wigley_ahmed_primary.txt

Source: Ahmed, Yaakob, Rashid, Elbatran, "Determining Ship Resistance Using Computational Fluid
Dynamics (CFD)", J. Transport System Engineering 2(1), 2015, 20-25, open access, PDF read from
https://jtse.utm.my/index.php/jtse/article/download/35/26 on 2026-11-09. Table 1 gives the Wigley
model as Lpp 1.00 m, B 0.1 m, D 0.0625 m, wetted area 0.135 m2; Table 5 gives Fn, V, force, CT
from CFX (x1000) and CT from experiment [Kajitani et al. 1983] (x1000). Values typed from the PDF.
"""
import math
import numpy as np
from marine_hull.hull import cf_ittc57
from marine_hull.michell import wave_resistance_wigley, wigley_wetted, G

L, B, T = 1.0, 0.1, 0.0625
RHO, NU = 1000.0, 1.0e-6
FN = np.array([0.250, 0.267, 0.289, 0.316, 0.354, 0.408])
V = np.array([0.7830, 0.8363, 0.9052, 0.9897, 1.1088, 1.2779])
FORCE = np.array([0.1422, 0.1591, 0.1845, 0.2277, 0.2828, 0.4088])
CT_CFX = np.array([6.0275, 5.9109, 5.8522, 6.0410, 5.9786, 6.5061]) * 1e-3
CT_EXP = np.array([5.92, 5.84, 6.16, 6.32, 6.12, 6.91]) * 1e-3
CT_EXP_3M = np.array([5.92, 5.84, 6.16, 6.32, 6.12, 6.91]) * 1e-3   # 3m transcription (Archibald)

print("(a) transcription used in 3m equals the primary Table 5 CT(exp):",
      bool(np.allclose(CT_EXP, CT_EXP_3M)))
print("\n(b) is the paper's CFD at model length 1 m?  V against Fn sqrt(g L)")
vchk = FN * math.sqrt(G * L)
print("   max |V_table - Fn sqrt(g*1m)| =", f"{np.max(np.abs(V - vchk)):.4f} m/s")

S = wigley_wetted(L, B, T)
print(f"\n(c) reference area implied by F / (0.5 rho V^2 CT_CFX), rho = {RHO:g}: exact S = {S:.4f}, paper S = 0.135")
for fn, v, f, ct in zip(FN, V, FORCE, CT_CFX):
    s_eff = f / (0.5 * RHO * v * v * ct)
    print(f"   Fn {fn:.3f}: S_eff {s_eff:.4f} m2  (x2 = {2*s_eff:.4f})")

print("\n(d) Michell + ITTC 1957 at L = 1 m against the paper's CFX CT and the tank CT; implied k")
print(f"{'Fn':>6} {'CT exp':>8} {'CT CFX':>8} {'Cw':>7} {'CF':>7} {'k vs exp':>9} {'k vs CFX':>9} {'CFX/exp-1 %':>12}")
ke, kc = [], []
for fn, ce, cc in zip(FN, CT_EXP, CT_CFX):
    u = fn * math.sqrt(G * L)
    q = 0.5 * RHO * u * u * S
    cw = wave_resistance_wigley(u, L, B, T, rho=RHO) / q
    cf = cf_ittc57(u * L / NU)
    ke.append((ce - cw) / cf - 1)
    kc.append((cc - cw) / cf - 1)
    print(f"{fn:6.3f} {ce*1e3:8.3f} {cc*1e3:8.3f} {cw*1e3:7.3f} {cf*1e3:7.3f} {ke[-1]:+9.2f} {kc[-1]:+9.2f} {(cc/ce-1)*100:+12.1f}")
print(f"mean implied k: exp {np.mean(ke):+.2f} (range {min(ke):+.2f}..{max(ke):+.2f}); "
      f"CFX {np.mean(kc):+.2f} (range {min(kc):+.2f}..{max(kc):+.2f})")
print(f"CFX against tank CT: mean {np.mean(CT_CFX/CT_EXP-1)*100:+.1f}%, max |.| {np.max(np.abs(CT_CFX/CT_EXP-1))*100:.1f}%")
