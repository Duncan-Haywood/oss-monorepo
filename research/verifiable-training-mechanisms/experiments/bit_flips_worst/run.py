"""Milestone 47, H4/H3 link: how much harm fits under the per-tensor bound K x m_t when the adversary chooses the site by gradient?

Protocol of ../bit_flips_tensor/run.py (d = 32, plain SGD in fp32, 600 steps, 4 seeds, harm = |dL_heldout| > 0.01 or non-finite).
At a random step t the adversary sees the training-batch gradient g of that step and may overwrite ONE weight with any value in [-K m_t, K m_t]
(m_t = init max|w| of the weight's tensor, so the plant passes the bound). Sites:
  random : uniform weight, value +-K m_t (milestone 46's plant);
  grad   : the weight maximising the first-order loss rise g_i (v - w_i), v = +sign(g_i) K m_t  (one gradient, no extra forward passes);
  eval   : the top 20 weights by that score are each tried, the one with the largest actual batch loss after the plant is kept (a stronger, costlier adversary).
K = 2 and 4 (K = 4 is the smallest factor that accepts honest growth in milestone 46). n = 20 draws (seed, step) per cell, shared by the three sites.
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
KS = [2, 4]
N_DRAW = 20
TOPN = 20
NOZERO = os.environ.get("NOZERO", "1") == "1"   # exclude zero-init tensors (bound K x 0 = 0): they need an absolute bound
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


def run(seed, site=None, step=0, K=0, u=0.0, sgn=1):
    tr, te, vocab = DATA
    torch.manual_seed(seed)
    model = TinyLM(vocab, CTX, d=D)
    params = list(model.parameters())
    npar = sum(p.numel() for p in params)
    mt = [float(p.abs().max()) for p in params]
    bound = torch.cat([torch.full((p.numel(),), m) for p, m in zip(params, mt)])
    order = np.random.default_rng(10_000 + seed)
    info = {}
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
            if site and t == step:
                w = torch.cat([p.reshape(-1) for p in params])
                if site == "random":
                    i = int(u * npar)
                    while NOZERO and float(bound[i]) == 0:
                        i = (i + 1) % npar
                    v = sgn * K * float(bound[i])
                else:
                    target = torch.sign(g) * K * bound
                    score = g * (target - w)
                    if NOZERO:
                        score = torch.where(bound > 0, score, torch.full_like(score, -np.inf))
                    if site == "grad":
                        i = int(score.argmax())
                    else:
                        cand = torch.topk(score, TOPN).indices.tolist()
                        best, i = -np.inf, cand[0]
                        for c in cand:
                            old = flat_get(params, c)
                            flat_set(params, c, float(target[c]))
                            l = float(F.cross_entropy(model(x).reshape(-1, model.head.out_features), y.reshape(-1)))
                            flat_set(params, c, old)
                            if not np.isfinite(l):
                                l = np.inf
                            if l > best:
                                best, i = l, c
                    v = float(target[i])
                info["val"] = v
                info["m_t"] = float(bound[i])
                info["w_old"] = float(w[i])
                flat_set(params, i, v)
    return float(heldout(model, te, CTX)), info


def job(a):
    seed, site, K, step, u, sgn = a
    loss, info = run(seed, None if site == "clean" else site, step, K, u, sgn)
    return {"seed": seed, "site": site, "K": K, "loss": loss, **info}


def main():
    prng = np.random.default_rng(47)
    jobs = [(s, "clean", 0, 0, 0.0, 1) for s in range(SEEDS)]
    for K in KS:
        for k in range(max(4, int(N_DRAW * SCALE))):
            seed, step, u = k % SEEDS, int(prng.integers(0, STEPS)), float(prng.random())
            sgn = 1 if prng.random() < .5 else -1
            for site in ("random", "grad", "eval"):
                jobs.append((seed, site, K, step, u, sgn))
    with Pool(4) as pool:
        outs = pool.map(job, jobs, chunksize=1)
    base = {o["seed"]: o["loss"] for o in outs if o["site"] == "clean"}
    L = []
    res = {"d": D, "KS": KS, "n": N_DRAW, "cells": {}}
    for K in KS:
        for site in ("random", "grad", "eval"):
            rs = [o for o in outs if o["site"] == site and o["K"] == K]
            dl = np.array([abs(o["loss"] - base[o["seed"]]) if np.isfinite(o["loss"]) else np.inf for o in rs])
            h = ~np.isfinite(dl) | (dl > EPS)
            nf = int((~np.isfinite(dl)).sum())
            med = float(np.median(dl[np.isfinite(dl)])) if np.isfinite(dl).any() else float("nan")
            res["cells"]["%s_K%d" % (site, K)] = {"n": len(rs), "harmful": int(h.sum()), "nonfinite": nf, "median_dL": med}
            L.append("K=%d %-6s n=%d harmful %2d (%.2f)  non-finite %d  median |dL| %.4f  median m_t %.3f" % (
                K, site, len(rs), h.sum(), h.mean(), nf, med, np.median([o["m_t"] for o in rs])))
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
