"""Milestone 75: how much training can a worker hide inside the segment drift tolerance? (H1/H4 link)

Worker submits (1 - eta) x the honest step at every step. A referee replays s-step segments from the worker's checkpoints
in fp16 and flags a segment when ||w_submitted(t0+s) - w_replay|| > rho_s * mean replayed step norm, where rho_s is the
largest honest fp16 ratio measured in milestone 72 (segment_drift/results.json). Harm is the paired held-out loss change.
Run: OMP_NUM_THREADS=1 PYTHONPATH=../../src python3 run.py   (a few minutes). Writes results.json, results.txt."""
import json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from vtm.margin import bootstrap_ci, grad, init, load_digits_split, loss, lr_at  # noqa: E402

SEEDS, T, BATCH, LR0 = 20, 1500, 64, 0.2
ETAS = [0.0, 0.005, 0.01, 0.02, 0.05, 0.1, 0.3, 1.0]
SS = [1, 5, 20]
STARTS = list(range(0, T - max(SS), 50))
DATA = load_digits_split()


def rho():
    rows = json.load(open(os.path.join(HERE, "..", "segment_drift", "results.json")))
    return {s: max(r["drift"] / r["step_norm"] for r in rows if r["ref"] == "fp16" and r["s"] == s) for s in SS}


def run_seed(args):
    seed, RHO = args
    xtr, ytr, xte, yte = DATA
    out = {}
    for eta in ETAS:
        rng = np.random.default_rng(seed)
        w = init(rng)
        orng = np.random.default_rng(10_000 + seed)
        batches = [orng.integers(0, len(ytr), BATCH) for _ in range(T)]
        ws = [w]
        for t in range(T):
            x, y = xtr[batches[t]], ytr[batches[t]]
            w = w - (1 - eta) * lr_at(t, T, LR0) * grad(w, x, y)
            ws.append(w)
        flags = {s: [] for s in SS}
        for t0 in STARTS:
            wr, norms = ws[t0], []
            for k in range(1, max(SS) + 1):
                t = t0 + k - 1
                x, y = xtr[batches[t]], ytr[batches[t]]
                d = -lr_at(t, T, LR0) * grad(wr, x, y, low_precision=True)
                norms.append(float(np.linalg.norm(d)))
                wr = wr + d
                if k in SS:
                    flags[k].append(float(np.linalg.norm(ws[t0 + k] - wr)) > RHO[k] * np.mean(norms))
        out[eta] = {"loss": loss(ws[-1], xte, yte), "flag": {s: float(np.mean(flags[s])) for s in SS}}
    return seed, out


def main():
    from multiprocessing import Pool
    RHO = rho()
    with Pool(4) as p:
        res = dict(p.map(run_seed, [(s, RHO) for s in range(SEEDS)]))
    json.dump({"rho": RHO, "res": {str(k): v for k, v in res.items()}}, open(os.path.join(HERE, "results.json"), "w"))
    L = [f"rho_s (largest honest fp16 drift / mean step norm, milestone 72): " + ", ".join(f"s={s}: {RHO[s]:.4f}" for s in SS),
         f"{SEEDS} seeds, T = {T}, {len(STARTS)} segments per seed per s. flag = share of segments flagged (mean over seeds).",
         "  eta     dL vs honest (mean [95% CI])        |dL|<0.01?   flag s=1   flag s=5   flag s=20"]
    base = [res[sd][0.0]["loss"] for sd in range(SEEDS)]
    for eta in ETAS:
        d = np.array([res[sd][eta]["loss"] - base[sd] for sd in range(SEEDS)])
        lo, hi = bootstrap_ci(d) if eta > 0 else (0.0, 0.0)
        f = {s: np.mean([res[sd][eta]["flag"][s] for sd in range(SEEDS)]) for s in SS}
        L.append(f"  {eta:<7} {d.mean():+.4f} [{lo:+.4f}, {hi:+.4f}]   {'yes' if abs(d.mean()) < 0.01 else 'no ':<11} {f[1]:.3f}      {f[5]:.3f}      {f[20]:.3f}")
    L.append("eta at which flag rate first reaches 50% (linear interpolation) vs rho_s / s:")
    for s in SS:
        fr = [np.mean([res[sd][e]["flag"][s] for sd in range(SEEDS)]) for e in ETAS]
        x50 = next((float(np.interp(0.5, fr[i - 1:i + 1], ETAS[i - 1:i + 1])) for i in range(1, len(ETAS)) if fr[i] >= 0.5), None)
        L.append(f"  s={s}: measured {x50 if x50 is None else round(x50, 4)}, rho_s/s = {RHO[s] / s:.4f}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
