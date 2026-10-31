"""Milestone 53, H4/H3 link: does a progress check (loss on a verifier-held batch every N steps) catch the stalling and reversed-step workers that norm checks admit?

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
SEEDS, STEPS, D, BATCH, CTX = 4, 600, 32, 32, 32
EPS, W, C, N, R = 0.01, 5, 1.5, 10, 1.05
TS = [10, 50, 200]
N_DRAW = 20
ATTACKS = ["stall", "ascent"]
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


def winmax(M):
    return np.array([M[:, max(0, t - W):t + W + 1].max() for t in range(STEPS)])


def thresholds(clean, seed):
    others = [o for o in clean if o["seed"] != seed]
    A, B = (np.array([o[k] for o in others]) for k in ("a", "b"))
    V = np.array([o["vl"] for o in others])
    sa, sb = winmax(A), winmax(B)
    ne = V.shape[1]
    pv = [R * V[:, max(0, e - 1):e + 2].max() for e in range(ne)]
    return {"step": [(C * sa[t], C * sb[t]) for t in range(STEPS)], "prog": pv}


def main():
    with Pool(4) as pool:
        clean = pool.map(job, [(s, None, 1, 0, None) for s in range(SEEDS)], chunksize=1)
    base = {o["seed"]: o["loss"] for o in clean}
    thr = {s: thresholds(clean, s) for s in range(SEEDS)}
    L, res = [], {"d": D, "N": N, "R": R, "n": N_DRAW, "cells": {}}
    fl = [v > thr[o["seed"]]["prog"][e] for o in clean for e, v in enumerate(o["vl"])]
    res["honest_flag_eval"] = float(np.mean(fl))
    L.append("honest eval points flagged (R=%.2f, N=%d): %.4f (of %d)" % (R, N, np.mean(fl), len(fl)))
    prng = np.random.default_rng(53)
    draws = [(j % SEEDS, float(prng.random())) for j in range(max(4, int(N_DRAW * SCALE)))]
    jobs = [(seed, a, T, int(u * (STEPS - T + 1)), thr[seed]) for seed, u in draws for T in TS for a in ATTACKS]
    with Pool(4) as pool:
        outs = pool.map(job, jobs, chunksize=1)
    for a in ATTACKS:
        for T in TS:
            rs = [o for o in outs if o["attack"] == a and o["T"] == T]
            dl = np.array([abs(o["loss"] - base[o["seed"]]) if np.isfinite(o["loss"]) else np.inf for o in rs])
            harm = ~np.isfinite(dl) | (dl > EPS)
            first, during = [], []
            for o in rs:
                th = thr[o["seed"]]["prog"]
                e0 = o["t0"] // N
                hits = [e for e, v in enumerate(o["vl"]) if e >= e0 and not v <= th[e]]
                first.append(hits[0] - e0 if hits else None)
                eend = (o["t0"] + T - 1) // N + 1
                during.append(bool(hits) and hits[0] <= eend)
            ever = np.array([f is not None for f in first])
            during = np.array(during)
            lat = [f for f in first if f is not None]
            unfl = ~ever
            key = "%s_T%d" % (a, T)
            res["cells"][key] = {"n": len(rs), "harmful": int(harm.sum()), "flagged_ever": int(ever.sum()),
                                 "flagged_by_window_end": int(during.sum()), "median_evals_to_flag": float(np.median(lat)) if lat else None,
                                 "unflagged": int(unfl.sum()), "harmful_unflagged": int((harm & unfl).sum()),
                                 "median_dL": float(np.median(dl[np.isfinite(dl)]))}
            c = res["cells"][key]
            L.append("%-6s T=%-3d n=%d harmful %2d | flagged by window end %2d, ever %2d | median evals to flag %s | unflagged %2d, of which harmful %d | median |dL| %.4f" % (
                a, T, len(rs), c["harmful"], c["flagged_by_window_end"], c["flagged_ever"], c["median_evals_to_flag"], c["unflagged"], c["harmful_unflagged"], c["median_dL"]))
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
