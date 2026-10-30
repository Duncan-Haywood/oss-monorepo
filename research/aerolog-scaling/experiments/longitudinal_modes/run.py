"""H1 with Reynolds-dependent aerodynamics: trim speed and longitudinal modes of a Froude model.

    /usr/bin/python3.13 experiments/longitudinal_modes/run.py > experiments/longitudinal_modes/results.txt

Aircraft: wing NACA 4412 (AR 10, e 0.8) plus tail NACA 0012 (area 0.2 of wing, AR 5, arm 3.0 mac),
CG at 0.25 mac, wing zero-moment point from the section polar. Section polars are NeuralFoil
(xxxlarge) at each surface's own Re; lift slope gets the finite-wing correction a = a0/(1 + a0/(pi e AR)),
downwash slope 2 a_w/(pi AR_w). Mass, inertia and geometry follow Froude scaling (inertia radius of
gyration 0.3 span). Two flight rules for the model: "same alpha" (flown at the full-size trim angle, so
Re-dependent CL(alpha) moves the trim speed) and "same CL" (speed matched to hold CL). Modes come from
the 4-state longitudinal equations (Etkin) with derivatives by central differences of the polars.
Nondimensional frequency = omega * sqrt(L/g), with L the span, which is Froude-invariant.
"""
import sys
import numpy as np
import aerosandbox as asb
import neuralfoil as nf

sys.path.insert(0, "src")
from aerolog_scaling.scaling import isa, G

WING, TAIL = asb.Airfoil("naca4412"), asb.Airfoil("naca0012")
AR_W, AR_T, E, S_T, ARM, KY = 10.0, 5.0, 0.8, 0.2, 3.0, 0.3
RHO, MU = isa(0.0)[2], isa(0.0)[3]
M_FULL, B_FULL = 1000.0, 3.0 * 10 ** 0.5


def section(af, re, alpha_deg, n_crit, xtr):
    r = nf.get_aero_from_airfoil(af, alpha=np.atleast_1d(alpha_deg), Re=re, model_size="xxxlarge",
                                 n_crit=n_crit, xtr_upper=xtr, xtr_lower=xtr)
    return float(r["CL"][0]), float(r["CD"][0]), float(r["CM"][0])


def surf(af, ar, re, a_deg, n_crit, xtr):
    """finite-wing CL, CD, CM at section angle a_deg (deg) via small-angle slope correction."""
    h = 0.5
    cl1, cd1, cm1 = section(af, re, a_deg, n_crit, xtr)
    clp, _, _ = section(af, re, a_deg + h, n_crit, xtr)
    clm, _, _ = section(af, re, a_deg - h, n_crit, xtr)
    a0 = (clp - clm) / (2 * h * np.pi / 180)
    k = 1 / (1 + a0 / (np.pi * E * ar))
    return cl1, cd1, cm1, a0 * k


