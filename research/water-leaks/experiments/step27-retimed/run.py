"""Step 27: re-time step 24's R30 to the detector's alarm. Seventeen rules, each a function of the
alarm day k_al and the tracker only (a lag: R30 on day k_al + delta; or a vote: the node R30 picks
on the most days of [k_al + a, k_al + b]). One is selected on the 2018 leaks D1-L detects (real and
injected pooled), frozen, and only then scored on the 2019 ones.

    PYTHONPATH=src python experiments/step27-retimed/run.py   # from research/water-leaks

Plan fixed in LOG.md (2026-11-19, step 27) before R30 was run at any day other than step 26's alarm
and oracle days. Reuses step 26's `build()` (and so step 25's cached simulations). Deterministic.
Writes results.txt, rules.tsv and leaks.tsv.
"""
from __future__ import annotations

import importlib.util
import math
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from scipy.stats import spearmanr

from water_leaks import localise, stats

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
RADIUS = 300.0
PRIMARY, REFERENCE = "D1-L", "D1-F"
TUNE, TEST = 2018, 2019
LAGS = (-7, -4, -2, -1, 0, 1, 2, 4, 7)
VOTES = ((-7, 0), (-4, 0), (-2, 2), (-4, 4), (0, 4), (0, 7), (-7, 7), (2, 7))


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m          # so multiprocessing can pickle step 26's `_simulate` by name
    spec.loader.exec_module(m)
    return m


def rule_order():
    """The plan's tie-break order: L rules by (|delta|, larger delta first), then V rules by
    (length, earlier start)."""
    lags = sorted(LAGS, key=lambda d: (abs(d), -d))
    votes = sorted(VOTES, key=lambda ab: (ab[1] - ab[0], ab[0]))
    return [("L", (d,)) for d in lags] + [("V", ab) for ab in votes]


def rule_name(rule):
    kind, p = rule
    return f"L{p[0]:+d}" if kind == "L" else f"V[{p[0]:+d},{p[1]:+d}]"


def vote(picks):
    """picks: [(day, node or None)] in day order. The node picked on the most days, ties to the
    pick of the latest such day; None when no day has a pick."""
    got = [(k, j) for k, j in picks if j is not None]
    if not got:
        return None
    n = Counter(j for _, j in got)
    top = max(n.values())
    for k, j in reversed(got):
        if n[j] == top:
            return j


def apply_rule(rule, pick_at, k_al):
    """pick_at(k) -> R30's node on day k (or None)."""
    kind, p = rule
    if kind == "L":
        return pick_at(k_al + p[0])
    a, b = p
    return vote([(k, pick_at(k)) for k in range(k_al + a, k_al + b + 1)])


def select(hits_by_rule, order):
    """The rule with the most hits; ties to the earliest in `order`."""
    best = max(hits_by_rule[r] for r in order)
    return next(r for r in order if hits_by_rule[r] == best)


