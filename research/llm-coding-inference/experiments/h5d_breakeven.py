"""Milestone 5d: break-even accuracy of a synthetic symmetric-flip coder for tuned PPI++ vs human-only.
    python3 experiments/h5d_breakeven.py          # writes h5d_breakeven.txt
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

SIZES, ACCS = (100, 200, 400), (0.60, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95)
REPS, SEED = int(os.environ.get("REPS", 600)), 20261102


def main():
    train, test_all, idx = H.corpus()
    sc = {}
    for l in (HERE / "llm_scores_Qwen2.5-3B-Instruct.tsv").read_text().splitlines():
        i, s = l.split("\t")
        sc[int(i)] = float(s)
    idx = [i for i in idx if i in sc]
    test = [test_all[i] for i in idx]
    human = np.array([t[2] for t in test], float)
    n = len(test)
    ll = np.array([math.log(1 + len(t[1].split())) for t in test])
    X = np.column_stack([np.ones(n)] + [[float(t[0] == k) for t in test] for k in ("hau", "ibo", "pcm")] + [(ll - ll.mean()) / ll.std()])
    truth = R.ols(X, human)
    rng = np.random.default_rng(SEED)
    out = [f"{n} items, human negative share {human.mean():.3f}; synthetic symmetric-flip coder, {REPS} draws, seed {SEED}",
           "columns per row: coverage human-only, coverage ppi++, mean half-width ratio ppi++/human-only"]
    for a in ACCS:
        f_all = np.where(rng.random(n) < a, human, 1 - human)  # one coder run per accuracy level, fixed over draws
        for na in SIZES:
            rr = random.Random(SEED + na)
            q = M6.tq(na - 5)
            hit_h, hit_i, rat, skipped = [[] for _ in range(len(H.NAMES))], [[] for _ in range(len(H.NAMES))], [[] for _ in range(len(H.NAMES))], 0
            for _ in range(REPS):
                ix = np.array(rr.sample(range(n), na))
                try:
                    b3, s3 = M6.human_hc3(X[ix], human[ix], n)
                    bj, sj = M6.tuned_hc3(X, f_all, ix, human[ix])[:2]
                except np.linalg.LinAlgError:
                    skipped += 1
                    continue
                if not (np.all(np.isfinite(s3)) and np.all(np.isfinite(sj))):
                    skipped += 1
                    continue
                for j in range(len(H.NAMES)):
                    hit_h[j].append(abs(b3[j] - truth[j]) <= q * s3[j])
                    hit_i[j].append(abs(bj[j] - truth[j]) <= q * sj[j])
                    rat[j].append(sj[j] / s3[j])
            m = [np.mean(hit_h[j]) for j in range(len(H.NAMES))], [np.mean(hit_i[j]) for j in range(len(H.NAMES))], [np.mean(rat[j]) for j in range(len(H.NAMES))]
            out.append(f"a={a:.2f} n={na} dropped {skipped} MEAN {np.mean(m[0]):.3f} {np.mean(m[1]):.3f} {np.mean(m[2]):.3f}")
            print(out[-1], flush=True)
    (HERE / "h5d_breakeven.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
