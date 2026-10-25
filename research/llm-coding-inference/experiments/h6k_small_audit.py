"""Milestone 6k: do selection effects appear at small audits? Paired comparison of in-sample-tuned PPI++ (6h), two-fold
cross-fitted PPI++ (6i) and human-only OLS on the SAME audits, at n = 60, 100 and 200, 3,000 draws per cell. Reports coverage of
each and the paired coverage difference (in-sample minus cross-fit; human minus in-sample) with a McNemar-type interval
(discordant pairs). Writes h6k_small_audit.txt.

    python3.13 experiments/h6k_small_audit.py     # needs numpy and the tsv cache that qual-dialect/experiments/run.py fills
"""
import math
import random
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[0]))
import group_shift as G  # noqa: E402
from llmci import regression as R  # noqa: E402

qd, d = G.qd, G.d
SIZES, REPS, SEED = (60, 100, 200), 3000, 20261026
NAMES = ["intercept(yor)", "hau", "ibo", "pcm", "loglen_z"]


def main():
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
    truth = R.ols(X, human)
    out = [f"NaijaSenti test corpus {n} tweets; outcome = human negative label; OLS truth on the whole corpus:",
           "  " + ", ".join(f"{a} {b:+.4f}" for a, b in zip(NAMES, truth)),
           f"audit sizes {SIZES} simple random, {REPS} draws per cell, seed {SEED}; coverage of the 95% interval, mean se; paired = same audits",
           "", "coder n coefficient cov_human cov_insample cov_crossfit se_insample/human se_crossfit/human d_ins-cf [95% CI] d_hum-ins [95% CI]"]
    def paired(a, b):
        """difference in coverage a - b over the same draws, normal interval from the discordant pairs"""
        a, b = np.array(a, float), np.array(b, float)
        dlt = a - b
        m, se = dlt.mean(), dlt.std(ddof=1) / math.sqrt(len(dlt))
        return f"{100 * m:+.2f} [{100 * (m - 1.96 * se):+.2f},{100 * (m + 1.96 * se):+.2f}]"
    for cname, f in coders.items():
        f = np.array(f, float)
        for na in SIZES:
            rr = random.Random(SEED + na)
            skipped = 0
            hit = {m: [[] for _ in NAMES] for m in ("human", "ins", "cf")}
            sez = {m: [[] for _ in NAMES] for m in ("human", "ins", "cf")}
            for _ in range(REPS):
                idx = np.array(rr.sample(range(n), na))
                perm = np.array(rr.sample(range(na), na))
                try:
                    res = {"human": R.human_ols(X[idx], human[idx], n)[:2],
                           "ins": R.ppi_ols_tuned(X, f, idx, human[idx])[:2],
                           "cf": R.ppi_ols_crossfit(X, f, idx, human[idx], perm)[:2]}
                except np.linalg.LinAlgError:  # a half-audit lacks a language: its audit design matrix is singular
                    skipped += 1
                    continue
                for m, (b, se) in res.items():
                    for j in range(len(NAMES)):
                        hit[m][j].append(abs(b[j] - truth[j]) <= 1.959964 * se[j])
                        sez[m][j].append(se[j])
            out.append(f"# {cname} n={na}: {skipped} of {REPS} draws dropped for all three estimators (singular audit design matrix)")
            for j, nm in enumerate(NAMES):
                h = {m: np.mean(hit[m][j]) for m in hit}
                r = {m: np.mean(sez[m][j]) / np.mean(sez["human"][j]) for m in hit}
                out.append(f"{cname} {na} {nm} {h['human']:.3f} {h['ins']:.3f} {h['cf']:.3f} {r['ins']:.3f} {r['cf']:.3f} "
                           f"{paired(hit['ins'][j], hit['cf'][j])} {paired(hit['human'][j], hit['ins'][j])}")
        print("\n".join(out[-(len(NAMES) + 1) * len(SIZES):]), flush=True)
    (HERE / "h6k_small_audit.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
