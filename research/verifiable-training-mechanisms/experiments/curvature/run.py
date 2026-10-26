"""Milestone 29 (H6): is the subsample cheat's accepted error aligned with high-curvature directions?
Runs the real subsample cheat (same seeds, batches, schedule and acceptance rule as experiments/transformer_cheats) and, at every
accepted step, measures on the full-batch loss the Rayleigh quotient r(v) = v'Hv/|v|^2 (H by double backprop) for: the error
eps = cheap - g, its orthogonal part to g, a random direction (mean of 3 draws), and g itself. Every 20th step also estimates
lambda_max(H) by 15 power iterations. Reports r(v)/lambda_max and the ratio r(eps_orth)/r(random).

Run:  OMP_NUM_THREADS=1 PYTHONPATH=../../src /path/to/python run.py   (needs torch; writes results.json, results.txt)"""
import json
import os
import sys
from multiprocessing import Pool

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import torch  # noqa: E402
import torch.nn.functional as F  # noqa: E402
from torch.nn.attention import SDPBackend, sdpa_kernel  # noqa: E402
from vtm import margin_tf as tf  # noqa: E402

torch.set_num_threads(1)
MATH = lambda: sdpa_kernel(SDPBackend.MATH)  # the flash CPU kernel has no double backward; used for Hessian products only
SEEDS, T, BATCH, CTX = 10, 600, 32, 32
TAUS = [3e-2, 1e-1]
TXT = tf.load_text(os.path.join(HERE, "..", "transformer", "corpus.txt"))


def hvp_fn(model, x, y):
    params = list(model.parameters())
    with MATH():
        out = model(x)
        loss = F.cross_entropy(out.reshape(-1, out.shape[-1]), y.reshape(-1))
        gs = torch.autograd.grad(loss, params, create_graph=True)
    flat = torch.cat([q.reshape(-1) for q in gs])

    def hv(v):
        with MATH():
            h = torch.autograd.grad(flat, params, grad_outputs=v, retain_graph=True)
        return torch.cat([q.reshape(-1) for q in h])
    return hv


def rayleigh(hv, v):
    return float(v @ hv(v)) / float(v @ v)


def run(a):
    seed, tau = a
    tr, te, vocab = TXT
    torch.manual_seed(seed)
    model = tf.TinyLM(vocab, CTX)
    params = list(model.parameters())
    order = np.random.default_rng(10_000 + seed)
    perm = np.random.default_rng(20_000 + seed)
    rnd = torch.Generator().manual_seed(40_000 + seed)
    rec = {"eps": [], "orth": [], "rand": [], "g": [], "lmax": [], "lmax_at_acc": []}
    last_lmax = None
    for t in range(T):
        idx = order.integers(0, len(tr) - CTX - 1, BATCH)
        x, y = tf.batch_at(tr, idx, CTX)
        lr = tf.lr_at(t, T, 0.5)
        g = tf.grad_vec(model, x, y)
        cheap = tf.grad_vec(model, x[:BATCH // 4], y[:BATCH // 4])
        p = torch.tensor(perm.permutation(BATCH))
        gr = tf.grad_vec(model, x[p], y[p])
        if lr * float((cheap - gr).norm()) <= tau:
            eps = cheap - g
            gh = g / g.norm()
            orth = eps - float(eps @ gh) * gh
            hv = hvp_fn(model, x, y)
            rv = [torch.randn(eps.shape, generator=rnd) for _ in range(3)]
            rec["eps"].append(rayleigh(hv, eps))
            rec["orth"].append(rayleigh(hv, orth))
            rec["rand"].append(float(np.mean([rayleigh(hv, v) for v in rv])))
            rec["g"].append(rayleigh(hv, g))
            if len(rec["eps"]) % 20 == 1:
                v = torch.randn(eps.shape, generator=rnd)
                for _ in range(15):
                    w = hv(v)
                    v = w / w.norm()
                rec["lmax"].append(rayleigh(hv, v))
            g = cheap
        with torch.no_grad():
            off = 0
            for q in params:
                n = q.numel()
                q -= lr * g[off:off + n].view_as(q)
                off += n
    return {k: (float(np.mean(v)) if v else None) for k, v in rec.items()} | {"n": len(rec["eps"])}


def main():
    rows = []
    with Pool(4) as pool:
        for tau in TAUS:
            out = pool.map(run, [(s, tau) for s in range(SEEDS)])
            ok = [o for o in out if o["n"] > 0 and o["lmax"] is not None]
            f = lambda k: np.array([o[k] for o in ok])
            ratio = f("orth") / f("rand")
            rows.append({"tau": tau, "seeds": len(ok), "accepted_per_seed": float(np.mean([o["n"] for o in ok])),
                         "r_eps": float(f("eps").mean()), "r_orth": float(f("orth").mean()), "r_rand": float(f("rand").mean()),
                         "r_g": float(f("g").mean()), "lmax": float(f("lmax").mean()),
                         "orth_over_rand": float(ratio.mean()), "orth_over_rand_ci": [float(np.percentile(ratio, 2.5)), float(np.percentile(ratio, 97.5))],
                         "orth_over_lmax": float((f("orth") / f("lmax")).mean()), "rand_over_lmax": float((f("rand") / f("lmax")).mean())})
            print(rows[-1], flush=True)
    json.dump({"rows": rows}, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    lines = ["tau     seeds acc/seed  r(eps)   r(orth)  r(rand)  r(g)    lmax    orth/rand [95% CI]       orth/lmax  rand/lmax"]
    for r in rows:
        lines.append(f"{r['tau']:<7.0e} {r['seeds']:<5d} {r['accepted_per_seed']:7.1f}  {r['r_eps']:.4f}  {r['r_orth']:.4f}  {r['r_rand']:.4f}  {r['r_g']:.4f}  {r['lmax']:.3f}  "
                     f"{r['orth_over_rand']:7.2f} [{r['orth_over_rand_ci'][0]:.2f},{r['orth_over_rand_ci'][1]:.2f}]  {r['orth_over_lmax']:.4f}    {r['rand_over_lmax']:.4f}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
