"""Does lagged elite recruitment / lagged stress produce secular cycles? Writes lag_results.txt.

    PYTHONPATH=src python3 experiments/history/run_lag.py
"""
import itertools, sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from civ_levers.history import run, summary  # noqa: E402

GRID = dict(rho=(0.03, 0.06, 0.12), m=(0.02, 0.05, 0.1), k=(4, 16), g=(0.5, 1.0, 2.0),
            lag=(0, 25, 50, 100, 200), plag=(0, 25, 50, 100, 200))
keys = list(GRID)
cells = [dict(zip(keys, v)) for v in itertools.product(*GRID.values())]
rows = [(c, summary(*run(years=2500, e0f=0.05, me=0.04, tau=0.3, **c))) for c in cells]
out = ["civ-history lag results (run_lag.py; do not edit by hand)",
       f"{len(cells)} cells; 2500 years, first 500 dropped; band 150-400 y; grid {GRID}", ""]
for lag, plag in itertools.product(GRID["lag"], GRID["plag"]):
    rs = [r for c, r in rows if c["lag"] == lag and c["plag"] == plag]
    cyc = sum(1 for r in rs if r["period"]); band = sum(1 for r in rs if 150 <= r["period"] <= 400)
    sw = max(r["n_cv"] for r in rs)
    out.append(f"lag {lag:3d} plag {plag:3d}: cycles {cyc:2d}/{len(rs)} in-band {band:2d} max swing {sw:.4f}")
out.append("")
for c, r in rows:
    if 150 <= r["period"] <= 400:
        out.append(f"in-band {c} period {r['period']} swing {r['n_cv']:.3f} unrest {r['unrest_share']:.2f}")
(HERE / "lag_results.txt").write_text("\n".join(out) + "\n")
