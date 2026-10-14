"""Do the isolated feasible pockets in w (gauge 2 mm, laser rules, peak stress) survive mesh refinement?
Scans w in 0.1 mm steps over 13.5-16.5 mm at fixed r, for h = 2.5, 2.0, 1.5 mm. Writes pockets.txt, pockets.json."""
import os, sys, json
import numpy as np
from multiprocessing import Pool
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from simdesign_gaugepockets import PROCESSES, Params, evaluate

OUT = os.path.dirname(os.path.abspath(__file__))
proc = PROCESSES["laser cutting"]
RS = (6.0, 8.0, 10.0, 12.0, 14.0)
HS = (2.5, 2.0, 1.5)
WS = [round(float(w), 1) for w in np.arange(13.5, 16.51, 0.1)]

def split_runs(ws):
    """Split sorted feasible w values (0.1 mm grid) into maximal contiguous runs; return (runs, top_run)."""
    runs = []
    for w in ws:
        if runs and round(w - runs[-1][-1], 1) <= 0.1:
            runs[-1].append(w)
        else:
            runs.append([w])
    return runs, (runs[-1] if runs else [])

def job(a):
    h, r, w = a
    e = evaluate(proc, Params(w=w, r=r, b=2.0), h=h, measure="peak")
    return h, r, w, bool(e["feasible"])

if __name__ == "__main__":
    with Pool() as p:
        res = p.map(job, [(h, r, w) for h in HS for r in RS for w in WS])
    feas = {(h, r): [w for hh, rr, w, f in res if hh == h and rr == r and f] for h in HS for r in RS}
    L = ["laser cutting, gauge 2 mm, peak stress; feasible w (mm) on a 0.1 mm scan of 13.5-16.5 at fixed r"]
    for h in HS:
        L.append(f"h = {h} mm")
        for r in RS:
            ok = feas[(h, r)]
            runs, top = split_runs(ok)
            iso = [x for x in runs[:-1]]
            L.append(f"  r={r:4.1f}: {len(ok)} feasible; {len(iso)} run(s) below the top run {top[0] if top else None}-{top[-1] if top else None}: {iso}")
    open(os.path.join(OUT, "pockets.txt"), "w").write("\n".join(L) + "\n")
    json.dump({f"{h}|{r}": v for (h, r), v in feas.items()}, open(os.path.join(OUT, "pockets.json"), "w"))
    print("\n".join(L))
