"""Bayes (regression Monte Carlo) policy vs the tuned margin and cutoff rules, on the same test trials as run.py.

About 6 minutes with numpy. Train: make_trials(n, sigma, 20000, seed 11); test: make_trials(n, sigma, 60000, seed 12),
the identical test draws run.py scored the margin and cutoff rules on, so every difference below is paired.
"""
import json, sys
from math import sqrt
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from secretary_margin import make_trials  # noqa: E402
from secretary_bayes import (trials_array, features, fit_policy, apply_policy, oracle_pick, margin_pick,  # noqa: E402
                             gm_pick, rate_se)

N = 50
TRAIN, TEST = 20000, 60000
SIGMAS = [0.0, 0.5, 1.0, 2.0]


def paired(a, b):
    d = a.astype(float) - b.astype(float)
    return d.mean(), d.std(ddof=1) / sqrt(d.size)


def main():
    margin = {r["sigma"]: r for r in json.loads((HERE / "results.json").read_text())["rows"]}
    out = ["== free-secretarymargin / Bayes step: n=%d, LS train %d (seed 11), test %d (seed 12, same draws as run.py) =="
           % (N, TRAIN, TEST), "",
           "sigma  P_cutoff  P_margin  P_bayes(se)  meanp_bayes  P_bayes_small  P_bayes_rich  P_oracle  "
           "bayes-margin(se)  share_of_gap_margin_closes  mean_stop_index_bayes  P_GM_exact"]
    rows = []
    for s in SIGMAS:
        btr, xtr = trials_array(make_trials(N, s, TRAIN, 11))
        bte, xte = trials_array(make_trials(N, s, TEST, 12))
        ptr, wtr = features(xtr, s)
        pte, wte = features(xte, s)
        sd = sqrt(1 + s * s)
        m = margin[s]
        hit_cut = margin_pick(xte, m["cutoff_r"], 0.0) == bte
        hit_mar = margin_pick(xte, m["margin_r"], m["margin_d"] * sd) == bte
        res = {}
        for kind in ("default", "small", "rich"):
            k = apply_policy(pte, wte, fit_policy(ptr, wtr, btr, kind))
            res[kind] = (k, k == bte)
        k, hit_b = res["default"]
        hit_o = oracle_pick(xte) == bte
        pb, seb = rate_se(hit_b)
        meanp = float(pte[np.arange(k.size), k].mean())
        dbm, sedbm = paired(hit_b, hit_mar)
        pc, pm, po = hit_cut.mean(), hit_mar.mean(), hit_o.mean()
        share = (pm - pc) / (pb - pc) if pb > pc else float("nan")
        pgm = float((gm_pick(xte) == bte).mean()) if s == 0.0 else None
        row = dict(sigma=s, p_cutoff=pc, p_margin=pm, p_bayes=pb, se_bayes=seb, meanp_bayes=meanp,
                   p_bayes_small=float(res["small"][1].mean()), p_bayes_rich=float(res["rich"][1].mean()),
                   p_oracle=po, bayes_minus_margin=dbm, se_bayes_minus_margin=sedbm,
                   margin_share_of_cutoff_to_bayes_gap=share, mean_stop_index=float(k.mean() + 1), p_gm_exact=pgm)
        rows.append({a: (float(b) if isinstance(b, (np.floating, float)) else b) for a, b in row.items()})
        out.append("%.2f %.4f %.4f %.4f(%.4f) %.4f %.4f %.4f %.4f %+.4f(%.4f) %.3f %.1f %s" % (
            s, pc, pm, pb, seb, meanp, row["p_bayes_small"], row["p_bayes_rich"], po, dbm, sedbm, share,
            row["mean_stop_index"], "%.4f" % pgm if pgm is not None else "-"))
        print(out[-1], flush=True)

    # Misspecification: the policy is fitted and its features computed under an assumed model; the world differs.
    out += ["", "misspecification (policy assumes q ~ N(0,1) and noise sigma_assumed; test world below; n=%d)" % N,
            "world  sigma_true  sigma_assumed  P_bayes_misspecified  P_bayes_correct  P_cutoff_r  P_margin"]
    mis = []
    rng_cases = [("noise", 1.0, 0.5, 0.0, 1.0), ("noise", 1.0, 2.0, 0.0, 1.0),
                 ("prior_shift+0.5", 1.0, 1.0, 0.5, 1.0), ("prior_spread x2", 1.0, 1.0, 0.0, 2.0)]
    for name, s_true, s_assumed, mu, scale in rng_cases:
        btr, xtr = trials_array(make_trials(N, s_assumed, TRAIN, 11))
        ptr, wtr = features(xtr, s_assumed)
        coefs = fit_policy(ptr, wtr, btr)
        bte, xte0 = trials_array(make_trials(N, s_true, TEST, 12))
        # make_trials draws q ~ N(0,1); rebuild a shifted/spread world from the same draws: q' = mu + scale*q
        # needs q, so regenerate q-consistent scores: x' = mu + scale*q + s_true*e. Recover q,e from the seed.
        import random
        rng = random.Random(12)
        q = np.empty((TEST, N)); e = np.empty((TEST, N))
        for i in range(TEST):
            q[i] = [rng.gauss(0, 1) for _ in range(N)]
            e[i] = [rng.gauss(0, 1) for _ in range(N)]
        xte = mu + scale * q + s_true * e
        bw = q.argmax(1)
        assert (bw == bte).all()
        pte, wte = features(xte, s_assumed)
        hit_mis = apply_policy(pte, wte, coefs) == bw
        # correct-model policy for the same world, as the reference
        rng2 = random.Random(11)
        q2 = np.empty((TRAIN, N)); e2 = np.empty((TRAIN, N))
        for i in range(TRAIN):
            q2[i] = [rng2.gauss(0, 1) for _ in range(N)]
            e2[i] = [rng2.gauss(0, 1) for _ in range(N)]
        # correct model: standardise to the policy's frame. x' = mu + scale*q + s*e  ->  (x'-mu)/scale = q + (s/scale) e
        s_eff = s_true / scale
        z_tr = q2 + s_eff * e2
        p2, w2 = features(z_tr, s_eff)
        c2 = fit_policy(p2, w2, q2.argmax(1))
        p3, w3 = features((xte - mu) / scale, s_eff)
        hit_ok = apply_policy(p3, w3, c2) == bw
        m = margin[s_true]
        sd = sqrt(1 + s_true * s_true)
        hit_cut = margin_pick(xte, m["cutoff_r"], 0.0) == bw
        hit_mar = margin_pick(xte, m["margin_r"], m["margin_d"] * sd) == bw
        row = dict(world=name, sigma_true=s_true, sigma_assumed=s_assumed, mu=mu, scale=scale,
                   p_bayes_misspecified=float(hit_mis.mean()), p_bayes_correct=float(hit_ok.mean()),
                   p_cutoff=float(hit_cut.mean()), p_margin=float(hit_mar.mean()))
        mis.append(row)
        out.append("%s %.2f %.2f %.4f %.4f %.4f %.4f" % (name, s_true, s_assumed, row["p_bayes_misspecified"],
                                                        row["p_bayes_correct"], row["p_cutoff"], row["p_margin"]))
        print(out[-1], flush=True)
    (HERE / "results_bayes.txt").write_text("\n".join(out) + "\n")
    (HERE / "results_bayes.json").write_text(json.dumps(dict(n=N, train=TRAIN, test=TEST, rows=rows,
                                                             misspecification=mis), indent=1))


if __name__ == "__main__":
    main()
