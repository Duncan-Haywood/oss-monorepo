"""H5 with H1 gust: do the tails of experiments/tail_search that restore the modes also restore the gust response?

    PY experiments/tail_gust/run.py > experiments/tail_gust/results.txt     (PY: an interpreter with aerosandbox, neuralfoil, scipy)

Wing grid, tail grid and mode model are those of experiments/tail_search (imported by source); the gust model and
metrics are those of experiments/gust_response. A tail design is kept when all three modes are within 5% of n = 1.
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
                gust = {h: [100 * (a / b - 1) for a, b in zip(gm.gust_peaks(r[3], h, c_full), base[h])] for h in HS}
                rows.append((name, k, ar, sec, frac, art, arm, w, gust))
    print(f"{len(rows)} mode-matched designs\n")
    print(f"{'airfoil':>9} {'k':>5} {'AR':>3}  tail (section, area, AR_t, arm)   modes%  worst gust%/H=5,12.5,25  worst metric at 12.5 (dn,q,theta)")
    names = ("dn", "q", "theta")
    worst_count = [0, 0, 0]
    within10 = within5_all = 0
    for name, k, ar, sec, frac, art, arm, w, gust in rows:
        ws = [max(abs(x) for x in gust[h]) for h in HS]
        j = int(np.argmax([abs(x) for x in gust[HS[1]]]))
        worst_count[j] += 1
        within10 += ws[1] <= 10
        within5_all += max(ws) <= 5
        print(f"{name:>9} {k:5.2f} {ar:3d}  {sec} {frac:.2f} {art:.1f} {arm:.1f}  {w:5.1f}  {ws[0]:5.1f} {ws[1]:5.1f} {ws[2]:5.1f}  {names[j]} ({gust[HS[1]][j]:+.1f})")
    print(f"\nall three gust peaks within 10% at H = 12.5: {within10} of {len(rows)}")
    print(f"all three gust peaks within 5% at all three H: {within5_all} of {len(rows)}")
    print("worst metric at H = 12.5: " + ", ".join(f"{n} {c}" for n, c in zip(names, worst_count)))
    best = min(rows, key=lambda x: max(max(abs(v) for v in x[8][h]) for h in HS))
    print("best design by worst gust error over all H: %s k %.2f AR %d tail %s %.2f %.1f %.1f, %.1f%%" % (best[0], best[1], best[2], best[3], best[4], best[5], best[6], max(max(abs(v) for v in best[8][h]) for h in HS)))


main()
