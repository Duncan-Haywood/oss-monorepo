"""Milestone 9f: how much noise in the identified short-period frequency can the adjustable tail (9d, 9e) tolerate?

    PY experiments/identification_noise/run.py > experiments/identification_noise/results.txt     (run from research/aerolog-scaling)

The 78 mode-matched designs of experiments/tail_gust_robust. For each true tail-slope scale s in SCALES, the area
multiplier f on the grid tail area is chosen by the mode criterion alone (the f in the grid F with the smallest
worst mode error, as an in-flight pitch-doublet would set it), then the three gust peaks (H = 5, 12.5, 25 chords)
are compared with the unchanged n = 1 reference, as in 9c. Nothing is tuned on the gust metrics.
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
SCALES = (0.75, 1.0)
SIGMAS = (0.0, 0.01, 0.02, 0.05, 0.10)
DRAWS = 400
F = np.round(np.arange(0.6, 1.801, 0.05), 2)


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

    def ev(af, k, ar, cl, wing, tail, sec, frac, art, arm, sc, f):
        r = ts.modes_tail(af, k, ar, nm.N, cl, wing, (tail[0] * sc, tail[1]), sec, frac * f, art, arm)
        if r is None:
            return None
        wm = max(abs(100 * (r[0] / rph - 1)), abs(100 * (r[1] / rsp - 1)), abs(100 * (r[2] / rz - 1)))
        wg = max(abs(100 * (a / b - 1)) for h in HS for a, b in zip(gm.gust_peaks(r[3], h, c_full), base[h]))
        return r[1] / rsp, wm, wg

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
                e1 = ev(af, k, ar, cl, wing, tail, sec, frac, art, arm, 1.0, 1.0)
                if e1 is None or e1[1] > 5:
                    continue
                tabs = []
                for sc in SCALES:
                    tab = [ev(af, k, ar, cl, wing, tail, sec, frac, art, arm, sc, f) for f in F]
                    if any(t is None for t in tab):
                        tabs = None
                        break
                    tabs.append(np.array(tab))
                if tabs is not None:
                    rows.append((name, k, ar, sec, frac, art, arm, tabs))
    n = len(rows)
    print(f"{n} mode-matched designs; f chosen on the grid {F[0]} to {F[-1]} so that the identified short-period frequency (true value times 1 + noise) is closest to the n = 1 value; {DRAWS} draws per design, noise normal with sd sigma (relative)\n")
    rng = np.random.default_rng(20261029)
    for i, sc in enumerate(SCALES):
        print(f"true tail slope scale {sc}")
        for sg in SIGMAS:
            med, p90, ok10, ok5, mode10 = [], [], 0, 0, 0
            for r in rows:
                t = r[7][i]
                eps = rng.normal(0, sg, DRAWS) if sg else np.zeros(1)
                idx = np.abs(t[:, 0][None, :] * (1 + eps)[:, None] - 1).argmin(axis=1)
                g, m = t[idx, 2], t[idx, 1]
                med.append(np.median(g))
                p90.append(np.percentile(g, 90))
                ok10 += np.mean(g <= 10) >= 0.9
                ok5 += np.mean(g <= 5) >= 0.9
                mode10 += np.mean(m <= 10) >= 0.9
            print(f"  sigma {sg:4.2f}: median over designs of the median worst gust error {np.median(med):5.1f}%, of the 90th percentile {np.median(p90):5.1f}%; designs with at least 90% of draws within 10% gust: {ok10} of {n}, within 5%: {ok5} of {n}; within 10% on every mode: {mode10} of {n}")


main()
