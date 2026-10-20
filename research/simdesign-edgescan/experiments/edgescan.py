"""Locate the feasible edge of the web width w to 0.1 mm (gauge 2 mm, laser cutting, peak von Mises, slenderness
limit relaxed to 12.5) on three meshes and three radii. Writes edgescan.txt and edgescan.json."""
import json, os, sys
from concurrent.futures import ProcessPoolExecutor
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from simdesign_edgescan import PROCESSES, Params, evaluate
from simdesign_edgescan import dfm

OUT = os.path.dirname(os.path.abspath(__file__))
HS = (1.5, 1.0, 0.75)
RS = (8.0, 12.0, 14.0)
WS = [round(float(w), 1) for w in np.arange(15.5, 17.51, 0.1)]
SLENDER = 12.5


def one(args):
    h, r, w = args
    dfm.MAX_SLENDER = SLENDER
    e = evaluate(PROCESSES["laser cutting"], Params(w=w, r=r, b=2.0), h=h, measure="peak")
    fe = e["fe"]
    return h, r, w, bool(e["feasible"]), (float(fe["peak_mpa"]) if fe else float("nan")), float(e["mass_g"])


def edge(row):
    """Smallest w such that it and every scanned w above it are feasible; None if the top is infeasible."""
    ok = None
    for w in reversed(WS):
        if row[f"{w}"][0]:
            ok = w
        else:
            break
    return ok


if __name__ == "__main__":
    jobs = [(h, r, w) for h in HS for r in RS for w in WS]
    with ProcessPoolExecutor() as ex:
        res = list(ex.map(one, jobs, chunksize=2))
    data = {}
    for h, r, w, ok, vm, m in res:
        data.setdefault(f"{h}", {}).setdefault(f"{r}", {})[f"{w}"] = [ok, vm, m]
    L = [f"laser cutting, gauge 2 mm, peak, slenderness limit {SLENDER}; w {WS[0]}-{WS[-1]} mm step 0.1"]
    for h in HS:
        for r in RS:
            row = data[f"{h}"][f"{r}"]
            e = edge(row)
            nonmono = [w for i, w in enumerate(WS[:-1]) if row[f"{w}"][1] < row[f"{WS[i+1]}"][1]]
            if e is None:
                L.append(f"h={h} r={r:4.1f}: no feasible edge in scan")
            else:
                L.append(f"h={h} r={r:4.1f}: edge w={e} (peak {row[f'{e}'][1]:.2f} MPa, {row[f'{e}'][2]:.2f} g); "
                         f"peak just below edge {row[f'{round(e-0.1,1)}'][1]:.2f} MPa" if f"{round(e-0.1,1)}" in row else
                         f"h={h} r={r:4.1f}: edge w={e} is the bottom of the scan")
            L.append(f"    peak not decreasing in w at: {nonmono}")
    open(os.path.join(OUT, "edgescan.txt"), "w").write("\n".join(L) + "\n")
    json.dump(data, open(os.path.join(OUT, "edgescan.json"), "w"))
    print("\n".join(L))
