"""Milestone 5g: fit the synthetic error mechanism to the real 1.5B and 3B coders' errors; does it reproduce their width ratios?
    python3 experiments/h5g_fitted.py         # writes h5g_fitted.txt
"""
import math
import os
import random
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import h3_llm_width as H  # noqa: E402
import h6m_ppi_hc3 as M6  # noqa: E402
from llmci import regression as R  # noqa: E402

SIZES, MODELS = (100, 200, 400), ("Qwen2.5-1.5B-Instruct", "Qwen2.5-3B-Instruct")
REPS, SEED = int(os.environ.get("REPS", 600)), 20261105


def logit_fit(Z, y, iters=50):
    b = np.zeros(Z.shape[1])
    for _ in range(iters):
        p = 1 / (1 + np.exp(-Z @ b))
        W = np.maximum(p * (1 - p), 1e-9)
        step = np.linalg.solve(Z.T @ (Z * W[:, None]) + 1e-6 * np.eye(Z.shape[1]), Z.T @ (y - p))
        b += step
        if np.abs(step).max() < 1e-9:
            break
    return b, 1 / (1 + np.exp(-Z @ b))


def ratios(X, human, f_all, truth, n, rng_seed):
    N = len(human)
    res = {}
    for na in SIZES:
        rr = random.Random(rng_seed + na)
        q = M6.tq(na - 5)
        hit, rat, skipped = [[] for _ in range(len(H.NAMES))], [[] for _ in range(len(H.NAMES))], 0
        for _ in range(REPS):
            ix = np.array(rr.sample(range(N), na))
            try:
                b3, s3 = M6.human_hc3(X[ix], human[ix], N)
                bj, sj = M6.tuned_hc3(X, f_all, ix, human[ix])[:2]
            except np.linalg.LinAlgError:
                skipped += 1
                continue
            if not (np.all(np.isfinite(s3)) and np.all(np.isfinite(sj))):
                skipped += 1
                continue
            for j in range(len(H.NAMES)):
                hit[j].append(abs(bj[j] - truth[j]) <= q * sj[j])
                rat[j].append(sj[j] / s3[j])
        res[na] = (np.mean([np.mean(h) for h in hit]), np.mean([np.mean(r) for r in rat]), skipped)
    return res


def main():
    train, test_all, idx = H.corpus()
    out = []
    for model in MODELS:
        sc = {}
        for l in (HERE / f"llm_scores_{model}.tsv").read_text().splitlines():
            i, s = l.split("\t")
            sc[int(i)] = float(s)
        ids = [i for i in idx if i in sc]
        test = [test_all[i] for i in ids]
        human = np.array([t[2] for t in test], float)
        n = len(test)
        f_real = np.array([float(sc[i] > 0) for i in ids])
        ll = np.array([math.log(1 + len(t[1].split())) for t in test])
        z = (ll - ll.mean()) / ll.std()
        X = np.column_stack([np.ones(n)] + [[float(t[0] == k) for t in test] for k in ("hau", "ibo", "pcm")] + [z])
        truth = R.ols(X, human)
        err = (f_real != human).astype(float)
        mention = np.array([float("@" in t[1]) for t in test])
        Z = np.column_stack([X, human, mention])
        beta, p = logit_fit(Z, err)
        names = ["const", "hau", "ibo", "pcm", "length_z", "human_neg", "mention"]
        out.append(f"{model}: {n} items, real agreement {1 - err.mean():.3f}; logistic error fit: " + ", ".join(f"{k} {v:+.2f}" for k, v in zip(names, beta)))
        rng = np.random.default_rng(SEED)
        f_syn = np.where(rng.random(n) < p, 1 - human, human)
        out.append(f"  fitted-synthetic realised agreement {np.mean(f_syn == human):.3f}; mean fitted flip prob {p.mean():.3f}")
        for label, f in (("real", f_real), ("fitted", f_syn)):
            r = ratios(X, human, f, truth, n, SEED)
            for na in SIZES:
                out.append(f"  {label} n={na} coverage {r[na][0]:.3f} ratio {r[na][1]:.3f} dropped {r[na][2]}")
                print(model, out[-1], flush=True)
    (HERE / "h5g_fitted.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
