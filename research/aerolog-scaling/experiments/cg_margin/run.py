"""H5 with H1 proper, CG: how precisely must the model's CG match the full-size aircraft for 7d's tails to keep the modes within 5%?

    /usr/bin/python3.13 experiments/cg_margin/run.py > experiments/cg_margin/results.txt

7d/7e held the CG at the wing aerodynamic centre (zero wing static margin). Here the model's CG sits h wing chords ahead of
the AC (h > 0 stable) while the n = 1 reference keeps h = 0: the wing adds Cm_alpha = -a_w h and the tail arm from the CG
grows by h chords (tail kept fixed relative to the wing AC). Wing, tail grid and mode model are 7d's, imported by path.
"""
import itertools
import numpy as np
import aerosandbox as asb

src = open("experiments/tail_search/run.py").read().rsplit("\nmain()", 1)[0]
src = src.replace("l_t = arm * (l_f / nm.AR0)", "l_t = arm * (l_f / nm.AR0) + H[0] * c")
src = src.replace("cma = -a_t * tq * l_t / c", "cma = -a_t * tq * l_t / c - a_w * H[0]")
ts = type(__import__("sys"))("ts")
ts.__dict__["__name__"] = "ts"
H = [0.0]
ts.__dict__["H"] = H
exec(compile(src, "ts", "exec"), ts.__dict__)
nm = ts.nm
from aerolog_scaling.scaling import airframe, G

HS = (-0.10, -0.05, -0.02, -0.01, 0.0, 0.01, 0.02, 0.05, 0.10)


def main():
    ref_af = asb.Airfoil("naca4412")
    ref = nm.modes(ref_af, 1.0, nm.AR0, 1.0, nm.CL0)
    rph, rsp, rz = ref["ph"], ref["sp"], ref["z"]
    full = airframe(nm.M_FULL, nm.B_FULL, nm.AR0, nm.CL0, 1.25, 2.1, nm.E)
    v_model = full["v"] * nm.N ** 0.5
    s_sim = full["s_ref"] * nm.N ** 2
    print(f"reference n=1 (h = 0): phugoid {rph:.3f}, short period {rsp:.3f}, zeta_sp {rz:.3f}")
    print("model CG h chords ahead of the wing AC; h = 0 is 7d exactly\n")
    print(f"{'wing':<9} {'h':>6} {'tails pass5':>11} {'of':>5}  best tail (worst deviation %)")
    for name in ("naca4412", "naca5406"):
        af = asb.Airfoil(name)
        k, ar = 1.0, 12
        s_w = k * s_sim
        c = s_w / np.sqrt(ar * s_w)
        cl = nm.CL0 / k
        v = np.sqrt(2 * nm.M_FULL * nm.N ** 3 * G / (nm.RHO * s_w * cl))
        re_w = nm.RHO * v * c / nm.MU
        wing = (nm.cd_at(af, re_w, cl), nm.slope_at(af, ar, re_w, cl))
        tails = []
        for sec, frac, art in itertools.product(ts.SECTIONS, ts.AREAS, ts.TAR):
            taf = asb.Airfoil(sec)
            re_t = nm.RHO * v * (np.sqrt(art * frac * s_sim) / art) / nm.MU
            tail = (nm.slope_at(taf, art, re_t, 0.05), nm.cd_at(taf, re_t, 0.05))
            if np.isnan(tail[1]):
                continue
            tails += [(sec, frac, art, arm, tail) for arm in ts.ARMS]
        for h in HS:
            H[0] = h
            n5 = nt = 0
            best = None
            for sec, frac, art, arm, tail in tails:
                r = ts.modes_tail(af, k, ar, nm.N, cl, wing, tail, sec, frac, art, arm)
                if r is None:
                    continue
                w = max(abs(100 * (r[0] / rph - 1)), abs(100 * (r[1] / rsp - 1)), abs(100 * (r[2] / rz - 1)))
                nt += 1
                n5 += w <= 5
                if best is None or w < best[0]:
                    best = (w, sec, frac, art, arm)
            b = f"{best[1]} area {best[2]:.2f} AR_t {best[3]:.1f} arm {best[4]:.1f} ({best[0]:.1f}%)" if best else "none"
            print(f"{name:<9} {h:6.2f} {n5:11d} {nt:5d}  {b}")


main()
