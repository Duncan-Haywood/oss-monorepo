"""Milestone 6n (nan-fix rerun of h6n_width.py, ratios only): once the intervals are valid (HC3 + t, 6m), is PPI++ still narrower than human-only HC3? Paired on the
same audits as h6m_ppi_hc3.py (same corpus, coders, truth, estimators), records the per-coefficient ratio of interval
half-widths (method / human-only HC3) and the share of draws where the method is narrower; seed fresh. Writes h6n_nanfix_<coder>.txt.

    python3 experiments/h6n_width.py nb-in-language     # lexicon-en | nb-english | nb-in-language
"""
import math
import os
import random
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[0]))
import group_shift as G  # noqa: E402
import h6m_ppi_hc3 as H  # noqa: E402
from llmci import regression as R  # noqa: E402

qd, d = G.qd, G.d
SIZES, REPS, SEED = (60, 100, 200, 400), int(os.environ.get("REPS", 600)), 20261029
NAMES = H.NAMES


def main():
    cname = sys.argv[1]
    rows = qd.load()
    rng = random.Random(qd.SEED)
    order = list(range(len(rows)))
    rng.shuffle(order)
    cut = int(qd.TRAIN_SHARE * len(rows))
    train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
    human = np.array([t[2] for t in test], float)
    if cname == "lexicon-en":
        f = [d.lexicon_code(t[1]) for t in test]
    elif cname == "nb-english":
        en = qd.r.load_examples(qd.fetch(qd.GOEMO_URL, qd.GOEMO))
        m = d.NB().fit([e[1] for e in en], [e[2] for e in en]).match_rate([e[1] for e in en], [e[2] for e in en])
        f = [m.code(t[1]) for t in test]
    else:
        m = d.NB().fit([t[1] for t in train], [t[2] for t in train]).match_rate([t[1] for t in train], [t[2] for t in train])
        f = [m.code(t[1]) for t in test]
    f = np.array(f, float)
    n = len(test)
    ll = np.array([math.log(1 + len(t[1].split())) for t in test])
    X = np.column_stack([np.ones(n)] + [[float(t[0] == k) for t in test] for k in ("hau", "ibo", "pcm")] + [(ll - ll.mean()) / ll.std()])
    out = [f"coder {cname}; NaijaSenti test corpus {n}; audit sizes {SIZES}, {REPS} draws, seed {SEED}",
           "ratio = half-width of method / half-width of human-only HC3 + t(n-5) on the same audit (mean of per-draw ratios; <1 means narrower); % narrower = share of draws with ratio < 1",
           "methods: ins-hc3t tuned PPI++ HC3 + t(n-5); cf-hc3t cross-fit HC3 + t(n-5); cf-hc3t2 cross-fit HC3 + t(n/2-5)",
           "coder n coefficient | ins-hc3t ratio %narrower | cf-hc3t ratio %narrower | cf-hc3t2 ratio %narrower"]
    for na in SIZES:
        rr = random.Random(SEED + na)
        q, qh, skipped = H.tq(na - 5), H.tq(na // 2 - 5), 0
        M = ["ins", "cf", "cf2"]
        ratio = {m: [[] for _ in NAMES] for m in M}
        for _ in range(REPS):
            idx = np.array(rr.sample(range(n), na))
            perm = np.array(rr.sample(range(na), na))
            try:
                _, s3 = H.human_hc3(X[idx], human[idx], n)
                sj = H.tuned_hc3(X, f, idx, human[idx])[1]
                sd = H.crossfit_hc3(X, f, idx, human[idx], perm)[1]
            except np.linalg.LinAlgError:
                skipped += 1
                continue
            if not (np.isfinite(s3).all() and np.isfinite(sj).all() and np.isfinite(sd).all()):
                skipped += 1  # a half-audit row with leverage 1 (degenerate group), like the singular-design drops
                continue
            for j in range(len(NAMES)):
                ratio["ins"][j].append(sj[j] / s3[j])
                ratio["cf"][j].append(sd[j] / s3[j])
                ratio["cf2"][j].append(sd[j] * qh / q / s3[j])
        out.append(f"# {cname} n={na}: {skipped} of {REPS} draws dropped")
        for j, nm in enumerate(NAMES + ["MEAN"]):
            cells = []
            for m in M:
                v = np.array(ratio[m]) if j == len(NAMES) else np.array(ratio[m][j])
                cells.append(f"{v.mean():.3f} {100 * (v < 1).mean():.0f}%")
            out.append(f"{cname} {na} {nm} | " + " | ".join(cells))
        print("\n".join(out[-7:]), flush=True)
    (HERE / f"h6n_nanfix_{cname}.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
