"""Milestone 45, H4: does a magnitude-bound check still catch harmful bit flips when the verifier's reference scale is something it can hold
(the initialisation's max|w|, a fixed absolute bound) instead of the true previous maximum, and how large a value can an adversary plant under it?

Protocol of ../bit_flips_bound/run.py (d = 32, plain SGD in fp32, 600 steps, 4 seeds, harm = |dL_heldout| > 0.01 or non-finite), fp32 weight site.
Part A: 120 single-bit flips (60 exp_hi, 20 each exp_lo, sign, man_hi; rng seed 43 as in milestones 43/44, so the fp32 flips are the same).
  References: prev (true max|w| at the flip step, milestone 44's control), init (max|w| at initialisation, which a verifier can recompute from the seed),
  fixed B = 1 and 10. Check: reject if non-finite or |w| > K * ref (K = 1, 2, 4, 10, 100).
Part B: planted values. One random weight is set to +-a * m0 at a random step, m0 = max|w| at initialisation, a in A_LIST, 20 draws per a. Harm rate vs a
  is the most an adversary gains by staying under a bound K * m0 with a <= K.
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
A_LIST = [1, 2, 4, 8, 16, 32, 64, 128]
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
                for q in params:
                    if i < q.numel():
                        flat = q.view(-1)
                        info["prev"] = max(float(p.abs().max()) for p in params)
                        info["init"] = m0
                        flat[i] = flip32(float(flat[i]), int(arg)) if mode == "flip" else float(arg) * m0
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
    rng = np.random.default_rng(43)
    jobs = [(s, "clean", "clean", 0, 0.0, 0) for s in range(SEEDS)]
    for cls, (lo, hi, n) in CLASSES.items():
        for k in range(max(4, int(n * SCALE))):
            jobs.append((k % SEEDS, "flip", cls, int(rng.integers(0, STEPS)), float(rng.random()), int(rng.integers(lo, hi + 1))))
    prng = np.random.default_rng(45)
    for a in A_LIST:
        for k in range(max(4, int(20 * SCALE))):
            jobs.append((k % SEEDS, "plant", "a=%g" % a, int(prng.integers(0, STEPS)), float(prng.random()), a * (1 if prng.random() < .5 else -1)))
    with Pool(4) as pool:
        outs = pool.map(job, jobs, chunksize=2)
    clean = [o for o in outs if o["mode"] == "clean"]
    base = {o["seed"]: o["loss"] for o in clean}
    L = ["clean runs: init max|w| %s ; final max|w| %s" % (
        " ".join("%.3f" % o["init"] for o in clean), " ".join("%.3f" % o["final_max"] for o in clean))]

    def harm_of(rs):
        dl = np.array([abs(o["loss"] - base[o["seed"]]) if np.isfinite(o["loss"]) else np.inf for o in rs])
        return ~np.isfinite(dl) | (dl > EPS)

    res = {"d": D, "KS": KS, "fixed": FIXED, "clean_init": [o["init"] for o in clean], "clean_final": [o["final_max"] for o in clean], "A": {}, "B": {}}
    fl = [o for o in outs if o["mode"] == "flip"]
    harm = harm_of(fl)
    fin = np.array([np.isfinite(o["val"]) for o in fl])
    refs = {"prev": np.array([o["prev"] for o in fl]), "init": np.array([o["init"] for o in fl])}
    for B in FIXED:
        refs["fixed%g" % B] = np.full(len(fl), B)
    absval = np.array([abs(o["val"]) if np.isfinite(o["val"]) else np.inf for o in fl])
    L.append("Part A: %d flips, %d harmful. catch rate of harmful flips / flagged share of all flips, by reference and K" % (len(fl), harm.sum()))
    L.append("ref      K=" + "      ".join(map(str, KS)))
    for name, r in refs.items():
        c, f, miss = [], [], []
        for K in KS:
            flag = ~fin | (absval > K * r)
            c.append(float(flag[harm].mean())); f.append(float(flag.mean())); miss.append(int((harm & ~flag).sum()))
        res["A"][name] = {"catch": c, "flag_all": f, "missed": miss}
        L.append("%-8s %s | flag %s | missed %s" % (name, " ".join("%.2f" % x for x in c), " ".join("%.2f" % x for x in f), miss))
    L.append("Part B: planted +-a*m0 (m0 = init max|w|), 1 random weight, random step: share harmful")
    for a in A_LIST:
        rs = [o for o in outs if o["mode"] == "plant" and o["cls"] == "a=%g" % a]
        h = harm_of(rs)
        nf = int((~np.array([np.isfinite(o["loss"]) for o in rs])).sum())
        res["B"][str(a)] = {"n": len(rs), "harmful": int(h.sum()), "nonfinite_loss": nf}
        L.append("a=%-4g n=%d harmful %d (%.2f), non-finite loss %d" % (a, len(rs), h.sum(), h.mean(), nf))
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
