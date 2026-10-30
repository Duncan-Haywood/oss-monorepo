"""Milestone 40, H4: how often does one silent bit flip in a weight during real training change the output by more than a referee tolerance?

Tiny causal transformer of milestones 11 and 12 (plain SGD, 600 steps, fp32). One bit of one weight is flipped after the update at a random step;
final held-out loss and weights are compared with the clean run of the same seed. Also: clean runs at 1 and 4 threads.
Run from this directory:  OMP_NUM_THREADS=1 /path/to/python run.py [flips_per_class] [seeds]   (needs torch; writes results.json, results.txt)"""
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
PER_CLASS = int(sys.argv[1]) if len(sys.argv) > 1 else 80
SEEDS = int(sys.argv[2]) if len(sys.argv) > 2 else 8
STEPS = 600
CLASSES = {"sign": (31, 31), "exp_hi": (27, 30), "exp_lo": (23, 26), "man_hi": (16, 22), "man_lo": (0, 15)}
WEIGHT = {k: (hi - lo + 1) / 32 for k, (lo, hi) in CLASSES.items()}
EPS = (1e-3, 1e-2, 1e-1)
DATA = load_text(os.path.join(HERE, "..", "transformer", "corpus.txt"))


def flip_bit(params, flat_index, bit):
    for q in params:
        if flat_index < q.numel():
            a = q.detach().numpy().view(np.int32).reshape(-1)
            a[flat_index] ^= np.int32(-2**31) if bit == 31 else np.int32(1 << bit)
            return
        flat_index -= q.numel()


def run(seed, flip=None, batch=32, ctx=32, lr0=0.5):
    tr, te, vocab = DATA
    torch.manual_seed(seed)
    model = TinyLM(vocab, ctx)
    params = list(model.parameters())
    order = np.random.default_rng(10_000 + seed)
    for t in range(STEPS):
        idx = order.integers(0, len(tr) - ctx - 1, batch)
        x, y = batch_at(tr, idx, ctx)
        lr = lr_at(t, STEPS, lr0)
        g = grad_vec(model, x, y)
        with torch.no_grad():
            off = 0
            for q in params:
                n = q.numel()
                q -= lr * g[off:off + n].view_as(q)
                off += n
        if flip is not None and t == flip[0]:
            flip_bit(params, flip[1], flip[2])
    w = torch.cat([q.detach().reshape(-1) for q in params])
    return float(heldout(model, te, ctx)), w


def clean(seed):
    return run(seed)


def faulty(a):
    seed, step, idx, bit, cls = a
    loss, w = run(seed, (step, idx, bit))
    return {"seed": seed, "step": step, "bit": bit, "cls": cls, "loss": loss, "w": w}


def main():
    with Pool(4) as pool:
        base = pool.map(clean, range(SEEDS))
        n_par = sum(p.numel() for p in TinyLM(DATA[2], 32).parameters())
        rng = np.random.default_rng(40)
        jobs = []
        for cls, (lo, hi) in CLASSES.items():
            for k in range(PER_CLASS):
                jobs.append((k % SEEDS, int(rng.integers(0, STEPS)), int(rng.integers(0, n_par)), int(rng.integers(lo, hi + 1)), cls))
        outs = pool.map(faulty, jobs, chunksize=4)
    # thread-count nondeterminism, in this process
    thread_rows = []
    for s in range(3):
        torch.set_num_threads(4)
        l4, w4 = run(s)
        torch.set_num_threads(1)
        l1, w1 = base[s]
        thread_rows.append({"seed": s, "dloss": l4 - l1, "rel_l2": float((w4 - w1).norm() / w1.norm())})
    res = {"params": n_par, "steps": STEPS, "per_class": PER_CLASS, "seeds": SEEDS, "clean_loss": [b[0] for b in base],
           "clean_std": float(np.std([b[0] for b in base], ddof=1)), "threads": thread_rows, "classes": {}}
    for cls in CLASSES:
        rows = [o for o in outs if o["cls"] == cls]
        d = np.array([abs(o["loss"] - base[o["seed"]][0]) if np.isfinite(o["loss"]) else np.inf for o in rows])
        rel = np.array([float((o["w"] - base[o["seed"]][1]).norm() / base[o["seed"]][1].norm()) if torch.isfinite(o["w"]).all() else np.inf for o in rows])
        res["classes"][cls] = {"n": len(rows), "nonfinite": float(np.mean(~np.isfinite(d))), "median_dloss": float(np.median(d)),
                               "median_rel_l2": float(np.median(rel)), "exactly_equal_loss": float(np.mean(d == 0)),
                               "harm": {str(e): float(np.mean(d > e)) for e in EPS}}
    res["overall_harm"] = {str(e): sum(WEIGHT[c] * res["classes"][c]["harm"][str(e)] for c in CLASSES) for e in EPS}
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    L = ["== params %d, %d steps, %d seeds, clean held-out loss std across seeds %.4f" % (n_par, STEPS, SEEDS, res["clean_std"]),
         "== threads 4 vs 1 (clean): " + "; ".join("seed %d dloss %.2e rel_l2 %.2e" % (r["seed"], r["dloss"], r["rel_l2"]) for r in thread_rows),
         "class   bits   n  nonfinite  P(|dL|>1e-3) P(>1e-2) P(>1e-1)  median_dL  median_relL2  P(dL==0)"]
    for cls, (lo, hi) in CLASSES.items():
        c = res["classes"][cls]
        L.append("%-7s %2d-%-2d %3d  %6.3f     %6.3f      %6.3f   %6.3f   %9.2e  %9.2e  %6.3f" % (
            cls, lo, hi, c["n"], c["nonfinite"], c["harm"]["0.001"], c["harm"]["0.01"], c["harm"]["0.1"], c["median_dloss"], c["median_rel_l2"], c["exactly_equal_loss"]))
    L.append("== overall P(harm) with uniform bit: " + ", ".join("eps %g: %.3f" % (e, res["overall_harm"][str(e)]) for e in EPS))
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
