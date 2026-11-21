"""Milestone 22: where does the half weight's step come from? Milestone 21 found that census degree
discount with one-sided ties at half weight, at phi = 0.25 false ties per true tie placed to close
triangles, ties keeping every report at kappa = 0 (no false tie named by both ends) and costs
0.30-0.42 point from kappa = 0.25 to 1, flat in between: a step, not a slope.

A census identity (tests/test_seeding.py, test_m22_census_kappa_moves_only_false_tie_weights): the
recall draw is shared across kappa and the echo draw is one uniform matrix thresholded at kappa, so
kappa changes nothing but which false ties keep full weight (a nested set, all of them at kappa = 1);
true-tie weights are the same at every kappa. So the half weight at kappa = 1 is the unfiltered
census with one-sided true ties halved, and at kappa = 0 it is that plus every false tie halved.
Two questions are left, and this run asks them: where on kappa the step sits (finer grid near 0),
and what halving one-sided true ties costs on its own (an oracle weighting that halves only
one-sided false ties, a diagnostic no field team can run).

Milestone 21's harness unchanged (milestone 6's joint bootstrap, B = 500, S = 100, 100 draws per
randomised rule, every extra randomised rule on its own stream keyed by its name, milestone 12's
primary rules, milestone 15's 47-rule reference never swapped), recall rho = 0.85, census degree
discount only: unfiltered; half weight at kappa = 0, 0.05, 0.1, 0.25, 1; oracle at kappa = 0 and
0.25. Eight rules, ten copies each; the four milestone 21 ran must reproduce it.

Tests H69-H72 (H73 is in seeds.py). Plan in LOG.md (2026-11-21, milestone 22), written before the run.

OMP_NUM_THREADS=1 /usr/bin/python3.13 experiments/m22_step/run.py   (about 40 minutes on 4 cores)
"""
import functools
import importlib.util
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))

_spec = importlib.util.spec_from_file_location("m20", os.path.join(HERE, "..", "m20_soft_cells", "run.py"))
m20 = importlib.util.module_from_spec(_spec)
sys.modules["m20"] = m20
_spec.loader.exec_module(m20)
m6, m11, m12, m10, sd = m20.m6, m20.m11, m20.m12, m20.m10, m20.sd

N_COPY = 10
PHI, MODE, W = 0.25, "closure", 0.5
SOFT_K = [0.0, 0.05, 0.1, 0.25, 1.0]
ORACLE_K = [0.0, 0.25]
fname = m20.fname


def _dd(v, b, r, kappa, w, recip, oracle):
    return sd.rule_recall_dd(v, b, r, 1.0, "uniform", None, m20.RHO, fp=PHI, fp_mode=MODE, recip=recip,
                             fp_joint=kappa, recip_w=w, oracle_true=oracle)


U = fname("census-dd", PHI, MODE)
S = {k: fname("census-dd", PHI, MODE, True, k, W) for k in SOFT_K}
O = {k: fname("census-dd", PHI, MODE, True, k, W) + "-oracle" for k in ORACLE_K}
ALLFN = {U: functools.partial(_dd, kappa=0.0, w=0.0, recip=False, oracle=False)}
ALLFN.update({S[k]: functools.partial(_dd, kappa=k, w=W, recip=True, oracle=False) for k in SOFT_K})
ALLFN.update({O[k]: functools.partial(_dd, kappa=k, w=W, recip=True, oracle=True) for k in ORACLE_K})
KEY = list(ALLFN)
NEWFN = {c: f for c, f in ALLFN.items() if c not in m11.NEW}
FN = {**m10.EXTRA, **m11.NEW, **m12.NEW, **NEWFN}
REPS = {f"{c}#r{j}": FN[c] for c in KEY for j in range(1, N_COPY)}
_base = {c: f for c, f in m6.EXTRA_RANDOMISED.items() if c not in m20.NEWFN and c not in m20.REPS}
m6.EXTRA_RANDOMISED = {**_base, **NEWFN, **REPS}
m6.PER_RULE_STREAMS = True
m6.NOT_IN_REFERENCE = set(REPS) | set(NEWFN)
m6.OUT_DIR = HERE


