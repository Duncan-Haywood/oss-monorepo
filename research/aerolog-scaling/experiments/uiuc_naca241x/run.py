"""Milestone 8d: NeuralFoil against measured UIUC NACA 2414 and 2415 lift slopes at Re 6e4 to 3e5.

    python3 experiments/uiuc_naca241x/run.py > experiments/uiuc_naca241x/results.txt

Data: Selig, Lyon, Giguere, Ninham, Guglielmo, "Summary of Low-Speed Airfoil Data, Vol. 2" (1996), file
LIFT02.TXT, airfoils "NACA 2414" and "NACA 2415" (D. Imes; 2415 comment "clean"). Fetched at run time and
cached outside the tree (the data are GPL-licensed, so the raw file is not committed). These are the 14 to 15%
thick sections nearest the headline tail's NACA 0015 that the series holds at Re bracketing the tail's 1.5e5.
They are cambered, so the slope is fitted in a window centred on the measured zero-lift angle, the same window
for NeuralFoil. Same call as 8c: xxxlarge, n_crit 9.
"""
import os
import urllib.request
import numpy as np
import aerosandbox as asb
import neuralfoil as nf

URL = "https://m-selig.ae.illinois.edu/pd/pub/lsat/volume02/LIFT02.TXT"
CACHE = os.environ.get("UIUC_CACHE2", "/tmp/LIFT02.TXT")
HALF = (2.0, 3.0, 4.0)


def load(name):
    if not os.path.exists(CACHE):
        urllib.request.urlretrieve(URL, CACHE)
    lines = open(CACHE, errors="replace").read().splitlines()
    i = next(j for j, l in enumerate(lines) if l.strip() == f"Airfoil: {name}")
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


def fit(al, cl, a0, half):
    m = np.abs(al - a0) <= half
    s, b = np.polyfit(al[m], cl[m], 1)
    return s * 180 / np.pi, -b / s


def nf_cl(code, re, al):
    r = nf.get_aero_from_airfoil(asb.Airfoil(code), alpha=al, Re=re, model_size="xxxlarge", n_crit=9)
    return np.asarray(r["CL"])


def main():
    print("Section lift slope a0 (per rad), UIUC LSAT Vol. 2 vs NeuralFoil xxxlarge n_crit 9; window = measured zero-lift angle +- w deg")
    print(f"thin-airfoil value 2 pi = {2 * np.pi:.3f}\n")
    rat = {}
    for name in ("NACA 2414", "NACA 2415"):
        code = name.replace(" ", "").lower()
        print(name)
        print(f"{'Re':>8} {'a0L UIUC':>9} {'a0L NF':>7} " + " ".join(f"{'UIUC w'+str(int(w)):>9} {'NF w'+str(int(w)):>7} {'ratio':>6}" for w in HALF))
        for re, d in load(name):
            al, cl = d[:, 0], d[:, 1]
            _, z = fit(al, cl, 0.0, 6.0)
            row = f"{re:8.0f} {z:9.2f} "
            nfz = fit(np.arange(-6, 6.01, .25), nf_cl(code, re, np.arange(-6, 6.01, .25)), 0.0, 6.0)[1]
            row += f"{nfz:7.2f} "
            for w in HALF:
                au, _ = fit(al, cl, z, w)
                g = np.arange(z - w, z + w + 0.01, 0.25)
                an, _ = fit(g, nf_cl(code, re, g), z, w)
                rat[(name, re, w)] = an / au
                row += f"{au:9.3f} {an:7.3f} {an / au:6.3f} "
            print(row)
        print()
    tail = [(k, v) for k, v in rat.items() if k[1] in (101100, 100900, 201700, 201800)]
    print("ratio NF/UIUC at the two Re bracketing the tail's 1.5e5 (about 1e5 and 2e5), all windows:")
    print(f"min {min(v for _, v in tail):.3f}  max {max(v for _, v in tail):.3f}  mean {np.mean([v for _, v in tail]):.3f}")
    print("tail Re 150,045 lies between; short-period error at tail slope x 0.8..1.2 is in uiuc_tail_slope/results.txt")


main()
