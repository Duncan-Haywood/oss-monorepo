"""Milestone 41, H4: does the harm of one silent weight bit flip fall as the model grows?

Same protocol as ../bit_flips/run.py (plain SGD, 600 steps, fp32, one bit of one weight flipped after the update at a random step, final
held-out loss compared with the clean run of the same seed), repeated at embedding width d = 16, 32, 64, 128 (2 layers, 2 heads).
Bit classes: exp_hi (27-30) 60 flips, exp_lo (23-26) 20, sign 20, man_hi (16-22) 20, per width; mantissa 0-15 omitted (0 of 100 harmful at d = 32).
Run from this directory:  OMP_NUM_THREADS=1 /path/to/python run.py [scale]   (needs torch; writes results.json, results.txt)"""
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
SEEDS = 4
STEPS = 600
WIDTHS = (16, 32, 64, 128)
CLASSES = {"exp_hi": ((27, 30), 60), "exp_lo": ((23, 26), 20), "sign": ((31, 31), 20), "man_hi": ((16, 22), 20)}
EPS = 0.01
DATA = load_text(os.path.join(HERE, "..", "transformer", "corpus.txt"))


def flip_bit(params, flat_index, bit):
    for q in params:
        if flat_index < q.numel():
            a = q.detach().numpy().view(np.int32).reshape(-1)
            a[flat_index] ^= np.int32(-2**31) if bit == 31 else np.int32(1 << bit)
            return
        flat_index -= q.numel()


def run(d, seed, flip=None, batch=32, ctx=32, lr0=0.5):
    tr, te, vocab = DATA
    torch.manual_seed(seed)
    model = TinyLM(vocab, ctx, d=d)
    params = list(model.parameters())
    order = np.random.default_rng(10_000 + seed)
    for t in range(STEPS):
        idx = order.integers(0, len(tr) - ctx - 1, batch)
        x, y = batch_at(tr, idx, ctx)
        g = grad_vec(model, x, y)
        lr = lr_at(t, STEPS, lr0)
        with torch.no_grad():
            off = 0
            for q in params:
                n = q.numel()
                q -= lr * g[off:off + n].view_as(q)
                off += n
        if flip is not None and t == flip[0]:
            flip_bit(params, flip[1], flip[2])
    return float(heldout(model, te, ctx))


def job(a):
    d, seed, step, idx, bit, cls = a
    return {"d": d, "seed": seed, "cls": cls, "loss": run(d, seed, (step, idx, bit)) if idx >= 0 else run(d, seed)}


def main():
    rng = np.random.default_rng(41)
    npar = {d: sum(p.numel() for p in TinyLM(DATA[2], 32, d=d).parameters()) for d in WIDTHS}
    jobs = [(d, s, 0, -1, 0, "clean") for d in WIDTHS for s in range(SEEDS)]
    for d in WIDTHS:
        for cls, ((lo, hi), n) in CLASSES.items():
            for k in range(max(4, int(n * SCALE))):
                jobs.append((d, k % SEEDS, int(rng.integers(0, STEPS)), int(rng.integers(0, npar[d])), int(rng.integers(lo, hi + 1)), cls))
    with Pool(4) as pool:
        outs = pool.map(job, jobs, chunksize=2)
    base = {(o["d"], o["seed"]): o["loss"] for o in outs if o["cls"] == "clean"}
    res = {"params": npar, "steps": STEPS, "seeds": SEEDS, "eps": EPS, "clean": {str(d): [base[(d, s)] for s in range(SEEDS)] for d in WIDTHS}, "rows": {}}
    L = ["width params clean_loss(mean) | class n nonfinite finite_harm any_harm(|dL|>%g)" % EPS]
    for d in WIDTHS:
        res["rows"][str(d)] = {}
        for cls in CLASSES:
            rs = [o for o in outs if o["d"] == d and o["cls"] == cls]
            dl = np.array([abs(o["loss"] - base[(d, o["seed"])]) if np.isfinite(o["loss"]) else np.inf for o in rs])
            nf, fin = float(np.mean(~np.isfinite(dl))), float(np.mean(np.isfinite(dl) & (dl > EPS)))
            res["rows"][str(d)][cls] = {"n": len(rs), "nonfinite": nf, "finite_harm": fin, "harm": nf + fin, "median_dloss": float(np.median(dl))}
            L.append("%4d %7d %.3f | %-6s %3d %.3f %.3f %.3f" % (d, npar[d], np.mean(res["clean"][str(d)]), cls, len(rs), nf, fin, nf + fin))
    for d in WIDTHS:
        r = res["rows"][str(d)]
        wt = {"exp_hi": 4 / 32, "exp_lo": 4 / 32, "sign": 1 / 32, "man_hi": 7 / 32}
        res["rows"][str(d)]["overall_harm_lower_bound"] = sum(wt[c] * r[c]["harm"] for c in wt)
        L.append("d=%d overall P(harm), bits 16-31 only (mantissa 0-15 counted 0): %.3f" % (d, res["rows"][str(d)]["overall_harm_lower_bound"]))
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