def main():
    step26 = _load("step26", EXP / "step26-alarm-timed" / "run.py")
    c = step26.build()
    rowsA, rowsB, offB, dpipe, ndist, est, real_T = (c[k] for k in ("rowsA", "rowsB", "offB", "dpipe", "ndist", "est", "real_T"))

    leaks = []          # every scored leak with its tracker and distance array
    for w in rowsA:
        leaks.append((w, real_T, dpipe[w["id"]]))
    for w, (meta, states) in zip(rowsB, offB):
        assert w["id"].endswith(meta["node"])
        leaks.append((w, states, ndist(meta["node"])))
    order = rule_order()
    assert len(order) == 17

    def pick_fn(states):
        cache = {}

        def pick_at(k):
            k = max(1, k)
            if k not in cache:
                cache[k] = est(states, k)[0]
            return cache[k]
        return pick_at

    def err(dist, j):
        return math.inf if j is None else float(dist[j])

    # per leak and detector: the error of every rule (and of R30 at the oracle day, from step 26);
    # built one year at a time, so no 2019 rule error exists until S has been selected on 2018
    table = []

    def score_year(year):
        for w, states, dist in leaks:
            if w["year"] != year:
                continue
            pick_at = pick_fn(states)
            ent = {"w": w, "pi": w["pi"], "year": w["year"], "arm": w["arm"]}
            for n in (PRIMARY, REFERENCE):
                k_al = w[f"k_{n}"]
                if k_al < 0:
                    ent[n] = None
                    continue
                e = {r: err(dist, apply_rule(r, pick_at, k_al)) for r in order}
                assert abs(e[("L", (0,))] - w[f"R30_{n}"]) < 0.5 or math.isinf(w[f"R30_{n}"]), (w["id"], n)
                ent[n] = e
            table.append(ent)

    def det(n, year, arm=None):
        return [t for t in table if t[n] is not None and t["year"] == year and (arm is None or t["arm"] == arm)]

    def nhits(rows, n, r):
        return int(sum(t[n][r] <= RADIUS for t in rows))

    def ohits(rows):
        return int(sum(t["w"]["R30_or"] <= RADIUS for t in rows))

    out = ["# water-leaks step 27: R30 (step 24) re-timed to D1-L's alarm day k_al; 17 rules (lag L: R30 on day",
           "# k_al + delta; vote V[a,b]: the node R30 picks on most days of [k_al + a, k_al + b]); one selected on",
           "# 2018's detected leaks (real and injected pooled), frozen, then scored on 2019's; rule 300 m along pipes", ""]

    # ---- selection, on 2018 only
    score_year(TUNE)
    tune = det(PRIMARY, TUNE)
    h18 = {r: nhits(tune, PRIMARY, r) for r in order}
    S = select(h18, order)
    L0 = ("L", (0,))
    out.append(f"## selection on {TUNE}: D1-L detects {len(tune)} leaks ({len(det(PRIMARY, TUNE, 'A'))} real, "
               f"{len(det(PRIMARY, TUNE, 'B'))} injected); R30 at the oracle day {ohits(tune)}")
    out.append("  rule        hits 2018")
    for r in order:
        out.append(f"  {rule_name(r):<11} {h18[r]:>3}" + ("   <- selected (S)" if r == S else ""))
    out.append(f"  S = {rule_name(S)}, frozen before any {TEST} score below was computed into this report")
    out.append("")
    # The 2019 scores are computed only after S is fixed above.
    score_year(TEST)
    test = det(PRIMARY, TEST)
    ps = [t["pi"] for t in test]
    h19 = {r: nhits(test, PRIMARY, r) for r in order}
    hs = np.array([test_[PRIMARY][S] <= RADIUS for test_ in test])
    h0 = np.array([test_[PRIMARY][L0] <= RADIUS for test_ in test])
    pS = localise.poisson_binomial_tail(ps, int(hs.sum()))
    x, y = localise.sign_test_counts(hs, h0)
    p_sign = stats.sign_test(x, y)
    gain18, gain19 = (h18[S] - h18[L0]) / len(tune), (h19[S] - h19[L0]) / len(test)
    out.append(f"## test on {TEST}: D1-L detects {len(test)} leaks ({len(det(PRIMARY, TEST, 'A'))} real, "
               f"{len(det(PRIMARY, TEST, 'B'))} injected); chance expected {sum(ps):.2f}; R30 at the oracle day {ohits(test)}")
    out.append(f"  S = {rule_name(S)}: {int(hs.sum())} of {len(test)} (P(chance >=) {pS:.2g}); L0 (step 26) {int(h0.sum())}")
    out.append(f"  paired S against L0: S only {x}, L0 only {y}, P = {p_sign:.3f}")
    for arm, lab in (("A", "real new 2019"), ("B", "injected 2019")):
        sub = det(PRIMARY, TEST, arm)
        out.append(f"    {lab}: S {nhits(sub, PRIMARY, S)}, L0 {nhits(sub, PRIMARY, L0)}, oracle day {ohits(sub)} of {len(sub)}")
    all19 = [t for t in table if t["year"] == TEST]
    out.append(f"  end to end ({TEST}, of all {len(all19)} leaks: {sum(t['arm'] == 'A' for t in all19)} real, "
               f"{sum(t['arm'] == 'B' for t in all19)} injected): S {int(hs.sum())}, L0 {int(h0.sum())}")
    out.append("")

    out.append("## pre-registered predictions (LOG.md, step 27 plan; detector D1-L, 2019's detected leaks)")
    out.append(f"  (a) S more hits than L0: {int(hs.sum())} against {int(h0.sum())}: {'HELD' if hs.sum() > h0.sum() else 'FAILED'}")
    out.append(f"  (b) S at least 8 hits: {int(hs.sum())}: {'HELD' if hs.sum() >= 8 else 'FAILED'}")
    out.append(f"  (c) S beats chance at P < 0.01: P = {pS:.2g}: {'HELD' if pS < 0.01 else 'FAILED'}")
    out.append(f"  (d) S beats L0 at P < 0.05 (sign test): P = {p_sign:.3f}: {'HELD' if p_sign < 0.05 and x > y else 'FAILED'}")
    held_e = gain19 >= 0.5 * gain18 if gain18 > 0 else False
    out.append(f"  (e) S keeps at least half its 2018 gain per leak: {gain19:+.3f} against 0.5 x {gain18:+.3f}:"
               f" {'HELD' if held_e else 'FAILED'}" + ("" if gain18 > 0 else " (S has no 2018 gain over L0)"))
    out.append("")

    # ---- no verdicts: the whole grid in both years, the reference detector
    rho = spearmanr([h18[r] for r in order], [h19[r] for r in order])
    out.append("## every rule, both years (no verdicts)")
    out.append(f"  rule        2018 of {len(tune):<3} 2019 of {len(test):<3} (real, injected)")
    rules_tsv = ["rule\thits_2018\thits_2019\thits_2019_real\thits_2019_injected\tn_2018\tn_2019"]
    for r in order:
        ra, rb = nhits(det(PRIMARY, TEST, "A"), PRIMARY, r), nhits(det(PRIMARY, TEST, "B"), PRIMARY, r)
        out.append(f"  {rule_name(r):<11} {h18[r]:>4}       {h19[r]:>4}       ({ra}, {rb})")
        rules_tsv.append(f"{rule_name(r)}\t{h18[r]}\t{h19[r]}\t{ra}\t{rb}\t{len(tune)}\t{len(test)}")
    out.append(f"  rank correlation of the rules' hits, 2018 against 2019: Spearman {rho.statistic:.2f} (P = {rho.pvalue:.2f})")
    out.append(f"  best rule in 2019 alone: {rule_name(select(h19, order))} ({max(h19.values())})")
    out.append("")
    for n in (REFERENCE,):
        t18, t19 = det(n, TUNE), det(n, TEST)
        out.append(f"## reference detector {n}, same S (no verdicts): 2018 {nhits(t18, n, S)} of {len(t18)} (L0 {nhits(t18, n, L0)}),"
                   f" 2019 {nhits(t19, n, S)} of {len(t19)} (L0 {nhits(t19, n, L0)}, oracle day {ohits(t19)})")
        h18n = {r: nhits(t18, n, r) for r in order}
        out.append(f"  {n}'s own 2018 selection would be {rule_name(select(h18n, order))} ({max(h18n.values())});"
                   f" it scores {nhits(t19, n, select(h18n, order))} in 2019")
    out.append("")

    # per-leak table for the detected leaks
    cols = ["arm", "id", "kind", "year", "pi", "k_or", f"k_{PRIMARY}", "R30_or", "L0", "S"]
    tsv = ["\t".join(cols)]
    for t in table:
        if t[PRIMARY] is None:
            continue
        w = t["w"]
        tsv.append("\t".join([w["arm"], w["id"], w["kind"], str(w["year"]), f"{w['pi']:.4g}", str(w["k_or"]),
                              str(w[f"k_{PRIMARY}"]), f"{w['R30_or']:.4g}", f"{t[PRIMARY][L0]:.4g}", f"{t[PRIMARY][S]:.4g}"]))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    (HERE / "rules.tsv").write_text("\n".join(rules_tsv) + "\n")
    (HERE / "leaks.tsv").write_text("\n".join(tsv) + "\n")
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
