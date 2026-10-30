"""Milestone 50, H4/H3 link: does a cheater who spreads the harm over T steps, each passing the aggregate-update check of milestone 49, accumulate harm?

Protocol of ../aggregate_check/run.py (d = 32, SGD fp32, 600 steps, 4 seeds, K = 4, C = 1.5, thresholds from the other three seeds; harm = |dL_heldout| > 0.01 or non-finite).
The adversary acts in T consecutive steps t0..t0+T-1 against the PER-STEP thresholds (the tighter check; ||step||_2/lr and ||step||_inf/lr both at most C x honest maximum). Sites:
  spread16, spread256 : at each attack step plant k = 16 / 256 weights (fresh gradient-chosen topk, values +sign(g) K m_t), shrunk by a scalar (bisection) until the whole submitted step passes the check, in addition to the honest SGD step;
  ascent              : the submitted step is +c lr g instead of -lr g (a reversed SGD step), c the largest scale that passes both norm checks (c = 1.5 x the honest maximum / the step's own norm, bounded by both norms).
T = 1, 10, 50, 200; n = 20 shared (seed, u) draws, t0 = floor(u (STEPS - T + 1)).
Run from this directory:  OMP_NUM_THREADS=1 python3 run.py [scale]   (needs torch; writes results.json, results.txt)"""
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
EPS = 0.01
K = 4
TS = [1, 10, 50, 200]
N_DRAW = 20
DATA = load_text(os.path.join(HERE, "..", "transformer", "corpus.txt"))


def flat_set(params, i, val):
    for q in params:
        if i < q.numel():
            q.view(-1)[i] = val
            return
        i -= q.numel()


def flat_get(params, i):
    for q in params:
        if i < q.numel():
            return float(q.view(-1)[i])
        i -= q.numel()


C = 1.5
SITES = ("spread16", "spread256", "ascent")


def run(seed, site=None, step=0, T=1, thr=None):
    """Returns (heldout loss, info). Clean runs (site None) also return per-step a_t, b_t."""
    tr, te, vocab = DATA
    torch.manual_seed(seed)
    model = TinyLM(vocab, CTX, d=D)
    params = list(model.parameters())
    mt = [float(p.abs().max()) for p in params]
    bound = torch.cat([torch.full((p.numel(),), m) for p, m in zip(params, mt)])
    order = np.random.default_rng(10_000 + seed)
    info = {"a": [], "b": [], "scales": [], "flagged": 0}
    for t in range(STEPS):
        idx = order.integers(0, len(tr) - CTX - 1, BATCH)
        x, y = batch_at(tr, idx, CTX)
        g = grad_vec(model, x, y)
        lr = lr_at(t, STEPS, lr0=0.5)
        attack = site is not None and step <= t < step + T
        with torch.no_grad():
            w = torch.cat([p.reshape(-1) for p in params])
            honest = -lr * g
            info["a"].append(float(honest.norm()) / lr)
            info["b"].append(float(honest.abs().max()) / lr)
            delta = honest
            if attack:
                th = thr["step"][t]

                def stats(d):
                    return float(d.norm()) / lr, float(d.abs().max()) / lr

                def passes(d):
                    a, b = stats(d)
                    return a <= th[0] and b <= th[1]

                if site == "ascent":
                    a0, b0 = stats(honest)
                    c = min(th[0] / a0, th[1] / b0)
                    delta = -c * honest
                    s = c
                else:
                    k = 16 if site == "spread16" else 256
                    target = torch.sign(g) * K * bound
                    score = torch.where(bound > 0, g * (target - w), torch.full_like(g, -np.inf))
                    idxs = torch.topk(score, k).indices
                    p_full = torch.zeros_like(w)
                    p_full[idxs] = target[idxs] - w[idxs]
                    s = 1.0
                    if not passes(honest + p_full):
                        lo, hi = 0.0, 1.0
                        for _ in range(30):
                            mid = 0.5 * (lo + hi)
                            lo, hi = (mid, hi) if passes(honest + mid * p_full) else (lo, mid)
                        s = lo
                    delta = honest + s * p_full
                info["scales"].append(s)
                info["flagged"] += int(not passes(delta))
            flat = w + delta
            off = 0
            for q in params:
                n = q.numel()
                q.copy_(flat[off:off + n].view_as(q))
                off += n
    return float(heldout(model, te, CTX)), info


def job(a):
    seed, site, T, step, thr = a
    loss, info = run(seed, None if site == "clean" else site, step, T, thr)
    return {"seed": seed, "site": site, "T": T, "step": step, "loss": loss, **info}


def thresholds(clean, seed):
    others = [o for o in clean if o["seed"] != seed]
    A = np.array([o["a"] for o in others])
    B = np.array([o["b"] for o in others])
    w = 5
    sa = np.array([A[:, max(0, t - w):t + w + 1].max() for t in range(STEPS)])
    sb = np.array([B[:, max(0, t - w):t + w + 1].max() for t in range(STEPS)])
    return {"glob": (C * A.max(), C * B.max()), "step": [(C * sa[t], C * sb[t]) for t in range(STEPS)]}


def main():
    clean_jobs = [(s, "clean", 1, 0, None) for s in range(SEEDS)]
    with Pool(4) as pool:
        clean = pool.map(job, clean_jobs, chunksize=1)
    base = {o["seed"]: o["loss"] for o in clean}
    thr = {s: thresholds(clean, s) for s in range(SEEDS)}
    L = []
    res = {"d": D, "K": K, "C": C, "ts": TS, "n": N_DRAW, "cells": {}}
    # false-positive side: share of honest steps flagged by each check
    for name in ("glob", "step"):
        fl = []
        for o in clean:
            th = thr[o["seed"]]
            for t in range(STEPS):
                tt = th["glob"] if name == "glob" else th["step"][t]
                fl.append(o["a"][t] > tt[0] or o["b"][t] > tt[1])
        res["honest_flag_" + name] = float(np.mean(fl))
        L.append("honest steps flagged (%s thresholds, leave-one-seed-out, C=%.1f): %.4f of %d" % (name, C, np.mean(fl), len(fl)))
    prng = np.random.default_rng(50)
    draws = [(j % SEEDS, float(prng.random())) for j in range(max(4, int(N_DRAW * SCALE)))]
    jobs = [(seed, site, T, int(u * (STEPS - T + 1)), thr[seed]) for seed, u in draws for T in TS for site in SITES]
    with Pool(4) as pool:
        outs = pool.map(job, jobs, chunksize=1)
    for site in SITES:
        for T in TS:
            rs = [o for o in outs if o["site"] == site and o["T"] == T]
            dl = np.array([abs(o["loss"] - base[o["seed"]]) if np.isfinite(o["loss"]) else np.inf for o in rs])
            h = ~np.isfinite(dl) | (dl > EPS)
            med = float(np.median(dl[np.isfinite(dl)])) if np.isfinite(dl).any() else float("nan")
            sc = float(np.median([np.median(o["scales"]) for o in rs]))
            fl = int(sum(o["flagged"] for o in rs))
            res["cells"]["%s_T%d" % (site, T)] = {"n": len(rs), "harmful": int(h.sum()), "median_dL": med, "median_scale": sc, "flagged_steps": fl}
            L.append("%-9s T=%-3d n=%d harmful %2d (%.2f) median |dL| %.4f  median per-step scale %.4f  attack steps flagged %d" % (
                site, T, len(rs), h.sum(), h.mean(), med, sc, fl))
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
