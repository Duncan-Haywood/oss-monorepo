"""What causes the peak-stress price scatter of laser cutting? Per-gauge sub-searches against a dense grid.

Laser cutting (steel sheet, ten stock gauges), peak von Mises stress on the search mesh h=2.5 mm, rules floor
r_min=0.2 mm, and the no-rules steel-sheet twin. For every gauge b:
  A. the differential-evolution sub-search that `optimise` runs (same settings), seeds 0-4;
  B. a dense deterministic 30 x 30 grid over (w, r) at that gauge: the least mass of any feasible grid cell.
The per-gauge prices (rules / free) and the winning gauge per seed are compared with the grid.
Writes results.json and results.txt.
"""
import json, os, sys, time
from dataclasses import replace
from multiprocessing import Pool
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_gaugescatter import PROCESSES, FREE, evaluate, Params
from simdesign_gaugescatter.optimise import _search
from simdesign_gaugescatter.dfm import BOUNDS

OUT = os.path.dirname(os.path.abspath(__file__))
SEEDS = (0, 1, 2, 3, 4)
H = 2.5
NG = 30
LASER = PROCESSES["laser cutting"]
GAUGES = LASER.b_stock
KINDS = {"rules": LASER, "free": FREE["steel sheet"]}
POPSIZE, MAXITER = 4, 25 // 2 + 5   # the per-gauge settings inside optimise()


def sub_search(t):
    kind, seed, b = t
    proc = KINDS[kind]
    p, n = _search(proc, b, seed, POPSIZE, MAXITER, H, "peak")
    e = evaluate(proc, p, h=H, measure="peak")
    return {"part": "A", "kind": kind, "seed": seed, "b": b, "w": p.w, "r": p.r, "feasible": bool(e["feasible"]),
            "mass_g": e["mass_g"] if e["feasible"] else None, "n_fe": n}


def grid(t):
    kind, b = t
    proc = KINDS[kind]
    ws = np.linspace(*BOUNDS["w"], NG)
    rs = np.linspace(*BOUNDS["r"], NG)
    cells = []
    for w in ws:
        for r in rs:
            e = evaluate(proc, Params(w=float(w), r=float(r), b=float(b)), h=H, measure="peak")
            cells.append((float(w), float(r), e["mass_g"] if e["feasible"] else None))
    feas = [c for c in cells if c[2] is not None]
    best = min(feas, key=lambda c: c[2]) if feas else None
    return {"part": "B", "kind": kind, "b": b, "n_feasible": len(feas), "n_cells": len(cells),
            "best": best, "masses": [c[2] for c in cells]}


def run(t):
    return sub_search(t) if t[0] in KINDS and len(t) == 3 else grid(t)


def summarise(res):
    import statistics as st
    L = [f"laser cutting vs free steel sheet, peak measure, search mesh h={H} mm, {NG}x{NG} grid; seeds {SEEDS}; mm, g"]
    A = {(r["kind"], r["seed"], r["b"]): r for r in res if r["part"] == "A"}
    B = {(r["kind"], r["b"]): r for r in res if r["part"] == "B"}
    L.append("B. grid optimum per gauge (g) [rules | free | price]")
    gp = {}
    for b in GAUGES:
        ru, fr = B[("rules", b)]["best"], B[("free", b)]["best"]
        pr = ru[2] / fr[2] if ru and fr else None
        gp[b] = pr
        L.append(f"  b={b}: " + (f"{ru[2]:.2f} (w={ru[0]:.1f}, r={ru[1]:.1f})" if ru else "infeasible") + " | "
                  + (f"{fr[2]:.2f} (w={fr[0]:.1f}, r={fr[1]:.1f})" if fr else "infeasible") + " | "
                  + (f"{pr:.3f}" if pr else "-")
                  + f" | feasible cells {B[('rules', b)]['n_feasible']}/{B[('free', b)]['n_feasible']} of {NG*NG}")
    gridbest = {k: min(B[(k, b)]["best"][2] for b in GAUGES if B[(k, b)]["best"]) for k in KINDS}
    gridb = {k: min((b for b in GAUGES if B[(k, b)]["best"]), key=lambda b: B[(k, b)]["best"][2]) for k in KINDS}
    L.append(f"grid winner overall: rules {gridbest['rules']:.2f} g at b={gridb['rules']}; free {gridbest['free']:.2f} g at b={gridb['free']}; "
             f"grid price {gridbest['rules']/gridbest['free']:.3f}")
    L.append("A. DE sub-search mass minus grid optimum for the same gauge (g) [kind seed: by gauge]")
    gaps = []
    for k in KINDS:
        for s in SEEDS:
            row = []
            for b in GAUGES:
                a, g = A[(k, s, b)], B[(k, b)]["best"]
                if a["mass_g"] is not None and g:
                    gaps.append(a["mass_g"] - g[2]); row.append(f"{a['mass_g']-g[2]:+.2f}")
                else:
                    row.append("inf" if a["mass_g"] is None else "n/a")
            L.append(f"  {k} seed {s}: " + " ".join(row))
    if gaps:
        L.append(f"gap summary over feasible sub-searches: n={len(gaps)}, mean {st.mean(gaps):+.2f}, min {min(gaps):+.2f}, max {max(gaps):+.2f}")
    L.append("A. best-over-gauges DE result per seed (g), winning gauge, and price")
    prices = []
    for s in SEEDS:
        out = {}
        for k in KINDS:
            c = [(A[(k, s, b)]["mass_g"], b) for b in GAUGES if A[(k, s, b)]["mass_g"] is not None]
            out[k] = min(c) if c else None
        if out["rules"] and out["free"]:
            pr = out["rules"][0] / out["free"][0]; prices.append(pr)
            L.append(f"  seed {s}: rules {out['rules'][0]:.2f} g (b={out['rules'][1]}), free {out['free'][0]:.2f} g (b={out['free'][1]}), price {pr:.3f}")
    if len(prices) > 1:
        L.append(f"DE price: mean {st.mean(prices):.3f}, sd {st.stdev(prices):.3f}, range {max(prices)-min(prices):.3f}")
    L.append("A. per-gauge DE price (rules/free, same seed and gauge): " + "; ".join(
        f"b={b}: " + " ".join(f"{A[('rules', s, b)]['mass_g']/A[('free', s, b)]['mass_g']:.3f}" for s in SEEDS
                              if A[('rules', s, b)]['mass_g'] and A[('free', s, b)]['mass_g']) for b in GAUGES))
    L.append(f"total wall time of tasks (s): {sum(r.get('wall_s', 0) for r in res):.0f}")
    return L


def timed(t):
    t0 = time.time()
    r = run(t)
    r["wall_s"] = time.time() - t0
    return r


def main():
    tasks = [(k, b) for k in KINDS for b in GAUGES] + [(k, s, b) for k in KINDS for s in SEEDS for b in GAUGES]
    with Pool(4) as pool:
        res = pool.map(timed, tasks, chunksize=1)
    for r in res:
        r.pop("masses", None) if r["part"] == "B" and "--keep-masses" not in sys.argv else None
    json.dump(res, open(os.path.join(OUT, "results.json"), "w"), indent=1)
    lines = summarise(res)
    open(os.path.join(OUT, "results.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
