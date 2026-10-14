"""Do the isolated feasible pockets in w move or vanish with mesh size? Scan w at fixed r (gauge 2 mm, rules,
peak von Mises) for h = 2.5, 2.0, 1.5 mm. Writes meshscan.txt and meshscan.json."""
import json, os, sys
from concurrent.futures import ProcessPoolExecutor
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from simdesign_pocketmesh import PROCESSES, Params, evaluate

OUT = os.path.dirname(os.path.abspath(__file__))
HS = (2.5, 2.0, 1.5)
RS = (8.0, 10.0, 12.0, 14.0)
WS = [round(float(w), 1) for w in np.arange(13.5, 16.51, 0.1)]


def one(args):
    h, r, w = args
    e = evaluate(PROCESSES["laser cutting"], Params(w=w, r=r, b=2.0), h=h, measure="peak")
    fe = e["fe"]
    return h, r, w, bool(e["feasible"]), (float(fe["peak_mpa"]) if fe else float("nan"))


if __name__ == "__main__":
    jobs = [(h, r, w) for h in HS for r in RS for w in WS]
    with ProcessPoolExecutor() as ex:
        res = list(ex.map(one, jobs, chunksize=4))
    data = {}
    for h, r, w, ok, vm in res:
        data.setdefault(f"{h}", {}).setdefault(f"{r}", {})[f"{w}"] = [ok, vm]
    L = ["laser cutting, gauge 2 mm, peak; feasible w (0.1 mm scan 13.5-16.5) per r and mesh size h"]
    for h in HS:
        for r in RS:
            ok = [w for w in WS if data[f"{h}"][f"{r}"][f"{w}"][0]]
            if ok:
                cont = len(ok) == round((max(ok) - min(ok)) / 0.1) + 1
                iso = [w for w in ok if w < 15.4]
                L.append(f"h={h} r={r:4.1f}: {len(ok)} feasible, contiguous={cont}, first={min(ok)}, below-15.4 pockets={iso}")
            else:
                L.append(f"h={h} r={r:4.1f}: none feasible")
    open(os.path.join(OUT, "meshscan.txt"), "w").write("\n".join(L) + "\n")
    json.dump(data, open(os.path.join(OUT, "meshscan.json"), "w"))
    print("\n".join(L))
