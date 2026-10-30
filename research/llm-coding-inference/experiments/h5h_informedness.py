"""Milestone 5h: is the real coders' null explained by their informedness (sens + spec - 1), not their agreement?
For each real coder (fixed cut score > 0, and the cut maximising Youden's J over the whole corpus, an in-sample
diagnostic with no label cost charged) a synthetic coder with the same sensitivity and specificity but independent
errors is run through the same tuned PPI++ + HC3 + t estimator as 5b to 5f.
    python3 experiments/h5h_informedness.py       # writes h5h_informedness.txt
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

SIZES = (100, 200, 400)
MODELS = ("Qwen2.5-0.5B-Instruct", "Qwen2.5-1.5B-Instruct", "Qwen2.5-3B-Instruct")
REPS, SEED = int(os.environ.get("REPS", 600)), 20261105


def sens_spec(f, human):
    return float(f[human == 1].mean()), float(1 - f[human == 0].mean())


def best_cut(s, human):
    best = (-1.0, 0.0)
    for c in np.unique(s):
        se, sp = sens_spec((s > c).astype(float), human)
        if se + sp - 1 > best[0]:
            best = (se + sp - 1, c)
    return best[1]


def run(f_all, X, human, truth, na, n):
    rr = random.Random(SEED + na)
    q = M6.tq(na - 5)
    k = len(H.NAMES)
    hit_h, hit_i, rat = [[] for _ in range(k)], [[] for _ in range(k)], [[] for _ in range(k)]
    skipped = 0
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
        for j in range(k):
            hit_h[j].append(abs(b3[j] - truth[j]) <= q * s3[j])
            hit_i[j].append(abs(bj[j] - truth[j]) <= q * sj[j])
            rat[j].append(sj[j] / s3[j])
    m = [np.mean([np.mean(v) for v in x]) for x in (hit_h, hit_i, rat)]
    return m, skipped


def main():
    train, test_all, idx = H.corpus()
    scores = {}
    for mname in MODELS:
        sc = {}
        for l in (HERE / f"llm_scores_{mname}.tsv").read_text().splitlines():
            i, s = l.split("\t")
            sc[int(i)] = float(s)
        scores[mname] = sc
    idx = [i for i in idx if all(i in sc for sc in scores.values())]
    test = [test_all[i] for i in idx]
    human = np.array([t[2] for t in test], float)
    n = len(test)
    ll = np.array([math.log(1 + len(t[1].split())) for t in test])
    X = np.column_stack([np.ones(n)] + [[float(t[0] == k) for t in test] for k in ("hau", "ibo", "pcm")] + [(ll - ll.mean()) / ll.std()])
    truth = R.ols(X, human)
    rng = np.random.default_rng(SEED)
    out = [f"{n} items, human negative share {human.mean():.3f}; {REPS} draws, seed {SEED}",
           "per coder: sens, spec, J = sens + spec - 1, agreement; then per n: coverage human-only, coverage ppi++, mean half-width ratio ppi++/human-only"]
    coders = []
    for mname in MODELS:
        short = mname.replace("Qwen2.5-", "").replace("-Instruct", "")
        s = np.array([scores[mname][i] for i in idx])
        cut = best_cut(s, human)
        coders.append((f"{short} fixed", (s > 0).astype(float)))
        coders.append((f"{short} bestJ(cut={cut:g})", (s > cut).astype(float)))
    cells = []
    for name, f in coders:
        se, sp = sens_spec(f, human)
        cells.append((name, "real", f))
        flip = np.where(human == 1, rng.random(n) < 1 - se, rng.random(n) < 1 - sp)
        cells.append((name, "matched-synthetic", np.where(flip, 1 - human, human)))
    flip = rng.random(n) < 0.31
    cells.append(("symmetric a=0.69", "synthetic", np.where(flip, 1 - human, human)))
    for name, kind, f in cells:
        se, sp = sens_spec(f, human)
        out.append(f"# {name} [{kind}]: sens {se:.3f} spec {sp:.3f} J {se + sp - 1:.3f} agreement {np.mean(f == human):.3f}")
        for na in SIZES:
            m, sk = run(f, X, human, truth, na, n)
            out.append(f"{name} [{kind}] n={na} dropped {sk} MEAN {m[0]:.3f} {m[1]:.3f} {m[2]:.3f}")
            print(out[-1], flush=True)
    (HERE / "h5h_informedness.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
