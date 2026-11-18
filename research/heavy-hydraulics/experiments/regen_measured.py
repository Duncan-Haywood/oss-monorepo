"""Milestone 5g: rating needed to harvest MEASURED lowering strokes, against 5e's assumed shapes.

Data: PATU 655 forestry crane, 108 lab recordings, CC BY 4.0, Saeed, Zhidchenko, Handroos,
Mendeley Data doi:10.17632/rn5j42rpyr.1 (download: https://data.mendeley.com/public-api/zip/rn5j42rpyr/download/1,
~190 MB; unzip and pass the folder holding the 95KG/148KG/... directories).
Power proxy per stroke: PA1 (piston-side pressure) x |dS1/dt| during retraction (lowering). Cylinder
area is not in the files, so only area-free quantities are reported: peak/mean and the rating for
95% / 99% energy capture as a multiple of the stroke's own mean power (same quantity as 5e).
Needs numpy. Usage: python regen_measured.py <data dir>
"""
import glob, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from regen_peaky import rating_for

SMOOTH_S, V_MIN, T_MIN, DS_MIN = 0.5, 5.0, 0.3, 20.0

def strokes(path):
    d = np.genfromtxt(path, delimiter=",", names=True)
    t = (d["Timeepoch_ms"] - d["Timeepoch_ms"][0]) / 1e9
    dt = float(np.median(np.diff(t)))
    k = max(1, int(round(SMOOTH_S / dt)))
    box = np.ones(k) / k
    sm = lambda x: np.convolve(x, box, mode="same")
    s, pa = sm(d["S1mm"]), sm(d["PA1bar"])
    v = np.gradient(s, dt)
    low = v < -V_MIN
    out, i, n = [], 0, len(t)
    while i < n:
        if low[i]:
            j = i
            while j < n and low[j]: j += 1
            if (j - i) * dt >= T_MIN and s[i] - s[j - 1] >= DS_MIN:
                p = np.clip(pa[i:j], 0, None) * (-v[i:j])
                if p.mean() > 0: out.append(list(p / p.mean()))
            i = j
        else: i += 1
    return out

if __name__ == "__main__":
    root = sys.argv[1]
    rows = []
    for f in sorted(glob.glob(os.path.join(root, "*", "*.csv"))):
        kg = os.path.basename(os.path.dirname(f))
        for p in strokes(f):
            rows.append((kg, len(p), max(p), rating_for(p, .95), rating_for(p, .99)))
    print(f"strokes: {len(rows)} from {len(set(r[0] for r in rows))} payload folders")
    def summ(name, sel):
        a = np.array([r[2:] for r in sel])
        if not len(a): return
        q = lambda c: " / ".join(f"{np.percentile(a[:, c], x):.2f}" for x in (10, 50, 90))
        print(f"{name:8} n={len(a):4d}  peak/mean {q(0)}   95% rating {q(1)}   99% rating {q(2)}   (p10 / median / p90)")
    summ("all", rows)
    for kg in sorted(set(r[0] for r in rows)): summ(kg, [r for r in rows if r[0] == kg])
    print("5e assumed shapes: peak/mean 1.0 to 2.0; 95% rating 0.95 to 1.55; 99% rating 0.99 to 1.80")
