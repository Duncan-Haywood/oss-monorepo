"""Milestone 6m: does an HC3-type leverage correction on the PPI++ influence (tuned in-sample and two-fold cross-fit)
close the 3-point gap to human-only HC3 + t that 6l left at audits of 60, 100 and 200? Same corpus, coders, truth,
audit sizes and estimators as h6l_small_sample_interval.py (fresh seed). Per coder (argument), REPS draws per size;
writes h6m_<coder>.txt.

    python3 experiments/h6m_ppi_hc3.py nb-in-language     # lexicon-en | nb-english | nb-in-language
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
import os
SIZES, REPS, SEED = (60, 100, 200), int(os.environ.get("REPS", 1500)), 20261028
NAMES = ["intercept(yor)", "hau", "ibo", "pcm", "loglen_z"]
Z = R.Z95


def tq(df):
    """97.5% Student-t quantile, Cornish-Fisher expansion in 1/df (error < 1e-4 for df >= 25; no scipy here)."""
    z = Z
    return z + (z**3 + z) / (4 * df) + (5 * z**5 + 16 * z**3 + 3 * z) / (96 * df**2) + (3 * z**7 + 19 * z**5 + 17 * z**3 - 15 * z) / (384 * df**3)


def human_hc3(Xa, ya, N):
    """human-only OLS with the HC3 leverage-corrected sandwich se and the finite-population factor (as in 6l)."""
    n, k = Xa.shape
    b = R.ols(Xa, ya)
    r = ya - Xa @ b
    inv = np.linalg.inv(Xa.T @ Xa)
    h = np.einsum("ij,jk,ik->i", Xa, inv, Xa)
    u = Xa * (r / (1 - h))[:, None]
    cov = inv @ (u.T @ u) @ inv * (1 - n / N)
    return b, np.sqrt(np.diag(cov))


def lam_hc3(X, f, idx, ya, lam):
    """PPI++ at one lam with each audit row's influence divided by 1 - h_i, h_i = x_i' (n M_lam)^-1 x_i (the leverage
    of the blended equation's audit part; lam = 0 gives the human-only HC3 leverage). Returns (theta, se)."""
    N, k = X.shape
    n = len(idx)
    Xa = X[idx]
    th, psi = R.ppi_ols_lam(X, f, idx, ya, lam)
    Mlam = lam * (X.T @ X / N) + (1 - lam) * (Xa.T @ Xa / n)
    h = np.einsum("ij,jk,ik->i", Xa, np.linalg.inv(Mlam), Xa) / n
    psi = psi / (1 - h)[:, None]
    return th, np.sqrt(psi.var(axis=0, ddof=1) * (1 - n / N) / n)


def tuned_hc3(X, f, idx, ya, grid=None):
    """per-coefficient lam on the 21-point grid with the smallest HC3-corrected se, in-sample."""
    k = X.shape[1]
    grid = np.linspace(0, 1, 21) if grid is None else grid
    bb, bs, bl = np.zeros(k), np.full(k, np.inf), np.zeros(k)
    for lam in grid:
        th, se = lam_hc3(X, f, idx, ya, lam)
        m = se < bs
        bb[m], bs[m], bl[m] = th[m], se[m], lam
    return bb, bs, bl


def crossfit_hc3(X, f, idx, ya, perm, grid=None):
    """two-fold cross-fit as R.ppi_ols_crossfit, with the HC3-corrected se both for choosing lam and for the interval."""
    N, k = X.shape
    halves = [perm[: len(perm) // 2], perm[len(perm) // 2:]]
    ths, ses = [], []
    for a, b in ((0, 1), (1, 0)):
        ia, ib = np.asarray(idx)[halves[a]], np.asarray(idx)[halves[b]]
        _, _, lam = tuned_hc3(X, f, ib, ya[halves[b]], grid)
        th, se = np.zeros(k), np.zeros(k)
        for lv in np.unique(lam):
            t, s = lam_hc3(X, f, ia, ya[halves[a]], lv)
            m = lam == lv
            th[m], se[m] = t[m], s[m]
        ths.append(th); ses.append(se)
    return (ths[0] + ths[1]) / 2, np.sqrt(ses[0] ** 2 + ses[1] ** 2) / 2


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
           "methods: hum-hc3t human-only HC3 + t(n-5); ins-t tuned PPI++ (6l, no leverage) + t; ins-hc3t tuned PPI++ with HC3-type influence + t(n-5); cf-t cross-fit (6l) + t; cf-hc3t cross-fit with HC3 + t(n-5); cf-hc3t2 same with t(n/2-5)",
           "coder n coefficient hum-hc3t ins-t ins-hc3t cf-t cf-hc3t cf-hc3t2  (mean over coefficients on the last line of each n)"]
    for na in SIZES:
        rr = random.Random(SEED + na)
        t_df, t_half, skipped = tq(na - 5), tq(na // 2 - 5), 0
        M = ["hum-hc3t", "ins-t", "ins-hc3t", "cf-t", "cf-hc3t", "cf-hc3t2"]
        hit = {m: [[] for _ in NAMES] for m in M}
        for _ in range(REPS):
            idx = np.array(rr.sample(range(n), na))
            perm = np.array(rr.sample(range(na), na))
            try:
                b3, s3 = human_hc3(X[idx], human[idx], n)
                bi, si = R.ppi_ols_tuned(X, f, idx, human[idx])[:2]
                bj, sj = tuned_hc3(X, f, idx, human[idx])[:2]
                bc, sc = R.ppi_ols_crossfit(X, f, idx, human[idx], perm)[:2]
                bd, sd = crossfit_hc3(X, f, idx, human[idx], perm)
            except np.linalg.LinAlgError:
                skipped += 1
                continue
            for j in range(len(NAMES)):
                for m, b, s, q in (("hum-hc3t", b3, s3, t_df), ("ins-t", bi, si, t_df), ("ins-hc3t", bj, sj, t_df),
                                   ("cf-t", bc, sc, t_df), ("cf-hc3t", bd, sd, t_df), ("cf-hc3t2", bd, sd, t_half)):
                    hit[m][j].append(abs(b[j] - truth[j]) <= q * s[j])
        out.append(f"# {cname} n={na}: {skipped} of {REPS} draws dropped (singular audit design); t quantile {t_df:.4f} vs 1.9600")
        for j, nm in enumerate(NAMES):
            out.append(f"{cname} {na} {nm} " + " ".join(f"{np.mean(hit[m][j]):.3f}" for m in M))
        out.append(f"{cname} {na} MEAN " + " ".join(f"{np.mean([np.mean(hit[m][j]) for j in range(len(NAMES))]):.3f}" for m in M))
        print("\n".join(out[-8:]), flush=True)
    (HERE / f"h6m_{cname}.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
