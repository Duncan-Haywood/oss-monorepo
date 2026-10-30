"""Milestone 51, H4/H3 link: what does the per-step aggregate check cost against the reversed-SGD-step attack as C tightens, and does a cumulative (windowed-sum) check close the accumulation milestone 50 found?

Protocol of ../spread_steps/run.py (d = 32, SGD fp32, 600 steps, 4 seeds, thresholds from the other three seeds, harm = |dL_heldout| > 0.01 or non-finite).
Adversary: `ascent`, the submitted step is +c lr g instead of -lr g, in T consecutive steps from a random t0, c the largest scale that passes the check in force.
Checks:
  step C=1.1, 1.25, 1.5, 2.0 : per-step ||step||_2/lr and ||step||_inf/lr at most C x the honest maximum over a +-5 step window (milestone 49/50);
  cum  C=1.5, W=50           : in addition, the norm of the sum of the last W submitted steps (the cumulative displacement) at most C x the honest maximum of that quantity over a +-5 step window.
The cum adversary bisects c until both checks pass.
T = 10, 50, 200; n = 20 shared (seed, u) draws, t0 = floor(u (STEPS - T + 1)).
Run from this directory:  OMP_NUM_THREADS=1 python3 run.py [scale]   (needs torch; writes results.json, results.txt)"""
import json
import os
import sys
from multiprocessing import Pool

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import torch  # noqa: E402
from vtm.margin_tf import TinyLM, batch_at, grad_vec, heldout, load_text, lr_at  # noqa: E402

torch.set_num_threads(1)
SCALE = float(sys.argv[1]) if len(sys.argv) > 1 else 1.0
SEEDS, STEPS, D, BATCH, CTX = 4, 600, 32, 32, 32
EPS = 0.01
W = 5      # threshold window half-width
WC = 50    # cumulative window
TS = [10, 50, 200]
N_DRAW = 20
CS = [1.1, 1.25, 1.5, 2.0]
VARIANTS = [("step", c) for c in CS] + [("cum", 1.5)]
DATA = load_text(os.path.join(HERE, "..", "transformer", "corpus.txt"))


def run(seed, attack=None, t0=0, T=1, thr=None):
    """attack None (clean) or (kind, C). Returns (heldout loss, info)."""
    tr, te, vocab = DATA
    torch.manual_seed(seed)
    model = TinyLM(vocab, CTX, d=D)
    params = list(model.parameters())
    order = np.random.default_rng(10_000 + seed)
    info = {"a": [], "b": [], "u": [], "scales": [], "flagged": 0, "cumflag": 0}
    hist = []
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
            if on:
                kind, C = attack
                ta, tb = thr[C]["step"][t]
                tc = thr[C]["cum"][t]
                past = sum(hist[-(WC - 1):]) if hist else torch.zeros_like(w)

                def ok(d):
                    if float(d.norm()) / lr > ta or float(d.abs().max()) / lr > tb:
                        return False
                    return kind == "step" or float((past + d).norm()) <= tc

                a0, b0 = float(honest.norm()) / lr, float(honest.abs().max()) / lr
                c = min(ta / a0, tb / b0)
                if not ok(-c * honest):
                    lo, hi = 0.0, c
                    for _ in range(40):
                        mid = 0.5 * (lo + hi)
                        lo, hi = (mid, hi) if ok(-mid * honest) else (lo, mid)
                    c = lo
                delta = -c * honest
                info["scales"].append(c)
                info["flagged"] += int(not ok(delta))
            hist.append(delta)
            if len(hist) > WC:
                hist.pop(0)
            info["a"].append(float(honest.norm()) / lr)
            info["b"].append(float(honest.abs().max()) / lr)
            info["u"].append(float(sum(hist).norm()))
            off = 0
            flat = w + delta
            for q in params:
                n = q.numel()
                q.copy_(flat[off:off + n].view_as(q))
                off += n
    return float(heldout(model, te, CTX)), info


def job(a):
    seed, attack, T, t0, thr = a
    loss, info = run(seed, attack, t0, T, thr)
    return {"seed": seed, "attack": attack, "T": T, "t0": t0, "loss": loss, **info}


def winmax(M):
    return np.array([M[:, max(0, t - W):t + W + 1].max() for t in range(STEPS)])


def thresholds(clean, seed):
    others = [o for o in clean if o["seed"] != seed]
    A, B, U = (np.array([o[k] for o in others]) for k in ("a", "b", "u"))
    sa, sb, su = winmax(A), winmax(B), winmax(U)
    return {C: {"step": [(C * sa[t], C * sb[t]) for t in range(STEPS)], "cum": [C * su[t] for t in range(STEPS)]} for C in CS}


def main():
    with Pool(4) as pool:
        clean = pool.map(job, [(s, None, 1, 0, None) for s in range(SEEDS)], chunksize=1)
    base = {o["seed"]: o["loss"] for o in clean}
    thr = {s: thresholds(clean, s) for s in range(SEEDS)}
    L, res = [], {"d": D, "ts": TS, "n": N_DRAW, "W": WC, "cells": {}}
    for C in CS:
        fs, fc = [], []
        for o in clean:
            th = thr[o["seed"]][C]
            for t in range(STEPS):
                fs.append(o["a"][t] > th["step"][t][0] or o["b"][t] > th["step"][t][1])
                fc.append(fs[-1] or o["u"][t] > th["cum"][t])
        res["honest_flag_step_%.2f" % C] = float(np.mean(fs))
        res["honest_flag_cum_%.2f" % C] = float(np.mean(fc))
        L.append("honest steps flagged, C=%.2f: per-step %.4f, per-step+cum %.4f (of %d)" % (C, np.mean(fs), np.mean(fc), len(fs)))
    prng = np.random.default_rng(51)
    draws = [(j % SEEDS, float(prng.random())) for j in range(max(4, int(N_DRAW * SCALE)))]
    jobs = [(seed, v, T, int(u * (STEPS - T + 1)), thr[seed]) for seed, u in draws for T in TS for v in VARIANTS]
    with Pool(4) as pool:
        outs = pool.map(job, jobs, chunksize=1)
    for v in VARIANTS:
        for T in TS:
            rs = [o for o in outs if o["attack"] == v and o["T"] == T]
            dl = np.array([abs(o["loss"] - base[o["seed"]]) if np.isfinite(o["loss"]) else np.inf for o in rs])
            h = ~np.isfinite(dl) | (dl > EPS)
            med = float(np.median(dl[np.isfinite(dl)])) if np.isfinite(dl).any() else float("nan")
            sc = float(np.median([np.median(o["scales"]) for o in rs]))
            key = "%s_C%.2f_T%d" % (v[0], v[1], T)
            res["cells"][key] = {"n": len(rs), "harmful": int(h.sum()), "median_dL": med, "median_scale": sc}
            L.append("%-4s C=%.2f T=%-3d n=%d harmful %2d (%.2f) median |dL| %.4f  median scale %.4f" % (v[0], v[1], T, len(rs), h.sum(), h.mean(), med, sc))
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
