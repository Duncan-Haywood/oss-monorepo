"""Milestone 6n: once the intervals are valid (HC3-type influence + t, 6m), is PPI++ narrower than human-only HC3 + t?
Same corpus, coders, truth and estimators as h6m_ppi_hc3.py; records the mean over draws of the ratio of each PPI++
interval's half-width (t quantile x se) to human-only HC3 + t's, on the same audit, per coefficient, plus coverage.
Fresh seed. Audit sizes 60 to 400. Writes h6n_<coder>.txt.

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
import h6m_ppi_hc3 as M6  # noqa: E402
from llmci import regression as R  # noqa: E402

qd, d, G = M6.qd, M6.d, M6.G
SIZES, REPS, SEED = (60, 100, 200, 400), int(os.environ.get("REPS", 600)), 20261029
NAMES = M6.NAMES


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
    truth = R.ols(X, human)
    agree = float(np.mean(f == human))
    out = [f"coder {cname} (agreement with human label {agree:.3f}); corpus {n}; sizes {SIZES}, {REPS} draws, seed {SEED}",
           "columns: coverage of hum-hc3t, ins-hc3t, cf-hc3t2 (t(n/2-5)); then mean half-width ratio ins-hc3t/hum-hc3t and cf-hc3t2/hum-hc3t (same audit)"]
    for na in SIZES:
        rr = random.Random(SEED + na)
        q, qh, skipped = M6.tq(na - 5), M6.tq(na // 2 - 5), 0
        hit = {m: [[] for _ in NAMES] for m in ("h", "i", "c")}
        rat = {m: [[] for _ in NAMES] for m in ("i", "c")}
        for _ in range(REPS):
            idx = np.array(rr.sample(range(n), na))
            perm = np.array(rr.sample(range(na), na))
            try:
                b3, s3 = M6.human_hc3(X[idx], human[idx], n)
                bj, sj = M6.tuned_hc3(X, f, idx, human[idx])[:2]
                bd, sd = M6.crossfit_hc3(X, f, idx, human[idx], perm)
            except np.linalg.LinAlgError:
                skipped += 1
                continue
            for j in range(len(NAMES)):
                hit["h"][j].append(abs(b3[j] - truth[j]) <= q * s3[j])
                hit["i"][j].append(abs(bj[j] - truth[j]) <= q * sj[j])
                hit["c"][j].append(abs(bd[j] - truth[j]) <= qh * sd[j])
                rat["i"][j].append(q * sj[j] / (q * s3[j]))
                rat["c"][j].append(qh * sd[j] / (q * s3[j]))
        out.append(f"# {cname} n={na}: {skipped} of {REPS} draws dropped")
        rows_ = []
        for j, nm in enumerate(NAMES):
            rows_.append([np.mean(hit[m][j]) for m in "hic"] + [np.mean(rat[m][j]) for m in "ic"])
            out.append(f"{cname} {na} {nm} " + " ".join(f"{v:.3f}" for v in rows_[-1]))
        out.append(f"{cname} {na} MEAN " + " ".join(f"{v:.3f}" for v in np.mean(rows_, axis=0)))
        print("\n".join(out[-7:]), flush=True)
    (HERE / f"h6n_{cname}.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
