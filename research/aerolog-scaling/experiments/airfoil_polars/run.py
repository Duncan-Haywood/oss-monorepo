"""H2/H3 with airfoil polars instead of a flat plate. NeuralFoil (a surrogate trained on XFOIL), NACA 4412.

    /usr/bin/python3.13 experiments/airfoil_polars/run.py > experiments/airfoil_polars/results.txt

Re_mac of the Froude model at length ratio n comes from the first-order calculator (same airframe as
experiments/run.py). Section cl is taken equal to the wing CL (strip approximation, no 3D effects).
Power ratio = [CD_total(n) / CD_total(1)] / [(CL/CD)...] reduces to ratio of total drag at the same CL,
since Froude scaling holds weight, speed and CL fixed; so P ratio = (CD0(n)+CDi) / (CD0(1)+CDi).
"""
import sys
import numpy as np
import aerosandbox as asb
import neuralfoil as nf

sys.path.insert(0, "src")
from aerolog_scaling.scaling import airframe

AF = asb.Airfoil("naca4412")
BASE = dict(aspect_ratio=10.0, cl_cruise=0.8, e_oswald=0.8)
ALPHAS = np.arange(-4, 20.01, 0.25)


def polar(re, n_crit):
    r = nf.get_aero_from_airfoil(AF, alpha=ALPHAS, Re=re, model_size="xxxlarge", n_crit=n_crit,
                                 xtr_upper=1.0 if n_crit > 0 else 1.0)
    return r


def at_cl(re, cl, n_crit, xtr=1.0):
    r = nf.get_aero_from_airfoil(AF, alpha=ALPHAS, Re=re, model_size="xxxlarge", n_crit=n_crit,
                                 xtr_upper=xtr, xtr_lower=xtr)
    cl_a, cd_a = np.asarray(r["CL"]), np.asarray(r["CD"])
    ok = np.asarray(r["analysis_confidence"]) > 0.5
    i_max = int(np.argmax(cl_a))
    pre = np.arange(len(cl_a)) <= i_max
    j = pre & (cl_a <= cl) & ok
    k = pre & (cl_a >= cl) & ok
    if not j.any() or not k.any():
        return float("nan"), float(cl_a.max())
    a, b = np.where(j)[0][-1], np.where(k)[0][0]
    cd = cd_a[a] if a == b else np.interp(cl, [cl_a[a], cl_a[b]], [cd_a[a], cd_a[b]])
    return float(cd), float(cl_a[ok].max())


def main():
    f = airframe(1000.0, 3.0 * 10 ** 0.5, 10.0, 0.8, 1.25, 2.1, 0.8)
    cdi = BASE["cl_cruise"] ** 2 / (np.pi * BASE["e_oswald"] * BASE["aspect_ratio"])
    print("NACA 4412 NeuralFoil xxxlarge; CL=0.8; CDi=%.4f (AR 10, e 0.8); wing CD = section cd + CDi" % cdi)
    for label, nc, xtr in (("free transition, n_crit 9", 9, 1.0), ("free transition, n_crit 5 (rougher)", 5, 1.0),
                           ("tripped at 5% chord", 9, 0.05)):
        print("\n" + label)
        print(f"{'n':>5} {'Re_mac':>9} {'cd@0.8':>8} {'CLmax':>6} {'P ratio vs Froude':>18} {'dCLmax':>7}")
        ref = None
        for n in (1.0, 0.5, 0.2, 0.1, 0.05):
            m = airframe(1000.0 * n ** 3, 3.0 * 10 ** 0.5 * n, 10.0, 0.8, 1.25, 2.1, 0.8)
            cd, clmax = at_cl(m["re"], 0.8, nc, xtr)
            if ref is None:
                ref = (cd, clmax)
            pr = (cd + cdi) / (ref[0] + cdi)
            print(f"{n:5.2f} {m['re']:9.2e} {cd:8.5f} {clmax:6.2f} {pr:18.3f} {clmax - ref[1]:7.2f}")


main()
