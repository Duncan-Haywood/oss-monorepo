"""H5: is there an airfoil (and trip) correction that restores H2 to within 5% at n = 0.2 without breaking H1's proxy?

    /usr/bin/python3.13 experiments/correction_search/run.py > experiments/correction_search/results.txt

Reference: the full-size aircraft (n = 1), NACA 4412 wing, free transition (n_crit 9), CL = 0.8.
Model at n = 0.2 (Re_mac from the first-order calculator), airfoil searched over NACA 4-digit
(camber m, position p, thickness t), boundary layer free (n_crit 9) or tripped at 5% chord.
Power ratio = (cd + CDi) / (cd_ref + CDi) at the same wing CL (Froude keeps weight, speed and CL).
H1 proxy (NOT a flight-dynamics run): section lift-curve slope within 5% of the reference's, and the
model CL within +/-6% of 0.8 (trim speed ~ CL^-0.5, so +/-3% in speed). Pitch moment is not checked.
"""
import itertools
import sys
import numpy as np
import aerosandbox as asb
import neuralfoil as nf

sys.path.insert(0, "src")
from aerolog_scaling.scaling import airframe

CL0, CDI = 0.8, 0.8 ** 2 / (np.pi * 0.8 * 10.0)
ALPHAS = np.arange(-6, 16.01, 0.5)
N_MODEL = 0.2
# low-Reynolds sections from the UIUC coordinate database bundled with AeroSandbox
LOW_RE = ["sd7037", "e387", "s1223", "e214", "mh32", "fx63137", "clarky", "ag35", "sd7062", "e61"]


def run(af, re, xtr):
    r = nf.get_aero_from_airfoil(af, alpha=ALPHAS, Re=re, model_size="xxxlarge", n_crit=9,
                                 xtr_upper=xtr, xtr_lower=xtr)
    cl, cd = np.asarray(r["CL"]), np.asarray(r["CD"])
    ok = np.asarray(r["analysis_confidence"]) > 0.5
    return cl, cd, ok


def cd_at(cl_a, cd_a, ok, cl):
    pre = np.arange(len(cl_a)) <= int(np.argmax(np.where(ok, cl_a, -9)))
    j, k = pre & (cl_a <= cl) & ok, pre & (cl_a >= cl) & ok
    if not j.any() or not k.any():
        return float("nan")
    a, b = np.where(j)[0][-1], np.where(k)[0][0]
    return float(cd_a[a] if a == b else np.interp(cl, [cl_a[a], cl_a[b]], [cd_a[a], cd_a[b]]))


def slope(cl_a, ok):
    m = ok & (cl_a > 0.2) & (cl_a < 1.0)
    return float(np.polyfit(ALPHAS[m], cl_a[m], 1)[0]) if m.sum() > 3 else float("nan")


def main():
    full = airframe(1000.0, 3.0 * 10 ** 0.5, 10.0, 0.8, 1.25, 2.1, 0.8)
    mod = airframe(1000.0 * N_MODEL ** 3, 3.0 * 10 ** 0.5 * N_MODEL, 10.0, 0.8, 1.25, 2.1, 0.8)
    ref_af = asb.Airfoil("naca4412")
    cl, cd, ok = run(ref_af, full["re"], 1.0)
    cd_ref, a_ref = cd_at(cl, cd, ok, CL0), slope(cl, ok)
    print(f"reference n=1: Re_mac {full['re']:.2e}, NACA 4412 free transition: cd@0.8 {cd_ref:.5f}, CDi {CDI:.5f}, dCL/dalpha {a_ref:.4f}/deg")
    print(f"model n={N_MODEL}: Re_mac {mod['re']:.2e}")
    for lab, xtr in (("free transition", 1.0), ("tripped at 5% chord", 0.05)):
        cl, cd, ok = run(ref_af, mod["re"], xtr)
        pr = (cd_at(cl, cd, ok, CL0) + CDI) / (cd_ref + CDI)
        print(f"  same airfoil (4412), {lab}: power ratio {pr:.3f}")
    rows = []
    names = [f"naca{m}{int(p * 10)}{t:02d}" for m, p, t in itertools.product((0, 2, 3, 4, 5, 6), (0.2, 0.4, 0.6), (6, 8, 10, 12, 15))
             if not (m == 0 and p != 0.4)]
    names += LOW_RE
    for name in names:
        af = asb.Airfoil(name)
        for lab, xtr in (("free", 1.0), ("trip", 0.05)):
            cl, cd, ok = run(af, mod["re"], xtr)
            c0 = cd_at(cl, cd, ok, CL0)
            if np.isnan(c0):
                continue
            a = slope(cl, ok)
            # allow CL in +/-6% of 0.8: best power ratio over that window (power ~ CL^1.5 shift ignored: ratio of drags at that CL scaled by CL)
            best = None
            for cl_w in np.linspace(0.8 * 0.94, 0.8 * 1.06, 7):
                c = cd_at(cl, cd, ok, cl_w)
                if np.isnan(c):
                    continue
                cdi_w = cl_w ** 2 / (np.pi * 0.8 * 10.0)
                # power ~ (CD/CL^1.5) at fixed weight; the reference has CD/CL^1.5 at CL0
                pw = ((c + cdi_w) / cl_w ** 1.5) / ((cd_ref + CDI) / CL0 ** 1.5)
                if best is None or pw < best[0]:
                    best = (pw, cl_w)
            rows.append((af.name, lab, c0, (c0 + CDI) / (cd_ref + CDI), best[0], best[1], a / a_ref))
    rows.sort(key=lambda r: r[3])
    print(f"\n{len(rows)} (airfoil, boundary-layer state) cases; ratio at CL 0.8, then best over CL 0.752..0.848 (power ~ CD/CL^1.5)")
    print(f"{'airfoil':>10} {'bl':>5} {'cd@0.8':>8} {'ratio@0.8':>10} {'best ratio':>11} {'CL':>6} {'slope/ref':>10}")
    for r in rows[:15]:
        print(f"{r[0]:>10} {r[1]:>5} {r[2]:8.5f} {r[3]:10.3f} {r[4]:11.3f} {r[5]:6.3f} {r[6]:10.3f}")
    ok5 = [r for r in rows if r[4] <= 1.05]
    ok5h = [r for r in ok5 if abs(r[6] - 1) <= 0.05]
    print(f"\ncases with best ratio <= 1.05: {len(ok5)} of {len(rows)}; of those with slope within 5% of reference: {len(ok5h)}")
    for r in ok5h[:10]:
        print(f"  {r[0]} {r[1]} ratio {r[4]:.3f} at CL {r[5]:.3f}, slope/ref {r[6]:.3f}")


main()
