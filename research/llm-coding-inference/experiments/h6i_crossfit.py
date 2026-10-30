"""Milestone 6i: two-fold cross-fitted PPI++ (lam chosen on the other half of the audit) against in-sample-tuned PPI++ (6h) and
human-only OLS, on the setup and draws of 6g/6h. Writes h6i_crossfit.txt.

    python3 experiments/h6i_crossfit.py

Milestone 6g (setup): regression coefficients from LLM codes plus an audit. Outcome = negative sentiment, covariates =
intercept, hau, ibo, pcm (yor is the reference) and standardised log tweet length. Truth = OLS of the human label on the
whole 70% test corpus. Writes h6g_regression.txt.

    python3 experiments/h6g_regression.py     # needs numpy and the tsv cache that qual-dialect/experiments/run.py fills
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
N_AUDIT, REPS, SEED = 400, 1000, 20261025
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
           f"audit n={N_AUDIT} simple random, {REPS} draws per cell, seed {SEED}; coverage of the 95% interval (binomial sd about 0.007), mean se, mean bias", "",
           "coder estimator coefficient coverage se bias se_over_human mean_lam"]
    for cname, f in coders.items():
        f = np.array(f, float)
        agree = float((f == human).mean())
        out.append(f"# {cname}: agreement with the human label {agree:.3f}")
        rr = random.Random(SEED)
        acc = {m: [[0, [], []] for _ in NAMES] for m in ("human", "PPI++", "crossfit")}
        lams = {"PPI++": [], "crossfit": []}
        for _ in range(REPS):
            idx = np.array(rr.sample(range(n), N_AUDIT))
            ests = {"human": R.human_ols(X[idx], human[idx], n),
                    }
            b, se, lam = R.ppi_ols_tuned(X, f, idx, human[idx])
            ests["PPI++"] = (b, se)
            lams["PPI++"].append(lam)
            b2, se2, lam2 = R.ppi_ols_crossfit(X, f, idx, human[idx], np.array(rr.sample(range(N_AUDIT), N_AUDIT)))
            ests["crossfit"] = (b2, se2)
            lams["crossfit"].append(lam2)
            for m, (b, se) in ests.items():
                for j in range(len(NAMES)):
                    a = acc[m][j]
                    a[0] += abs(b[j] - truth[j]) <= 1.959964 * se[j]
                    a[1].append(se[j]); a[2].append(b[j] - truth[j])
        for m in acc:
            for j, nm in enumerate(NAMES):
                a = acc[m][j]
                ratio = np.mean(a[1]) / np.mean(acc["human"][j][1])
                extra = f" {np.mean([l[j] for l in lams[m]]):.3f}" if m in lams else " -"
                out.append(f"{cname} {m} {nm} {a[0] / REPS:.3f} {np.mean(a[1]):.4f} {np.mean(a[2]):+.4f} {ratio:.3f}{extra}")
        print("\n".join(out[-(4 * len(NAMES)) - 1:]), flush=True)
    (HERE / "h6i_crossfit.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
