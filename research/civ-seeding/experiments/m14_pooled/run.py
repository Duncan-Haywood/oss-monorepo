"""Milestone 14: do milestones 10 and 11's sub-point findings survive pooled Monte Carlo copies?

Milestone 13's harness unchanged (milestone 6's joint bootstrap, B = 500, S = 100, 100 draws per
randomised rule, every extra randomised rule on its own stream, milestone 12's 53 primary rules),
with four replicates (`name#r<j>`, surveys and scoring runs drawn afresh) of 15 rules: milestone
13's four key rules, the three f = 0.5 split rules at perfect recall, and census top degree,
census degree discount and the three-quarters-random half survey at rho = 0.85, 0.75 and 0.5.

Two readings per rule:
- per copy (c = 0 primary, 1-4 replicates): replicate c swapped in for all 15 rules;
- pooled: each village's mean adopters averaged over the five copies (500 draws per village),
  swapped in for all 15; regret against the best of the primary set with the pooled columns.
Monte Carlo se of a pooled median = sd of the five copy medians / sqrt(5); of a difference
between two rules = sd of the five per-copy differences / sqrt(5).

Tests H34-H37. Plan in LOG.md (2026-11-18, milestone 14), written before the run.

OMP_NUM_THREADS=1 /usr/bin/python3.13 experiments/m14_pooled/run.py   (about 40 minutes on 4 cores)
"""
import importlib.util
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))

_spec = importlib.util.spec_from_file_location("m12", os.path.join(HERE, "..", "m12_strength", "run.py"))
m12 = importlib.util.module_from_spec(_spec)
sys.modules["m12"] = m12
_spec.loader.exec_module(m12)
m6, m11, m10 = m12.m6, m12.m11, m12.m10

N_REP = 4
M13_KEY = ["census-dd-measured", "census-dd-matched",
           "adaptive-dd-0.5-s0.75-measured", "adaptive-dd-0.5-s0.75-matched"]
SPLIT = ["adaptive-dd-0.5-s0.25", "adaptive-dd-0.5", "adaptive-dd-0.5-s0.75"]
RHO = [0.85, 0.75, 0.5]
RBASE = ["census-degree", "census-dd", "adaptive-dd-0.5-s0.75"]
RECALL = [m11.name(b, r) for b in RBASE for r in RHO]
KEY = M13_KEY + SPLIT + RECALL
FN = {**m10.EXTRA, **m11.NEW, **m12.NEW}
REPS = {f"{c}#r{j}": FN[c] for c in KEY for j in range(1, N_REP + 1)}
m6.EXTRA_RANDOMISED = {**m6.EXTRA_RANDOMISED, **REPS}
m6.PER_RULE_STREAMS = True
m6.NOT_IN_REFERENCE = set(REPS)
m6.OUT_DIR = HERE


def regret_cols(r, Ecols):
    """B x len(cols) worst-case regret; Ecols(k) gives the rules x villages matrix under process k."""
    W, draws = r["W"], r["draws"]
    B = W.shape[0]
    cache = {}
    out = np.zeros((B, len(m6.FAMS), 0))
    for bi in range(B):
        row = []
        for f in m6.FAMS:
            k = draws[bi][f]
            if k not in cache:
                cache[k] = Ecols(k)
            tot = cache[k] @ W[bi]
            row.append(1 - tot / tot.max())
        if out.shape[2] == 0:
            out = np.zeros((B, len(m6.FAMS), len(row[0])))
        out[bi] = row
    return out.max(1)


