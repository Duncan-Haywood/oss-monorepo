"""Milestone 3c: Holtrop-Mennen on the Wigley tank point (Ju 1983), against the Michell + ITTC model.

    PYTHONPATH=src python3 experiments/run_holtrop.py > experiments/results_holtrop.txt
"""
import math
from marine_hull.hull import cf_ittc57, G, RHO_FRESH
from marine_hull.holtrop import hm_resistance
from marine_hull.michell import wave_resistance_wigley, wigley_wetted, wigley_volume

L, B, D = 4.0, 0.4, 0.25
U, CT_EXP = 1.67, 4.16e-3
NUS = {10: 1.3059e-6, 15: 1.1386e-6, 20: 1.0034e-6, 25: 0.8927e-6}
VOL, S_EX = wigley_volume(L, B, D), wigley_wetted(L, B, D)
CM = CWP = 2.0 / 3.0
print(f"Wigley {L} x {B} x {D} m: volume {VOL:.4f} m3 (Cb {VOL/(L*B*D):.4f}), exact S {S_EX:.4f} m2, Cp {(VOL/(L*B*D))/CM:.3f}")
print("-- tank point Fn 0.267, CT on Ju's area 2.380 m2 --")
for tc, nu in NUS.items():
    for lab, s in (("HM-regression S", None), ("exact S", S_EX)):
        r = hm_resistance(U, L, B, D, VOL, CM, CWP, rho=RHO_FRESH, nu=nu, s=s)
        ct = r["RT"] / (0.5 * RHO_FRESH * U * U * 2.380)
        print(f"{tc}C {lab}: S {r['S']:.3f}, 1+k1 {r['1+k1']:.3f}, CF {cf_ittc57(r['Re'])*1e3:.3f}e-3, CW_HM {r['RW']/(0.5*RHO_FRESH*U*U*2.380)*1e3:.3f}e-3, "
              f"CA {r['CA']*1e3:.3f}e-3, CT {ct*1e3:.3f}e-3 ({(ct/CT_EXP-1)*100:+.0f}%)")
print("-- HM against Michell + ITTC (k = 0 and k = 0.25), 15 C, same hull, over Fn --")
print("Fn    v      RT_HM[N]  RT_M0[N]  RT_M25[N]  HM/M0  HM/M25  RW_HM/RW_Michell")
for fn in (0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40):
    v = fn * math.sqrt(G * L)
    r = hm_resistance(v, L, B, D, VOL, CM, CWP, rho=RHO_FRESH, nu=NUS[15], s=S_EX)
    rwm = wave_resistance_wigley(v, L, B, D, rho=RHO_FRESH)
    rf = 0.5 * RHO_FRESH * v * v * S_EX * cf_ittc57(v * L / NUS[15])
    m0, m25 = rf + rwm, 1.25 * rf + rwm
    print(f"{fn:.2f}  {v:.3f}  {r['RT']:8.2f}  {m0:8.2f}  {m25:8.2f}  {r['RT']/m0:.2f}   {r['RT']/m25:.2f}   {r['RW']/rwm:.2f}")
