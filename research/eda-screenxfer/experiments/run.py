"""Run the cross-family screen experiment; writes results.txt and results.json.

    PYTHONPATH=src python experiments/run.py      (about a minute)
"""
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from eda_screenxfer import models, screen  # noqa: E402

ROWS = models.load(HERE / "dataset.jsonl")
X, Y, NAMES = models.matrix(ROWS)
FAM = np.array([r["family"] for r in ROWS])
CYC = np.array([r["cycles"] for r in ROWS], float)
HELD = ("mac", "fir")           # the two families whose cycles vary: alu and sorter have one objective (cycles = 1)
SEEDS = 100
FRAC = 0.75                     # each seed's space is a random 75% of the family's designs
BUDGETS = (3, 4, 6, 8, 12, 16, 20)
MAXB = max(BUDGETS)
METHODS = ["random", "cycles-first random", "free objectives only",
           "transfer ridge", "transfer linear", "transfer ridge + refit", "transfer linear + refit",
           "transfer ridge + refit, k=3", "constant cost model + refit", "front-first oracle"]


def run_space(held, seed):
    idx = np.where(FAM == held)[0]
    rs = np.random.RandomState(1000 + seed)
    idx = np.sort(rs.choice(idx, size=int(round(FRAC * len(idx))), replace=False))
    other = np.where(FAM != held)[0]
    O = screen.normalise(Y[idx], CYC[idx])
    true_hv = screen.hv2(O)
    orders = {
        "random": screen.random_order(O, MAXB, np.random.RandomState(seed)),
        "cycles-first random": screen.cycles_first_random(O, MAXB, np.random.RandomState(seed)),
        "free objectives only": screen.free_only(O, MAXB),
        "front-first oracle": _oracle(O),
    }
    for name, kind, k, refit in [("transfer ridge", "ridge", 0, False), ("transfer linear", "linear", 0, False),
                                 ("transfer ridge + refit", "ridge", 0, True), ("transfer linear + refit", "linear", 0, True),
                                 ("transfer ridge + refit, k=3", "ridge", 3, True),
                                 ("constant cost model + refit", "mean", 0, True)]:
        orders[name] = screen.screen(X[idx], CYC[idx], Y[idx], X[other], Y[other], MAXB, kind, k, refit=refit)
    q = {}
    for kind in ("linear", "ridge"):
        p = models.Model(kind).fit(X[other], Y[other]).predict(X[idx])
        q[kind] = (float(np.median(models.ape(p, Y[idx]))), models.spearman(p, Y[idx]))
    return {m: screen.hv_curve(O, orders[m], true_hv) for m in METHODS}, int((screen.fronts(O) == 0).sum()), len(idx), q


def _oracle(O):
    """Synthesise the true front first (best possible order), then the rest by front."""
    rk = screen.fronts(O)
    return list(np.lexsort((np.arange(len(O)), rk)))[:MAXB]


def boot(v, rs, n=2000):
    m = rs.choice(v, size=(n, len(v))).mean(1)
    return float(np.percentile(m, 2.5)), float(np.percentile(m, 97.5))


def main():
    out, lines = {}, []
    rs = np.random.RandomState(7)
    for held in HELD:
        res = [run_space(held, s) for s in range(SEEDS)]
        curves = {m: np.array([r[0][m] for r in res]) for m in METHODS}
        out[held] = {m: curves[m].tolist() for m in METHODS}
        lines.append(f"== {held}: mean fraction of true-front hypervolume after b syntheses ({SEEDS} subsampled spaces of "
                     f"{res[0][2]} designs, true front {np.mean([r[1] for r in res]):.1f} designs on average)")
        lines.append("method | " + " | ".join(f"b={b}" for b in BUDGETS))
        for m in METHODS:
            lines.append(m + " | " + " | ".join(f"{curves[m][:, b - 1].mean():.3f}" for b in BUDGETS))
        lines.append("")
        lines.append(f"== {held}: the cost model alone, trained on the other three families, on this family (median over spaces)")
        for kind in ("linear", "ridge"):
            lines.append(f"{kind}: median absolute percentage error {np.median([r[3][kind][0] for r in res])*100:.0f}%, "
                         f"Spearman rank correlation with true cells {np.median([r[3][kind][1] for r in res]):.3f}")
        lines.append("")
        lines.append(f"== {held}: 95% bootstrap interval of the mean at b=8 and b=12")
        for m in METHODS:
            l8, h8 = boot(curves[m][:, 7], rs)
            l12, h12 = boot(curves[m][:, 11], rs)
            lines.append(f"{m}: b=8 {l8:.3f} to {h8:.3f}; b=12 {l12:.3f} to {h12:.3f}")
        lines.append("")
        lines.append(f"== {held}: paired seeds (share of spaces where the first method has strictly higher / equal hypervolume), b=8 and b=12")
        for a, b in [("transfer ridge + refit", "random"), ("transfer ridge + refit", "cycles-first random"),
                     ("transfer ridge + refit", "transfer ridge"), ("transfer ridge + refit, k=3", "transfer ridge + refit"),
                     ("transfer linear + refit", "transfer ridge + refit")]:
            cells = []
            for bi in (8, 12):
                d = curves[a][:, bi - 1] - curves[b][:, bi - 1]
                cells.append(f"b={bi} win {np.mean(d > 1e-9):.2f} tie {np.mean(np.abs(d) <= 1e-9):.2f}")
            lines.append(f"{a} vs {b}: " + "; ".join(cells))
        lines.append("")
    # both families pooled, for the figure
    lines.append("== P. pooled over mac and fir, mean fraction of true hypervolume")
    lines.append("budget " + " ".join(m.replace(" ", "_") for m in METHODS))
    for b in range(1, MAXB + 1):
        lines.append(f"{b} " + " ".join(f"{np.mean([out[h][m] and np.array(out[h][m])[:, b - 1].mean() for h in HELD]):.3f}" for m in METHODS))
    (HERE / "results.txt").write_text("\n".join(lines) + "\n")
    (HERE / "results.json").write_text(json.dumps({h: {m: np.round(np.array(v), 4).tolist() for m, v in d.items()} for h, d in out.items()}))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