def main():
    r = m6.main()
    E, rules = r["E"], r["rules"]
    k = {c: i for i, c in enumerate(rules)}
    ref = [c for c in rules if c not in REPS and c not in NEWFN and c not in m20.M15_KEY]
    ref_idx = np.array([k[x] for x in ref])

    def cols(c):
        return [k[x if c == 0 else f"{x}#r{c}"] for x in KEY]

    copies, hits = [], []
    for c in range(N_COPY):
        idx = cols(c)
        w, h = m20.worst_regret(r, ref_idx, lambda q, idx=idx: E[q][idx])
        copies.append(w)
        hits.append(h)
    ki = {x: i for i, x in enumerate(KEY)}
    a = np.array([cols(c) for c in range(N_COPY)])
    pooled, hp = m20.worst_regret(r, ref_idx, lambda q: E[q][a].mean(0))
    cm = np.array([[float(np.median(w[:, ki[x]])) for x in KEY] for w in copies])
    pm = {x: float(np.median(pooled[:, ki[x]])) for x in KEY}
    # a smooth companion to the median: the mean over draws of pooled worst-case regret
    pmean = {x: float(pooled[:, ki[x]].mean()) for x in KEY}
    cmean = np.array([[float(w[:, ki[x]].mean()) for x in KEY] for w in copies])

    lines = []
    p = lines.append
    p(f"# Milestone 22: the half weight's step, census degree discount at phi = {PHI:g} closure "
      f"(recall {m20.RHO:g}), {N_COPY} Monte Carlo copies of {len(KEY)} rules")
    p(f"B = {copies[0].shape[0]} joint draws; reference = {len(ref)} primary rules (milestone 15's set), never swapped")
    p(f"share of (draw, family, rule) cells where a key rule beats the reference best: copies "
      f"{min(hits):.4f}-{max(hits):.4f}, pooled {hp:.4f}")
    prior = json.load(open(os.path.join(HERE, "..", "m21_kappa_dip", "verdicts.json")))["rows"]
    shared = [x for x in KEY if x in prior]
    dprior = max(abs(cm[c, ki[x]] - prior[x]["copies"][c]) for x in shared for c in range(N_COPY))
    p(f"\n## sanity: the {len(shared)} rules milestone 21 ran, all 10 copies against its copies, "
      f"max |difference| {dprior:.2e}")

    p("\n## per rule: joint median per copy (0-9) | pooled 10 [5%, 95%] | MC se | pooled mean over draws (MC se)")
    se = cm.std(0, ddof=1) / np.sqrt(N_COPY)
    sem = cmean.std(0, ddof=1) / np.sqrt(N_COPY)
    rows = {}
    for x in KEY:
        i = ki[x]
        lo, hi = np.percentile(pooled[:, i], [5, 95])
        rows[x] = dict(copies=cm[:, i].round(5).tolist(), pooled=round(pm[x], 5), q5=round(float(lo), 5),
                       q95=round(float(hi), 5), se=round(float(se[i]), 5), mean=round(pmean[x], 5),
                       mean_se=round(float(sem[i]), 5))
        p(f"  {x:48s} " + " ".join(f"{v * 100:.2f}" for v in cm[:, i])
          + f" | {pm[x] * 100:.2f} [{lo * 100:.2f}, {hi * 100:.2f}] | {se[i] * 100:.2f}"
          + f" | {pmean[x] * 100:.2f} ({sem[i] * 100:.2f})")

    p("\n## contrasts (pooled over 10 copies, MC se from paired copies, z; negative = first is better); "
      "same contrast on the mean over draws")
    con = {}

    def show(tag, x, y):
        d = pm[x] - pm[y]
        s_ = float((cm[:, ki[x]] - cm[:, ki[y]]).std(ddof=1) / np.sqrt(N_COPY))
        dm = pmean[x] - pmean[y]
        sm = float((cmean[:, ki[x]] - cmean[:, ki[y]]).std(ddof=1) / np.sqrt(N_COPY))
        con[tag] = dict(d=round(d, 5), se=round(s_, 5), d_mean=round(dm, 5), se_mean=round(sm, 5))
        p(f"  {tag:34s}: {d * 100:+.2f} (se {s_ * 100:.2f}, z {d / s_ if s_ else 0:+.1f}); "
          f"mean {dm * 100:+.2f} (se {sm * 100:.2f}, z {dm / sm if sm else 0:+.1f})")
    for kk in SOFT_K:
        show(f"half k{kk:g} - unfiltered", S[kk], U)
    for kk in SOFT_K[1:]:
        show(f"half k{kk:g} - half k0", S[kk], S[0.0])
    for x, y in zip(SOFT_K, SOFT_K[1:]):
        show(f"half k{y:g} - half k{x:g}", S[y], S[x])
    for kk in ORACLE_K:
        show(f"oracle k{kk:g} - half k{kk:g}", O[kk], S[kk])
        show(f"oracle k{kk:g} - unfiltered", O[kk], U)
    show("oracle k0.25 - oracle k0", O[0.25], O[0.0])

    def z(c):
        return c["d"] / c["se"] if c["se"] else 0.0
    c69, c70 = con["half k0.05 - half k0"], con["half k0.25 - half k0.1"]
    c71, c72 = con["oracle k0.25 - half k0.25"], con["oracle k0.25 - unfiltered"]
    h69 = bool(c69["d"] > 2 * c69["se"])
    h70 = bool(abs(c70["d"]) <= 2 * c70["se"])
    h71 = bool(c71["d"] < -2 * c71["se"])
    h72 = bool(c72["d"] < -2 * c72["se"])

    def fmt(c):
        return f"{c['d'] * 100:+.2f} (se {c['se'] * 100:.2f}, z {z(c):+.1f})"
    p(f"\nH69 (the step is sharp: half weight at kappa 0.05 worse than at kappa 0 by > 2 MC se): "
      f"{'held' if h69 else 'refuted'}; {fmt(c69)}")
    p(f"H70 (the plateau is reached by kappa 0.1: half weight at 0.25 within 2 MC se of 0.1): "
      f"{'held' if h70 else 'refuted'}; {fmt(c70)}")
    p(f"H71 (halving one-sided true ties is the cost: oracle better than half weight at kappa 0.25 by > 2 MC se): "
      f"{'held' if h71 else 'refuted'}; {fmt(c71)}")
    p(f"H72 (perfect labelling beats keeping every report at kappa 0.25 by > 2 MC se): "
      f"{'held' if h72 else 'refuted'}; {fmt(c72)}")
    txt = "\n".join(lines) + "\n"
    out = "smoke_verdicts" if m6.SMOKE else "verdicts"
    open(os.path.join(HERE, out + ".txt"), "w").write(txt)
    json.dump({"key": KEY, "phi": PHI, "mode": MODE, "w": W, "soft_kappa": SOFT_K, "oracle_kappa": ORACLE_K,
               "rho": m20.RHO, "rows": rows, "contrasts": con, "sanity_prior": dprior, "hits": [hits, hp],
               "h69": [c69, h69], "h70": [c70, h70], "h71": [c71, h71], "h72": [c72, h72],
               "unfiltered": U, "soft": S, "oracle": O},
              open(os.path.join(HERE, out + ".json"), "w"), indent=1)
    print(txt)


if __name__ == "__main__":
    main()
