"""Milestone 3 (H1): benign drift and the hidden margin of a tolerance-tau referee.

Run from this directory:  OMP_NUM_THREADS=1 PYTHONPATH=../../src python3 run.py   (about 6 minutes on 4 cores)
Writes results.json and results.txt next to this file."""
import json
import os
import sys
from multiprocessing import Pool

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from vtm.margin import STRATEGIES, accuracy, bootstrap_ci, load_digits_split, loss, train  # noqa: E402

SEEDS = 20
TAUS = [10.0 ** e for e in range(-8, 0)] + [0.3]
DATA = load_digits_split()


def job(args):
    seed, strategy, tau, referee = args
    w, info = train(DATA, seed, strategy=strategy, tau=tau, referee=referee, record=strategy is None)
    out = {"loss": loss(w, DATA[2], DATA[3]), "acc": accuracy(w, DATA[2], DATA[3]), "cheated": info["cheated"]}
    if strategy is None:
        out["norms"], out["drifts"] = info["norms"], info["drifts"]
    return out


def main():
    res = {"seeds": SEEDS, "taus": TAUS, "honest": {}, "cheat": {}}
    with Pool(4) as pool:
        for referee in ("reorder", "fp16"):
            hon = pool.map(job, [(s, None, 0.0, referee) for s in range(SEEDS)])
            h_loss = np.array([h["loss"] for h in hon])
            drifts = np.concatenate([h["drifts"] for h in hon])
            norms = np.concatenate([h["norms"] for h in hon])
            res["honest"][referee] = {
                "loss_mean": float(h_loss.mean()), "loss_std": float(h_loss.std(ddof=1)),
                "acc_mean": float(np.mean([h["acc"] for h in hon])),
                "drift_q": {q: float(np.quantile(drifts, q)) for q in (0.5, 0.9, 0.99, 1.0)},
                "norm_q": {q: float(np.quantile(norms, q)) for q in (0.01, 0.1, 0.5, 0.9)},
                "frac_drift_zero": float(np.mean(drifts == 0)),
                "false_dispute": {str(t): float(np.mean(drifts > t)) for t in TAUS},
            }
            for strat in STRATEGIES:
                rows = []
                for tau in TAUS:
                    outs = pool.map(job, [(s, strat, tau, referee) for s in range(SEEDS)])
                    d = np.array([o["loss"] for o in outs]) - h_loss
                    lo, hi = bootstrap_ci(d)
                    rows.append({"tau": tau, "cheated": float(np.mean([o["cheated"] for o in outs])),
                                 "deg_mean": float(d.mean()), "deg_lo": lo, "deg_hi": hi,
                                 "acc_drop": float(np.mean([h["acc"] for h in hon]) - np.mean([o["acc"] for o in outs]))})
                    print(referee, strat, tau, rows[-1], flush=True)
                res["cheat"][f"{referee}/{strat}"] = rows
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    lines = []
    for referee, h in res["honest"].items():
        lines.append(f"referee={referee} honest held-out loss {h['loss_mean']:.4f} (seed std {h['loss_std']:.4f}), acc {h['acc_mean']:.3f}")
        lines.append(f"  step drift quantiles {h['drift_q']}  (zero on {h['frac_drift_zero']:.2f} of steps)")
        lines.append(f"  honest update-norm quantiles {h['norm_q']}")
        for strat in STRATEGIES:
            lines.append(f"  strategy={strat}")
            lines.append("    tau       false_dispute  cheated   degradation [95% CI]            > seed std")
            for r in res["cheat"][f"{referee}/{strat}"]:
                fd = h["false_dispute"][str(r["tau"])]
                lines.append(f"    {r['tau']:<9.0e} {fd:<14.3f} {r['cheated']:<9.3f} {r['deg_mean']:+.5f} [{r['deg_lo']:+.5f}, {r['deg_hi']:+.5f}]  "
                             f"{'yes' if r['deg_lo'] > 0 and r['deg_mean'] > h['loss_std'] else 'no'}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
