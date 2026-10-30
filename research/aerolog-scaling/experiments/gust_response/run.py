"""H1 proper, gust part: response of the Froude model to a Froude-scaled 1-cos vertical gust, similar and non-similar.

    /usr/bin/python3.13 experiments/gust_response/run.py > experiments/gust_response/results.txt

Same four-state model, polars and power-matched grid as experiments/nonsimilar_modes. A vertical gust w_g adds
alpha_g = w_g / V to the angle of attack seen by wing and tail at once (no gust penetration lag, no alpha-dot
term, as the model has none). The gust is 1-cos with gradient distance H = h chords of the full-size wing; for
the model H scales with n and w_g with sqrt(n), so alpha_g(t sqrt(g/L)) is the same function at every scale.
Metrics (all Froude-invariant): peak load-factor increment (from the lift slope and alpha + alpha_g), peak pitch
rate q sqrt(L/g), peak pitch attitude theta.
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
HS = (5, 12.5, 25)
AG_MAX = 0.05  # peak w_g / V; the model is linear, so only ratios between scales are reported


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
        return dict(ok=False)
    return dict(ok=True, A=A, v=v, c=c, l_f=l_f, cla=cla, q=q, s_w=s_w, m=m, cl_w=cl_w)



def gust_peaks(r, h_chords, c_full):
    """Peak |delta n|, |q| sqrt(L/g), |theta| for a 1-cos gust of gradient H = h_chords * c_full * (r['l_f'] / L_full)."""
    A, v = r["A"], r["v"]
    bvec = A[:, 1].copy()  # alpha enters the u, alpha and q rows through column 1; the +q in the alpha row is not alpha
    scale = r["l_f"] / B_FULL  # n
    h_len = h_chords * c_full * scale
    t_end = 2 * h_len / v  # 1-cos gust of length 2H
    dt = t_end / 4000
    ts = np.arange(0, 6 * t_end, dt)
    x = np.zeros(4)
    dn = qm = th = 0.0
    # exact discretisation (zero-order hold) of x' = A x + b u
    from scipy.linalg import expm
    M = np.zeros((5, 5))
    M[:4, :4], M[:4, 4] = A, bvec
    E_ = expm(M * dt)
    Ad, Bd = E_[:4, :4], E_[:4, 4]
    k_n = r["q"] * r["s_w"] / (r["m"] * G)
    for t in ts:
        u = AG_MAX * 0.5 * (1 - np.cos(np.pi * v * t / h_len)) if v * t < 2 * h_len else 0.0
        x = Ad @ x + Bd * u
        dn = max(dn, abs(k_n * r["cla"] * (x[1] + u)))
        qm = max(qm, abs(x[2]) * np.sqrt(r["l_f"] / G))
        th = max(th, abs(x[3]))
    return dn, qm, th


def main():
    full = airframe(M_FULL, B_FULL, AR0, CL0, 1.25, 2.1, E)
    ref_af = asb.Airfoil("naca4412")
    ref_pw = (cd_at(ref_af, full["re"], CL0) + CL0 ** 2 / (np.pi * E * AR0)) / CL0
    v_model = full["v"] * N ** 0.5
    s_sim = full["s_ref"] * N ** 2
    c_full = np.sqrt(full["s_ref"] / AR0)
    ref = modes(ref_af, 1.0, AR0, 1.0, CL0)
    sim = modes(ref_af, 1.0, AR0, N, CL0)
    print("1-cos vertical gust, gradient H in full-size chords (scaled by n for the model); peaks as percent difference from n = 1")
    for hc in HS:
        base = gust_peaks(ref, hc, c_full)
        print(f"\nH = {hc} chords. reference n=1: peak dn {base[0]:.4f}, q sqrt(L/g) {base[1]:.4f}, theta {base[2]:.4f}")
        s = gust_peaks(sim, hc, c_full)
        d = [100 * (a / b - 1) for a, b in zip(s, base)]
        print(f"  similar n=0.2 (4412, k 1, AR 10): d(dn) {d[0]:6.1f}%  d(q) {d[1]:6.1f}%  d(theta) {d[2]:6.1f}%")
        rows = []
        for name in ("naca4412", "naca5406"):
            af = asb.Airfoil(name)
            for k in KS:
                for ar in ARS:
                    s_w = k * s_sim
                    re = RHO * v_model * (s_w / np.sqrt(ar * s_w)) / MU
                    cl = CL0 / k
                    cd = cd_at(af, re, cl)
                    if np.isnan(cd):
                        continue
                    pr = ((cd + cl ** 2 / (np.pi * E * ar)) / cl) / ref_pw
                    if abs(pr - 1) > 0.05:
                        continue
                    r = modes(af, k, ar, N, cl)
                    if not r["ok"]:
                        continue
                    g = gust_peaks(r, hc, c_full)
                    rows.append((name, k, ar, [100 * (a / b - 1) for a, b in zip(g, base)]))
        w = sorted(rows, key=lambda x: max(abs(y) for y in x[3]))
        for name, k, ar, d in w[:3]:
            print(f"  best  {name:>9} k {k:4.2f} AR {ar:2d}: d(dn) {d[0]:6.1f}%  d(q) {d[1]:6.1f}%  d(theta) {d[2]:6.1f}%")
        n5 = sum(max(abs(y) for y in x[3]) <= 5 for x in rows)
        n10 = sum(max(abs(y) for y in x[3]) <= 10 for x in rows)
        print(f"  {len(rows)} power-matched cases: worst of three within 5%: {n5}; within 10%: {n10}")


main()