def main():
    r = m6.main()
    E, rules = r["E"], r["rules"]
    k = {c: i for i, c in enumerate(rules)}
    prim = [c for c in rules if c not in REPS]
    pi = {c: i for i, c in enumerate(prim)}

    def copy_names(c):
        return [x if (c == 0 or x not in KEY) else f"{x}#r{c}" for x in prim]

    copies = []
    for c in range(N_REP + 1):
        idx = [k[x] for x in copy_names(c)]
        w = regret_cols(r, lambda q, idx=idx: E[q][idx])
        copies.append(w)                                              # B x len(prim)
    allidx = np.array([[k[x] for x in copy_names(c)] for c in range(N_REP + 1)])   # copies x prim
    pooled = regret_cols(r, lambda q: E[q][allidx].mean(0))            # B x len(prim)

    def med(w, x):
        return float(np.median(w[:, pi[x]]))
    cm = np.array([[med(w, x) for x in KEY] for w in copies])          # copies x KEY
    se = cm.std(0, ddof=1) / np.sqrt(N_REP + 1)
    pm = {x: med(pooled, x) for x in KEY}

    def diff(a, b):
        d = cm[:, KEY.index(a)] - cm[:, KEY.index(b)]
        return med(pooled, a) - med(pooled, b), d, float(d.std(ddof=1) / np.sqrt(N_REP + 1))

    lines = []
    p = lines.append
    p("# Milestone 14: pooled Monte Carlo copies of 15 randomised rules (milestone 13's harness)")
    p(f"B = {copies[0].shape[0]} joint draws; {N_REP + 1} copies; reference = the {len(prim)} primary rules, "
      "the copy's (or pooled) columns swapped in for all 15")

    # sanity against milestone 13
    s13 = json.load(open(os.path.join(HERE, "..", "m13_streams", "verdicts.json")))
    m13med = np.array(s13["median_per_copy"])
    m13copies = []
    for c in range(N_REP + 1):
        idx = [k[x if (c == 0 or x not in M13_KEY) else f"{x}#r{c}"] for x in prim]
        w = regret_cols(r, lambda q, idx=idx: E[q][idx])
        m13copies.append([med(w, x) for x in M13_KEY])
    dev = float(np.abs(np.array(m13copies) - m13med).max())
    p(f"\n## sanity: milestone 13's copies rebuilt (only its four rules swapped), max |difference| from "
      f"m13_streams/verdicts.json {dev:.2e} (rounded to 1e-5 there)")

    p("\n## per rule: joint median per copy | pooled median [5%, 95% bootstrap] | MC se | copy sd | minimax share (pooled)")
    best = np.argmin(pooled, 1)
    rows = {}
    for i, x in enumerate(KEY):
        lo, hi = np.percentile(pooled[:, pi[x]], [5, 95])
        mm = float((best == pi[x]).mean())
        rows[x] = dict(copies=cm[:, i].round(5).tolist(), pooled=round(pm[x], 5), q5=round(float(lo), 5),
                       q95=round(float(hi), 5), se=round(float(se[i]), 5),
                       sd=round(float(cm[:, i].std(ddof=1)), 5), minimax=mm,
                       shift=round(pm[x] - cm[0, i], 5))
        p(f"  {x:32s} " + " ".join(f"{v:.4f}" for v in cm[:, i])
          + f" | {pm[x]:.4f} [{lo:.4f}, {hi:.4f}] | {se[i] * 100:.2f} | {cm[:, i].std(ddof=1) * 100:.2f} | {mm:.3f}")

    p("\n## reference rows, pooled reading: perfect census dd-0.05 "
      f"{med(pooled, 'dd-0.05'):.4f}, census top degree {med(pooled, 'degree'):.4f}")

    # H35 split lean
    d35, d35c, se35 = diff("adaptive-dd-0.5-s0.75", "adaptive-dd-0.5")
    sh35 = float((pooled[:, pi["adaptive-dd-0.5-s0.75"]] < pooled[:, pi["adaptive-dd-0.5"]]).mean())
    d25, d25c, se25 = diff("adaptive-dd-0.5-s0.25", "adaptive-dd-0.5")
    p("\n## split at f = 0.5, perfect recall (pooled difference, per-copy differences, MC se, pooled paired share)")
    p(f"  s0.75 - half split: {d35 * 100:+.2f} point; copies " + " ".join(f"{v * 100:+.2f}" for v in d35c)
      + f"; se {se35 * 100:.2f}; s0.75 lower in {sh35:.3f} of draws")
    p(f"  s0.25 - half split: {d25 * 100:+.2f} point; copies " + " ".join(f"{v * 100:+.2f}" for v in d25c)
      + f"; se {se25 * 100:.2f}")

    # H36 monotone in rho
    p("\n## recall: rho = 0.75 minus rho = 0.5 (pooled, per copy, MC se); and 0.85 minus 0.75")
    h36 = {}
    for b in RBASE:
        d, dc, s_ = diff(m11.name(b, 0.75), m11.name(b, 0.5))
        d2, _, s2 = diff(m11.name(b, 0.85), m11.name(b, 0.75))
        h36[b] = dict(d=d, copies=dc.round(5).tolist(), se=s_, ok=bool(d <= 2 * s_))
        p(f"  {b:22s} {d * 100:+.2f} point; copies " + " ".join(f"{v * 100:+.2f}" for v in dc)
          + f"; se {s_ * 100:.2f} | 0.85 - 0.75: {d2 * 100:+.2f} (se {s2 * 100:.2f})")

    # milestone 12/13 comparison, pooled
    p("\n## milestone 12's H28 on pooled scores: measured minus matched")
    for b in ("census-dd", "adaptive-dd-0.5-s0.75"):
        d, dc, s_ = diff(f"{b}-measured", f"{b}-matched")
        p(f"  {b:22s} {d * 100:+.2f} point (se {s_ * 100:.2f})")

    c37 = "adaptive-dd-0.5-s0.75-r0.85"
    sh37 = float((pooled[:, pi[c37]] < pooled[:, pi["degree"]]).mean())
    h34 = bool((se <= 0.0015).all())
    h35 = bool(d35 <= -0.0025 and d35 < -2 * se35)
    h37 = bool(pm[c37] <= 0.025 and sh37 >= 0.9)
    p(f"\nH34 (every pooled median has MC se <= 0.15 point): {'held' if h34 else 'refuted'}; max se "
      f"{se.max() * 100:.2f} ({KEY[int(np.argmax(se))]})")
    p(f"H35 (pooled s0.75 - half split <= -0.25 point and below -2 se): {'held' if h35 else 'refuted'}; "
      f"{d35 * 100:+.2f}, 2 se = {2 * se35 * 100:.2f}")
    p("H36 (rho 0.75 row no more than 2 se above rho 0.5): "
      f"{'held' if all(v['ok'] for v in h36.values()) else 'refuted'}; "
      + ", ".join(f"{b} {v['d'] * 100:+.2f} (2 se {2 * v['se'] * 100:.2f})" for b, v in h36.items()))
    p(f"H37 ({c37} pooled median <= 2.5%, beats perfect census top degree in >= 90%): "
      f"{'held' if h37 else 'refuted'}; {pm[c37]:.4f}, {sh37:.3f}")
    p("prediction (not tested): pooled within 0.5 point of copy 0: max |shift| "
      f"{max(abs(v['shift']) for v in rows.values()) * 100:.2f} point")
    sds = np.array([rows[x]["sd"] for x in KEY])
    mms = np.array([rows[x]["minimax"] for x in KEY])
    rho_ = float(np.corrcoef(np.argsort(np.argsort(sds)), np.argsort(np.argsort(mms)))[0, 1])
    p(f"exploratory: rank correlation of copy sd with pooled minimax share over the 15 rules: {rho_:+.2f}")
    txt = "\n".join(lines) + "\n"
    out = "smoke_verdicts" if m6.SMOKE else "verdicts"
    open(os.path.join(HERE, out + ".txt"), "w").write(txt)
    json.dump({"key": KEY, "rows": rows, "sanity_m13": dev,
               "h34": h34, "h35": [d35, se35, sh35, h35], "h36": h36, "h37": [pm[c37], sh37, h37],
               "ref": {"dd-0.05": med(pooled, "dd-0.05"), "degree": med(pooled, "degree")},
               "sd_minimax_rank_corr": rho_},
              open(os.path.join(HERE, out + ".json"), "w"), indent=1)
    print(txt)


if __name__ == "__main__":
    main()
