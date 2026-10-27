"""H5 with H1 proper: longitudinal modes of the 7b power-matched non-similar models at n = 0.2.

    /usr/bin/python3.13 experiments/nonsimilar_modes/run.py > experiments/nonsimilar_modes/results.txt

Power-match grid as experiments/nonsimilar_search (NACA 4412 and 5406, area factor k, aspect ratio AR, n = 0.2).
Modes as experiments/longitudinal_modes (Etkin four-state, NeuralFoil polars, strip finite-wing slope), but the
model wing has its own S = k S_sim and AR; tail and inertia stay the Froude-scaled full-size values.
"""
import sys
import numpy as np
import aerosandbox as asb
import neuralfoil as nf

sys.path.insert(0, "src")
from aerolog_scaling.scaling import airframe, isa, G

CL0, AR0, E, N = 0.8, 10.0, 0.8, 0.2
S_T, AR_T, ARM, KY = 0.2, 5.0, 3.0, 0.3
M_FULL, B_FULL = 1000.0, 3.0 * 10 ** 0.5
ALPHAS = np.arange(-6, 18.01, 0.5)
KS = (0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.5, 1.75, 2.0)
ARS = (5, 6, 7, 8, 10, 12, 14, 16)
RHO, MU = isa(0.0)[2], isa(0.0)[3]
TAIL = asb.Airfoil("naca0012")


def polar(af, re, alphas):
    r = nf.get_aero_from_airfoil(af, alpha=np.atleast_1d(alphas), Re=re, model_size="xxxlarge", n_crit=9)
    return np.asarray(r["CL"]), np.asarray(r["CD"]), np.asarray(r["analysis_confidence"]) > 0.5


def cd_at(af, re, cl):
    cl_a, cd_a, ok = polar(af, re, ALPHAS)
    pre = np.arange(len(cl_a)) <= int(np.argmax(np.where(ok, cl_a, -9)))
    j, k = pre & (cl_a <= cl) & ok, pre & (cl_a >= cl) & ok
    if not j.any() or not k.any():
        return float("nan")
    a, b = np.where(j)[0][-1], np.where(k)[0][0]
    return float(cd_a[a] if a == b else np.interp(cl, [cl_a[a], cl_a[b]], [cd_a[a], cd_a[b]]))


def slope_at(af, ar, re, cl_target):
    """finite-wing lift slope (per rad) at the section alpha where the section CL equals cl_target."""
    cl_a, _, ok = polar(af, re, ALPHAS)
    pre = np.arange(len(cl_a)) <= int(np.argmax(np.where(ok, cl_a, -9)))
    al = float(np.interp(cl_target, cl_a[pre], ALPHAS[pre]))
    h = 0.5
    cp, _, _ = polar(af, re, [al + h])
    cm, _, _ = polar(af, re, [al - h])
    a0 = (cp[0] - cm[0]) / (2 * h * np.pi / 180)
    return a0 / (1 + a0 / (np.pi * E * ar))


def modes(af, k, ar, n, cl_w):
    m, l_f = M_FULL * n ** 3, B_FULL * n
    s_sim = l_f ** 2 / AR0
    s_w = k * s_sim
    b = np.sqrt(ar * s_w)
    c = s_w / b
    s_t = S_T * s_sim
    b_t = np.sqrt(AR_T * s_t)
    c_t = b_t / AR_T
    l_t = ARM * (l_f / AR0)
    iyy = m * (KY * l_f) ** 2
    v = np.sqrt(2 * m * G / (RHO * s_w * cl_w))
    q = 0.5 * RHO * v * v
    re_w, re_t = RHO * v * c / MU, RHO * v * c_t / MU
    cd_w = cd_at(af, re_w, cl_w)
    a_w = slope_at(af, ar, re_w, cl_w)
    a_t = slope_at(TAIL, AR_T, re_t, 0.05)
    cd_t = cd_at(TAIL, re_t, 0.05)
    deps = 2 * a_w / (np.pi * ar)
    cdi = cl_w ** 2 / (np.pi * E * ar)
    cd_tot = cd_w + cdi + (s_t / s_w) * cd_t
    tq = (s_t / s_w) * (1 - deps)
    cla = a_w + a_t * tq
    cma = -a_t * tq * l_t / c
    cmq = -2 * a_t * (s_t / s_w) * (l_t / c) ** 2
    cda = 2 * cl_w * a_w / (np.pi * E * ar)
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
        return dict(ok=False, ev=ev, v=v / np.sqrt(G * l_f), re_t=re_t)
    ph, sp = cplx
    return dict(ok=True, ph=abs(ph), sp=abs(sp), z=-sp.real / abs(sp), v=v / np.sqrt(G * l_f), re_t=re_t, ev=ev)


def main():
    full = airframe(M_FULL, B_FULL, AR0, CL0, 1.25, 2.1, E)
    v_model = full["v"] * N ** 0.5
    s_sim = full["s_ref"] * N ** 2
    ref_af = asb.Airfoil("naca4412")
    ref_pw = (cd_at(ref_af, full["re"], CL0) + CL0 ** 2 / (np.pi * E * AR0)) / CL0
    ref = modes(ref_af, 1.0, AR0, 1.0, CL0)
    print(f"reference n=1 NACA 4412 (free): phugoid {ref['ph']:.3f}, short period {ref['sp']:.3f}, zeta_sp {ref['z']:.3f}, tail Re {ref['re_t']:.2e}")
    rows = []
    for name in ("naca4412", "naca5406"):
        af = asb.Airfoil(name)
        for k in KS:
            for ar in ARS:
                s = k * s_sim
                re = RHO * v_model * (s / np.sqrt(ar * s)) / MU
                cl = CL0 / k
                cd = cd_at(af, re, cl)
                if np.isnan(cd):
                    continue
                pr = ((cd + cl ** 2 / (np.pi * E * ar)) / cl) / ref_pw
                if abs(pr - 1) <= 0.05:
                    rows.append((name, k, ar, cl, pr, modes(af, k, ar, N, cl)))
    sim = modes(ref_af, 1.0, AR0, N, CL0)
    print(f"uncorrected similar model n=0.2 (4412, k 1, AR 10): " + (f"ph {sim['ph']:.3f} sp {sim['sp']:.3f} zeta {sim['z']:.3f}, tail Re {sim['re_t']:.2e}" if sim['ok'] else "mode structure changed"))
    print(f"\n{len(rows)} power-matched cases (|ratio - 1| <= 0.05); d = percent difference from the n = 1 reference")
    print(f"{'airfoil':>9} {'k':>5} {'AR':>3} {'CL':>5} {'P ratio':>7} {'dph%':>6} {'dsp%':>6} {'dz%':>6}  worst%")
    n5 = n3 = 0
    for name, k, ar, cl, pr, r in rows:
        if not r["ok"]:
            print(f"{name:>9} {k:5.2f} {ar:3d} {cl:5.2f} {pr:7.3f}   mode structure changed (no oscillatory short period)")
            continue
        d = [100 * (r["ph"] / ref["ph"] - 1), 100 * (r["sp"] / ref["sp"] - 1), 100 * (r["z"] / ref["z"] - 1)]
        w = max(abs(x) for x in d)
        n5 += w <= 5
        n3 += w <= 3
        print(f"{name:>9} {k:5.2f} {ar:3d} {cl:5.2f} {pr:7.3f} {d[0]:6.1f} {d[1]:6.1f} {d[2]:6.1f}  {w:6.1f}")
    print(f"\nall three within 5%: {n5} of {len(rows)}; within 3%: {n3} of {len(rows)}")


main()
