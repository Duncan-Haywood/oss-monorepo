"""Milestone 8e: does a tail that restores the longitudinal modes survive a 25% error in the tail lift slope?

    PY experiments/robust_tail/run.py > experiments/robust_tail/results.txt

As experiments/tail_search (same wings, grid and mode model, imported by path), but each tail is evaluated at
tail-slope scale factors SCALES (the 8c/8d UIUC checks put NeuralFoil's slope 1.0 to 1.4 times the measured one at the tail's Re).
A tail is "robust" if the worst of the three mode errors is within the tolerance at every scale in 0.75..1.0.

Wing grid and mode model as experiments/nonsimilar_modes (imported by path); only the tail changes:
section, area (fraction of the Froude-scaled similar wing area), aspect ratio and arm (similar-wing chords).
"""
import itertools
import sys
import numpy as np
import aerosandbox as asb

sys.path.insert(0, "src")
from aerolog_scaling.scaling import airframe, G

src = open("experiments/nonsimilar_modes/run.py").read().rsplit("\nmain()", 1)[0]
nm = type(sys)("nm")
nm.__dict__["__name__"] = "nm"
exec(compile(src, "nm", "exec"), nm.__dict__)

SECTIONS = ("naca0009", "naca0012", "naca0015")
AREAS = (0.15, 0.2, 0.3, 0.4, 0.6)
TAR = (3.5, 5.0, 7.0)
ARMS = (1.5, 2.0, 2.5, 3.0, 3.5, 4.5)
SCALES = (0.75, 0.8, 0.9, 1.0)


def modes_tail(af, k, ar, n, cl_w, wing, tail, sec_name, s_t_frac, ar_t, arm):
    """as nm.modes with the tail passed in; wing = cached (cd_w, a_w), tail = cached per (section, area, AR)."""
    m, l_f = nm.M_FULL * n ** 3, nm.B_FULL * n
    s_sim = l_f ** 2 / nm.AR0
    s_w = k * s_sim
    b = np.sqrt(ar * s_w)
    c = s_w / b
    s_t = s_t_frac * s_sim
    l_t = arm * (l_f / nm.AR0)
    iyy = m * (nm.KY * l_f) ** 2
    v = np.sqrt(2 * m * G / (nm.RHO * s_w * cl_w))
    q = 0.5 * nm.RHO * v * v
    cd_w, a_w = wing
    a_t, cd_t = tail
    deps = 2 * a_w / (np.pi * ar)
    cdi = cl_w ** 2 / (np.pi * nm.E * ar)
    cd_tot = cd_w + cdi + (s_t / s_w) * cd_t
    tq = (s_t / s_w) * (1 - deps)
    cla = a_w + a_t * tq
    cma = -a_t * tq * l_t / c
    cmq = -2 * a_t * (s_t / s_w) * (l_t / c) ** 2
    cda = 2 * cl_w * a_w / (np.pi * nm.E * ar)
    xu = -(2 * cd_tot) * q * s_w / (m * v)
    zu = -(2 * cl_w) * q * s_w / (m * v)
    xa = (cl_w - cda) * q * s_w / m
    za = -(cla + cd_tot) * q * s_w / m
    ma = cma * q * s_w * c / iyy
    mq = cmq * q * s_w * c * c / (2 * v) / iyy
    A = np.array([[xu, xa, 0, -G], [zu / v, za / v, 1, 0], [0, ma, mq, 0], [0, 0, 1, 0]])
    ev = np.linalg.eigvals(A) * np.sqrt(l_f / G)
    cplx = sorted([e for e in ev if e.imag > 1e-9], key=abs)
    if len(cplx) != 2:
        return None
    ph, sp = cplx
    return abs(ph), abs(sp), -sp.real / abs(sp)


