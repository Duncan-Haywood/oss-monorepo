"""Hourly on/off schedules for pump 10 against the one-window grid.   PYTHONPATH=src python experiments/run_hourly.py > experiments/results_hourly.txt

Stage 1 simulates every one- and two-run mask once (cached, tariff independent) in parallel; stage 2 picks the best per tariff;
stage 3 gives a local search and a GA a fixed budget of fresh EPANET runs per tariff and seed.
"""
import json
import os
import tempfile
import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from infra_pumpsched.hourly import Evaluator, feasible, genetic, local_search, runs_masks  # noqa: E402
from infra_pumpsched.sched import cost, simulate, tariff, total_kwh  # noqa: E402

CACHE = Path(__file__).resolve().with_name("masks_cache.json")
BUDGET = 600  # fresh EPANET runs per search per tariff
SEEDS = (0, 1, 2)


def _init():
    """EPANET writes temp.inp/.rpt/.bin in the working directory: give each worker its own so runs cannot overwrite each other."""
    os.chdir(tempfile.mkdtemp(prefix="pumpsched-"))


def _sim(m):
    from infra_pumpsched.sched import simulate_mask
    r = simulate_mask(m)
    return m, {"kwh": {p: v.tolist() for p, v in r["kwh"].items()}, **{k: v for k, v in r.items() if k != "kwh"}}


def load():
    if CACHE.exists():
        raw = json.loads(CACHE.read_text())
        return {tuple(map(bool, k)): {**v, "kwh": {p: np.array(a) for p, a in v["kwh"].items()}} for k, v in raw}
    masks = runs_masks()
    with Pool(initializer=_init) as pool:
        out = pool.map(_sim, masks, chunksize=20)
    CACHE.write_text(json.dumps([[list(m), r] for m, r in out]))
    return load()


def main():
    store = load()
    base = simulate(1, 14)
    print(f"== A. masks with at most two runs of on-hours simulated: {len(store)}; feasible {sum(feasible(r) for r in store.values())}")
    one_run = {m: r for m, r in store.items() if sum(m[i] != m[i - 1] for i in range(24)) <= 2}
    print(f"   of which one run (the earlier window grid, plus off): {len(one_run)}; feasible {sum(feasible(r) for r in one_run.values())}")

    def best(pool, pr):
        ks = [m for m, r in pool.items() if feasible(r)]
        m = min(ks, key=lambda m: cost(pool[m], pr))
        return m, cost(pool[m], pr)

    def fmt(m):
        runs, h = [], 0
        while h < 24:
            if m[h]:
                j = h
                while j < 24 and m[j]:
                    j += 1
                runs.append(f"{h:02d}-{j:02d}")
                h = j
            else:
                h += 1
        return " ".join(runs) or "off"

    print("\n== B. Best feasible schedule: one window vs two windows (exhaustive), cost as % of shipped cost")
    print("tariff | ratio | one-window cost % | best one window | two-window cost % | best two-run schedule | extra saving, % of shipped | pump-10 hours")
    rows = []
    for kind in ("flat", "evening", "daytime", "midday-cheap"):
        for ratio in ((1,) if kind == "flat" else (1.5, 3, 10)):
            pr = tariff(kind, ratio)
            c0 = cost(base, pr)
            m1, c1 = best(one_run, pr)
            m2, c2 = best(store, pr)
            rows.append((kind, ratio, c1 / c0, c2 / c0, m2))
            print(f"{kind} | {ratio} | {100 * c1 / c0:.1f} | {fmt(m1)} | {100 * c2 / c0:.1f} | {fmt(m2)} | {100 * (c1 - c2) / c0:.2f} | {sum(m2)}")

    print(f"\n== C. Free-form search over all 2^24 masks, {BUDGET} fresh EPANET runs each, {len(SEEDS)} seeds; cost as % of shipped cost")
    print("tariff | ratio | two-run optimum % | local search from best window: best/median/worst % | GA from random: best/median/worst % | GA beats two-run optimum in")
    summary = []
    for kind in ("flat", "evening", "daytime", "midday-cheap"):
        for ratio in ((1,) if kind == "flat" else (1.5, 3, 10)):
            pr = tariff(kind, ratio)
            c0 = cost(base, pr)
            m1, _ = best(one_run, pr)
            _, c2 = best(store, pr)
            ls, ga = [], []
            for s in SEEDS:
                ev = Evaluator()
                ls.append(local_search(ev, pr, m1, BUDGET, np.random.default_rng(s))[1] / c0)
                ev = Evaluator()
                ga.append(genetic(ev, pr, BUDGET, np.random.default_rng(100 + s))[1] / c0)
            ls, ga = np.array(ls), np.array(ga)
            n_better = int((ga < c2 / c0 - 1e-6).sum())
            print(f"{kind} | {ratio} | {100 * c2 / c0:.1f} | {100 * ls.min():.1f} / {100 * np.median(ls):.1f} / {100 * ls.max():.1f} | "
                  f"{100 * ga.min():.1f} / {100 * np.median(ga):.1f} / {100 * ga.max():.1f} | {n_better} of {len(SEEDS)}")
            summary.append((kind, ratio, c2 / c0, ls.min(), ga.min()))
    return summary


if __name__ == "__main__":
    main()
