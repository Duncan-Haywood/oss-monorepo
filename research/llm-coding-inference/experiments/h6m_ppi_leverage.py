"""Milestone 6m: does an HC3-type leverage correction of the PPI++ influence (tuned and cross-fit), with the t quantile,
bring PPI++ coverage at audits of 60, 100 and 200 to human-only HC3+t's level (6l)? Same corpus, coders, truth, audit
sizes and human-only columns as h6l_small_sample_interval.py (fresh seed). Per coder (argument); writes h6m_<coder>.txt.

The correction (a heuristic, not a derived result): audit row i's influence e_i x_i' Minv is divided by 1 - h_i with
h_i = (1 - lam) x_i' (n M_lam)^-1 x_i, the weight the audit row has in the blended normal matrix; lam = 0 gives the
HC3 leverage of human-only OLS. lam is still chosen by the uncorrected se (as 6l); only the reported se changes.

    python3 experiments/h6m_ppi_leverage.py nb-in-language     # lexicon-en | nb-english | nb-in-language
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
SIZES, REPS, SEED = (60, 100, 200), 1500, 20261028
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


def lam_hc3(X, f, idx, y, lam):
    """PPI++ estimating-equation estimate at lam with the leverage-corrected se (see module docstring)."""
    N, k = X.shape
    n = len(idx)
    Xa, fa = X[idx], f[idx]
    Mlam = lam * (X.T @ X / N) + (1 - lam) * (Xa.T @ Xa / n)
    Minv = np.linalg.inv(Mlam)
    th = Minv @ (lam * (X * f[:, None]).mean(axis=0) + (Xa * (y - lam * fa)[:, None]).mean(axis=0))
    e = (y - lam * fa) - (1 - lam) * (Xa @ th)
    h = (1 - lam) * np.einsum("ij,jk,ik->i", Xa, Minv, Xa) / n
    psi = (Xa * (e / (1 - h))[:, None]) @ Minv.T
    return th, np.sqrt(psi.var(axis=0, ddof=1) * (1 - n / N) / n)


def tuned_hc3(X, f, idx, y):
    """Tuned PPI++ (lam chosen by uncorrected se, as R.ppi_ols_tuned) with the corrected se at the chosen lam."""
    b, _, lam = R.ppi_ols_tuned(X, f, idx, y)
    th, se = np.zeros(len(b)), np.zeros(len(b))
    for lv in np.unique(lam):
        t, s = lam_hc3(X, f, idx, y, lv)
        m = lam == lv
        th[m], se[m] = t[m], s[m]
    return th, se


def crossfit_hc3(X, f, idx, y, perm):
    """R.ppi_ols_crossfit with the corrected se on each half."""
    N, k = X.shape
    halves = [perm[: len(perm) // 2], perm[len(perm) // 2:]]
    ths, ses = [], []
    for a, b in ((0, 1), (1, 0)):
        ia, ib = np.asarray(idx)[halves[a]], np.asarray(idx)[halves[b]]
        _, _, lam = R.ppi_ols_tuned(X, f, ib, y[halves[b]])
        th, se = np.zeros(k), np.zeros(k)
        for lv in np.unique(lam):
            t, s = lam_hc3(X, f, ia, y[halves[a]], lv)
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
           "methods: hum-hc3t human-only HC3 + t (6l); ins-t / cf-t tuned and cross-fit PPI++ with t, no leverage correction (6l); ins-hc3t / cf-hc3t the same with the leverage correction (new); ins-se / cf-se = mean corrected/uncorrected se ratio",
           "coder n coefficient hum-hc3t ins-t ins-hc3t cf-t cf-hc3t ins-se cf-se  (mean over coefficients on the last line of each n)"]
    for na in SIZES:
        rr = random.Random(SEED + na)
        t_df, skipped = tq(na - 5), 0
        M = ["hum-hc3t", "ins-t", "ins-hc3t", "cf-t", "cf-hc3t"]
        hit = {m: [[] for _ in NAMES] for m in M}
        rat = {m: [[] for _ in NAMES] for m in ("ins-se", "cf-se")}
        for _ in range(REPS):
            idx = np.array(rr.sample(range(n), na))
            perm = np.array(rr.sample(range(na), na))
            try:
                b3, s3 = human_hc3(X[idx], human[idx], n)
                bi, si = R.ppi_ols_tuned(X, f, idx, human[idx])[:2]
                bc, sc = R.ppi_ols_crossfit(X, f, idx, human[idx], perm)[:2]
                bi2, si2 = tuned_hc3(X, f, idx, human[idx])
                bc2, sc2 = crossfit_hc3(X, f, idx, human[idx], perm)
            except np.linalg.LinAlgError:
                skipped += 1
                continue
            for j in range(len(NAMES)):
                for m, b, s, q in (("hum-hc3t", b3, s3, t_df), ("ins-t", bi, si, t_df), ("ins-hc3t", bi2, si2, t_df),
                                   ("cf-t", bc, sc, t_df), ("cf-hc3t", bc2, sc2, t_df)):
                    hit[m][j].append(abs(b[j] - truth[j]) <= q * s[j])
                rat["ins-se"][j].append(si2[j] / si[j])
                rat["cf-se"][j].append(sc2[j] / sc[j])
        out.append(f"# {cname} n={na}: {skipped} of {REPS} draws dropped (singular audit design); t quantile {t_df:.4f} vs 1.9600")
        for j, nm in enumerate(NAMES):
            out.append(f"{cname} {na} {nm} " + " ".join(f"{np.mean(hit[m][j]):.3f}" for m in M) + " " + " ".join(f"{np.mean(rat[m][j]):.3f}" for m in rat))
        out.append(f"{cname} {na} MEAN " + " ".join(f"{np.mean([np.mean(hit[m][j]) for j in range(len(NAMES))]):.3f}" for m in M) + " " + " ".join(f"{np.mean([np.mean(rat[m][j]) for j in range(len(NAMES))]):.3f}" for m in rat))
        print("\n".join(out[-8:]), flush=True)
    (HERE / f"h6m_{cname}.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
