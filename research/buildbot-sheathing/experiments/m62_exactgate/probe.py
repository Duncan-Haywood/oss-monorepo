"""Milestone 62 development probe (seed 61's directions, not held out): L_any against milestone 61's L_p and balance
limit for every pose and direction, from milestone 61's results.json. Writes probe.json; prints a summary."""
import os as _os
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    _os.environ.setdefault(_v, "1")
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gate as G  # noqa: E402

R61 = json.load(open(os.path.join(HERE, "..", "m61_lastfour", "results.json")))
PH = [p for _, p in R61["loads"]]


def task(kk):
    key = tuple([kk[0]] + kk[1:])
    G.C.setup(key[0])
    s = str(list(key))
    return s, [G.lany(key, math.radians(p), lp, lim) for p, lp, lim in zip(PH, R61["lp"][s], R61["limits"][s])]


if __name__ == "__main__":
    t0 = time.time()
    keys = [json.loads(s.replace("'", '"')) for s in R61["limits"]]
    with G.M1.mp.get_context("fork").Pool(int(os.environ.get("M62_PROCS", "4"))) as pool:
        res = dict(pool.map(task, keys, chunksize=1))
    json.dump(res, open(os.path.join(HERE, "probe.json"), "w"), separators=(",", ":"))
    for n in ("g1", "h1"):
        gp, ga, above, none, ev = [], [], 0, 0, 0
        for s, v in res.items():
            if f"'{n}'" not in s:
                continue
            for x, lp, lim in zip(v, R61["lp"][s], R61["limits"][s]):
                if x is None:
                    continue
                ev += x["ev"]
                above += bool(x["above"])
                if x["L"] is None:
                    none += 1
                    continue
                gp.append(lim - lp)
                ga.append(lim - x["L"])
        print(f"{n}: pairs {len(gp) + none}; L_any none {none}; ok above a binding balance limit + 0.5 N {above}; "
              f"pose-side gap > 0.01: {sum(g > 0.01 for g in gp)} (max {max(gp):.2f}); "
              f"any-side gap > 0.01: {sum(g > 0.01 for g in ga)} (max {max(ga):.2f}); > 0.5: {sum(g > 0.5 for g in ga)}; "
              f"evaluations {ev}")
    print(f"run time {time.time() - t0:.0f} s")
