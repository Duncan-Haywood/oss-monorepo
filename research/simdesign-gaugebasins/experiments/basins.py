"""Where in (w, r) do the two gauge-2 mass groups sit? Rules (laser cutting) and free steel sheet, seeds 0-19.

Gauge b=2 mm, peak von Mises on the search mesh h=2.5 mm. Runs the `base` (popsize 4) and `bigpop` (popsize 8)
searches of simdesign-gaugerestart, records the final (w, r), then evaluates a 21x21 grid over the bounds to map
the feasible set and its mass. Writes basins.json and basins.txt.
"""
import json, os, statistics as st, sys
from multiprocessing import Pool
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from simdesign_gaugebasins import PROCESSES, FREE, Params, evaluate
from simdesign_gaugebasins.optimise import _search, BOUNDS

OUT = os.path.dirname(os.path.abspath(__file__))
H, B, MAXITER, SPLIT = 2.5, 2, 17, 34.65
KINDS = {"rules": PROCESSES["laser cutting"], "free": FREE["steel sheet"]}
SEEDS = range(20)
NG = 21


def run(t):
    kind, variant, seed = t
    proc = KINDS[kind]
    p, n = _search(proc, B, seed, 4 if variant == "base" else 8, MAXITER, H, "peak")
    e = evaluate(proc, p, h=H, measure="peak")
    return {"kind": kind, "variant": variant, "seed": seed, "w": p.w, "r": p.r,
            "mass_g": e["mass_g"] if e["feasible"] else None, "n_fe": n}


def grid_pt(t):
    kind, i, j = t
    w = np.linspace(*BOUNDS["w"], NG)[i]
    r = np.linspace(*BOUNDS["r"], NG)[j]
    e = evaluate(KINDS[kind], Params(w=float(w), r=float(r), b=float(B)), h=H, measure="peak")
    return {"kind": kind, "w": float(w), "r": float(r), "feasible": bool(e["feasible"]), "mass_g": e["mass_g"]}


def summarise(res, grid):
    L = [f"gauge b={B} mm, peak measure, h={H} mm; bounds w {BOUNDS['w']}, r {BOUNDS['r']}; lower group < {SPLIT} g"]
    for v in ("base", "bigpop"):
        for k in KINDS:
            r = [x for x in res if x["kind"] == k and x["variant"] == v and x["mass_g"] is not None]
            for name, grp in (("lower", [x for x in r if x["mass_g"] < SPLIT]), ("upper", [x for x in r if x["mass_g"] >= SPLIT])):
                if grp:
                    ws, rs, ms = [x["w"] for x in grp], [x["r"] for x in grp], [x["mass_g"] for x in grp]
                    L.append(f"{v:6s} {k:5s} {name}: n={len(grp):2d} w {min(ws):.2f}-{max(ws):.2f} r {min(rs):.2f}-{max(rs):.2f} mass {min(ms):.2f}-{max(ms):.2f}")
    for k in KINDS:
        g = [x for x in grid if x["kind"] == k]
        f = [x for x in g if x["feasible"]]
        L.append(f"grid {k}: {len(f)} of {len(g)} points feasible" + (f"; min mass {min(x['mass_g'] for x in f):.2f} g" if f else ""))
        # connected components of the feasible set on the grid (4-neighbour)
        feas = {(round(x["w"], 6), round(x["r"], 6)) for x in f}
        ws = [round(float(a), 6) for a in np.linspace(*BOUNDS["w"], NG)]
        rs = [round(float(a), 6) for a in np.linspace(*BOUNDS["r"], NG)]
        seen, comps = set(), []
        for i, a in enumerate(ws):
            for j, b in enumerate(rs):
                if (a, b) in feas and (a, b) not in seen:
                    stack, comp = [(i, j)], []
                    seen.add((a, b))
                    while stack:
                        ii, jj = stack.pop()
                        comp.append((ws[ii], rs[jj]))
                        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                            ni, nj = ii + di, jj + dj
                            if 0 <= ni < NG and 0 <= nj < NG and (ws[ni], rs[nj]) in feas and (ws[ni], rs[nj]) not in seen:
                                seen.add((ws[ni], rs[nj])); stack.append((ni, nj))
                    comps.append(comp)
        L.append(f"grid {k}: {len(comps)} connected feasible component(s), sizes {sorted(len(c) for c in comps)}")
    return L


def main():
    tasks = [(k, v, s) for v in ("base", "bigpop") for k in KINDS for s in SEEDS]
    gtasks = [(k, i, j) for k in KINDS for i in range(NG) for j in range(NG)]
    with Pool(4) as pool:
        res = pool.map(run, tasks, chunksize=1)
        grid = pool.map(grid_pt, gtasks, chunksize=4)
    json.dump({"runs": res, "grid": grid}, open(os.path.join(OUT, "basins.json"), "w"), indent=1)
    L = summarise(res, grid)
    open(os.path.join(OUT, "basins.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
