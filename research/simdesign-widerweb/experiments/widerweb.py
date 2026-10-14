"""Relax the slenderness rule (w/b <= 8) and scan wider webs at fine meshes (gauge 2 mm, laser cutting, peak
von Mises). Writes widerweb.txt and widerweb.json."""
import json, os, sys
from concurrent.futures import ProcessPoolExecutor
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from simdesign_widerweb import PROCESSES, Params, evaluate
from simdesign_widerweb import dfm

OUT = os.path.dirname(os.path.abspath(__file__))
HS = (1.5, 1.0, 0.75)
RS = (8.0, 12.0, 14.0)
WS = [round(float(w), 1) for w in np.arange(15.0, 20.01, 0.5)]
SLENDER = 12.5   # relaxed from 8 so that w up to 25 mm is not cut by the rule at b = 2 mm


def one(args):
    h, r, w = args
    dfm.MAX_SLENDER = SLENDER
    e = evaluate(PROCESSES["laser cutting"], Params(w=w, r=r, b=2.0), h=h, measure="peak")
    fe = e["fe"]
    return h, r, w, bool(e["feasible"]), (float(fe["peak_mpa"]) if fe else float("nan")), float(e["mass_g"]), \
        (float(fe["tip_deflection_mm"]) if fe else float("nan"))


if __name__ == "__main__":
    jobs = [(h, r, w) for h in HS for r in RS for w in WS]
    with ProcessPoolExecutor() as ex:
        res = list(ex.map(one, jobs, chunksize=2))
    data = {}
    for h, r, w, ok, vm, m, tip in res:
        data.setdefault(f"{h}", {}).setdefault(f"{r}", {})[f"{w}"] = [ok, vm, m, tip]
    L = [f"laser cutting, gauge 2 mm, peak, slenderness limit {SLENDER}; w 15-20 mm step 0.5"]
    for h in HS:
        for r in RS:
            row = data[f"{h}"][f"{r}"]
            ok = [w for w in WS if row[f"{w}"][0]]
            best = min(ok, key=lambda w: row[f"{w}"][2]) if ok else None
            lo = min(WS, key=lambda w: row[f"{w}"][1])
            L.append(f"h={h} r={r:4.1f}: feasible w={ok}; lightest={best} ({row[f'{best}'][2]:.1f} g)" if ok else
                     f"h={h} r={r:4.1f}: none feasible")
            L.append(f"    lowest peak {row[f'{lo}'][1]:.1f} MPa at w={lo}; tip at that w {row[f'{lo}'][3]:.2f} mm")
    open(os.path.join(OUT, "widerweb.txt"), "w").write("\n".join(L) + "\n")
    json.dump(data, open(os.path.join(OUT, "widerweb.json"), "w"))
    print("\n".join(L))
