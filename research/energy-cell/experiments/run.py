"""Run the search comparison. Usage (from research/energy-cell, with PyBaMM installed):
  PYTHONPATH=src python experiments/run.py auto      # random + Bayesian, 5 seeds x 30 evals (~10 min on 4 cores) -> auto.json
  PYTHONPATH=src python experiments/run.py session   # evaluates proposals/round*.json (the session agent) -> session.json
  PYTHONPATH=src python experiments/run.py report    # writes results.txt from auto.json + session.json
"""
import json
import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np

from energy_cell import evaluate, random_search, bayes_search, replay, BASELINE, NAMES

HERE = Path(__file__).resolve().parent
BUDGET, SEEDS = 30, range(5)


def f(x):
    return evaluate(x)["score"]


def one(job):
    method, seed = job
    run = (random_search if method == "random" else bayes_search)(f, BUDGET, seed)
    return method, seed, [(list(map(float, x)), float(s)) for x, s in run]


def auto():
    jobs = [(m, s) for m in ("random", "bayes") for s in SEEDS]
    with Pool(4) as p:
        res = p.map(one, jobs, chunksize=1)
    (HERE / "auto.json").write_text(json.dumps([{"method": m, "seed": s, "trace": t} for m, s, t in res]))


def session():
    props = []
    for p in sorted((HERE / "proposals").glob("round*.json")):
        props += json.loads(p.read_text())
    with Pool(4) as pool:
        full = pool.map(evaluate, props)
    out = [{"x": list(map(float, np.clip(x, 0, None))), **{k: float(v) for k, v in r.items()}} for x, r in zip(props, full)]
    (HERE / "session.json").write_text(json.dumps(out))


def best_curve(trace):
    return np.maximum.accumulate([s for _, s in trace])


def report():
    auto_runs = json.loads((HERE / "auto.json").read_text())
    ses = json.loads((HERE / "session.json").read_text())
    base = evaluate(BASELINE)
    lines = [f"Baseline (OKane2022 cell, 75.6 um, as given): {base['score']:.1f} Wh/kg at cycle 100, "
             f"{base['wh_kg_bol']:.1f} at cycle 2, retention {base['retention']:.3f}, stack mass {base['mass_kg']*1000:.1f} g", ""]
    lines.append("A. Best score so far (Wh/kg at cycle 100) after n evaluations, mean [min-max] over 5 seeds; session is one run")
    lines.append(f"{'n':>4} {'random':>22} {'bayes':>22} {'session':>9}")
    curves = {m: np.array([best_curve(r["trace"]) for r in auto_runs if r["method"] == m]) for m in ("random", "bayes")}
    sc = np.maximum.accumulate([r["score"] for r in ses])
    for n in (5, 10, 15, 20, 25, 30):
        cell = lambda c: f"{c[:, n-1].mean():7.1f} [{c[:, n-1].min():5.1f}-{c[:, n-1].max():5.1f}]"
        lines.append(f"{n:>4} {cell(curves['random']):>22} {cell(curves['bayes']):>22} {sc[n-1]:9.1f}")
    lines += ["", "B. Best design found by each method (best seed for random and bayes)"]
    lines.append(f"{'method':>8} " + " ".join(f"{n:>17}" for n in NAMES) + f" {'Wh/kg end':>10}")
    for m in ("random", "bayes"):
        runs = [r for r in auto_runs if r["method"] == m]
        x, s = max((p for r in runs for p in r["trace"]), key=lambda p: p[1])
        lines.append(f"{m:>8} " + " ".join(f"{v:17.3f}" for v in x) + f" {s:10.1f}")
    b = max(ses, key=lambda r: r["score"])
    lines.append(f"{'session':>8} " + " ".join(f"{v:17.3f}" for v in b["x"]) + f" {b['score']:10.1f}")
    lines += ["", "C. Detail of each method's best design",
              f"   session best: {b['wh_kg_bol']:.1f} Wh/kg at cycle 2, {b['wh_kg_end']:.1f} at cycle 100, retention {b['retention']:.3f}, mass {b['mass_kg']*1000:.1f} g"]
    allev = [s for r in auto_runs for _, s in r["trace"]]
    lines.append(f"   failed or non-cycling evaluations (score 0): random+bayes {sum(s == 0 for s in allev)} of {len(allev)}, session {sum(r['score'] == 0 for r in ses)} of {len(ses)}")
    lines += ["", "D. Session proposals in order (Wh/kg at cycle 100)"]
    for i, r in enumerate(ses, 1):
        lines.append(f"{i:>3} " + " ".join(f"{v:7.3f}" for v in r["x"]) + f"  {r['score']:7.1f}  retention {r['retention']:.3f}")
    (HERE / "results.txt").write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    {"auto": auto, "session": session, "report": report}[sys.argv[1]]()
