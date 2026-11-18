"""Milestone 7bc: does reserving a fixed share of the audit for the coder-negative cell's second phase give the
second-phase check of 7bb the power it lacked, and at what width cost? (7bb's next step (1).)

Why. 7bb tried to catch the "many-miss" failures (weak coders whose admitted pilot under-saw the coder-negative cell's
misses; seven cells with 30+ admitted draws cover under 88% given the split under the library default p5j40) with the
coder-negative cell's second-phase labels, which the pilot never saw. None of its candidates qualified, and its
reading was that the design starves the check: at a pilot of 0.7 n the Neyman allocation sends nearly all of the
remaining 0.3 n to the coder-positive cell, so the coder-negative cell's second phase held no labels or a handful
(2+ labels in 76.7% of admitted draws; lr caring n 1,000: none in 5 of 8 probed draws). A check on a handful of labels
has no power, and the variance maximum (v2) on a noisy small-sample variance is biased up, which is where its cost
came from. Here the coder-negative cell's second phase is given a fixed size, decided before any label is seen.

Reservation (cells draws only; pooled draws are untouched). Let t0, t1 be the plan's second-phase counts (`to_label`,
coder-negative then coder-positive cell) and R = round(r n). The reserved design labels t0' = min(unpiloted cell-0
items, max(t0, R)) in cell 0 and t1' = max(0, t1 - (t0' - t0)) in cell 1, so the budget is never exceeded. To keep
common random numbers with p5j40, cell 0 keeps p5j40's t0 second-phase items and adds t0' - t0 fresh ones drawn at
random from its unlabelled rest, and cell 1 keeps a random subset of size t1' of p5j40's t1 items (a random subset of
a simple random sample is one). The pilot, the plan, the p5j40 floor flag and lambda's definition are unchanged.

Candidates (start from p5j40, the library default, change only what is named; plan, pilot and seeds are 7bb's):
  p5j40   the library default (replays 7bb).
  v2      7bb's variance check on the unreserved labels (replays 7bb).
  rs10    reserve r = 0.10, p5j40's interval on the reserved labels: the cost of moving labels alone.
  rs10v2  reserve r = 0.10, cell 0's variance = max(its p5j40 variance, its second-phase sample variance).
  rs20v2  reserve r = 0.20, the same check.
  rs10tp  reserve r = 0.10, cell 0 closed two-phase on every cells draw (pilot labels exact, the rest from the second
          phase alone, plus-two floor, FPC on the rest; 7bb's tp1 with a reserved sample). A cost reference close to
          7ap's neg-only two-phase design; it decides nothing.
Cell 1 and lambda are estimated as in p5j40 in every candidate except that rs* use the reserved labels.

Cells: 7bb's 157 (7az's 130 GoEmotions cells and 7ba's 27 NaijaSenti cells), 1,000 draws each (+/- 1.4 points). The
reservation was never run on any of them; the GoEmotions cells hold the failures that motivated it, so P1 tests reach,
not generalisation.

    python3 experiments/h7bc_reserved_check.py draws [reps]   # -> h7bc_reserved_check_draws.txt
    python3 experiments/h7bc_reserved_check.py summary        # predictions and decision rule -> h7bc_reserved_check.txt
    python3 experiments/h7bc_reserved_check.py smoke [reps]   # first cell only, printed

Prediction (written and committed before any draw; a 10-draw smoke test of one cell may run first and is disclosed):
  P0  (replication) pooled, t10, p5j40 and v2 equal 7bb's in all 157 cells (coverage, ratio, admitted, fired).
  P1  (reach) of the 7 many-miss cells, rs10v2 lifts at least 3 to 88%+ admitted coverage. Guess: rs10 1, rs10v2 3,
      rs20v2 4, rs10tp 6 (7bb's tp1 lifted 6 on far fewer labels).
  P2  (cost) share of p5j40's summed gain (sum of 1 - ratio) kept over the 130 GoEmotions cells. Guess: rs10 85 to 95%
      (moving 0.1 n out of the cell where Neyman wanted it costs little where the cells gain is large), rs10v2 50 to
      75% (a larger second phase makes the maximum less noisy, so it costs less than 7bb's v2 at 34.5%), rs20v2 35 to
      60%, rs10tp negative (cell 0 holds most of the corpus, and 0.1 n labels estimate it far worse than 0.7 n).
  P3  (do no harm) no cell where p5j40 covers 93%+ falls under 93% under rs10, rs10v2 or rs20v2.
  P4  (second corpus) on the 27 NaijaSenti cells each of rs10, rs10v2, rs20v2 keeps 90%+ of p5j40's summed gain there
      and its weak-coder admitted coverage is at least p5j40's.
  Decision rule, fixed now (7bb's). A candidate (rs10v2, rs20v2) qualifies if (a) P3; (b) weak-cell (J < 0.30)
  admitted coverage over all 157 cells at least p5j40's; (c) fewer cells with 30+ admitted draws under 88% than p5j40;
  (d) 90%+ of p5j40's summed gain over the 130 GoEmotions cells; (e) P4 for it. Of those that qualify the one with the
  largest summed gain over all 157 cells is to become the library default in the next step (its own PR, with a test
  that replays this file draw for draw; this step changes no library code). If none qualifies, the default stays
  p5j40 and the paper's limitation 6 adds that a reserved second phase was tried, with these numbers. My expectation,
  stated so it can be wrong: none qualifies, on (d).
"""
import random
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))
from llmci import audit_design as A  # noqa: E402
A.RARE_FALLBACK = None  # pinned, as 7az, 7ba and 7bb
A.NEG_FLOOR = None  # pinned: p5j40 is applied below exactly as 7bb applied it
import h7au_neg_floor as U  # noqa: E402
import h7ay_cond_floor as Y  # noqa: E402
import h7at_weak_admit as W  # noqa: E402
import h7bb_second_phase as BB  # noqa: E402