def main():
    full = airframe(nm.M_FULL, nm.B_FULL, nm.AR0, nm.CL0, 1.25, 2.1, nm.E)
    v_model = full["v"] * nm.N ** 0.5
    s_sim = full["s_ref"] * nm.N ** 2
    ref_af = asb.Airfoil("naca4412")
    ref_pw = (nm.cd_at(ref_af, full["re"], nm.CL0) + nm.CL0 ** 2 / (np.pi * nm.E * nm.AR0)) / nm.CL0
    ref = nm.modes(ref_af, 1.0, nm.AR0, 1.0, nm.CL0)
    rph, rsp, rz = ref["ph"], ref["sp"], ref["z"]
    print(f"reference n=1 NACA 4412 (free): phugoid {rph:.3f}, short period {rsp:.3f}, zeta_sp {rz:.3f}")
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
                pr = ((cd + cl ** 2 / (np.pi * nm.E * ar)) / cl) / ref_pw
                if abs(pr - 1) <= 0.05:
                    cases.append((name, af, k, ar, cl, pr))
    print(f"{len(cases)} power-matched wings; tail grid {len(SECTIONS)} sections x {len(AREAS)} areas x {len(TAR)} aspect ratios x {len(ARMS)} arms = {len(SECTIONS)*len(AREAS)*len(TAR)*len(ARMS)} tails each\n")
    print(f"{'airfoil':>9} {'k':>5} {'AR':>3} {'CL':>5} {'P ratio':>7} {'n pass5':>7} {'n pass3':>7} {'ok@1.0':>7}  best robust tail (section, area, AR_t, arm)  worst% at scale {SCALES}  max%")
    wings5 = wings3 = tot5 = tot3 = tot = tot1 = 0
    for name, af, k, ar, cl, pr in cases:
        s_w = k * s_sim
        c = s_w / np.sqrt(ar * s_w)
        v = np.sqrt(2 * nm.M_FULL * nm.N ** 3 * G / (nm.RHO * s_w * cl))
        # model quantities at the model's own n = 0.2
        v = np.sqrt(2 * nm.M_FULL * nm.N ** 3 * G / (nm.RHO * s_w * cl))
        re_w = nm.RHO * v * c / nm.MU
        wing = (nm.cd_at(af, re_w, cl), nm.slope_at(af, ar, re_w, cl))
        best, n5, n3, nt, at1 = None, 0, 0, 0, 0
        for sec, frac, art in itertools.product(SECTIONS, AREAS, TAR):
            taf = asb.Airfoil(sec)
            b_t = np.sqrt(art * frac * s_sim)
            re_t = nm.RHO * v * (b_t / art) / nm.MU
            tail = (nm.slope_at(taf, art, re_t, 0.05), nm.cd_at(taf, re_t, 0.05))
            if np.isnan(tail[1]):
                continue
            for arm in ARMS:
                ws = []
                for sc in SCALES:
                    r = modes_tail(af, k, ar, nm.N, cl, wing, (tail[0] * sc, tail[1]), sec, frac, art, arm)
                    if r is None:
                        ws = None
                        break
                    ws.append(max(abs(100 * (r[0] / rph - 1)), abs(100 * (r[1] / rsp - 1)), abs(100 * (r[2] / rz - 1))))
                if ws is None:
                    continue
                w = max(ws)
                nt += 1
                n5 += w <= 5
                n3 += w <= 3
                at1 += ws[-1] <= 5
                if best is None or w < best[0]:
                    best = (w, sec, frac, art, arm, ws)
        tot += nt
        tot1 += at1
        tot5 += n5
        tot3 += n3
        wings5 += n5 > 0
        wings3 += n3 > 0
        if best is None:
            continue
        w, sec, frac, art, arm, d = best
        print(f"{name:>9} {k:5.2f} {ar:3d} {cl:5.2f} {pr:7.3f} {n5:7d} {n3:7d} {at1:7d}  {sec} {frac:.2f} {art:.1f} {arm:.1f}  " + " ".join(f"{x:5.1f}" for x in d) + f"  {w:6.1f}")
    print(f"\nwings with at least one tail within 5% on all three modes at every scale: {wings5} of {len(cases)}; within 3%: {wings3} of {len(cases)}")
    print(f"tail designs: {tot1} of {tot} within 5% at scale 1.0 alone; {tot5} within 5% at every scale in {SCALES}; {tot3} within 3% at every scale")


main()
