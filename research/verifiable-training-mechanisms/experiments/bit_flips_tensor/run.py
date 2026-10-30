"""Milestone 46, H4: does a per-tensor magnitude bound leave an adversary less room than the global bound of milestone 45?

Protocol of ../bit_flips_ref/run.py (d = 32, plain SGD in fp32, 600 steps, 4 seeds, harm = |dL_heldout| > 0.01 or non-finite), fp32 weight site.
Paired plants: for each draw (seed, step, weight) the same weight is set once to +-a * m0 (m0 = global init max|w|, the bound of milestone 45) and once to
+-a * m_t (m_t = init max|w| of the tensor that weight sits in, the per-tensor bound). Both are admitted by a bound K = a, so the harm rate vs a is what
an adversary gains under K x reference. Also reports the per-tensor init maxima and the share of weights in tensors with m_t < m0 / 2.
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
CLASSES = {"exp_hi": (27, 30, 60), "exp_lo": (23, 26, 20), "sign": (31, 31, 20), "man_hi": (20, 22, 20)}
A_LIST = [1, 2, 4, 8]
N_PLANT = 40
KS = [1, 2, 4, 10, 100]
FIXED = [1.0, 10.0]
DATA = load_text(os.path.join(HERE, "..", "transformer", "corpus.txt"))


def flip32(w, bit):
    a = np.array([w], dtype=np.float32).view(np.int32)
    a ^= np.int32(-2**31) if bit == 31 else np.int32(1 << bit)
    return float(a.view(np.float32)[0])


def run(seed, mode=None, step=0, u=0.0, arg=0.0, info=None):
    """mode 'flip': arg = bit; mode 'plant': arg = signed multiple of the init maximum."""
    tr, te, vocab = DATA
    torch.manual_seed(seed)
    model = TinyLM(vocab, CTX, d=D)
    params = list(model.parameters())
    npar = sum(p.numel() for p in params)
    m0 = max(float(p.abs().max()) for p in params)
    mt = [float(p.abs().max()) for p in params]
    order = np.random.default_rng(10_000 + seed)
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
            if mode and t == step:
                i = int(u * npar)
                for ti, q in enumerate(params):
                    if i < q.numel():
                        flat = q.view(-1)
                        info["init"] = m0
                        flat[i] = float(arg) * (m0 if mode == "plant_global" else mt[ti])
                        info["m_t"] = mt[ti]; info["tensor"] = ti
                        info["val"] = float(flat[i])
                        break
                    i -= q.numel()
    info = info if info is not None else {}
    info["final_max"] = max(float(p.abs().max()) for p in params)
    info["init"] = m0
    return float(heldout(model, te, CTX))


def job(a):
    seed, mode, cls, step, u, arg = a
    info = {}
    loss = run(seed, None if mode == "clean" else mode, step, u, arg, info)
    return {"seed": seed, "mode": mode, "cls": cls, "arg": arg, "loss": loss, **info}


def main():
    prng = np.random.default_rng(46)
    jobs = [(s, "clean", "clean", 0, 0.0, 0) for s in range(SEEDS)]
    for a in A_LIST:
        for k in range(max(4, int(N_PLANT * SCALE))):
            seed, step, u = k % SEEDS, int(prng.integers(0, STEPS)), float(prng.random())
            sgn = 1 if prng.random() < .5 else -1
            for mode in ("plant_global", "plant_tensor"):
                jobs.append((seed, mode, "a=%g" % a, step, u, a * sgn))
    with Pool(4) as pool:
        outs = pool.map(job, jobs, chunksize=2)
    clean = [o for o in outs if o["mode"] == "clean"]
    base = {o["seed"]: o["loss"] for o in clean}
    L = ["clean runs: init max|w| %s" % " ".join("%.3f" % o["init"] for o in clean)]

    def harm_of(rs):
        dl = np.array([abs(o["loss"] - base[o["seed"]]) if np.isfinite(o["loss"]) else np.inf for o in rs])
        return ~np.isfinite(dl) | (dl > EPS)

    res = {"d": D, "A_LIST": A_LIST, "B": {}}
    pl = [o for o in outs if o["mode"] == "plant_tensor"]
    ratio = np.array([o["m_t"] / o["init"] for o in pl])
    L.append("planted weight's tensor max / global max (m_t / m0): median %.2f, min %.2f, share of draws with m_t < m0/2: %.2f" % (
        np.median(ratio), ratio.min(), (ratio < .5).mean()))
    L.append("share harmful when a weight is set to +-a * reference (paired draws, n=%d per cell)" % len(pl) if False else
             "share harmful when a weight is set to +-a * reference (paired draws): global m0 vs own-tensor m_t")
    for a in A_LIST:
        g = [o for o in outs if o["mode"] == "plant_global" and o["cls"] == "a=%g" % a]
        t = [o for o in outs if o["mode"] == "plant_tensor" and o["cls"] == "a=%g" % a]
        hg, ht = harm_of(g), harm_of(t)
        res["B"][str(a)] = {"n": len(g), "global_harmful": int(hg.sum()), "tensor_harmful": int(ht.sum()),
                            "only_global": int((hg & ~ht).sum()), "only_tensor": int((ht & ~hg).sum())}
        L.append("a=%-3g n=%d  global %d (%.2f)  tensor %d (%.2f)  harmful only under global %d, only under tensor %d" % (
            a, len(g), hg.sum(), hg.mean(), ht.sum(), ht.mean(), (hg & ~ht).sum(), (ht & ~hg).sum()))
    by = {}
    for o in pl:
        by.setdefault(o["tensor"], []).append(o["m_t"])
    L.append("tensor index: planted-draw count, init max|w|  " + "; ".join("%d: n=%d m=%.2f" % (k, len(v), np.mean(v)) for k, v in sorted(by.items())))
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
