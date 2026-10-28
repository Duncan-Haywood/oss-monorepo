"""Milestone 8c: NeuralFoil against measured UIUC NACA 0009 lift slopes at Re 4e4 to 1e5.

    python3 experiments/uiuc_tail_slope/run.py > experiments/uiuc_tail_slope/results.txt

Data: Selig, Guglielmo, Broeren, Giguere, "Summary of Low-Speed Airfoil Data, Vol. 1" (1995), file
LIFT01.TXT, airfoil "NACA 0009" (M. Nankivil, smooth). Fetched at run time and cached outside the tree
(the data are GPL-licensed, so the raw file is not committed). Then the slope ratio is passed into the
tail_search mode model for the headline design as a sensitivity (the headline tail is NACA 0015, which Vol. 1
does not hold, so this is indicative, not a check of that section).
"""
import itertools
import os
import sys
import urllib.request
import numpy as np
import aerosandbox as asb
import neuralfoil as nf

sys.path.insert(0, "src")
from aerolog_scaling.scaling import airframe, G

URL = "https://m-selig.ae.illinois.edu/pd/pub/lsat/volume01/LIFT01.TXT"
CACHE = os.environ.get("UIUC_CACHE", "/tmp/LIFT01.TXT")
AL_LIM = 3.0


def load():
    if not os.path.exists(CACHE):
        urllib.request.urlretrieve(URL, CACHE)
    lines = open(CACHE, errors="replace").read().splitlines()
    i = next(j for j, l in enumerate(lines) if l.strip() == "Airfoil: NACA 0009")
    runs, j = [], i
    while True:
        j += 1
        if lines[j].startswith("Airfoil:"):
            break
        if lines[j].startswith("Average Reynolds"):
            re = float(lines[j + 1])
            nang = int(lines[j + 3])
            rows = [list(map(float, l.split()[:2])) for l in lines[j + 5:j + 5 + nang]]
            runs.append((re, np.array(rows)))
    return runs


def fit(alpha, cl, lim=AL_LIM):
    m = np.abs(alpha) <= lim
    a, b = np.polyfit(alpha[m], cl[m], 1)
    res = cl[m] - (a * alpha[m] + b)
    n = m.sum()
    se = np.sqrt(res @ res / (n - 2) / np.sum((alpha[m] - alpha[m].mean()) ** 2))
    return a * 180 / np.pi, se * 180 / np.pi, -b / a, int(n)


def nf_cl(re, alpha):
    r = nf.get_aero_from_airfoil(asb.Airfoil("naca0009"), alpha=alpha, Re=re, model_size="xxxlarge", n_crit=9)
    return np.asarray(r["CL"])


def main():
    runs = load()
    print("NACA 0009, section lift slope a0 (per rad) fitted over |alpha| <= 3 deg; UIUC LSAT Vol. 1 (Nankivil) vs NeuralFoil xxxlarge n_crit 9")
    print(f"thin-airfoil value 2 pi = {2 * np.pi:.3f}\n")
    print(f"{'Re':>8} {'n pts':>5} {'UIUC a0':>8} {'+-se':>6} {'NF a0':>7} {'NF/UIUC':>8} {'UIUC a0L deg':>12} {'NF a0L deg':>10}")
    ratios = {}
    for re, d in runs:
        al, cl = d[:, 0], d[:, 1]
        a_u, se, z_u, n = fit(al, cl)
        grid = np.arange(-AL_LIM, AL_LIM + 0.01, 0.25)
        a_n, _, z_n, _ = fit(grid, nf_cl(re, grid))
        ratios[re] = a_n / a_u
        print(f"{re:8.0f} {n:5d} {a_u:8.3f} {se:6.3f} {a_n:7.3f} {a_n / a_u:8.3f} {z_u:12.2f} {z_n:10.2f}")
    print("\nNF/UIUC slope ratio by fit window |alpha| <= 2 / 3 / 4 deg:")
    for re, d in runs:
        out = []
        for lim in (2.0, 3.0, 4.0):
            g = np.arange(-lim, lim + 0.01, 0.25)
            out.append(fit(g, nf_cl(re, g), lim)[0] / fit(d[:, 0], d[:, 1], lim)[0])
        print(f"{re:8.0f} " + " ".join(f"{x:6.3f}" for x in out))
    print(f"\nmean NF/UIUC {np.mean(list(ratios.values())):.3f}; largest deviation from 1: Re {max(ratios, key=lambda r: abs(ratios[r] - 1)):.0f} ({max(abs(v - 1) for v in ratios.values()) * 100:.1f}%)")

    src = open("experiments/tail_search/run.py").read().rsplit("\nmain()", 1)[0]
    ts = type(sys)("ts")
    ts.__dict__["__name__"] = "ts"
    exec(compile(src, "ts", "exec"), ts.__dict__)
    nm = ts.nm
    full = airframe(nm.M_FULL, nm.B_FULL, nm.AR0, nm.CL0, 1.25, 2.1, nm.E)
    s_sim = full["s_ref"] * nm.N ** 2
    v_model = full["v"] * nm.N ** 0.5
    af = asb.Airfoil("naca4412")
    k, ar, frac, art, arm = 1.0, 12, 0.15, 5.0, 3.5
    cl = nm.CL0 / k
    s_w = k * s_sim
    c = s_w / np.sqrt(ar * s_w)
    re_w = nm.RHO * v_model * c / nm.MU
    wing = (nm.cd_at(af, re_w, cl), nm.slope_at(af, ar, re_w, cl))
    b_t = np.sqrt(art * frac * s_sim)
    re_t = nm.RHO * v_model * (b_t / art) / nm.MU
    ref = nm.modes(asb.Airfoil("naca4412"), 1.0, nm.AR0, 1.0, nm.CL0)
    print(f"\nHeadline non-similar design (k 1.0, AR 12, tail area {frac}, AR_t {art}, arm {arm}); tail Re {re_t:.0f}")
    print(f"{'tail slope x':>12} {'dph%':>6} {'dsp%':>6} {'dz%':>6} {'worst%':>7}")
    taf = asb.Airfoil("naca0015")
    a_t, cd_t = nm.slope_at(taf, art, re_t, 0.05), nm.cd_at(taf, re_t, 0.05)
    for f in (0.8, 0.9, 1.0, 1.1, 1.2):
        r = ts.modes_tail(af, k, ar, nm.N, cl, wing, (f * a_t, cd_t), "naca0015", frac, art, arm)
        d = (100 * (r[0] / ref["ph"] - 1), 100 * (r[1] / ref["sp"] - 1), 100 * (r[2] / ref["z"] - 1))
        print(f"{f:12.2f} {d[0]:6.2f} {d[1]:6.2f} {d[2]:6.2f} {max(abs(x) for x in d):7.2f}")


main()
