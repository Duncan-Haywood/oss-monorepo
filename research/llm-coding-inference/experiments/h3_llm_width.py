"""Milestone 5 (H3): does a real local LLM coder narrow the valid PPI++ interval, against the 6n stand-ins, on the same items?
Corpus = the seeded subsample of the NaijaSenti test part coded by llm_code.py (truth = OLS on that corpus with human labels).
Coders: the LLM (score > 0, zero-shot, no tuning on human labels) and the three 6n stand-ins on the same items.
Estimators/intervals as 6n: human-only HC3 + t(n-5) and tuned PPI++ HC3 + t(n-5). Writes h3_<coder>.txt.

    python3 experiments/h3_llm_width.py llm-Qwen2.5-1.5B-Instruct   # or lexicon-en | nb-english | nb-in-language
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

qd, d = M6.qd, M6.d
SIZES, REPS, SEED = (60, 100, 200, 400), int(os.environ.get("REPS", 600)), 20261031
NAMES = M6.NAMES
N_CORPUS = 6000


def corpus():
    rows = qd.load()
    rng = random.Random(qd.SEED)
    order = list(range(len(rows)))
    rng.shuffle(order)
    cut = int(qd.TRAIN_SHARE * len(rows))
    train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
    idx = sorted(random.Random(20261030).sample(range(len(test)), N_CORPUS))
    return train, test, idx


def coder(cname, train, test):
    if cname.startswith("llm-"):
        sc = {}
        for l in (HERE / f"llm_scores_{cname[4:]}.tsv").read_text().splitlines():
            i, s = l.split("\t")
            sc[int(i)] = float(s)
        return None, sc
    if cname == "lexicon-en":
        return [d.lexicon_code(t[1]) for t in test], None
    if cname == "nb-english":
        en = qd.r.load_examples(qd.fetch(qd.GOEMO_URL, qd.GOEMO))
        m = d.NB().fit([e[1] for e in en], [e[2] for e in en]).match_rate([e[1] for e in en], [e[2] for e in en])
    else:
        m = d.NB().fit([t[1] for t in train], [t[2] for t in train]).match_rate([t[1] for t in train], [t[2] for t in train])
    return [m.code(t[1]) for t in test], None


def main():
    cname = sys.argv[1]
    train, test_all, idx = corpus()
    codes, sc = coder(cname, train, test_all)
    if sc is not None:
        idx = [i for i in idx if i in sc]
        f_all = {i: float(sc[i] > 0) for i in idx}
    else:
        f_all = {i: float(codes[i]) for i in idx}
    test = [test_all[i] for i in idx]
    human = np.array([t[2] for t in test], float)
    f = np.array([f_all[i] for i in idx], float)
    n = len(test)
    ll = np.array([math.log(1 + len(t[1].split())) for t in test])
    X = np.column_stack([np.ones(n)] + [[float(t[0] == k) for t in test] for k in ("hau", "ibo", "pcm")] + [(ll - ll.mean()) / ll.std()])
    truth = R.ols(X, human)
    agree = float(np.mean(f == human))
    sens = float(f[human == 1].mean())
    spec = float(1 - f[human == 0].mean())
    out = [f"coder {cname}: corpus {n} items, human negative share {human.mean():.3f}; coder positive share {f.mean():.3f}; "
           f"agreement {agree:.3f}, sensitivity {sens:.3f}, specificity {spec:.3f}; sizes {SIZES}, {REPS} draws, seed {SEED}",
           "columns: coverage hum-hc3t, ins-hc3t; mean half-width ratio ins-hc3t/hum-hc3t (same audit)"]
    for na in SIZES:
        rr = random.Random(SEED + na)
        q, skipped = M6.tq(na - 5), 0
        hit = {m: [[] for _ in NAMES] for m in ("h", "i")}
        rat = [[] for _ in NAMES]
        for _ in range(REPS):
            ix = np.array(rr.sample(range(n), na))
            try:
                b3, s3 = M6.human_hc3(X[ix], human[ix], n)
                bj, sj = M6.tuned_hc3(X, f, ix, human[ix])[:2]
            except np.linalg.LinAlgError:
                skipped += 1
                continue
            if not (np.all(np.isfinite(s3)) and np.all(np.isfinite(sj))):
                skipped += 1
                continue
            for j in range(len(NAMES)):
                hit["h"][j].append(abs(b3[j] - truth[j]) <= q * s3[j])
                hit["i"][j].append(abs(bj[j] - truth[j]) <= q * sj[j])
                rat[j].append(sj[j] / s3[j])
        out.append(f"# {cname} n={na}: {skipped} of {REPS} draws dropped")
        rows_ = []
        for j, nm in enumerate(NAMES):
            rows_.append([np.mean(hit["h"][j]), np.mean(hit["i"][j]), np.mean(rat[j])])
            out.append(f"{cname} {na} {nm} " + " ".join(f"{v:.3f}" for v in rows_[-1]))
        out.append(f"{cname} {na} MEAN " + " ".join(f"{v:.3f}" for v in np.mean(rows_, axis=0)))
        print("\n".join(out[-7:]), flush=True)
    (HERE / f"h3_{cname}.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
