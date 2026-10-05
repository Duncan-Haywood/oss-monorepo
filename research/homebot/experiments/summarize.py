"""Collect every run's eval.json into results/rl_summary.json and print markdown tables.

    PYTHONPATH=src python experiments/summarize.py
"""
from __future__ import annotations

import csv
import os
import json
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
RUNS = Path(os.environ.get("RUNS_DIR", HERE / "runs"))


def load_runs():
    runs = []
    for p in sorted(RUNS.glob("*/eval.json")):
        d = json.loads(p.read_text())
        d["name"] = p.parent.name
        rows = list(csv.DictReader(open(p.parent / "progress.csv")))
        d["curve"] = [(int(r["time/total_timesteps"]), float(r["rollout/success_rate"] or 0)) for r in rows]
        runs.append(d)
    return runs


def regime(r) -> str:
    """'nominal', 'dr', or 'dr_<variant>' for a training-setting ablation."""
    base = "dr" if r["meta"]["dr"] else "nominal"
    v = r["meta"].get("variant", "")
    return f"{base}_{v}" if v else base


def group(runs, env, key):
    return [r for r in runs if r["meta"]["env"] == env and regime(r) == key]


def table(runs, env):
    gaps = list(next(r for r in runs if r["meta"]["env"] == env)["eval"].keys())
    out = {}
    keys = sorted({regime(r) for r in runs if r["meta"]["env"] == env}, key=lambda k: (k != "nominal", k))
    for key in keys:
        g = group(runs, env, key)
        out[key] = {}
        for gap in gaps:
            s = np.array([r["eval"][gap]["success_rate"] for r in g])
            dist = np.array([r["eval"][gap]["final_distance_median_m"] for r in g])
            out[key][gap] = {"seeds": len(g), "success_mean": float(s.mean()), "success_min": float(s.min()),
                             "success_max": float(s.max()), "median_dist_mm_mean": float(dist.mean() * 1000),
                             "tipped": int(sum(r["eval"][gap].get("tipped", 0) for r in g))}
            if "ever_lifted_5cm" in g[0]["eval"][gap]:
                out[key][gap]["ever_lifted_mean"] = float(np.mean([r["eval"][gap]["ever_lifted_5cm"] for r in g]))
    return out


def steps_to(curve, level=0.9):
    for steps, s in curve:
        if s >= level:
            return steps
    return None


def main():
    runs = load_runs()
    summary = {}
    for env in sorted({r["meta"]["env"] for r in runs}):
        summary[env] = {"table": table(runs, env)}
        summary[env]["wall_minutes"] = {r["name"]: r["meta"]["wall_minutes"] for r in runs if r["meta"]["env"] == env}
        summary[env]["steps_to_90pct_train_success"] = {r["name"]: steps_to(r["curve"]) for r in runs
                                                        if r["meta"]["env"] == env}
        cross = {r["name"]: r.get("cross_eval", {}) for r in runs if r["meta"]["env"] == env and r.get("cross_eval")}
        if cross:
            summary[env]["cross_eval"] = cross
        print(f"\n### {env}\n")
        t = summary[env]["table"]
        cols = list(t)
        print("| Twin | " + " | ".join(f"{c} success (mean, min-max over seeds)" for c in cols) + " |")
        print("|---|" + "---|" * len(cols))
        for gap in next(iter(t.values())):
            cells = []
            for c in cols:
                v = t[c][gap]
                cells.append(f"{v['success_mean']:.2f} ({v['success_min']:.2f}-{v['success_max']:.2f}), "
                             f"{v['median_dist_mm_mean']:.0f} mm" + (f", tipped {v['tipped']}" if v["tipped"] else ""))
            print(f"| {gap} | " + " | ".join(cells) + " |")
        for name, ce in cross.items():
            for env2, res in ce.items():
                for gap, v in res.items():
                    print(f"cross-eval {name} on {env2} [{gap}]: success {v['success_rate']:.2f} ± {v['success_ci95']:.2f}, "
                          f"median dist {v['final_distance_median_m'] * 1000:.0f} mm, tipped {v['tipped']}")
    out = HERE / "results"
    out.mkdir(exist_ok=True)
    (out / "rl_summary.json").write_text(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
