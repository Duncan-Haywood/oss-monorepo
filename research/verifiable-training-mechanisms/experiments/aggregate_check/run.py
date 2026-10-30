"""Milestone 49, H4/H3 link: does an aggregate-update check (L2 norm and largest coordinate of the submitted step) close the room that milestone 48 left under the per-tensor bound?

Protocol of ../bit_flips_multi/run.py (d = 32, SGD fp32, 600 steps, 4 seeds, K = 4, harm = |dL_heldout| > 0.01 or non-finite).
Phase 1: clean runs record, per step, the submitted step Delta_t = w_t - w_{t-1}: a_t = ||Delta_t||_2 / lr_t and b_t = ||Delta_t||_inf / lr_t.
Verifier thresholds (calibrated on OTHER seeds, leave-one-out): global = C x max over all other-seed steps; step = C x max over other seeds of the value at the same step (+-5 step window). C = 1.5.
Phase 2: at a random step the adversary plants k weights as in milestone 48 (topk, values +sign(g) K m_t). Sites:
  topk      : unconstrained (milestone 48); we record whether the check would flag it;
  fit_glob  : plant delta shrunk by a scalar s in [0,1] (bisection) until the submitted step passes the GLOBAL thresholds;
  fit_step  : same against the STEP thresholds.
n = 20 shared (seed, step) draws per cell, k = 1, 4, 16, 64, 256.
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
KS_PLANT = [1, 4, 16, 64, 256]
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
SITES = ("topk", "fit_glob", "fit_step")


def run(seed, site=None, step=0, k=1, thr=None):
    """Returns (heldout loss, info). Clean runs (site None) also return per-step a_t, b_t."""
    tr, te, vocab = DATA
    torch.manual_seed(seed)
    model = TinyLM(vocab, CTX, d=D)
    params = list(model.parameters())
    npar = sum(p.numel() for p in params)
    mt = [float(p.abs().max()) for p in params]
    bound = torch.cat([torch.full((p.numel(),), m) for p, m in zip(params, mt)])
    order = np.random.default_rng(10_000 + seed)
    info = {"npar": npar, "a": [], "b": []}
    for t in range(STEPS):
        idx = order.integers(0, len(tr) - CTX - 1, BATCH)
        x, y = batch_at(tr, idx, CTX)
        g = grad_vec(model, x, y)
        lr = lr_at(t, STEPS, lr0=0.5)
        with torch.no_grad():
            off = 0
            for q in params:
                n = q.numel()
                q -= lr * g[off:off + n].view_as(q)
                off += n
            honest = -lr * g
            info["a"].append(float(honest.norm()) / lr)
            info["b"].append(float(honest.abs().max()) / lr)
            if site and t == step:
                w = torch.cat([p.reshape(-1) for p in params])
                target = torch.sign(g) * K * bound
                score = torch.where(bound > 0, g * (target - w), torch.full_like(g, -np.inf))
                idxs = torch.topk(score, k).indices
                p_full = torch.zeros_like(w)
                p_full[idxs] = target[idxs] - w[idxs]

                def stats(s):
                    d = honest + s * p_full
                    return float(d.norm()) / lr, float(d.abs().max()) / lr

                def passes(s, th):
                    a, b = stats(s)
                    return a <= th[0] and b <= th[1]

                s = 1.0
                a1, b1 = stats(1.0)
                info["flag_glob"] = not passes(1.0, thr["glob"])
                info["flag_step"] = not passes(1.0, thr["step"][t])
                if site != "topk":
                    th = thr["glob"] if site == "fit_glob" else thr["step"][t]
                    if not passes(1.0, th):
                        lo, hi = 0.0, 1.0
                        for _ in range(30):
                            mid = 0.5 * (lo + hi)
                            lo, hi = (mid, hi) if passes(mid, th) else (lo, mid)
                        s = lo
                info["scale"] = s
                info["a_sub"], info["b_sub"] = stats(s)
                info["a_honest"], info["b_honest"] = info["a"][-1], info["b"][-1]
                flat = w + s * p_full
                off = 0
                for q in params:
                    n = q.numel()
                    q.copy_(flat[off:off + n].view_as(q))
                    off += n
    return float(heldout(model, te, CTX)), info


def job(a):
    seed, site, k, step, thr = a
    loss, info = run(seed, None if site == "clean" else site, step, k, thr)
    return {"seed": seed, "site": site, "k": k, "step": step, "loss": loss, **info}


def thresholds(clean, seed):
    others = [o for o in clean if o["seed"] != seed]
    A = np.array([o["a"] for o in others])
    B = np.array([o["b"] for o in others])
    w = 5
    sa = np.array([A[:, max(0, t - w):t + w + 1].max() for t in range(STEPS)])
    sb = np.array([B[:, max(0, t - w):t + w + 1].max() for t in range(STEPS)])
    return {"glob": (C * A.max(), C * B.max()), "step": [(C * sa[t], C * sb[t]) for t in range(STEPS)]}


def main():
    clean_jobs = [(s, "clean", 0, 0, None) for s in range(SEEDS)]
    with Pool(4) as pool:
        clean = pool.map(job, clean_jobs, chunksize=1)
    base = {o["seed"]: o["loss"] for o in clean}
    thr = {s: thresholds(clean, s) for s in range(SEEDS)}
    L = []
    res = {"d": D, "K": K, "C": C, "ks": KS_PLANT, "n": N_DRAW, "cells": {}}
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
    prng = np.random.default_rng(49)
    draws = []
    for j in range(max(4, int(N_DRAW * SCALE))):
        draws.append((j % SEEDS, int(prng.integers(0, STEPS))))
    jobs = [(seed, site, k, step, thr[seed]) for seed, step in draws for k in KS_PLANT for site in SITES]
    with Pool(4) as pool:
        outs = pool.map(job, jobs, chunksize=1)
    for k in KS_PLANT:
        for site in SITES:
            rs = [o for o in outs if o["site"] == site and o["k"] == k]
            dl = np.array([abs(o["loss"] - base[o["seed"]]) if np.isfinite(o["loss"]) else np.inf for o in rs])
            h = ~np.isfinite(dl) | (dl > EPS)
            med = float(np.median(dl[np.isfinite(dl)])) if np.isfinite(dl).any() else float("nan")
            fg = float(np.mean([o["flag_glob"] for o in rs]))
            fs = float(np.mean([o["flag_step"] for o in rs]))
            sc = float(np.median([o["scale"] for o in rs]))
            ratio = float(np.median([o["a_sub"] / o["a_honest"] for o in rs]))
            res["cells"]["%s_k%d" % (site, k)] = {"n": len(rs), "harmful": int(h.sum()), "median_dL": med,
                                                 "flag_glob": fg, "flag_step": fs, "median_scale": sc, "median_a_ratio": ratio}
            L.append("k=%-3d %-8s n=%d harmful %2d (%.2f) median |dL| %.4f  unconstrained plant flagged glob %.2f step %.2f  median scale %.3f  median ||step||/||honest|| %.2f" % (
                k, site, len(rs), h.sum(), h.mean(), med, fg, fs, sc, ratio))
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
