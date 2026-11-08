"""Does a collapse reset give secular cycles of visible amplitude? Writes collapse_results.txt.

    PYTHONPATH=src python3 experiments/history/run_collapse.py
"""
import itertools, sys
import numpy as np
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from civ_levers.history import run, summary  # noqa: E402

GRID = dict(rho=(0.03, 0.06, 0.12), m=(0.02, 0.05), k=(4, 8), g=(2.0, 4.0, 8.0, 16.0),
            lag=(0, 50, 100, 200), collapse_thr=(0.1, 0.3, 0.5))
LEVERS = {"none": {}, "elite_cap": {"elite_cap": 0.06}, "welfare": {"welfare": 0.2}}
keys = list(GRID)
cells = [dict(zip(keys, v)) for v in itertools.product(*GRID.values())]
rows = []
for name, lev in LEVERS.items():
    for c in cells:
        res = run(years=2500, e0f=0.05, me=0.04, tau=0.3, plag=c["lag"], **c, **lev)
        s = summary(*res)
        col = [x for x in run.collapses if x >= 500]
        s["ncol"] = len(col)
        s["iv"] = float(np.median(np.diff(col))) if len(col) >= 3 else 0.0
        rows.append((name, c, s))
out = ["civ-history collapse results (run_collapse.py; do not edit by hand)",
       f"{len(cells)} cells x {len(LEVERS)} levers; 2500 years, first 500 dropped; band 150-400 y; grid {GRID}; levers {LEVERS}", ""]
for name in LEVERS:
    rs = [(c, r) for n, c, r in rows if n == name]
    band = sum(1 for c, r in rs if 150 <= r["period"] <= 400)
    big = sum(1 for c, r in rs if r["n_cv"] >= 0.10)
    both = sum(1 for c, r in rs if 150 <= r["period"] <= 400 and r["n_cv"] >= 0.10)
    real = sum(1 for c, r in rs if 150 <= r["period"] <= 400 and r["n_cv"] >= 0.10 and 150 <= r["iv"] <= 400)
    floor = sum(1 for c, r in rs if 150 <= r["period"] <= 400 and r["n_cv"] >= 0.10 and r["iv"] < 100)
    out.append(f"lever {name:9s}: both-cells with median collapse interval 150-400 y: {real}; pinned near the 50 y refractory floor (<100 y): {floor}")
    col = [r["ncol"] for c, r in rs if r["ncol"]]
    out.append(f"lever {name:9s}: cells {len(rs)}, in-band {band}, swing>=0.10 {big}, both {both}, "
               f"max swing {max(r['n_cv'] for c, r in rs):.3f}, cells with collapses {len(col)}, "
               f"mean collapses (those) {sum(col) / max(len(col), 1):.2f}")
out.append("")
for name, c, r in rows:
    if name == "none" and 150 <= r["period"] <= 400 and r["n_cv"] >= 0.10:
        out.append(f"both {c} period {r['period']} swing {r['n_cv']:.3f} collapses {r['ncol']} median interval {r['iv']:.0f}")
(HERE / "collapse_results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out[:6]))
