"""Milestone 5c: cut chosen on c human labels (charged), PPI++ on n other rows vs human-only on n + c rows.
    python3 experiments/h5c_calibrated.py Qwen2.5-3B-Instruct   # writes h5c_<model>.txt
"""
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

SIZES, C, REPS, SEED = (100, 200, 400), 100, int(os.environ.get("REPS", 600)), 20261101


def cut(score, y):
    best, bt = -1.0, 0.0
    for t in np.unique(score):
        f = score > t
        v = f[y == 1].mean() + (~f)[y == 0].mean()
        if v > best:
            best, bt = v, t
    return bt


def main():
    model = sys.argv[1]
    train, test_all, idx = H.corpus()
    sc = {}
    for l in (HERE / f"llm_scores_{model}.tsv").read_text().splitlines():
        i, s = l.split("\t")
        sc[int(i)] = float(s)
    idx = [i for i in idx if i in sc]
    test = [test_all[i] for i in idx]
    human = np.array([t[2] for t in test], float)
    score = np.array([sc[i] for i in idx])
    n = len(test)
    import math
    ll = np.array([math.log(1 + len(t[1].split())) for t in test])
    X = np.column_stack([np.ones(n)] + [[float(t[0] == k) for t in test] for k in ("hau", "ibo", "pcm")] + [(ll - ll.mean()) / ll.std()])
    truth = R.ols(X, human)
    out = [f"model {model}: {n} items, human negative share {human.mean():.3f}; c={C}, {REPS} draws, seed {SEED}",
           "columns: coverage hum(n+c) hc3t, ppi++(n) hc3t; mean half-width ratio ppi++(n)/hum(n+c); mean calibrated sens+spec"]
    for na in SIZES:
        rr = random.Random(SEED + na)
        q, qh, skipped = M6.tq(na - 5), M6.tq(na + C - 5), 0
        hit = {m: [[] for _ in H.NAMES] for m in ("h", "i")}
        rat = [[] for _ in H.NAMES]
        ss = []
        for _ in range(REPS):
            ix = np.array(rr.sample(range(n), na + C))
            cal, aud = ix[:C], ix[C:]
            t = cut(score[cal], human[cal])
            f = (score > t).astype(float)
            ss.append(f[human == 1].mean() + 1 - f[human == 0].mean())
            try:
                b3, s3 = M6.human_hc3(X[ix], human[ix], n)
                bj, sj = M6.tuned_hc3(X, f, aud, human[aud])[:2]
            except np.linalg.LinAlgError:
                skipped += 1
                continue
            if not (np.all(np.isfinite(s3)) and np.all(np.isfinite(sj))):
                skipped += 1
                continue
            for j in range(len(H.NAMES)):
                hit["h"][j].append(abs(b3[j] - truth[j]) <= qh * s3[j])
                hit["i"][j].append(abs(bj[j] - truth[j]) <= q * sj[j])
                rat[j].append(q * sj[j] / (qh * s3[j]))
        out.append(f"# {model} n={na}: {skipped} of {REPS} dropped; mean sens+spec {np.mean(ss):.3f}")
        rows_ = []
        for j, nm in enumerate(H.NAMES):
            rows_.append([np.mean(hit["h"][j]), np.mean(hit["i"][j]), np.mean(rat[j])])
            out.append(f"{model} {na} {nm} " + " ".join(f"{v:.3f}" for v in rows_[-1]))
        out.append(f"{model} {na} MEAN " + " ".join(f"{v:.3f}" for v in np.mean(rows_, axis=0)))
        print("\n".join(out[-8:]), flush=True)
    (HERE / f"h5c_{model}.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