SHARE = U.SHARE
FLOOR = BB.FLOOR
P5J40 = BB.P5J40
RESERVE = {"rs10": 0.10, "rs10v2": 0.10, "rs20v2": 0.20, "rs10tp": 0.10}
MODE = {"rs10": None, "rs10v2": "v2", "rs20v2": "v2", "rs10tp": "tp"}
CANDS = ["t10", "p5j40", "v2"] + list(RESERVE)
RULES = ["pooled"] + CANDS
MANY = BB.MANY
WEAK_J, GOOD_J = U.WEAK_J, U.GOOD_J
OUT = HERE / "h7bc_reserved_check_draws.txt"
SUMMARY = HERE / "h7bc_reserved_check.txt"
HEAD = Y.HEAD
cells = BB.cells


def reserve(plan, labels, pset, h, r, n, rng):
    """The reserved labelling: p5j40's labels with cell 0's second phase topped up to round(r n) and cell 1's cut by
    as many (a random subset of p5j40's cell-1 draws). Returns (labels, items added to cell 0)."""
    c0, c1 = plan["cells"]
    t0, t1 = plan["to_label"]
    free0 = [i for i in c0 if i not in labels]
    t0n = min(t0 + len(free0), max(t0, round(r * n)))
    add = t0n - t0
    t1n = max(0, t1 - add)
    sec1 = [i for i in c1 if i in labels and i not in pset]
    assert len(sec1) == t1, (len(sec1), t1)
    out = {i: v for i, v in labels.items() if i in pset or i in c0set(plan)}
    for i in rng.sample(sec1, t1n):
        out[i] = h[i]
    for i in rng.sample(free0, add):
        out[i] = h[i]
    assert len(out) <= n
    return out, add


def c0set(plan):
    s = plan.get("_c0set")
    if s is None:
        s = plan["_c0set"] = set(plan["cells"][0])
    return s


