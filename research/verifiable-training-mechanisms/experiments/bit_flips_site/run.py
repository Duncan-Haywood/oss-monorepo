"""Milestone 42, H4: silent bit flips in weights vs gradients vs activations.

Protocol of ../bit_flips_size/run.py at d = 32 (plain SGD, 600 steps, fp32, 4 seeds, harm = |dL_heldout| > 0.01 or non-finite),
with the flip applied at one of three sites at a random step: weight (after the update), gradient (one element of the flattened
gradient before the update), activation (one element of one block's output in the forward pass of that step).
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
SEEDS, STEPS, D, BATCH, CTX = 4, 600, 32, 32, 32
SITES = ("weight", "gradient", "activation")
CLASSES = {"exp_hi": ((27, 30), 60), "exp_lo": ((23, 26), 20), "sign": ((31, 31), 20), "man_hi": ((16, 22), 20)}
EPS = 0.01
DATA = load_text(os.path.join(HERE, "..", "transformer", "corpus.txt"))


def xor_bit(a, bit):
    a ^= np.int32(-2**31) if bit == 31 else np.int32(1 << bit)


def flip_params(params, i, bit):
    for q in params:
        if i < q.numel():
            xor_bit(q.detach().numpy().view(np.int32).reshape(-1)[i:i + 1], bit)
            return
        i -= q.numel()


def run(seed, site=None, step=0, u=0.0, bit=0, blk=0):
    """u in [0,1) picks the element within the site's tensor."""
    tr, te, vocab = DATA
    torch.manual_seed(seed)
    model = TinyLM(vocab, CTX, d=D)
    params = list(model.parameters())
    npar = sum(p.numel() for p in params)
    order = np.random.default_rng(10_000 + seed)
    for t in range(STEPS):
        idx = order.integers(0, len(tr) - CTX - 1, BATCH)
        x, y = batch_at(tr, idx, CTX)
        hook = None
        if site == "activation" and t == step:
            def fn(mod, inp, out):
                out = out.clone()
                flat = out.detach().numpy().view(np.int32).reshape(-1)
                j = int(u * flat.size)
                xor_bit(flat[j:j + 1], bit)
                return out
            hook = model.blocks[blk].register_forward_hook(fn)
        g = grad_vec(model, x, y)
        if hook:
            hook.remove()
        if site == "gradient" and t == step:
            g = g.clone()
            xor_bit(g.numpy().view(np.int32)[int(u * npar):int(u * npar) + 1], bit)
        lr = lr_at(t, STEPS, lr0=0.5)
        with torch.no_grad():
            off = 0
            for q in params:
                n = q.numel()
                q -= lr * g[off:off + n].view_as(q)
                off += n
        if site == "weight" and t == step:
            flip_params(params, int(u * npar), bit)
    return float(heldout(model, te, CTX))


def job(a):
    seed, site, cls, step, u, bit, blk = a
    return {"seed": seed, "site": site, "cls": cls, "loss": run(seed) if site == "clean" else run(seed, site, step, u, bit, blk)}


def main():
    rng = np.random.default_rng(42)
    jobs = [(s, "clean", "clean", 0, 0.0, 0, 0) for s in range(SEEDS)]
    for site in SITES:
        for cls, ((lo, hi), n) in CLASSES.items():
            for k in range(max(4, int(n * SCALE))):
                jobs.append((k % SEEDS, site, cls, int(rng.integers(0, STEPS)), float(rng.random()), int(rng.integers(lo, hi + 1)), int(rng.integers(0, 2))))
    with Pool(4) as pool:
        outs = pool.map(job, jobs, chunksize=2)
    base = {o["seed"]: o["loss"] for o in outs if o["site"] == "clean"}
    res = {"d": D, "steps": STEPS, "seeds": SEEDS, "eps": EPS, "clean": [base[s] for s in range(SEEDS)], "rows": {}}
    L = ["site class n nonfinite finite_harm any_harm(|dL|>%g)" % EPS]
    wt = {"exp_hi": 4 / 32, "exp_lo": 4 / 32, "sign": 1 / 32, "man_hi": 7 / 32}
    for site in SITES:
        res["rows"][site] = {}
        for cls in CLASSES:
            rs = [o for o in outs if o["site"] == site and o["cls"] == cls]
            dl = np.array([abs(o["loss"] - base[o["seed"]]) if np.isfinite(o["loss"]) else np.inf for o in rs])
            nf, fin = float(np.mean(~np.isfinite(dl))), float(np.mean(np.isfinite(dl) & (dl > EPS)))
            res["rows"][site][cls] = {"n": len(rs), "nonfinite": nf, "finite_harm": fin, "harm": nf + fin}
            L.append("%-10s %-6s %3d %.3f %.3f %.3f" % (site, cls, len(rs), nf, fin, nf + fin))
        res["rows"][site]["overall_harm_lower_bound"] = sum(wt[c] * res["rows"][site][c]["harm"] for c in wt)
        L.append("%s overall P(harm), bits 16-31 (mantissa 0-15 counted 0): %.3f" % (site, res["rows"][site]["overall_harm_lower_bound"]))
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
