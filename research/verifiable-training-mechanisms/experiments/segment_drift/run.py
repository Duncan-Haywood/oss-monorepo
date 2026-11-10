"""Milestone 72: how does referee drift grow over an s-step replayed segment? (H1/H4 link)

Honest float32 worker (milestone 3 MLP, 20 seeds, T = 1500). From each checkpoint t0 (every 50 steps) a referee replays
s steps on the same batches from the worker's own checkpoint, with (a) batch rows permuted each step (reorder) or
(b) float16-rounded weights and inputs (fp16). Drift D = L2 distance between worker and referee weights after s steps.
Run: OMP_NUM_THREADS=1 PYTHONPATH=../../src python3 run.py   (about 1 minute). Writes results.json, results.txt."""
import json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from vtm.margin import grad, init, load_digits_split, lr_at  # noqa: E402

SEEDS, T, BATCH, LR0 = 20, 1500, 64, 0.2
SS = [1, 2, 5, 10, 20, 40]
STARTS = list(range(0, T - max(SS), 50))
DATA = load_digits_split()


def run_seed(seed):
    xtr, ytr = DATA[0], DATA[1]
    rng = np.random.default_rng(seed)
    w = init(rng)
    orng = np.random.default_rng(10_000 + seed)
    prng = np.random.default_rng(20_000 + seed)
    batches = [orng.integers(0, len(ytr), BATCH) for _ in range(T)]
    ws, norms = [w], []
    for t in range(T):
        x, y = xtr[batches[t]], ytr[batches[t]]
        d = -lr_at(t, T, LR0) * grad(w, x, y)
        norms.append(float(np.linalg.norm(d)))
        w = w + d
        ws.append(w)
    out = []
    for t0 in STARTS:
        for ref in ("reorder", "fp16"):
            wr = ws[t0]
            for k in range(1, max(SS) + 1):
                t = t0 + k - 1
                x, y = xtr[batches[t]], ytr[batches[t]]
                lr = lr_at(t, T, LR0)
                if ref == "reorder":
                    p = prng.permutation(BATCH)
                    wr = wr - lr * grad(wr, x[p], y[p])
                else:
                    wr = wr - lr * grad(wr, x, y, low_precision=True)
                if k in SS:
                    out.append({"seed": seed, "t0": t0, "ref": ref, "s": k,
                                "drift": float(np.linalg.norm(ws[t0 + k] - wr)),
                                "seg_norm": float(np.linalg.norm(ws[t0 + k] - ws[t0])),
                                "step_norm": float(np.mean(norms[t0:t0 + k])),
                                "min_norm": float(np.min(norms[t0:t0 + k])),
                                "last_norm": float(norms[t0 + k - 1])})
    return out


def main():
    from multiprocessing import Pool
    with Pool(4) as p:
        rows = [r for rs in p.map(run_seed, range(SEEDS)) for r in rs]
    json.dump(rows, open(os.path.join(HERE, "results.json"), "w"))
    L = []
    for ref in ("reorder", "fp16"):
        L.append(f"referee={ref}: drift of an s-step replay (L2, all seeds and starts; n per cell = {SEEDS * len(STARTS)})")
        L.append("  s    median      p90         p99         max        median/step-norm  max/step-norm")
        med = {}
        for s in SS:
            r = [x for x in rows if x["ref"] == ref and x["s"] == s]
            d = np.array([x["drift"] for x in r]); sn = np.array([x["step_norm"] for x in r])
            med[s] = np.median(d)
            L.append(f"  {s:<4} {np.median(d):.3e}  {np.quantile(d, .9):.3e}  {np.quantile(d, .99):.3e}  {d.max():.3e}  "
                     f"{np.median(d / sn):.3e}         {np.max(d / sn):.3e}")
        if med[1] > 0 and med[40] > 0:
            L.append(f"  log-log slope of median drift vs s: {np.polyfit(np.log(SS), np.log([max(med[s], 1e-30) for s in SS]), 1)[0]:.2f}"
                     f" (1 = linear growth, 0.5 = random walk)")
        for phase, (a, b) in {"early t<300": (0, 300), "mid 300-900": (300, 900), "late >=900": (900, T)}.items():
            r = [x for x in rows if x["ref"] == ref and x["s"] == 10 and a <= x["t0"] < b]
            d = np.array([x["drift"] for x in r]); sn = np.array([x["step_norm"] for x in r])
            L.append(f"  s=10 {phase}: median drift {np.median(d):.3e}, median step norm {np.median(sn):.3e}, ratio {np.median(d / sn):.2e}")
        L.append("  milestone 73: drift against the stalled step's own norm (a stall's displacement is the norm of the step it replaces)")
        L.append("  s    max drift/min step norm   p99 drift/min   frac of segments with drift > min step norm   late (t>=900) max ratio")
        for s in SS:
            r = [x for x in rows if x["ref"] == ref and x["s"] == s]
            q = np.array([x["drift"] / x["min_norm"] for x in r])
            lt = np.array([x["drift"] / x["min_norm"] for x in r if x["t0"] >= 900])
            L.append(f"  {s:<4} {q.max():.3e}                 {np.quantile(q, .99):.3e}      {np.mean(q > 1):.4f}                                       {lt.max():.3e}")
        L.append("")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
