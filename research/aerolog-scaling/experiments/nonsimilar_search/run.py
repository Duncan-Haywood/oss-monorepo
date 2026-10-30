"""H5, non-similar corrections: wing area factor k and aspect ratio at n = 0.2, weight and Froude speed fixed.

    /usr/bin/python3.13 experiments/nonsimilar_search/run.py > experiments/nonsimilar_search/results.txt

Reference: n = 1, NACA 4412, AR 10, e 0.8, CL 0.8, free transition (as experiments/correction_search).
Model: mass 0.2^3 m, speed sqrt(0.2) V (Froude), wing area k * 0.2^2 S, aspect ratio AR, so CL = 0.8 / k and
chord = S_model / b. Power ratio = (CD/CL) / (CD/CL)_ref (same weight*speed scaling). H1 proxy is reported, not enforced.
"""
import sys
import numpy as np
import aerosandbox as asb
import neuralfoil as nf

sys.path.insert(0, "src")
from aerolog_scaling.scaling import airframe, isa

CL0, AR0, E = 0.8, 10.0, 0.8
N = 0.2
ALPHAS = np.arange(-6, 18.01, 0.5)
KS = (0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.5, 1.75, 2.0)
ARS = (5, 6, 7, 8, 10, 12, 14, 16)


def cd_at(af, re, cl):
    r = nf.get_aero_from_airfoil(af, alpha=ALPHAS, Re=re, model_size="xxxlarge", n_crit=9)
    cl_a, cd_a, ok = np.asarray(r["CL"]), np.asarray(r["CD"]), np.asarray(r["analysis_confidence"]) > 0.5
    pre = np.arange(len(cl_a)) <= int(np.argmax(np.where(ok, cl_a, -9)))
    j, k = pre & (cl_a <= cl) & ok, pre & (cl_a >= cl) & ok
    if not j.any() or not k.any():
        return float("nan")
    a, b = np.where(j)[0][-1], np.where(k)[0][0]
    return float(cd_a[a] if a == b else np.interp(cl, [cl_a[a], cl_a[b]], [cd_a[a], cd_a[b]]))


def slope3d(ar):
    a0 = 2 * np.pi
    return a0 / (1 + a0 / (np.pi * E * ar))


def main():
    full = airframe(1000.0, 3.0 * 10 ** 0.5, AR0, CL0, 1.25, 2.1, E)
    _, _, rho, mu, _ = isa(0.0)
    v_model = full["v"] * N ** 0.5
    s_sim = full["s_ref"] * N ** 2
    ref_af = asb.Airfoil("naca4412")
    cd_ref = cd_at(ref_af, full["re"], CL0)
    ref = (cd_ref + CL0 ** 2 / (np.pi * E * AR0)) / CL0
    print(f"reference n=1: Re_mac {full['re']:.2e}, cd@0.8 {cd_ref:.5f}, (CD/CL) {ref:.5f}; model speed {v_model:.2f} m/s, similar area {s_sim:.3f} m2")
    slope_ref = slope3d(AR0)
    rows = []
    for name in ("naca4412", "naca5406"):
        af = asb.Airfoil(name)
        for k in KS:
            for ar in ARS:
                s = k * s_sim
                chord = s / np.sqrt(ar * s)
                re = rho * v_model * chord / mu
                cl = CL0 / k
                cd = cd_at(af, re, cl)
                if np.isnan(cd):
                    continue
                pr = ((cd + cl ** 2 / (np.pi * E * ar)) / cl) / ref
                rows.append((name, k, ar, re, cl, pr, slope3d(ar) / slope_ref))
    rows.sort(key=lambda r: r[5])
    print(f"\n{len(rows)} cases; best 15 by power ratio")
    print(f"{'airfoil':>9} {'k':>5} {'AR':>3} {'Re_mac':>9} {'CL':>6} {'P ratio':>8} {'a3D/ref':>8}")
    for r in rows[:15]:
        print(f"{r[0]:>9} {r[1]:5.2f} {r[2]:3d} {r[3]:9.2e} {r[4]:6.3f} {r[5]:8.3f} {r[6]:8.3f}")
    sim = [r for r in rows if r[1] == 1.0 and r[2] == 10]
    for r in sim:
        print(f"similar design {r[0]} (k 1, AR 10): ratio {r[5]:.3f}")
    band = [r for r in rows if abs(r[5] - 1) <= 0.05]
    print(f"\nTWO-SIDED: |ratio - 1| <= 0.05 (a match, not an improvement): {len(band)} of {len(rows)}")
    print(f"  with CL within 6% of 0.8: {len([r for r in band if abs(r[4] / CL0 - 1) <= 0.06])}")
    print(f"  with finite-wing slope within 5% of reference: {len([r for r in band if abs(r[6] - 1) <= 0.05])}")
    print(f"  both bounds: {len([r for r in band if abs(r[4] / CL0 - 1) <= 0.06 and abs(r[6] - 1) <= 0.05])}")
    for r in band[:12]:
        print(f"    {r[0]} k {r[1]} AR {r[2]} ratio {r[5]:.3f} CL {r[4]:.3f} a3D/ref {r[6]:.3f}")
    ok5 = [r for r in rows if r[5] <= 1.05]
    print(f"\nratio <= 1.05: {len(ok5)} of {len(rows)}")
    if ok5:
        print(f"  smallest k among them: {min(r[1] for r in ok5)}")
    c = [r for r in ok5 if abs(r[4] / CL0 - 1) <= 0.06]
    print(f"  of those with CL within 6% of 0.8: {len(c)}")
    d = [r for r in ok5 if abs(r[6] - 1) <= 0.05]
    print(f"  of those with finite-wing slope within 5% of reference: {len(d)}")
    e = [r for r in ok5 if abs(r[4] / CL0 - 1) <= 0.06 and abs(r[6] - 1) <= 0.05]
    print(f"  both bounds: {len(e)}")
    for r in d[:5]:
        print(f"    slope-ok: {r[0]} k {r[1]} AR {r[2]} ratio {r[5]:.3f} CL {r[4]:.3f}")


main()
