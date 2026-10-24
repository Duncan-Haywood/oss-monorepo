"""Electric fleet on Solomon RC208: route-first/charge-second against charge-aware local search.
   python experiments/run.py [seconds_per_search]    (runs configs in parallel; writes experiments/results.txt)"""
import json
import math
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from infra_routing.instance import kmeans_stations, read, with_ev  # noqa: E402
from infra_routing.search import Evaluator, improve, repair  # noqa: E402

SEEDS = (0, 1, 2)
# (label, battery range Q, recharge time per unit of range g, number of stations)
CONFIGS = ([("Q", q, 0.3, 5) for q in (400, 300, 200, 150, 100, 75)]
           + [("g", 150, g, 5) for g in (0.1, 1.0)]
           + [("k", 150, 0.3, k) for k in (2, 10)])


def one(args):
    label, Q, g, k, seed, seconds = args
    inst = with_ev(read(HERE.parent / "data" / "RC208.vrp"), Q, g, [])
    st = kmeans_stations(inst, k)
    inst = with_ev(inst, Q, g, st)
    base = json.loads((HERE.parent / "data" / "baseline_routes.json").read_text())["routes"]
    ev = Evaluator(inst)
    t0 = time.time()
    rep = repair(ev, base)
    if rep is None:
        return label, Q, g, k, seed, None
    first = (len(rep), ev.total(rep), time.time() - t0)
    routes, info = improve(ev, rep, seconds, seed)
    tot = ev.total(routes)
    ctime = sum(ev.cost(r)[1] for r in routes)
    return label, Q, g, k, seed, (first, (len(routes), tot, ctime), info, routes)


def main(seconds=40):
    inst0 = read(HERE.parent / "data" / "RC208.vrp")
    base = json.loads((HERE.parent / "data" / "baseline_routes.json").read_text())["routes"]
    free = Evaluator(inst0)
    lines = ["# infra-routing on Solomon RC208 (100 customers, capacity 1000, 10 per service)", ""]
    lines.append(f"A. Battery ignored (PyVRP, 60 s): {len(base)} routes, distance {free.total(base):.2f}")
    lines.append("")
    jobs = [(l, q, g, k, s, seconds) for (l, q, g, k) in CONFIGS for s in SEEDS]
    with ProcessPoolExecutor() as pool:
        res = list(pool.map(one, jobs))
    lines.append("B. Per config (best of 3 seeds of iterated local search). range Q | recharge g | stations | "
                 "route-first: routes / distance | after search: routes / distance / charge time | "
                 "distance penalty vs battery-ignored | perturbations | route evaluations")
    out = {}
    for (l, q, g, k, s, _), r in zip(jobs, res):
        out.setdefault((l, q, g, k), []).append(r[5])
    ref = free.total(base)
    for key, runs in out.items():
        l, q, g, k = key
        if runs[0] is None:
            lines.append(f"{l} | Q={q} | g={g} | k={k} | route-first has no feasible repair")
            continue
        first = runs[0][0]
        best = min(runs, key=lambda r: r[1][1])
        spread = [round(r[1][1], 1) for r in runs]
        lines.append(f"{l} | Q={q} | g={g} | k={k} | {first[0]} / {first[1]:.1f} | "
                     f"{best[1][0]} / {best[1][1]:.1f} / {best[1][2]:.1f} | "
                     f"{100 * (first[1] / ref - 1):.1f}% -> {100 * (best[1][1] / ref - 1):.1f}% | "
                     f"{best[2]['kicks']} kicks | {best[2]['evals']} | seeds {spread}")
    (HERE / "results.txt").write_text("\n".join(lines) + "\n")
    (HERE / "solutions.json").write_text(json.dumps(
        {f"Q={k[1]},g={k[2]},k={k[3]}": min(v, key=lambda r: r[1][1])[3] if v[0] else None
         for k, v in out.items()}))
    print("\n".join(lines))


if __name__ == "__main__":
    main(*[float(a) for a in sys.argv[1:]])
