"""Milestone 8e: NeuralFoil against the measured UIUC NACA 64A010 lift slope at Re 2e4 to 3e5.

    python3 experiments/uiuc_naca64a010/run.py > experiments/uiuc_naca64a010/results.txt

Why: 8c (NACA 0009) and 8d (NACA 2414/2415) found NeuralFoil's section slope 1.2 to 1.7 times measured at
Re 1e5 to 2e5 for the headline tail's thickness class. The symmetric NACA 0012 and 0015 are not in the hosted
volumes 1 to 3 of the UIUC low-speed summary (volumes 4 and 5 returned 404 from the session on 2026-11-07; the 0012/0015
data may exist elsewhere), so the one symmetric NACA-family section with a 9-Reynolds-number sweep that
brackets the tail's Re 1.5e5 is the NACA 64A010 (Champine, "clean"), a 10% thick laminar-flow section with
the same zero-camber geometry class. It is not the tail's section: this tests whether the 0009 finding is a
property of symmetric sections or of that one data set.

Predictions, fixed before the run:
P1. Mean NF/UIUC slope ratio over the Re 1e5 to 2e5 runs (|alpha| <= 3 deg window) is above 1.1, as for 0009 at 1e5 (1.175).
P2. At Re <= 4e4 the ratio is below 1 or within 10% of 1 (0009: 0.72 at 40,600 in the 3 deg window).
P3. The ratio varies by more than 25% across the nine Reynolds numbers (instability of the surrogate, or of the data).

Data: Selig, Guglielmo, Broeren, Giguere, "Summary of Low-Speed Airfoil Data, Vol. 1" (1995), LIFT01.TXT, airfoil
"NACA 64A010". Fetched at run time and cached outside the tree (GPL-licensed data, so not committed). The file
holds nine Reynolds numbers (22,100 to 305,400); all are used. Only two (101,000 and 204,000) lie in the tail's 1e5 to 2e5 band, so P1 rests on two runs.
NeuralFoil xxxlarge, n_crit 9, airfoil from AeroSandbox's bundled UIUC coordinates.
"""
import os
import urllib.request
import numpy as np
import aerosandbox as asb
import neuralfoil as nf

URL = "https://m-selig.ae.illinois.edu/pd/pub/lsat/volume01/LIFT01.TXT"
CACHE = os.environ.get("UIUC_CACHE", "/tmp/LIFT01.TXT")


def load():
    if not os.path.exists(CACHE):
        urllib.request.urlretrieve(URL, CACHE)
    lines = open(CACHE, errors="replace").read().splitlines()
    i = next(j for j, l in enumerate(lines) if l.strip() == "Airfoil: NACA 64A010")
    runs, j = [], i
    while True:
        j += 1
        if j >= len(lines) or lines[j].startswith("Airfoil:"):
            break
        if lines[j].startswith("Average Reynolds"):
            re = float(lines[j + 1])
            nang = int(lines[j + 3])
            rows = [list(map(float, l.split()[:2])) for l in lines[j + 5:j + 5 + nang]]
            runs.append((re, np.array(rows)))
    return runs


def fit(alpha, cl, lim):
    m = np.abs(alpha) <= lim
    a, b = np.polyfit(alpha[m], cl[m], 1)
    return a * 180 / np.pi, -b / a, int(m.sum())


def nf_cl(re, alpha):
    r = nf.get_aero_from_airfoil(asb.Airfoil("naca64a010"), alpha=alpha, Re=re, model_size="xxxlarge", n_crit=9)
    return np.asarray(r["CL"])


def main():
    runs = load()
    print("NACA 64A010, section lift slope a0 (per rad); UIUC LSAT Vol. 1 (Champine, clean) vs NeuralFoil xxxlarge n_crit 9")
    print(f"thin-airfoil value 2 pi = {2 * np.pi:.3f}; ratio = NF / UIUC for fit windows |alpha| <= 2 / 3 / 4 deg\n")
    print(f"{'Re':>8} {'UIUC a0 (w3)':>12} {'NF a0 (w3)':>10} {'ratio w2':>8} {'ratio w3':>8} {'ratio w4':>8}")
    r3 = {}
    for re, d in sorted(runs, key=lambda x: x[0]):
        out = []
        for lim in (2.0, 3.0, 4.0):
            g = np.arange(-lim, lim + 0.01, 0.25)
            au = fit(d[:, 0], d[:, 1], lim)[0]
            an = fit(g, nf_cl(re, g), lim)[0]
            out.append((au, an, an / au))
        r3[re] = out[1][2]
        print(f"{re:8.0f} {out[1][0]:12.3f} {out[1][1]:10.3f} {out[0][2]:8.3f} {out[1][2]:8.3f} {out[2][2]:8.3f}")
    mid = [v for r, v in r3.items() if 1e5 <= r <= 2.1e5]
    low = {r: v for r, v in r3.items() if r <= 4.1e4}
    print(f"\nP1: mean ratio (w3) over Re 1e5 to 2.1e5 ({len(mid)} runs): {np.mean(mid):.3f}  -> {'held' if np.mean(mid) > 1.1 else 'refuted'}")
    print("P2: ratio (w3) at Re <= 4.1e4: " + ", ".join(f"{r:.0f}: {v:.3f}" for r, v in sorted(low.items()))
          + f"  -> {'held' if all(v < 1.1 for v in low.values()) else 'refuted'}")
    spread = max(r3.values()) / min(r3.values()) - 1
    print(f"P3: max/min ratio (w3) over all {len(r3)} runs minus 1 = {spread * 100:.1f}%  -> {'held' if spread > 0.25 else 'refuted'}")


main()
