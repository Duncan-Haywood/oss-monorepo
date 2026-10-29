"""Milestone 48, H4/H3 link: how much harm fits under the per-tensor bound K x m_t when the adversary plants k weights, not one?

Protocol of ../bit_flips_tensor/run.py (d = 32, plain SGD in fp32, 600 steps, 4 seeds, harm = |dL_heldout| > 0.01 or non-finite).
At a random step t the adversary sees the training-batch gradient g of that step and overwrites k weights, each with a value inside [-K x m_t, K x m_t] of its own tensor (so every plant passes the per-tensor bound). Sites:
  randk : k uniform weights (zero-init tensors excluded), values +-K m_t with random signs (control);
  topk  : the k weights with the largest first-order loss rise g_i (v_i - w_i), v_i = +sign(g_i) K m_t (one gradient, no extra forward passes).
K = 4 (the smallest factor that accepts honest growth in milestone 46); k = 1, 4, 16, 64, 256 of the ~14k weights. n = 20 draws (seed, step) per cell, shared by both sites.
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


def run(seed, site=None, step=0, k=1, u=0.0, sgn=1):
    tr, te, vocab = DATA
    torch.manual_seed(seed)
    model = TinyLM(vocab, CTX, d=D)
    params = list(model.parameters())
    npar = sum(p.numel() for p in params)
    mt = [float(p.abs().max()) for p in params]
    bound = torch.cat([torch.full((p.numel(),), m) for p, m in zip(params, mt)])
    order = np.random.default_rng(10_000 + seed)
    info = {"npar": npar}
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
                ok = (bound > 0).nonzero().reshape(-1).numpy()
                if site == "randk":
                    rng = np.random.default_rng(int(1e6 * u) + k)
                    idxs = rng.choice(ok, size=k, replace=False)
                    vals = rng.choice([-1.0, 1.0], size=k) * K * bound[idxs].numpy()
                else:
                    target = torch.sign(g) * K * bound
                    score = torch.where(bound > 0, g * (target - w), torch.full_like(score_ := g, -np.inf))
                    idxs = torch.topk(score, k).indices.numpy()
                    vals = target[idxs].numpy()
                info["m_t_med"] = float(np.median(bound[idxs].numpy()))
                info["mean_abs_val"] = float(np.abs(vals).mean())
                wt = torch.from_numpy(np.asarray(vals, dtype=np.float32))
                flat = torch.cat([p.reshape(-1) for p in params])
                flat[torch.from_numpy(np.asarray(idxs, dtype=np.int64))] = wt
                off = 0
                for q in params:
                    n = q.numel()
                    q.copy_(flat[off:off + n].view_as(q))
                    off += n
    return float(heldout(model, te, CTX)), info


def job(a):
    seed, site, k, step, u, sgn = a
    loss, info = run(seed, None if site == "clean" else site, step, k, u, sgn)
    return {"seed": seed, "site": site, "k": k, "loss": loss, **info}


def main():
    prng = np.random.default_rng(48)
    jobs = [(s, "clean", 0, 0, 0.0, 1) for s in range(SEEDS)]
    for j in range(max(4, int(N_DRAW * SCALE))):
        seed, step, u = j % SEEDS, int(prng.integers(0, STEPS)), float(prng.random())
        for k in KS_PLANT:
            for site in ("randk", "topk"):
                jobs.append((seed, site, k, step, u, 1))
    with Pool(4) as pool:
        outs = pool.map(job, jobs, chunksize=1)
    base = {o["seed"]: o["loss"] for o in outs if o["site"] == "clean"}
    L = []
    res = {"d": D, "K": K, "ks": KS_PLANT, "n": N_DRAW, "cells": {}}
    for k in KS_PLANT:
        for site in ("randk", "topk"):
            rs = [o for o in outs if o["site"] == site and o["k"] == k]
            dl = np.array([abs(o["loss"] - base[o["seed"]]) if np.isfinite(o["loss"]) else np.inf for o in rs])
            h = ~np.isfinite(dl) | (dl > EPS)
            nf = int((~np.isfinite(dl)).sum())
            med = float(np.median(dl[np.isfinite(dl)])) if np.isfinite(dl).any() else float("nan")
            res["cells"]["%s_k%d" % (site, k)] = {"n": len(rs), "harmful": int(h.sum()), "nonfinite": nf, "median_dL": med}
            L.append("k=%-3d %-5s n=%d harmful %2d (%.2f)  non-finite %d  median |dL| %.4f  median m_t %.3f  mean |v| %.2f" % (
                k, site, len(rs), h.sum(), h.mean(), nf, med, np.median([o["m_t_med"] for o in rs]), np.mean([o["mean_abs_val"] for o in rs])))
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
