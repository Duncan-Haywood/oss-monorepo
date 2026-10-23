"""Quasi-static day experiments for infra-hosting-feeders; writes results_day.txt.   PYTHONPATH=src python experiments/run_day.py   (about 25 min)"""
from pathlib import Path
import numpy as np
from infra_hosting_feeders import FEEDERS, MEASURES, Measure, random_placement, load_names, pv_shape, load_day, day_stats

HERE = Path(__file__).resolve().parent
N = 40                              # the first 40 of the 200 placements of run.py (same seed and draw)
LEVELS = [0, 1000, 2000, 3000]      # total PV kW (the feeder peak is 3,490 kW)
DAYS = {"peak-load day (day 222 of the 8,760-point shape)": 221, "lowest-mean-load day (day 359)": 358}
ms = MEASURES + [Measure("regulator -1 V", vreg_drop=1.0), Measure("regulator -3 V", vreg_drop=3.0)]
f = FEEDERS["123"]
rng = np.random.default_rng(1)
nodes = load_names(f)
places = [random_placement(rng, nodes) for _ in range(N)]
pv = pv_shape()
out = []


def p(s=""):
    out.append(s)


p(f"=== IEEE 123-node, quasi-static day: 1,440 one-minute steps, PV shape from feeder/123/PVShape.dss (peak {pv.max():.2f}, {int((pv > 0.02).sum())} min above 2 %), "
  f"load = PaperLoadShape.txt day x 3,490 kW peak; {N} random placements, PV total {LEVELS} kW ===")
p("Cells: median over placements [min, max] of minutes per day above 1.05 pu / below 0.95 pu at a service node, and regulator tap operations per day.")
for dname, d in DAYS.items():
    lm = load_day(d)
    p()
    p(f"--- {dname}: load fraction {lm.min():.2f} to {lm.max():.2f}, mean {lm.mean():.2f} ---")
    for kw in LEVELS:
        p(f"PV total {kw} kW" + (" (no PV: one run, placement irrelevant)" if kw == 0 else ""))
        for m in ms:
            rs = [day_stats(f, m, lm, pv, pl, kw) for pl in (places[:1] if kw == 0 else places)]
            g = lambda k: np.array([r[k] for r in rs], float)
            cell = lambda k: f"{np.median(g(k)):.0f} [{g(k).min():.0f},{g(k).max():.0f}]"
            p(f"  {m.name:22s} over {cell('over'):>14s} | under {cell('under'):>14s} | tap ops {cell('ops'):>14s} | "
              f"placements with any over {100 * np.mean(g('over') > 0):.0f}% | not converged {int(g('bad').sum())} steps | lowest {g('vmin').min():.3f} pu")
(HERE / "results_day.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