def run(c, reps):
    """7bb's `run` scheme and seeds line for line (pooled, t10, p5j40, v2); the reserved candidates reuse its pilot and
    plan, and their extra randomness comes from a separate generator per draw."""
    h, f, n = c["h"], c["f"], c["n"]
    N, truth = len(h), sum(h) / len(h)
    rr = random.Random(c["seed"] + 13)
    srs = [rr.sample(range(N), n) for _ in range(reps)]
    k = round(SHARE * n)
    res = {nm: [] for nm in RULES}
    fired = {nm: 0 for nm in CANDS}
    for d in range(reps):
        full = srs[d]
        labels = {i: h[i] for i in full}
        plan = A.plan_audit(f, labels, n, tau=2.0, neg_guard=0)
        _, lo, hi = A.audit_interval(plan, f, labels)
        res["pooled"].append(((hi - lo) / 2, lo <= truth <= hi, False, False))
        sb = random.Random(c["seed"] + 7 * d)
        pilot = full[:k]
        pset = set(pilot)
        pm = sum(1 for i in pilot if h[i] and not f[i])
        jh = W.j_lower([h[i] for i in pilot], [f[i] for i in pilot], 0.0)
        labels = {i: h[i] for i in pilot}
        plan = A.plan_audit(f, labels, n, tau=0.10, neg_guard=A.NEG_GUARD)
        if plan["design"] == "pooled":
            labels = {i: h[i] for i in full}
            plan = dict(plan, to_label=[0])
        for cell, t in zip(plan["cells"], plan["to_label"]):
            for i in sb.sample([i for i in cell if i not in labels], t):
                labels[i] = h[i]
        assert len(labels) <= n, (c["label"], n, len(labels))
        cl = plan["design"] == "cells"
        if cl:
            assert pm >= A.NEG_GUARD and all(f[i] == 0 for i in plan["cells"][0]), (c["label"], n, d)
        on = cl and pm < P5J40[0] and jh < P5J40[1]
        ivs, errs = {}, set()
        try:
            base = U.interval(plan, f, labels, None)
            p5 = U.interval(plan, f, labels, FLOOR if on else None)
            assert max(abs(a - b) for a, b in zip(p5, BB.interval(plan, f, labels, pset, on, None))) < 1e-12
            ivs["t10"], ivs["p5j40"] = base, p5
            fired["p5j40"] += on
            sec = [labels[i] for i in plan["cells"][0] if i in labels and i not in pset] if cl else []
            if cl and len(sec) >= 2:
                ivs["v2"] = BB.interval(plan, f, labels, pset, on, "v2")
                fired["v2"] += ivs["v2"] != p5
            else:
                ivs["v2"] = p5
        except ValueError:  # a cell with fewer than two labels; counted and reported, never silently dropped
            errs.update(("t10", "p5j40", "v2"))
        sr = random.Random(c["seed"] + 7 * d + 500009)
        rs_lab = {}
        for nm, r in RESERVE.items():
            if not cl:
                if "p5j40" in ivs:
                    ivs[nm] = ivs["p5j40"]
                else:
                    errs.add(nm)
                continue
            if r not in rs_lab:
                rs_lab[r] = reserve(plan, labels, pset, h, r, n, random.Random(sr.random()))
            lab, add = rs_lab[r]
            try:
                one = BB.interval(plan, f, lab, pset, on, None)
                sec = [lab[i] for i in plan["cells"][0] if i in lab and i not in pset]
                if MODE[nm] is None or len(sec) < 2:
                    ivs[nm] = one
                    fired[nm] += add > 0 if MODE[nm] is None else 0
                else:
                    ivs[nm] = BB.interval(plan, f, lab, pset, on, MODE[nm])
                    fired[nm] += ivs[nm] != one
            except ValueError:
                errs.add(nm)
        if errs:
            _, lo, hi = A.audit_interval({"design": "pooled", "cells": [list(range(N))]}, f, labels)
        for nm in CANDS:
            if nm in errs:
                res[nm].append(((hi - lo) / 2, lo <= truth <= hi, cl, True))
            else:
                _, a, b = ivs[nm]
                res[nm].append(((b - a) / 2, a <= truth <= b, cl, False))
    return res, fired


