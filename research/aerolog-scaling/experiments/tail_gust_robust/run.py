"""Milestone 9c: do the mode-matched tails of experiments/tail_gust keep the gust response if the tail slope is 0.75 to 1.0 of NeuralFoil's?

    PY experiments/tail_gust_robust/run.py > experiments/tail_gust_robust/results.txt     (PY: an interpreter with aerosandbox, neuralfoil, scipy)

Wing grid, tail grid and mode model are those of experiments/tail_search (imported by source); the gust model and
metrics are those of experiments/gust_response. A tail design is kept when all three modes are within 5% of n = 1 at slope scale 1.0; it is then
re-evaluated at SCALES (as experiments/robust_tail), the reference n = 1 unchanged.
"""
import itertools
import sys
import numpy as np
import aerosandbox as asb

sys.path.insert(0, "src")
from aerolog_scaling.scaling import airframe, G


def load(path, name, patch=None):
    src = open(path).read().rsplit("\nmain()", 1)[0]
    if patch:
        src = src.replace(*patch)
    mod = type(sys)(name)
    mod.__dict__["__name__"] = name
    exec(compile(src, name, "exec"), mod.__dict__)
    return mod


ts = load("experiments/tail_search/run.py", "ts",
          ("    return abs(ph), abs(sp), -sp.real / abs(sp)",
           "    return abs(ph), abs(sp), -sp.real / abs(sp), dict(ok=True, A=A, v=v, c=c, l_f=l_f, cla=cla, q=q, s_w=s_w, m=m, cl_w=cl_w)"))
nm, gm = ts.nm, load("experiments/gust_response/run.py", "gm")
HS = gm.HS
SCALES = (0.75, 0.8, 0.9, 1.0)


def main():
    full = airframe(nm.M_FULL, nm.B_FULL, nm.AR0, nm.CL0, 1.25, 2.1, nm.E)
    v_model = full["v"] * nm.N ** 0.5
    s_sim = full["s_ref"] * nm.N ** 2
    c_full = np.sqrt(full["s_ref"] / nm.AR0)
    ref_af = asb.Airfoil("naca4412")
    ref_pw = (nm.cd_at(ref_af, full["re"], nm.CL0) + nm.CL0 ** 2 / (np.pi * nm.E * nm.AR0)) / nm.CL0
    ref = nm.modes(ref_af, 1.0, nm.AR0, 1.0, nm.CL0)
    rph, rsp, rz = ref["ph"], ref["sp"], ref["z"]
    base = {h: gm.gust_peaks(gm.modes(ref_af, 1.0, nm.AR0, 1.0, nm.CL0), h, c_full) for h in HS}
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
                    cases.append((name, af, k, ar, cl))
    print(f"{len(cases)} power-matched wings x {len(ts.SECTIONS) * len(ts.AREAS) * len(ts.TAR) * len(ts.ARMS)} tails; keep modes within 5%; gust peaks as percent difference from n = 1")
    rows = []
    for name, af, k, ar, cl in cases:
        s_w = k * s_sim
        c = s_w / np.sqrt(ar * s_w)
        v = np.sqrt(2 * nm.M_FULL * nm.N ** 3 * G / (nm.RHO * s_w * cl))
        re_w = nm.RHO * v * c / nm.MU
        wing = (nm.cd_at(af, re_w, cl), nm.slope_at(af, ar, re_w, cl))
        for sec, frac, art in itertools.product(ts.SECTIONS, ts.AREAS, ts.TAR):
            taf = asb.Airfoil(sec)
            b_t = np.sqrt(art * frac * s_sim)
            re_t = nm.RHO * v * (b_t / art) / nm.MU
            tail = (nm.slope_at(taf, art, re_t, 0.05), nm.cd_at(taf, re_t, 0.05))
            if np.isnan(tail[1]):
                continue
            for arm in ts.ARMS:
                r = ts.modes_tail(af, k, ar, nm.N, cl, wing, tail, sec, frac, art, arm)
                if r is None:
                    continue
                w = max(abs(100 * (r[0] / rph - 1)), abs(100 * (r[1] / rsp - 1)), abs(100 * (r[2] / rz - 1)))
                if w > 5:
                    continue
                per = []
                for sc in SCALES:
                    r2 = ts.modes_tail(af, k, ar, nm.N, cl, wing, (tail[0] * sc, tail[1]), sec, frac, art, arm)
                    if r2 is None:
                        per = None
                        break
                    wm = max(abs(100 * (r2[0] / rph - 1)), abs(100 * (r2[1] / rsp - 1)), abs(100 * (r2[2] / rz - 1)))
                    wg = max(abs(100 * (a / b - 1)) for h in HS for a, b in zip(gm.gust_peaks(r2[3], h, c_full), base[h]))
                    per.append((wm, wg))
                if per is None:
                    continue
                rows.append((name, k, ar, sec, frac, art, arm, per))
    print(f"{len(rows)} mode-matched designs (slope scale 1.0), each re-evaluated at {SCALES}\n")
    print("worst gust error over H=5,12.5,25 and worst mode error, per slope scale; designs sorted by worst gust error over scales")
    rows.sort(key=lambda x: max(g for _, g in x[7]))
    for name, k, ar, sec, frac, art, arm, per in rows[:15]:
        print(f"{name:>9} {k:5.2f} {ar:3d}  {sec} {frac:.2f} {art:.1f} {arm:.1f}  gust " + " ".join(f"{g:5.1f}" for _, g in per) + "  modes " + " ".join(f"{m:5.1f}" for m, _ in per))
    for tol in (10, 5):
        n = sum(max(g for _, g in r[7]) <= tol for r in rows)
        print(f"designs with worst gust error within {tol}% at every scale: {n} of {len(rows)}")
    for tol in (10, 5):
        print(f"designs with worst gust error within {tol}% at scale 0.75 alone: {sum(r[7][0][1] <= tol for r in rows)} of {len(rows)}")
    print(f"designs whose worst gust error at scale 0.75 is below their worst mode error at 0.75: {sum(r[7][0][1] < r[7][0][0] for r in rows)} of {len(rows)}")
    print(f"median worst gust error at scales {SCALES}: " + ", ".join(f"{np.median([r[7][i][1] for r in rows]):.1f}" for i in range(len(SCALES))))
    print(f"median worst mode error at scales {SCALES}: " + ", ".join(f"{np.median([r[7][i][0] for r in rows]):.1f}" for i in range(len(SCALES))))


main()
