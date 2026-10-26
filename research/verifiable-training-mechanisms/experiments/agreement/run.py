"""Milestone 31 (H3 inputs): measured agreement probabilities of real cheap gradients, then the H3 contract costs at those values.

Along the honest trajectory of the `transformer_cheats` setup, two submissions agree when lr * ||a - b|| <= tau.
Run from this directory:  OMP_NUM_THREADS=1 /path/to/python run.py [seeds]   (needs torch, scipy; writes results.json, results.txt)"""
import json
import os
import sys
from multiprocessing import Pool

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import torch  # noqa: E402
from vtm.margin_tf import TinyLM, batch_at, grad_vec, lr_at, load_text  # noqa: E402
from vtm.peer import peer_cost  # noqa: E402

torch.set_num_threads(1)
SEEDS = int(sys.argv[1]) if len(sys.argv) > 1 else 10
STEPS, BATCH, CTX = 600, 32, 32
TAUS = [1e-3, 1e-2, 3e-2, 1e-1]
DATA = load_text(os.path.join(HERE, "..", "transformer", "corpus.txt"))


def job(seed):
    """Per-step distances (lr-scaled) between submissions, along the honest trajectory of one seed."""
    tr, _, vocab = DATA
    torch.manual_seed(seed)
    model = TinyLM(vocab, CTX)
    order = np.random.default_rng(10_000 + seed)
    perm = np.random.default_rng(20_000 + seed)
    pick = np.random.default_rng(30_000 + seed)
    d = {k: [] for k in ("hh", "hc", "cc", "cc_shared_hc", "stale_h")}
    prev = None
    for t in range(STEPS):
        idx = order.integers(0, len(tr) - CTX - 1, BATCH)
        x, y = batch_at(tr, idx, CTX)
        lr = lr_at(t, STEPS, 0.5)
        g = grad_vec(model, x, y)
        p = torch.tensor(perm.permutation(BATCH))
        g2 = grad_vec(model, x[p], y[p])
        q1, q2 = (torch.tensor(pick.choice(BATCH, BATCH // 4, replace=False)) for _ in range(2))
        c1 = grad_vec(model, x[q1], y[q1])
        c2 = grad_vec(model, x[q2], y[q2])
        cs = grad_vec(model, x[:BATCH // 4], y[:BATCH // 4])  # shared quarter: both workers submit this vector
        dist = lambda a, b: lr * float((a - b).norm())
        d["hh"].append(dist(g, g2))
        d["hc"].append(dist(c1, g))
        d["cc"].append(dist(c1, c2))
        d["cc_shared_hc"].append(dist(cs, g))
        d["stale_h"].append(dist(prev, g) if prev is not None else float("inf"))
        prev = g
        with torch.no_grad():
            off = 0
            for q in model.parameters():
                n = q.numel()
                q -= lr * g[off:off + n].view_as(q)
                off += n
    return {k: np.array(v) for k, v in d.items()}


def main():
    with Pool(4) as pool:
        runs = pool.map(job, range(SEEDS))
    res, lines = {"rows": [], "contract": []}, []
    lines.append("agreement probabilities (mean over seeds, [2.5, 97.5] percentile over seeds); agree = lr*||a-b|| <= tau")
    lines.append("tau      delta (honest pair disagrees)   alpha_sub (cheat~honest)   kappa_sub_indep (cheat~cheat)   alpha_shared   alpha_stale")
    for tau in TAUS:
        def stat(key, agree=True):
            v = np.array([(r[key] <= tau).mean() for r in runs])
            v = v if agree else 1 - v
            return float(v.mean()), float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))
        row = {"tau": tau, "delta": stat("hh", False), "alpha_sub": stat("hc"), "kappa_sub": stat("cc"),
               "alpha_shared": stat("cc_shared_hc"), "alpha_stale": stat("stale_h")}
        res["rows"].append(row)
        f = lambda s: f"{s[0]:.3f} [{s[1]:.3f}, {s[2]:.3f}]"
        lines.append(f"{tau:<8.0e} {f(row['delta']):<31} {f(row['alpha_sub']):<26} {f(row['kappa_sub']):<31} {f(row['alpha_shared']):<14} {f(row['alpha_stale'])}")
    lines.append("")
    lines.append("contract cost per worker with measured (delta, alpha, kappa); g = 0.75 (quarter batch) for subsample, 1.0 for stale; audit-only vs peer, both requiring (cheat, cheat) not to be an equilibrium")
    lines.append("cheat        tau      p     S    audit_unique  peer_unique   saving")
    for row in res["rows"]:
        for name, g, a, k in (("subsample", 0.75, "alpha_sub", "kappa_sub"), ("shared-q", 0.75, "alpha_shared", None), ("stale", 1.0, "alpha_stale", None)):
            delta, alpha = row["delta"][0], min(row[a][0], 1 - row["delta"][0])
            kappa = row[k][0] if k else 1.0
            for p in (0.1, 0.3):
                for S in (0.0, 1.0):
                    au = peer_cost(g, p, S, delta, alpha, kappa, use_peer=False, exclude_copying=True)
                    pu = peer_cost(g, p, S, delta, alpha, kappa, use_peer=True, exclude_copying=True)
                    sv = (au - pu) / au if np.isfinite(au) and au > 0 and np.isfinite(pu) else float("nan")
                    res["contract"].append(dict(cheat=name, tau=row["tau"], p=p, S=S, delta=delta, alpha=alpha, kappa=kappa, audit_unique=au, peer_unique=pu, saving=sv))
                    lines.append(f"{name:<12} {row['tau']:<8.0e} {p:<5} {S:<4} {au:<13.4f} {pu:<13.4f} {sv:+.4f}")
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
