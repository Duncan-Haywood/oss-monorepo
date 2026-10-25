"""Milestone 6j: a paired test of the selection effect left open by 6i. In-sample-tuned PPI++ (6h) against two-fold cross-fitted
PPI++ (6i) and human-only OLS, on the same audits, 4,000 draws per coder. Per audit and coefficient the coverage indicators and
standard errors of the three estimators are kept, so the coverage difference is a paired difference (McNemar-style) whose
sampling error is far below the binomial sd of 6i's unpaired comparison. Writes h6j_paired.txt.

    OMP_NUM_THREADS=1 python3 experiments/h6j_paired.py     # about 25 min on one core per coder, run in the background

Setup as 6g/6h/6i (NaijaSenti test corpus, negative-sentiment OLS, audit n = 400, three stand-in coders).
"""
import math
import random
import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[0]))
import group_shift as G  # noqa: E402
from llmci import regression as R  # noqa: E402

qd, d = G.qd, G.d
import os
N_AUDIT, REPS, SEED = 400, int(os.environ.get("REPS", 4000)), 20261026
NAMES = ["intercept(yor)", "hau", "ibo", "pcm", "loglen_z"]
Z = 1.959964


def setup():
    rows = qd.load()
    rng = random.Random(qd.SEED)
    order = list(range(len(rows)))
    rng.shuffle(order)
    cut = int(qd.TRAIN_SHARE * len(rows))
    train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
    en = qd.r.load_examples(qd.fetch(qd.GOEMO_URL, qd.GOEMO))
    nb_en = d.NB().fit([e[1] for e in en], [e[2] for e in en]).match_rate([e[1] for e in en], [e[2] for e in en])
    nb_in = d.NB().fit([t[1] for t in train], [t[2] for t in train]).match_rate([t[1] for t in train], [t[2] for t in train])
    human = np.array([t[2] for t in test], float)
    coders = {"lexicon-en": [d.lexicon_code(t[1]) for t in test], "nb-english": [nb_en.code(t[1]) for t in test],
              "nb-in-language": [nb_in.code(t[1]) for t in test]}
    n = len(test)
    ll = np.array([math.log(1 + len(t[1].split())) for t in test])
    X = np.column_stack([np.ones(n)] + [[float(t[0] == k) for t in test] for k in ("hau", "ibo", "pcm")] + [(ll - ll.mean()) / ll.std()])
    return X, human, coders, R.ols(X, human)


def run_coder(cname):
    X, human, coders, truth = setup()
    f = np.array(coders[cname], float)
    n = len(human)
    rr = random.Random(SEED)
    cov = np.zeros((REPS, 3, len(NAMES)), bool)   # human, in-sample, crossfit
    se = np.zeros((REPS, 3, len(NAMES)))
    for r in range(REPS):
        idx = np.array(rr.sample(range(n), N_AUDIT))
        bh, sh = R.human_ols(X[idx], human[idx], n)
        bi, si, _ = R.ppi_ols_tuned(X, f, idx, human[idx])
        bc, sc, _ = R.ppi_ols_crossfit(X, f, idx, human[idx], np.array(rr.sample(range(N_AUDIT), N_AUDIT)))
        for k, (b, s) in enumerate(((bh, sh), (bi, si), (bc, sc))):
            cov[r, k] = np.abs(b - truth) <= Z * s
            se[r, k] = s
    return cname, cov, se


def paired(a, b):
    """mean and 95% half-width (normal) of the per-draw difference a - b, in points."""
    x = a.astype(float) - b.astype(float)
    return 100 * x.mean(), 100 * Z * x.std(ddof=1) / math.sqrt(len(x))


def main():
    X, human, coders, truth = setup()
    names = list(coders)
    with Pool(len(names)) as p:
        res = p.map(run_coder, names)
    out = [f"NaijaSenti test corpus {len(human)} tweets; audit n={N_AUDIT}, {REPS} paired draws per coder, seed {SEED}",
           "coverage difference in points (mean, 95% half-width of the paired difference); se ratio = mean se / mean human-only se", "",
           "coder coefficient cov_insample cov_crossfit cov_human insample-crossfit(+-) insample-human(+-) crossfit-human(+-) se_ratio_insample se_ratio_crossfit"]
    for cname, cov, se in res:
        for j, nm in enumerate(NAMES):
            ic, ih, ch = paired(cov[:, 1, j], cov[:, 2, j]), paired(cov[:, 1, j], cov[:, 0, j]), paired(cov[:, 2, j], cov[:, 0, j])
            out.append(f"{cname} {nm} {cov[:, 1, j].mean():.4f} {cov[:, 2, j].mean():.4f} {cov[:, 0, j].mean():.4f} "
                       f"{ic[0]:+.2f}({ic[1]:.2f}) {ih[0]:+.2f}({ih[1]:.2f}) {ch[0]:+.2f}({ch[1]:.2f}) "
                       f"{se[:, 1, j].mean() / se[:, 0, j].mean():.3f} {se[:, 2, j].mean() / se[:, 0, j].mean():.3f}")
        # pooled over the five coefficients of one audit (draw-level mean coverage; coefficients share the audit)
        pc = [cov[:, k, :].mean(axis=1) for k in range(3)]
        for lab, a, b in (("insample-crossfit", pc[1], pc[2]), ("insample-human", pc[1], pc[0]), ("crossfit-human", pc[2], pc[0])):
            m, h = paired(a, b)
            out.append(f"# {cname} pooled over coefficients {lab}: {m:+.2f} points (95% +-{h:.2f})")
    (HERE / "h6j_paired.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