def modes(n, n_crit, xtr, alpha_trim_deg, same_cl=None):
    m, b = M_FULL * n ** 3, B_FULL * n
    s_w = b * b / AR_W
    c = b / AR_W
    s_t, b_t = S_T * s_w, np.sqrt(AR_T * S_T * s_w)
    c_t, l_t = b_t / AR_T, ARM * c
    iyy = m * (KY * b) ** 2
    # trim speed: wing CL(alpha) from the section polar at the wing's Re (iterate Re with speed)
    v = np.sqrt(2 * m * G / (RHO * s_w * 0.8))
    for _ in range(30):
        re_w = RHO * v * c / MU
        cl, cd, cm, aw = surf(WING, AR_W, re_w, alpha_trim_deg, n_crit, xtr)
        cl_w = cl
        if same_cl is not None:
            cl_w = same_cl
            vn = np.sqrt(2 * m * G / (RHO * s_w * cl_w))
        else:
            vn = np.sqrt(2 * m * G / (RHO * s_w * cl_w))
        if abs(vn - v) < 1e-6:
            break
        v = 0.5 * (v + vn)
    q = 0.5 * RHO * v * v
    re_w, re_t = RHO * v * c / MU, RHO * v * c_t / MU
    cl_w0, cd_w, cm_w, a_w = surf(WING, AR_W, re_w, alpha_trim_deg, n_crit, xtr)
    # tail at zero lift trim (elevator carries the trim load), slope from its own polar at alpha 0
    _, cd_t, _, a_t = surf(TAIL, AR_T, re_t, 0.0, n_crit, xtr)
    deps = 2 * a_w / (np.pi * AR_W)
    cl_w = m * G / (q * s_w)
    cdi = cl_w ** 2 / (np.pi * E * AR_W)
    cd_tot = cd_w + cdi + (s_t / s_w) * cd_t
    # derivatives (per rad), stability axes, CG at 0.25c so wing aerodynamic centre is at the CG
    cla = a_w + a_t * (s_t / s_w) * (1 - deps)
    cma = -a_t * (s_t / s_w) * (1 - deps) * l_t / c
    cmq = -2 * a_t * (s_t / s_w) * (l_t / c) ** 2
    cda = 2 * cl_w * a_w / (np.pi * E * AR_W)
    # dimensional derivatives
    mass = m
    xu = -(2 * cd_tot) * q * s_w / (mass * v)               # per unit u (cd ~ constant in speed)
    zu = -(2 * cl_w) * q * s_w / (mass * v)
    xa = (cl_w - cda) * q * s_w / mass
    za = -(cla + cd_tot) * q * s_w / mass
    ma = cma * q * s_w * c / iyy
    mq = cmq * q * s_w * c * c / (2 * v) / iyy
    # state [u, alpha(w/v), q, theta]; level flight gamma = 0
    A = np.array([[xu, xa, 0, -G],
                  [zu / v, za / v, 1, 0],
                  [0, ma * 1.0, mq, 0],
                  [0, 0, 1, 0]])
    A[1, 0] = zu / v
    ev = np.linalg.eigvals(A) * np.sqrt(b / G)   # nondimensional: lambda * sqrt(span/g)
    out = {"eig": ev}
    cplx = sorted([e for e in ev if e.imag > 1e-9], key=lambda e: abs(e))
    if len(cplx) == 2:
        out["phugoid"], out["short"] = (abs(cplx[0]), -cplx[0].real / abs(cplx[0])), (abs(cplx[1]), -cplx[1].real / abs(cplx[1]))
    elif len(cplx) == 1:   # one oscillatory pair, the other mode real
        out["osc"] = (abs(cplx[0]), -cplx[0].real / abs(cplx[0]))
    out["v_nd"] = v / np.sqrt(G * b)
    out["cl"], out["re_w"], out["ld"] = cl_w, re_w, cl_w / cd_tot
    return out


def main():
    print("Longitudinal modes of a Froude-scaled cargo UAV, NeuralFoil polars; frequencies are omega*sqrt(span/g)")
    for label, nc, xtr in (("free transition (n_crit 9)", 9, 1.0), ("tripped at 5% chord", 9, 0.05)):
        # full-size trim angle that gives CL 0.8
        al = np.linspace(0, 12, 121)
        re1 = RHO * np.sqrt(2 * M_FULL * G / (RHO * (B_FULL ** 2 / AR_W) * 0.8)) * (B_FULL / AR_W) / MU
        cls = np.array([section(WING, re1, a, nc, xtr)[0] for a in al])
        a_trim = float(np.interp(0.8, cls, al))
        print(f"\n{label}; full-size trim alpha {a_trim:.2f} deg")
        for rule in ("same alpha", "same CL"):
            print(f"  rule: {rule}")
            print(f"  {'n':>5} {'Re_w':>9} {'V_nd':>6} {'CL':>5} {'L/D':>5} {'w_ph':>7} {'w_sp':>7} {'z_sp':>6}  eigenvalues (x sqrt(b/g))")
            ref = None
            for n in (1.0, 0.5, 0.2, 0.1, 0.05):
                r = modes(n, nc, xtr, a_trim, 0.8 if rule == "same CL" else None)
                if ref is None:
                    ref = r
                ph, sp = r.get("phugoid", (np.nan,) * 2), r.get("short", (np.nan,) * 2)
                ev = " ".join("%.3f%+.3fj" % (e.real, e.imag) for e in r["eig"])
                print(f"  {n:5.2f} {r['re_w']:9.2e} {r['v_nd']:6.3f} {r['cl']:5.2f} {r['ld']:5.1f} {ph[0]:7.3f} {sp[0]:7.3f} {sp[1]:6.3f}  {ev}")
            r2 = modes(0.1, nc, xtr, a_trim, 0.8 if rule == "same CL" else None)
            rel = lambda a, b: 100 * (b / a - 1)
            if "phugoid" in r2 and "phugoid" in ref:
                print("  n=0.1 vs 1: dV %+.1f%%  dw_ph %+.1f%%  dw_sp %+.1f%%  dz_sp %+.1f%%" % (
                    rel(ref["v_nd"], r2["v_nd"]), rel(ref["phugoid"][0], r2["phugoid"][0]),
                    rel(ref["short"][0], r2["short"][0]), rel(ref["short"][1], r2["short"][1])))
            else:
                print("  n=0.1 vs 1: dV %+.1f%%; the mode structure changed (see eigenvalues)" % rel(ref["v_nd"], r2["v_nd"]))


main()