def one_cell(args):
    c, reps = args
    res, fired = run(c, reps)
    ref = sum(x[0] for x in res["pooled"]) / reps
    lines = []
    for name in RULES:
        r = res[name]
        w = sum(x[0] for x in r) / reps
        adm = [x for x in r if x[2]]
        lines.append(f"{c['label']} | {c['n']} | {c['J']:.3f} | {name} | {int(c['corpus'] == 'naija')} | "
                     f"{100 * sum(x[1] for x in r) / reps:.1f} | {100 * w:.3f} | {w / ref:.3f} | {len(adm)} | "
                     f"{sum(x[1] for x in adm)} | {sum(x[3] for x in r)} | {fired.get(name, 0)}")
    print("\n".join(lines), flush=True)
    return lines


def draws(reps):
    cs = list(cells())
    with Pool(4) as p:
        got = p.map(one_cell, [(c, reps) for c in cs], chunksize=1)
    OUT.write_text("\n".join([HEAD] + [l for g in got for l in g]) + "\n")


def summary():
    by = Y.parse(OUT)
    keys = list(dict.fromkeys((k[0], k[1]) for k in by))
    na = [k for k in keys if by[(*k, "pooled")]["fresh"]]
    go = [k for k in keys if k not in na]
    weak = [k for k in keys if by[(*k, "pooled")]["J"] < WEAK_J]
    good = [k for k in keys if by[(*k, "pooled")]["J"] >= GOOD_J]
    out = [f"cells run: {len(keys)} ({len(go)} GoEmotions, {len(na)} NaijaSenti; {len(weak)} weak J < {WEAK_J}, "
           f"{len(good)} good J >= {GOOD_J}); errors (cell with < 2 labels): "
           + ", ".join(f"{nm} {sum(by[(*k, nm)]['err'] for k in keys)}" for nm in CANDS)]
    old = Y.parse(HERE / "h7bb_second_phase_draws.txt")
    ms = ("cov", "ratio", "adm", "admc", "fired")
    same = [k for k in keys if all(by[(*k, r)][m] == old[(*k, r)][m] for r in ("pooled", "t10", "p5j40", "v2")
                                   for m in ms)]
    out.append(f"P0 pooled, t10, p5j40 and v2 replay 7bb in {len(same)} of {len(keys)}: "
               f"{'yes' if len(same) == len(keys) else 'no'}")

    def gain(nm, ks=keys):
        return sum(1 - by[(*k, nm)]["ratio"] for k in ks)

    def admcov(nm, k):
        b = by[(*k, nm)]
        return 100 * b["admc"] / b["adm"] if b["adm"] else float("nan")

    def adm_low(nm):
        return [(k, by[(*k, nm)]["adm"], round(admcov(nm, k), 1)) for k in keys
                if by[(*k, nm)]["adm"] >= 30 and by[(*k, nm)]["admc"] < 0.88 * by[(*k, nm)]["adm"]]

    def pooled_adm(nm, ks):
        a = sum(by[(*k, nm)]["adm"] for k in ks)
        return (100 * sum(by[(*k, nm)]["admc"] for k in ks) / a if a else float("nan")), a

    def p3_fail(nm):
        return [(k, by[(*k, nm)]["cov"]) for k in keys
                if by[(*k, nm)]["cov"] < 93.0 and by[(*k, "p5j40")]["cov"] >= 93.0]

    adm_all = sum(by[(*k, "p5j40")]["adm"] for k in keys)
    for nm in CANDS:
        wc, wa = pooled_adm(nm, weak)
        out.append(f"{nm}: gain all {gain(nm):.3f} (GoEmotions {gain(nm, go):.3f}, NaijaSenti {gain(nm, na):.3f}, weak "
                   f"{gain(nm, weak):.3f}, good {gain(nm, good):.3f}); changed or fired in "
                   f"{sum(by[(*k, nm)]['fired'] for k in keys)} of {adm_all} admitted draws; weak admitted coverage "
                   f"{wc:.1f}% of {wa}; admitted >= 30 under 88%: {adm_low(nm)}; under 93% where p5j40 is not: "
                   f"{p3_fail(nm)}")
    out.append("admitted coverage in the many-miss cells: " + "; ".join(
        f"{k[0]} n {k[1]} ({by[(*k, 'p5j40')]['adm']}): " + ", ".join(
            f"{nm} {admcov(nm, k):.1f} r {by[(*k, nm)]['ratio']:.3f}" for nm in CANDS[1:])
        for k in MANY if (*k, "p5j40") in by))
    for nm in RESERVE:
        p1 = sum(admcov(nm, k) >= 88.0 for k in MANY if (*k, nm) in by)
        out.append(f"P1 {nm} lifts {p1} of the {len(MANY)} many-miss cells to 88%+ admitted"
                   + (f": {'yes' if p1 >= 3 else 'no'} (rs10v2 needs 3)" if nm == "rs10v2" else ""))
    g0, n0 = gain("p5j40", go), gain("p5j40", na)
    out.append("P2 share of p5j40's GoEmotions gain kept: " + ", ".join(
        f"{nm} {gain(nm, go) / g0:.3f}" for nm in RESERVE))
    out.append("P3 no cell under 93% where p5j40 covers: " + ", ".join(
        f"{nm} {'yes' if not p3_fail(nm) else 'no'} ({len(p3_fail(nm))})" for nm in RESERVE))
    nweak = [k for k in na if k in weak]
    p0w = pooled_adm("p5j40", nweak)[0]

    def p4(nm):
        return gain(nm, na) >= 0.9 * n0 and pooled_adm(nm, nweak)[0] >= p0w

    out.append(f"P4 NaijaSenti: 90%+ of p5j40's gain ({n0:.3f}) and weak admitted coverage at least {p0w:.1f}%: "
               + ", ".join(f"{nm} {gain(nm, na):.3f} / {pooled_adm(nm, nweak)[0]:.1f}% {'yes' if p4(nm) else 'no'}"
                           for nm in RESERVE))
    p0wc, p0bad = pooled_adm("p5j40", weak)[0], len(adm_low("p5j40"))

    def checks(nm):
        return dict(a=not p3_fail(nm), b=pooled_adm(nm, weak)[0] >= p0wc, c=len(adm_low(nm)) < p0bad,
                    d=gain(nm, go) >= 0.9 * g0, e=p4(nm))

    for nm in ("rs10v2", "rs20v2"):
        out.append(f"decision checks {nm}: " + ", ".join(f"({x}) {'yes' if v else 'no'}" for x, v in checks(nm).items()))
    ok = [nm for nm in ("rs10v2", "rs20v2") if all(checks(nm).values())]
    if ok:
        out.append(f"Decision rule: qualifying {ok}; {max(ok, key=gain)} is to become the library default (next step)")
    else:
        out.append("Decision rule: none qualifies; the default stays p5j40")
    text = "\n".join(out); print(text); SUMMARY.write_text(text + "\n")


def main():
    mode = ARGS[0] if ARGS else "summary"
    if mode == "summary":
        summary()
    elif mode == "smoke":
        c = next(cells())
        print("\n".join(one_cell((c, int(ARGS[1]) if len(ARGS) > 1 else 10))))
    else:
        draws(int(ARGS[1]) if len(ARGS) > 1 else 1000)


if __name__ == "__main__":
    main()
