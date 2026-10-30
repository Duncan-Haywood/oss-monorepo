"""Milestone 27 (H6): is the damage of the subsample and stale cheats set by the size of their accepted error, or by its direction?

Run from this directory:  OMP_NUM_THREADS=1 PYTHONPATH=../../src /path/to/python run.py   (needs torch; writes results.json, results.txt)
Reads ../transformer_cheats/results.json (measured degradation of the real cheats, 10 seeds, same honest runs).

Arms, per cheat in {subsample, stale} and tau in {1e-2, 3e-2, 1e-1}: the referee accepts a step when lr * ||cheap - referee|| <= tau,
exactly as in vtm.margin_tf.train. The "rand" arm accepts the same way but applies the honest batch gradient plus an error of the
same norm as the cheat's (||cheap - g||) in a uniformly random direction. Same seeds, batches and schedule.
error_path_share = sum over accepted steps of lr * ||cheap - g|| / sum of lr * ||g|| (how much error was let in, relative to the path)."""
import json
import os
import sys
from multiprocessing import Pool

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import torch  # noqa: E402
from vtm import margin_tf as tf  # noqa: E402

torch.set_num_threads(1)
SEEDS, T, BATCH, CTX = 10, 600, 32, 32
TAUS = [1e-2, 3e-2, 1e-1]
TXT = tf.load_text(os.path.join(HERE, "..", "transformer", "corpus.txt"))


def run(a):
    seed, steps, kind, tau = a  # kind: honest | subsample | stale | subsample_rand | stale_rand
    tr, te, vocab = TXT
    torch.manual_seed(seed)
    model = tf.TinyLM(vocab, CTX)
    params = list(model.parameters())
    order = np.random.default_rng(10_000 + seed)
    perm = np.random.default_rng(20_000 + seed)
    rnd = torch.Generator().manual_seed(30_000 + seed)
    base = kind.split("_")[0]
    prev, acc, e_acc, d_all = None, 0, 0.0, 0.0
    for t in range(steps):
        idx = order.integers(0, len(tr) - CTX - 1, BATCH)
        x, y = tf.batch_at(tr, idx, CTX)
        lr = tf.lr_at(t, steps, 0.5)
        g = tf.grad_vec(model, x, y)
        d_all += lr * float(g.norm())
        if kind != "honest":
            cheap = tf.grad_vec(model, x[:BATCH // 4], y[:BATCH // 4]) if base == "subsample" else prev
            p = torch.tensor(perm.permutation(BATCH))
            gr = tf.grad_vec(model, x[p], y[p])
            if cheap is not None and lr * float((cheap - gr).norm()) <= tau:
                acc += 1
                e = float((cheap - g).norm())
                e_acc += lr * e
                if kind.endswith("_rand"):
                    u = torch.randn(g.shape, generator=rnd)
                    g = g + e * u / u.norm()
                else:
                    g = cheap
        prev = g
        with torch.no_grad():
            off = 0
            for q in params:
                n = q.numel()
                q -= lr * g[off:off + n].view_as(q)
                off += n
    return tf.heldout(model, te, CTX), acc / steps, e_acc / d_all


def main():
    meas = json.load(open(os.path.join(HERE, "..", "transformer_cheats", "results.json")))
    with Pool(4) as pool:
        h = np.array([r[0] for r in pool.map(run, [(s, T, "honest", 0.0) for s in range(SEEDS)])])
        rows = []
        for base in ["subsample", "stale"]:
            for tau in TAUS:
                m = next(r for r in meas["rows"] if r["strategy"] == base and abs(r["tau"] - tau) < 1e-12)
                out = pool.map(run, [(s, T, base + "_rand", tau) for s in range(SEEDS)])
                d = np.array([o[0] for o in out]) - h
                rows.append({"strategy": base, "tau": tau, "measured_accept": m["cheated"], "measured": m["deg_mean"],
                             "ci": [m["deg_lo"], m["deg_hi"]], "rand_accept": float(np.mean([o[1] for o in out])),
                             "rand": float(d.mean()), "rand_ci": [float(np.percentile(d, 2.5)), float(np.percentile(d, 97.5))],
                             "error_path_share": float(np.mean([o[2] for o in out]))})
                print(rows[-1], flush=True)
        json.dump({"honest": float(h.mean()), "rows": rows}, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    lines = [f"honest loss {h.mean():.4f}", "cheat      tau     accept real/rand  real deg [95% CI]               rand-direction deg  rand/real"]
    for r in rows:
        lines.append(f"{r['strategy']:<10} {r['tau']:<7.0e} {r['measured_accept']:.3f}/{r['rand_accept']:.3f}   "
                     f"{r['measured']:+.5f} [{r['ci'][0]:+.5f},{r['ci'][1]:+.5f}]  {r['rand']:+.5f}  {r['rand']/(r['measured'] or float('nan')):7.2f}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
