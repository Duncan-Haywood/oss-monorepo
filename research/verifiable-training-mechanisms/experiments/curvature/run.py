"""Milestone 29 (H6): is the subsample cheat's orthogonal error harmful because it lines up with high-curvature directions?
Runs the real subsample cheat (same seeds, batches, schedule and acceptance rule as experiments/transformer_cheats) and, at every
accepted step, measures with Hessian-vector products of the full-batch loss the Rayleigh quotient u'Hu (u a unit vector) of
  orth: the part of e = cheap - g orthogonal to g;  rand: a random unit direction;  g_hat: the honest gradient direction.
Every 10th accepted step it also estimates lambda_max by 8 power iterations. It also sums the second-order loss increase
0.5 * lr^2 * e_orth'H e_orth over accepted steps (a rough predictor, on batch loss, not held-out loss).

Run from this directory:  OMP_NUM_THREADS=1 PYTHONPATH=../../src /path/to/python run.py   (needs torch; writes results.json, results.txt)"""
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
SEEDS, T, BATCH, CTX = 10, 600, 32, 32
TAUS = [3e-2, 1e-1]
TXT = tf.load_text(os.path.join(HERE, "..", "transformer", "corpus.txt"))


def hvp_fn(model, x, y):
    params = list(model.parameters())
    out = model(x)
    loss = F.cross_entropy(out.reshape(-1, out.shape[-1]), y.reshape(-1))
    gs = torch.autograd.grad(loss, params, create_graph=True)
    flat = torch.cat([q.reshape(-1) for q in gs])

    def hvp(v):
        hs = torch.autograd.grad(flat, params, grad_outputs=v, retain_graph=True)
        return torch.cat([h.reshape(-1) for h in hs])
    return hvp


def run(a):
    with sdpa_kernel(SDPBackend.MATH):  # the fused CPU attention kernel has no double backward
        return run_inner(a)


def run_inner(a):
    seed, tau = a
    tr, te, vocab = TXT
    torch.manual_seed(seed)
    model = tf.TinyLM(vocab, CTX)
    params = list(model.parameters())
    order = np.random.default_rng(10_000 + seed)
    perm = np.random.default_rng(20_000 + seed)
    rnd = torch.Generator().manual_seed(40_000 + seed)
    acc, q_orth, q_rand, q_g, lam, pred = 0, [], [], [], [], 0.0
    for t in range(T):
        idx = order.integers(0, len(tr) - CTX - 1, BATCH)
        x, y = tf.batch_at(tr, idx, CTX)
        lr = tf.lr_at(t, T, 0.5)
        g = tf.grad_vec(model, x, y)
        cheap = tf.grad_vec(model, x[:BATCH // 4], y[:BATCH // 4])
        p = torch.tensor(perm.permutation(BATCH))
        gr = tf.grad_vec(model, x[p], y[p])
        if lr * float((cheap - gr).norm()) <= tau:
            acc += 1
            eps = cheap - g
            gh = g / g.norm()
            orth = eps - (eps @ gh) * gh
            uo = orth / orth.norm()
            ur = torch.randn(g.numel(), generator=rnd)
            ur = ur / ur.norm()
            hvp = hvp_fn(model, x, y)
            q_orth.append(float(uo @ hvp(uo)))
            q_rand.append(float(ur @ hvp(ur)))
            q_g.append(float(gh @ hvp(gh)))
            pred += 0.5 * lr * lr * float(orth @ hvp(orth))
            if acc % 10 == 1:
                v = torch.randn(g.numel(), generator=rnd)
                for _ in range(8):
                    v = hvp(v / v.norm())
                lam.append(float(v.norm()))
            g = cheap
        with torch.no_grad():
            off = 0
            for q in params:
                n = q.numel()
                q -= lr * g[off:off + n].view_as(q)
                off += n
    m = lambda l: float(np.mean(l)) if l else float("nan")
    return {"acc": acc / T, "q_orth": m(q_orth), "q_rand": m(q_rand), "q_g": m(q_g), "lam": m(lam), "pred": pred}


def main():
    meas = json.load(open(os.path.join(HERE, "..", "transformer_cheats", "results.json")))
    rows = []
    with Pool(4) as pool:
        for tau in TAUS:
            out = pool.map(run, [(s, tau) for s in range(SEEDS)])
            mr = next(r for r in meas["rows"] if r["strategy"] == "subsample" and abs(r["tau"] - tau) < 1e-12)
            row = {"tau": tau, "measured_damage": mr["deg_mean"], "seeds": out}
            for k in ["q_orth", "q_rand", "q_g", "lam", "pred", "acc"]:
                row[k] = float(np.nanmean([o[k] for o in out]))
            ratio = np.array([o["q_orth"] / o["q_rand"] for o in out])
            row["ratio_orth_rand"] = [float(np.nanmean(ratio)), float(np.nanpercentile(ratio, 2.5)), float(np.nanpercentile(ratio, 97.5))]
            rows.append(row)
            print({k: v for k, v in row.items() if k != "seeds"}, flush=True)
    json.dump({"rows": rows}, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    lines = ["tau     accept  Rayleigh(orth)  Rayleigh(rand)  Rayleigh(g_hat)  lambda_max  orth/rand mean [95% range over seeds]  second-order pred  measured damage"]
    for r in rows:
        lines.append(f"{r['tau']:<7.0e} {r['acc']:.3f}  {r['q_orth']:.4f}  {r['q_rand']:.5f}  {r['q_g']:.4f}  {r['lam']:.3f}  "
                     f"{r['ratio_orth_rand'][0]:.1f} [{r['ratio_orth_rand'][1]:.1f},{r['ratio_orth_rand'][2]:.1f}]  {r['pred']:+.5f}  {r['measured_damage']:+.5f}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
