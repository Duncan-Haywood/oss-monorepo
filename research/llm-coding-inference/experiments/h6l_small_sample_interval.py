"""Milestone 6l: does a small-sample interval (t quantile on n - p df; HC3 leverage for human-only) restore coverage at
audits of 60, 100 and 200 that 6k found short under the normal quantile? Same corpus, coders, truth, audit sizes and
estimators as h6k_small_audit.py. Per coder (argument), REPS draws per size; writes h6l_<coder>.txt.

    python3 experiments/h6l_small_sample_interval.py nb-in-language     # lexicon-en | nb-english | nb-in-language
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
SIZES, REPS, SEED = (60, 100, 200), 1500, 20261027
NAMES = ["intercept(yor)", "hau", "ibo", "pcm", "loglen_z"]
Z = R.Z95


def tq(df):
    """97.5% Student-t quantile, Cornish-Fisher expansion in 1/df (error < 1e-4 for df >= 25; no scipy here)."""
    z = Z
    return z + (z**3 + z) / (4 * df) + (5 * z**5 + 16 * z**3 + 3 * z) / (96 * df**2) + (3 * z**7 + 19 * z**5 + 17 * z**3 - 15 * z) / (384 * df**3)


def human_hc3(Xa, ya, N):
    """human-only OLS with the HC3 leverage-corrected sandwich se and the finite-population factor (as human_ols)."""
    n, k = Xa.shape
    b = R.ols(Xa, ya)
    r = ya - Xa @ b
    inv = np.linalg.inv(Xa.T @ Xa)
    h = np.einsum("ij,jk,ik->i", Xa, inv, Xa)
    u = Xa * (r / (1 - h))[:, None]
    cov = inv @ (u.T @ u) @ inv * (1 - n / N)
    return b, np.sqrt(np.diag(cov))


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
    out = [f"coder {cname}; NaijaSenti test corpus {n}; audit sizes {SIZES}, {REPS} draws, seed {SEED}; coverage of nominal 95% intervals",
           "methods: hum-N human-only normal; hum-t human-only t(n-5); hum-hc3t human-only HC3 + t; ins-N / ins-t tuned PPI++; cf-N / cf-t cross-fit",
           "coder n coefficient hum-N hum-t hum-hc3t ins-N ins-t cf-N cf-t  (mean over coefficients on the last line of each n)"]
    for na in SIZES:
        rr = random.Random(SEED + na)
        t_df, skipped = tq(na - 5), 0
        M = ["hum-N", "hum-t", "hum-hc3t", "ins-N", "ins-t", "cf-N", "cf-t"]
        hit = {m: [[] for _ in NAMES] for m in M}
        for _ in range(REPS):
            idx = np.array(rr.sample(range(n), na))
            perm = np.array(rr.sample(range(na), na))
            try:
                bh, sh = R.human_ols(X[idx], human[idx], n)[:2]
                b3, s3 = human_hc3(X[idx], human[idx], n)
                bi, si = R.ppi_ols_tuned(X, f, idx, human[idx])[:2]
                bc, sc = R.ppi_ols_crossfit(X, f, idx, human[idx], perm)[:2]
            except np.linalg.LinAlgError:
                skipped += 1
                continue
            for j in range(len(NAMES)):
                for m, b, s, q in (("hum-N", bh, sh, Z), ("hum-t", bh, sh, t_df), ("hum-hc3t", b3, s3, t_df),
                                   ("ins-N", bi, si, Z), ("ins-t", bi, si, t_df), ("cf-N", bc, sc, Z), ("cf-t", bc, sc, t_df)):
                    hit[m][j].append(abs(b[j] - truth[j]) <= q * s[j])
        out.append(f"# {cname} n={na}: {skipped} of {REPS} draws dropped (singular audit design); t quantile {t_df:.4f} vs 1.9600")
        for j, nm in enumerate(NAMES):
            out.append(f"{cname} {na} {nm} " + " ".join(f"{np.mean(hit[m][j]):.3f}" for m in M))
        out.append(f"{cname} {na} MEAN " + " ".join(f"{np.mean([np.mean(hit[m][j]) for j in range(len(NAMES))]):.3f}" for m in M))
        print("\n".join(out[-8:]), flush=True)
    (HERE / f"h6l_{cname}.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
