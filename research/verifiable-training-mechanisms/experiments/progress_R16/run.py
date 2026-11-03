"""Milestone 55, H4/H3 link: price the progress-check ratio R on 16 honest seeds, with calibration sets of 3, 7 and 15 other seeds (follow-up of milestone 54)

Protocol of ../c_sweep_cum/run.py (d = 32, SGD fp32, 600 steps, 4 seeds, thresholds from the other three seeds, harm = |dL_heldout| > 0.01 or non-finite).
Progress check: every N = 10 steps the verifier evaluates the submitted weights on its own fixed batch (256 windows of the training text, seed 777)
and flags if the loss exceeds R x (largest loss of any other seed over eval points e-1..e+1), R = 1.05.
Adversaries (T consecutive steps from t0, non-adaptive to the progress check): `stall` (no step), `ascent` (+c lr g, c the largest scale passing the per-step C = 1.5 norm check).
T = 10, 50, 200; n = 20 shared (seed, u) draws.
Run:  OMP_NUM_THREADS=1 python3 run.py [scale]   (needs torch; writes results.json, results.txt)"""
import json
import os
import sys
from multiprocessing import Pool

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import torch  # noqa: E402
import torch.nn.functional as F  # noqa: E402
from vtm.margin_tf import TinyLM, batch_at, grad_vec, heldout, load_text, lr_at  # noqa: E402

torch.set_num_threads(1)
SCALE = float(sys.argv[1]) if len(sys.argv) > 1 else 1.0
SEEDS, STEPS, D, BATCH, CTX = 16, 600, 32, 32, 32
EPS, W, C, N, R = 0.01, 5, 1.5, 10, 1.05  # R here only fixes the ascent run; flags are re-scored for every R in RS
RS = [1.00, 1.005, 1.01, 1.02, 1.03, 1.05]
KS = [3, 7, 15]
TS = [200]
N_DRAW = 32
ATTACKS = ["stall"]
DATA = load_text(os.path.join(HERE, "..", "transformer", "corpus.txt"))


def verifier_loss(model, tr, vb):
    x, y = vb
    with torch.no_grad():
        return float(F.cross_entropy(model(x).reshape(-1, model.head.out_features), y.reshape(-1)))


def run(seed, attack=None, t0=0, T=1, thr=None):
    tr, te, vocab = DATA
    torch.manual_seed(seed)
    model = TinyLM(vocab, CTX, d=D)
    params = list(model.parameters())
    order = np.random.default_rng(10_000 + seed)
    vidx = np.random.default_rng(777).integers(0, len(tr) - CTX - 1, 256)
    vb = batch_at(tr, vidx, CTX)
    info = {"a": [], "b": [], "vl": [], "flagged_steps": 0}
    for t in range(STEPS):
        idx = order.integers(0, len(tr) - CTX - 1, BATCH)
        x, y = batch_at(tr, idx, CTX)
        g = grad_vec(model, x, y)
        lr = lr_at(t, STEPS, lr0=0.5)
        on = attack is not None and t0 <= t < t0 + T
        with torch.no_grad():
            w = torch.cat([p.reshape(-1) for p in params])
            honest = -lr * g
            delta = honest
            if on and attack == "stall":
                delta = torch.zeros_like(honest)
            elif on:
                ta, tb = thr["step"][t]
                a0, b0 = float(honest.norm()) / lr, float(honest.abs().max()) / lr
                c = 0.999 * min(ta / a0, tb / b0)
                delta = -c * honest
            info["a"].append(float(delta.norm()) / lr)
            info["b"].append(float(delta.abs().max()) / lr)
            off, flat = 0, w + delta
            for q in params:
                n = q.numel()
                q.copy_(flat[off:off + n].view_as(q))
                off += n
        if t % N == N - 1:
            info["vl"].append(verifier_loss(model, tr, vb))
    return float(heldout(model, te, CTX)), info


def job(a):
    seed, attack, T, t0, thr = a
    loss, info = run(seed, attack, t0, T, thr)
    return {"seed": seed, "attack": attack, "T": T, "t0": t0, "loss": loss, **info}


def main():
    with Pool(4) as pool:
        clean = pool.map(job, [(s, None, 1, 0, None) for s in range(SEEDS)], chunksize=1)
    V = np.array([o["vl"] for o in clean])  # seeds x eval points
    ne = V.shape[1]
    base = {o["seed"]: o["loss"] for o in clean}
    rng = np.random.default_rng(55)

    def prog_thr(cal):
        return np.array([V[cal][:, max(0, e - 1):e + 2].max() for e in range(ne)])

    # calibration sets: for each test seed, 20 random subsets of K other seeds
    cal_sets = {(s, K, r): list(rng.choice([q for q in range(SEEDS) if q != s], K, replace=False))
                for s in range(SEEDS) for K in KS for r in range(20)}
    L, res = [], {"seeds": SEEDS, "N": N, "honest": {}, "stall": {}}
    for K in KS:
        for Rr in RS:
            fl, anyfl = [], []
            for (s, k, r), cal in cal_sets.items():
                if k != K:
                    continue
                f = V[s] > Rr * prog_thr(cal)
                fl.append(f.mean())
                anyfl.append(bool(f.any()))
            res["honest"]["K%d_R%s" % (K, Rr)] = {"eval_point_rate": float(np.mean(fl)), "job_rate": float(np.mean(anyfl)), "n_sets": len(fl)}
            L.append("honest, calibration K=%2d, R=%.3f: eval points flagged %.4f, jobs with any flag %.3f (%d (seed, subset) pairs)" % (K, Rr, np.mean(fl), np.mean(anyfl), len(fl)))
    prng = np.random.default_rng(56)
    draws = [(j % SEEDS, float(prng.random())) for j in range(N_DRAW)]
    jobs = [(seed, "stall", 200, int(u * (STEPS - 200 + 1)), None) for seed, u in draws]
    with Pool(4) as pool:
        outs = pool.map(job, jobs, chunksize=1)
    dl = np.array([abs(o["loss"] - base[o["seed"]]) for o in outs])
    harm = dl > EPS
    L.append("stall T=200: n=%d, harmful %d (median |dL| %.4f)" % (len(outs), harm.sum(), np.median(dl)))
    for K in KS:
        for Rr in RS:
            ever = []
            for o in outs:
                cal = [c for (s, k, r), c in cal_sets.items() if s == o["seed"] and k == K][0]
                th = prog_thr(cal)
                e0 = o["t0"] // N
                ever.append(any(e >= e0 and not v <= Rr * th[e] for e, v in enumerate(o["vl"])))
            ever = np.array(ever)
            res["stall"]["K%d_R%s" % (K, Rr)] = {"flagged": int(ever.sum()), "harmful_unflagged": int((harm & ~ever).sum()), "n": len(outs)}
            L.append("stall T=200, K=%2d, R=%.3f: flagged %2d of %d, harmful and unflagged %2d" % (K, Rr, ever.sum(), len(outs), (harm & ~ever).sum()))
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
