"""Where does the peak-stress price scatter of laser-cutting rules come from?

simdesign-filletfloor left open whether the scatter (price 0.990-1.145 over seeds 0-4 under the peak measure)
comes from the ten per-gauge sub-searches landing in different local optima. This script re-runs that search
(peak measure, floor 0.2 mm, search mesh h=2.5 mm, seeds 0-4, rules and no-rules steel-sheet twin) but keeps the best
feasible mass of every stock-gauge sub-search, at two search budgets: the base budget of ``optimise`` and a larger one.
Writes results.json and results.txt.
"""
import json, os, sys, time, statistics as st
from multiprocessing import Pool
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_gaugebudget import PROCESSES, FREE, evaluate
from simdesign_gaugebudget.optimise import _search

OUT = os.path.dirname(os.path.abspath(__file__))
SEEDS = (0, 1, 2, 3, 4)
H = 2.5
# (popsize, maxiter) of one per-gauge sub-search; "base" is what optimise() uses at its defaults (popsize 8, maxiter 25)
BUDGETS = {"base": (4, 17), "big": (8, 35)}
# the free twin has a continuous depth: one 3-variable search with optimise()'s defaults (base) or double popsize and iterations (big)
CONT_BUDGETS = {"base": (8, 25), "big": (16, 50)}
TWINS = {"rules": PROCESSES["laser cutting"], "free": FREE["steel sheet"]}


def task(t):
    twin, seed, budget, gauge = t
    proc = TWINS[twin]
    pop, it = BUDGETS[budget] if gauge is not None else CONT_BUDGETS[budget]
    t0 = time.time()
    p, n = _search(proc, gauge, seed, pop, it, H, "peak")
    e = evaluate(proc, p, h=H, measure="peak")
    return {"twin": twin, "seed": seed, "budget": budget, "gauge": gauge, "w": p.w, "r": p.r, "b": p.b,
            "feasible": bool(e["feasible"]), "mass_g": e["mass_g"], "n_fe": n, "wall_s": time.time() - t0}


def best(res, twin, seed, budget):
    c = [r for r in res if (r["twin"], r["seed"], r["budget"]) == (twin, seed, budget) and r["feasible"]]
    return min(c, key=lambda r: r["mass_g"]) if c else None


def summarise(res):
    L = [f"laser cutting rules vs steel-sheet free twin, peak measure, search mesh h={H} mm; seeds {SEEDS}; g, mm",
         f"sub-search budgets (popsize, maxiter) per gauge: {BUDGETS}; free twin (continuous depth, gauge None): {CONT_BUDGETS}"]
    for bud in BUDGETS:
        L.append(f"== budget {bud}")
        pr = []
        for s in SEEDS:
            ru, fr = best(res, "rules", s, bud), best(res, "free", s, bud)
            pr.append(ru["mass_g"] / fr["mass_g"])
            L.append(f"seed {s}: rules {ru['mass_g']:.2f} g (gauge {ru['gauge']}, w {ru['w']:.2f}, r {ru['r']:.2f}) | "
                     f"free {fr['mass_g']:.2f} g (depth {fr['b']:.2f}) | price {pr[-1]:.3f}")
        L.append(f"price mean {st.mean(pr):.3f} sd {st.stdev(pr):.3f} range {max(pr)-min(pr):.3f}")
        for twin in TWINS:
            gs = sorted({r["gauge"] for r in res if r["twin"] == twin}, key=lambda g: -1 if g is None else g)
            L.append(f"-- {twin}: best feasible mass per gauge by seed (min over seeds, max over seeds, number of seeds feasible)")
            for g in gs:
                m = [r["mass_g"] for r in res if (r["twin"], r["budget"], r["gauge"]) == (twin, bud, g) and r["feasible"]]
                L.append(f"gauge {g}: " + (f"{min(m):.2f} .. {max(m):.2f} g, {len(m)}/{len(SEEDS)} feasible, spread {max(m)-min(m):.2f} g" if m else "never feasible"))
    L.append("== base vs big budget, same seed (winning mass g)")
    for twin in TWINS:
        for s in SEEDS:
            a, b = best(res, twin, s, "base"), best(res, twin, s, "big")
            L.append(f"{twin} seed {s}: base {a['mass_g']:.2f} (gauge {a['gauge']}, b {a['b']:.2f}) -> big {b['mass_g']:.2f} (gauge {b['gauge']}, b {b['b']:.2f})")
    L.append(f"total wall time of tasks (s): {sum(r['wall_s'] for r in res):.0f}; function evaluations with FE: {sum(r['n_fe'] for r in res)}")
    return L


def main():
    gauges = {t: [g for g in TWINS[t].b_stock if g <= TWINS[t].b_max] or [None] for t in TWINS}
    tasks = [(t, s, b, g) for b in BUDGETS for t in TWINS for s in SEEDS for g in gauges[t]]
    with Pool(4) as pool:
        res = pool.map(task, tasks, chunksize=1)
    json.dump(res, open(os.path.join(OUT, "results.json"), "w"), indent=1)
    lines = summarise(res)
    open(os.path.join(OUT, "results.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
