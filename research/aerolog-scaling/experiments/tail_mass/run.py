"""H5 with H1 proper, tail mass: do 7d's passing tails survive the inertia a tail of that size and arm adds?

    /usr/bin/python3.13 experiments/tail_mass/run.py > experiments/tail_mass/results.txt

7d held the pitch inertia at the Froude-scaled full-size value whatever the tail. Here the tail is a point mass
m_t = mu * m * (tail area / 0.2 sim-wing area) at its arm, and the pitch inertia changes by
m_t * l_t^2 - mu * m * l_ref^2 (l_ref = the full-size 3.0-chord arm). Wing, tail grid and mode model are 7d's
(imported by path). mu is not sourced for this airframe, so it is swept; CG is held (ballast at the nose).
"""
import itertools
import numpy as np
import aerosandbox as asb

src = open("experiments/tail_search/run.py").read().rsplit("\nmain()", 1)[0]
src = src.replace("iyy = m * (nm.KY * l_f) ** 2", "iyy = m * (nm.KY * l_f) ** 2 + DI(m, s_t, l_t, s_sim, l_f)")
ts = type(sys := __import__("sys"))("ts")
ts.__dict__["__name__"] = "ts"
MU = [0.0]
ts.__dict__["DI"] = lambda m, s_t, l_t, s_sim, l_f: MU[0] * m * ((s_t / s_sim) / 0.2 * l_t ** 2 - (3.0 * l_f / ts.nm.AR0) ** 2)
exec(compile(src, "ts", "exec"), ts.__dict__)
nm = ts.nm
from aerolog_scaling.scaling import airframe, G

MUS = (0.0, 0.02, 0.04, 0.06)


def main():
    ref_af = asb.Airfoil("naca4412")
    ref = nm.modes(ref_af, 1.0, nm.AR0, 1.0, nm.CL0)
    rph, rsp, rz = ref["ph"], ref["sp"], ref["z"]
    full = airframe(nm.M_FULL, nm.B_FULL, nm.AR0, nm.CL0, 1.25, 2.1, nm.E)
    v_model = full["v"] * nm.N ** 0.5
    s_sim = full["s_ref"] * nm.N ** 2
    print(f"reference n=1: phugoid {rph:.3f}, short period {rsp:.3f}, zeta_sp {rz:.3f}")
    print("tail mass fraction mu swept (unsourced); mu = 0 is 7d exactly\n")
    cases = []
    for name in ("naca4412", "naca5406"):
        af = asb.Airfoil(name)
        for k in nm.KS:
            for ar in nm.ARS:
                s = k * s_sim
                re = nm.RHO * v_model * (s / np.sqrt(ar * s)) / nm.MU
                cl = nm.CL0 / k
                cd = nm.cd_at(af, re, cl)
                if np.isnan(cd):
                    continue
                pr = ((cd + cl ** 2 / (np.pi * nm.E * ar)) / cl) / ((nm.cd_at(ref_af, full["re"], nm.CL0) + nm.CL0 ** 2 / (np.pi * nm.E * nm.AR0)) / nm.CL0)
                if abs(pr - 1) <= 0.05:
                    cases.append((name, af, k, ar, cl))
    # table[mu] = [wings with a passing tail, passing tails, total tails]; best[mu][wing]
    res = {mu: [0, 0, 0] for mu in MUS}
    detail = {}
    for name, af, k, ar, cl in cases:
        s_w = k * s_sim
        c = s_w / np.sqrt(ar * s_w)
        v = np.sqrt(2 * nm.M_FULL * nm.N ** 3 * G / (nm.RHO * s_w * cl))
        wing = (nm.cd_at(af, nm.RHO * v * c / nm.MU, cl), nm.slope_at(af, ar, nm.RHO * v * c / nm.MU, cl))
        tails = []
        for sec, frac, art in itertools.product(ts.SECTIONS, ts.AREAS, ts.TAR):
            taf = asb.Airfoil(sec)
            re_t = nm.RHO * v * (np.sqrt(art * frac * s_sim) / art) / nm.MU
            tail = (nm.slope_at(taf, art, re_t, 0.05), nm.cd_at(taf, re_t, 0.05))
            if np.isnan(tail[1]):
                continue
            tails += [(sec, frac, art, arm, tail) for arm in ts.ARMS]
        for mu in MUS:
            MU[0] = mu
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
            res[mu][0] += n5 > 0
            res[mu][1] += n5
            res[mu][2] += nt
            detail[(name, k, ar, mu)] = (n5, best)
    print(f"{'mu':>5} {'wings pass5':>11} {'tails pass5':>11} {'of':>6}")
    for mu in MUS:
        print(f"{mu:5.2f} {res[mu][0]:>8d}/{len(cases)} {res[mu][1]:11d} {res[mu][2]:6d}")
    print("\nthe 7d k=1.0 wings (best tail, worst deviation %):")
    for name in ("naca4412", "naca5406"):
        for mu in MUS:
            n5, b = detail[(name, 1.0, 12, mu)]
            print(f"  {name} AR12 mu={mu:.2f}: {n5:3d} tails pass; best {b[1]} area {b[2]:.2f} AR_t {b[3]:.1f} arm {b[4]:.1f}, worst {b[0]:.1f}%")


main()
