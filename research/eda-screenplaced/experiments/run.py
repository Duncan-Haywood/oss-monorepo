"""Screen the placed area-period front of each family with cost models trained on the other families.

    PYTHONPATH=src python experiments/run.py      (a few minutes); writes results.txt and results.json
"""
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from eda_screenplaced import models, screen  # noqa: E402

DATA = models.load(HERE / "dataset.jsonl")
PLACED = {(r["family"], json.dumps(r["params"], sort_keys=True)): r for r in models.load(HERE / "placed.jsonl")[1:]}
ROWS = [r for r in DATA if (r["family"], json.dumps(r["params"], sort_keys=True)) in PLACED]
X, _, NAMES = models.matrix(ROWS)
FAM = np.array([r["family"] for r in ROWS])
P = [PLACED[(r["family"], json.dumps(r["params"], sort_keys=True))] for r in ROWS]
AREA = np.array([p["repaired_area"] for p in P], float)       # um^2 after repair_design / repair_timing
PERIOD = np.array([p["placed_period_ns"] for p in P], float)  # 8 ns minus worst slack, before repair
FAMILIES = ("mac", "fir", "alu", "sorter")
SEEDS = 60
FRAC = 0.75
BUDGETS = (3, 4, 6, 8, 12, 16)
MAXB = max(BUDGETS)
SCREENS = {"screen: area + period models": ("ridge", "ridge"),
           "screen: area model, period unpredicted": ("ridge", "mean"),
           "screen: no models (constant)": ("mean", "mean"),
           "screen: linear area + linear period": ("linear", "linear")}
METHODS = ["random"] + list(SCREENS) + ["front-first oracle"]


def run_space(held, seed):
    idx = np.where(FAM == held)[0]
    rs = np.random.RandomState(1000 + seed)
    idx = rs.permutation(rs.choice(idx, size=int(round(FRAC * len(idx))), replace=False))  # shuffled: index order must not track size
    other = np.where(FAM != held)[0]
    O = screen.normalise(AREA[idx], PERIOD[idx])
    true_hv = screen.hv2(O)
    orders = {"random": screen.random_order(len(idx), MAXB, np.random.RandomState(seed)),
              "front-first oracle": screen.oracle_order(O, MAXB)}
    for name, kinds in SCREENS.items():
        orders[name] = screen.screen(X[idx], AREA[idx], PERIOD[idx], X[other], AREA[other], PERIOD[other], MAXB, kinds)
    q = {}
    for tag, y in (("area", AREA), ("period", PERIOD)):
        p = models.Model("ridge").fit(X[other], y[other]).predict(X[idx])
        q[tag] = (float(np.median(models.ape(p, y[idx]))), models.spearman(p, y[idx]))
    return {m: screen.hv_curve(O, orders[m], true_hv) for m in METHODS}, int((screen.fronts(O) == 0).sum()), len(idx), q


def boot(v, rs, n=2000):
    m = rs.choice(v, size=(n, len(v))).mean(1)
    return float(np.percentile(m, 2.5)), float(np.percentile(m, 97.5))


def main():
    out, lines = {}, []
    rs = np.random.RandomState(7)
    for held in FAMILIES:
        res = [run_space(held, s) for s in range(SEEDS)]
        curves = {m: np.array([r[0][m] for r in res]) for m in METHODS}
        out[held] = curves
        lines.append(f"== {held}: mean fraction of true-front hypervolume after b placements ({SEEDS} subsampled spaces of "
                     f"{res[0][2]} designs, true front {np.mean([r[1] for r in res]):.1f} designs on average)")
        lines.append("method | " + " | ".join(f"b={b}" for b in BUDGETS))
        for m in METHODS:
            lines.append(m + " | " + " | ".join(f"{curves[m][:, b - 1].mean():.3f}" for b in BUDGETS))
        lines.append(f"-- ridge cost model trained on the other three families, on {held} (median over spaces)")
        for tag in ("area", "period"):
            lines.append(f"{tag}: median APE {np.median([r[3][tag][0] for r in res])*100:.0f}%, "
                         f"Spearman {np.median([r[3][tag][1] for r in res]):.3f}")
        lines.append(f"-- 95% bootstrap interval of the mean at b=8 and b=12")
        for m in METHODS:
            l8, h8 = boot(curves[m][:, 7], rs)
            l12, h12 = boot(curves[m][:, 11], rs)
            lines.append(f"{m}: b=8 {l8:.3f} to {h8:.3f}; b=12 {l12:.3f} to {h12:.3f}")
        lines.append("-- paired spaces (share where the first method is strictly higher / tied)")
        for a, b in [("screen: area + period models", "random"), ("screen: area model, period unpredicted", "random"),
                     ("screen: area + period models", "screen: area model, period unpredicted"),
                     ("screen: area + period models", "screen: no models (constant)")]:
            cells = []
            for bi in (8, 12):
                d = curves[a][:, bi - 1] - curves[b][:, bi - 1]
                cells.append(f"b={bi} win {np.mean(d > 1e-9):.2f} tie {np.mean(np.abs(d) <= 1e-9):.2f}")
            lines.append(f"{a} vs {b}: " + "; ".join(cells))
        lines.append("")
    lines.append("== P. pooled over the four families, mean fraction of true hypervolume")
    lines.append("budget " + " ".join(m.replace(" ", "_").replace(":", "") for m in METHODS))
    for b in range(1, MAXB + 1):
        lines.append(f"{b} " + " ".join(f"{np.mean([out[h][m][:, b - 1].mean() for h in FAMILIES]):.3f}" for m in METHODS))
    (HERE / "results.txt").write_text("\n".join(lines) + "\n")
    (HERE / "results.json").write_text(json.dumps({h: {m: np.round(c, 4).tolist() for m, c in d.items()} for h, d in out.items()}))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
