"""Milestone 43, H4: does a narrower stored format change the harm of one silent weight bit flip?

Protocol of ../bit_flips_site/run.py (d = 32, plain SGD in fp32, 600 steps, 4 seeds, harm = |dL_heldout| > 0.01 or non-finite),
weight site only. The flipped weight is round-tripped through the stored format: cast to fp32/bf16/fp16, one bit xor-ed in that
format's bit pattern, cast back to fp32. Training arithmetic stays fp32, so this models a flip in a 16-bit stored copy of the
weights, not mixed-precision training. Bit classes are per format (top four exponent bits, remaining exponent bits, sign,
top three mantissa bits).
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
# format -> (torch dtype, sign bit, {class: (lo, hi, n)})
FORMATS = {
    "fp32": (torch.float32, 31, {"exp_hi": (27, 30, 60), "exp_lo": (23, 26, 20), "sign": (31, 31, 20), "man_hi": (20, 22, 20)}),
    "bf16": (torch.bfloat16, 15, {"exp_hi": (11, 14, 60), "exp_lo": (7, 10, 20), "sign": (15, 15, 20), "man_hi": (4, 6, 20)}),
    "fp16": (torch.float16, 15, {"exp_hi": (11, 14, 60), "exp_lo": (10, 10, 20), "sign": (15, 15, 20), "man_hi": (7, 9, 20)}),
}
DATA = load_text(os.path.join(HERE, "..", "transformer", "corpus.txt"))


def flip_stored(w, fmt, bit):
    """Return fp32 value of w after one bit of its fmt representation is flipped."""
    dt = FORMATS[fmt][0]
    if fmt == "fp32":
        a = np.array([w], dtype=np.float32).view(np.int32)
        a ^= np.int32(-2**31) if bit == 31 else np.int32(1 << bit)
        return float(a.view(np.float32)[0])
    a = torch.tensor([w], dtype=torch.float32).to(dt).view(torch.int16).clone()
    a ^= torch.tensor(-32768 if bit == 15 else 1 << bit, dtype=torch.int16)
    return float(a.view(dt).to(torch.float32)[0])


def run(seed, fmt=None, step=0, u=0.0, bit=0):
    tr, te, vocab = DATA
    torch.manual_seed(seed)
    model = TinyLM(vocab, CTX, d=D)
    params = list(model.parameters())
    npar = sum(p.numel() for p in params)
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
            if fmt and t == step:
                i = int(u * npar)
                for q in params:
                    if i < q.numel():
                        flat = q.view(-1)
                        flat[i] = flip_stored(float(flat[i]), fmt, bit)
                        break
                    i -= q.numel()
    return float(heldout(model, te, CTX))


def job(a):
    seed, fmt, cls, step, u, bit = a
    return {"seed": seed, "fmt": fmt, "cls": cls, "loss": run(seed) if fmt == "clean" else run(seed, fmt, step, u, bit)}


def main():
    rng = np.random.default_rng(43)
    jobs = [(s, "clean", "clean", 0, 0.0, 0) for s in range(SEEDS)]
    for fmt, (_, _, classes) in FORMATS.items():
        for cls, (lo, hi, n) in classes.items():
            for k in range(max(4, int(n * SCALE))):
                jobs.append((k % SEEDS, fmt, cls, int(rng.integers(0, STEPS)), float(rng.random()), int(rng.integers(lo, hi + 1))))
    with Pool(4) as pool:
        outs = pool.map(job, jobs, chunksize=2)
    base = {o["seed"]: o["loss"] for o in outs if o["fmt"] == "clean"}
    res = {"d": D, "steps": STEPS, "seeds": SEEDS, "eps": EPS, "clean": [base[s] for s in range(SEEDS)], "rows": {}}
    L = ["format class n nonfinite finite_harm any_harm(|dL|>%g)" % EPS]
    for fmt in FORMATS:
        res["rows"][fmt] = {}
        for cls in FORMATS[fmt][2]:
            rs = [o for o in outs if o["fmt"] == fmt and o["cls"] == cls]
            dl = np.array([abs(o["loss"] - base[o["seed"]]) if np.isfinite(o["loss"]) else np.inf for o in rs])
            nf, fin = float(np.mean(~np.isfinite(dl))), float(np.mean(np.isfinite(dl) & (dl > EPS)))
            res["rows"][fmt][cls] = {"n": len(rs), "nonfinite": nf, "finite_harm": fin, "harm": nf + fin}
            L.append("%-5s %-6s %3d %.3f %.3f %.3f" % (fmt, cls, len(rs), nf, fin, nf + fin))
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
