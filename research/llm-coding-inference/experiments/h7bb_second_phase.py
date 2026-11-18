"""Milestone 7bb: can the second-phase labels, which the pilot never saw, catch the draws whose admitted pilot under-saw
a weak coder's misses (the "many-miss" failures no pilot statistic reaches), at an acceptable width cost? (7ba's next
step (1), 7ao's direction.)

Why. Under the shipped rule (pilot 0.7 n, cap, tau 0.1, 3-miss guard) plus the library default floor p5j40 (7az), six
GoEmotions cells with 30+ admitted draws still cover under 88% given that cells were used: 1.5B disapproval n 1,000
(74.3%), lr approval n 1,000 (69.8%) and n 750 (72.8%), lr annoyance n 2,000 (87.2%) and n 750 (62.5%), lr disapproval
n 1,000 (87.6%); on NaijaSenti, Qwen 3B 5% n 500 (84.6%, 7ba). The failing draws' pilots hold 5 or more coder misses or
J_hat over 0.40, so every pilot-only trigger tried (J_hat, its lower bound, the miss count, both) cannot see them. 7at's
post hoc replay: every missed interval lies below the truth and the coder-negative cell's variance in those draws is
0.36 to 0.69 of its true value. The pilot chose the design, so its labels are selected; the second-phase labels in the
coder-negative cell are a fresh simple random sample of the cell's unpiloted rest, drawn after the choice, so they
carry evidence the selection did not touch. 7ao/7ap estimated that cell from the second phase alone in every draw and
lost more width than it gained. Here the second phase is used only as a check, or only on the variance side.

Candidates (all start from p5j40, the library default, and change only the coder-negative cell (cell 0) of a one-phase
cells plan; plan, labels and seeds are 7az's / 7ba's, common random numbers):
  p5j40  the library default (replays 7az and 7ba).
  v2     variance check: cell 0's variance is max(its p5j40 variance, the raw sample variance of cell 0's second-phase
         labels alone), when the second phase holds 2+ labels there. Mean unchanged.
  tp10   switch on a test: let x_P / m_P be the pilot's coder misses / pilot items in cell 0 and x_S / m_S the same for
         the second phase. If P(Bin(m_S, p_P) >= x_S) < 0.10 with p_P = (x_P + 0.5) / (m_P + 1), cell 0 is closed
         two-phase: the pilot's labels counted exactly, the unpiloted rest R_0's mean and variance from the second phase
         alone (variance floored at the plus-two pseudo-count, FPC on R_0), as 7ao. Otherwise p5j40.
  tp25   the same test at 0.25.
  tp1    two-phase in cell 0 on every cells draw (the test at 1.0; a cost reference, decides nothing).
Cell 1 (coder-positive) and lambda are untouched in every candidate (f is constant within cell 0, so lambda does not
enter cell 0's term).

Cells. 7az's 130 GoEmotions cells (seen: the six failing cells above were found on them, so they test whether the check
reaches the failures, not whether it generalises) and 7ba's 27 NaijaSenti cells (nb, Qwen 1.5B and 3B coders at 5%, 10%
and native prevalence, n 300 / 500 / 1,000; fresh for this check: no second-phase statistic was ever computed on them).
1,000 draws per cell (+/- 1.4 points). Rare fallback and the library NEG_FLOOR pinned off; p5j40 is applied here exactly
as 7az / 7ba applied it (`h7au_neg_floor.interval` with the plus-two floor), and every draw asserts this file's
interval reduces to it to 1e-12 when no check fires.

    python3 experiments/h7bb_second_phase.py draws [reps]   # -> h7bb_second_phase_draws.txt
    python3 experiments/h7bb_second_phase.py summary        # predictions and decision rule -> h7bb_second_phase.txt
    python3 experiments/h7bb_second_phase.py smoke [reps]   # first cell only, printed

Prediction (written and committed before any draw; a 10-draw smoke test of one cell may run first and is disclosed):
  P0  (replication) pooled, t10 and p5j40 equal 7az's in all 130 GoEmotions cells and 7ba's in all 27 NaijaSenti cells
      (coverage, ratio, admitted draws, fired).
  P1  (reach) of the 7 many-miss cells (the six above and Qwen 3B 5% n 500), tp10 lifts at least 4 to 88%+ admitted
      coverage. Guess: tp10 4, tp25 5, v2 2 (the missed intervals sit below the truth, so the mean is biased low too,
      which a variance check alone does not move).
  P2  (cost) share of p5j40's summed gain (sum of 1 - ratio) kept over the 130 GoEmotions cells. Guess: v2 80 to 92%,
      tp10 92 to 98%, tp25 85 to 95%, tp1 under 70%.
  P3  (do no harm) no cell where p5j40 covers 93%+ falls under 93% under v2, tp10 or tp25.
  P4  (fresh) on the 27 NaijaSenti cells each of v2, tp10, tp25 keeps 90%+ of p5j40's summed gain there and its
      weak-coder admitted coverage is at least p5j40's.
  Decision rule, fixed now. A candidate (v2, tp10, tp25) qualifies if (a) P3; (b) weak-cell (J < 0.30) admitted
  coverage over all 157 cells at least p5j40's; (c) fewer cells with 30+ admitted draws under 88% than p5j40, over all
  157; (d) 90%+ of p5j40's summed gain over the 130 GoEmotions cells; (e) P4 for it. Of those that qualify the one with
  the largest summed gain over all 157 cells is to become the library default in the next step (its own PR, with a test
  that replays this file draw for draw; this step changes no library code). If none qualifies, the default stays p5j40
  and the paper's limitation 6 adds that a second-phase check was tried, with these numbers.
"""
import math
import random
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))
from llmci import audit_design as A  # noqa: E402
A.RARE_FALLBACK = None  # pinned, as 7az and 7ba
A.NEG_FLOOR = None  # pinned: p5j40 is applied below exactly as 7az / 7ba applied it
import h7au_neg_floor as U  # noqa: E402
import h7ay_cond_floor as Y  # noqa: E402
import h7at_weak_admit as W  # noqa: E402
import h7az_joint_trigger as Z  # noqa: E402
import h7ba_floor_naija as B  # noqa: E402

SHARE = U.SHARE
FLOOR = ("neg", "pseudo", 2)
P5J40 = (5, 0.40)
CANDS = ["t10", "p5j40", "v2", "tp10", "tp25", "tp1"]
TESTS = {"tp10": 0.10, "tp25": 0.25, "tp1": 1.0}
RULES = ["pooled"] + CANDS
MANY = (("1.5B disapproval", 1000), ("lr approval", 1000), ("lr approval", 750), ("lr annoyance", 2000),
        ("lr annoyance", 750), ("lr disapproval", 1000), ("q3 p0.05", 500))
WEAK_J, GOOD_J = U.WEAK_J, U.GOOD_J
OUT = HERE / "h7bb_second_phase_draws.txt"
SUMMARY = HERE / "h7bb_second_phase.txt"
HEAD = Y.HEAD


def cells():
    for c in Z.cells():
        yield dict(c, corpus="goemo")
    for c in B.cells():
        yield dict(c, corpus="naija")


def upper_tail(m, p, x):
    """P(Bin(m, p) >= x)."""
    if x <= 0:
        return 1.0
    return max(0.0, 1.0 - sum(math.comb(m, j) * p ** j * (1 - p) ** (m - j) for j in range(x)))


def interval(plan, f_all, labels, pilot, floor_on, mode, z=1.959964):
    """`h7au_neg_floor.interval` (one-phase plan, floor (neg, pseudo, 2) if floor_on), with cell 0 changed by `mode`:
    None (unchanged), "v2" (variance max with the second phase's), or "tp" (two-phase: pilot labels exact, the rest
    from the second phase alone, plus-two floor, FPC on the rest)."""
    cells = plan["cells"]
    ys = [[labels[i] for i in c if i in labels] for c in cells]
    fs = [[f_all[i] for i in c if i in labels] for c in cells]
    if any(len(y) < 2 for y in ys):
        raise ValueError("each cell needs at least two labelled items")
    ay = [v for y in ys for v in y]
    af = [v for f in fs for v in f]
    mf = sum(af) / len(af)
    vf = sum((v - mf) ** 2 for v in af) / (len(af) - 1)
    my = sum(ay) / len(ay)
    lam = 0.0 if vf == 0 else min(1.0, max(0.0, sum((a - my) * (b - mf) for a, b in zip(ay, af)) / (len(ay) - 1) / vf))
    total = sum(len(c) for c in cells)
    value = var = 0.0
    for h, (c, y, f) in enumerate(zip(cells, ys, fs)):
        w = len(c) / total
        if h == 0 and mode == "tp":
            yp = [labels[i] for i in c if i in pilot]
            ysec = [labels[i] for i in c if i in labels and i not in pilot]
            rest = len(c) - len(yp)
            ms = sum(ysec) / len(ysec)
            vs = sum((x - ms) ** 2 for x in ysec) / (len(ysec) - 1)
            vs = max(vs, U.floor_var(ysec, "pseudo", 2))
            value += w * (sum(yp) + rest * ms) / len(c)
            var += w * w * (rest / len(c)) ** 2 * (1 - len(ysec) / rest) * vs / len(ysec)
            continue
        r = [a - lam * b for a, b in zip(y, f)]
        mr = sum(r) / len(r)
        v = sum((x - mr) ** 2 for x in r) / (len(r) - 1)
        if floor_on and len(cells) > 1 and h == 0:
            v = max(v, U.floor_var(y, "pseudo", 2))
        if h == 0 and mode == "v2":
            ysec = [labels[i] for i in c if i in labels and i not in pilot]
            ms = sum(ysec) / len(ysec)
            v = max(v, sum((x - ms) ** 2 for x in ysec) / (len(ysec) - 1))
        value += w * (lam * sum(f_all[i] for i in c) / len(c) + mr)
        var += w * w * (1 - len(y) / len(c)) * v / len(y)
    return A._wilson(value, var, z)


def run(c, reps):
    """`h7az_joint_trigger.run`'s scheme and seeds, line for line (7ba's is the same); the candidates reuse t10's plan
    and labels."""
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
        try:
            lib = A.audit_interval(plan, f, labels)
            base = U.interval(plan, f, labels, None)
            assert max(abs(a - b) for a, b in zip(lib, base)) < 1e-12, (c["label"], n, d)
            on = cl and pm < P5J40[0] and jh < P5J40[1]
            p5 = U.interval(plan, f, labels, FLOOR if on else None)
            assert max(abs(a - b) for a, b in zip(p5, interval(plan, f, labels, pset, on, None))) < 1e-12
            ivs = {"t10": base, "p5j40": p5}
            fired["p5j40"] += on
            sec = [labels[i] for i in plan["cells"][0] if i in labels and i not in pset] if cl else []
            if cl and len(sec) >= 2:
                ivs["v2"] = interval(plan, f, labels, pset, on, "v2")
                fired["v2"] += ivs["v2"] != p5
                prim = [labels[i] for i in plan["cells"][0] if i in pset]
                pp = (sum(prim) + 0.5) / (len(prim) + 1)
                pv = upper_tail(len(sec), pp, sum(sec))
                for nm, a in TESTS.items():
                    if pv < a or a >= 1.0:
                        ivs[nm] = interval(plan, f, labels, pset, on, "tp")
                        fired[nm] += 1
                    else:
                        ivs[nm] = p5
            else:
                for nm in ("v2",) + tuple(TESTS):
                    ivs[nm] = p5
            for nm in CANDS:
                _, lo, hi = ivs[nm]
                res[nm].append(((hi - lo) / 2, lo <= truth <= hi, cl, False))
        except ValueError:  # a cell with fewer than two labels; counted and reported, never silently dropped
            _, lo, hi = A.audit_interval({"design": "pooled", "cells": [list(range(N))]}, f, labels)
            for nm in CANDS:
                res[nm].append(((hi - lo) / 2, lo <= truth <= hi, cl, True))
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
           f"{sum(by[(*k, nm)]['err'] for k in keys for nm in CANDS)}"]
    z_old = Y.parse(HERE / "h7az_joint_trigger_draws.txt")
    b_old = Y.parse(HERE / "h7ba_floor_naija_draws.txt")
    ms = ("cov", "ratio", "adm", "admc", "fired")
    sz = [k for k in go if all(by[(*k, r)][m] == z_old[(*k, r)][m] for r in ("pooled", "t10", "p5j40") for m in ms)]
    sb = [k for k in na if all(by[(*k, r)][m] == b_old[(*k, r)][m] for r in ("pooled", "t10", "p5j40") for m in ms)]
    out.append(f"P0 pooled, t10 and p5j40 replay 7az in {len(sz)} of {len(go)} and 7ba in {len(sb)} of {len(na)}: "
               f"{'yes' if len(sz) == len(go) and len(sb) == len(na) else 'no'}")

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
                   f"{sum(by[(*k, nm)]['fired'] for k in keys)} of {adm_all} admitted draws "
                   f"({sum(by[(*k, nm)]['fired'] for k in good)} in good cells); weak admitted coverage {wc:.1f}% of {wa}; "
                   f"admitted >= 30 under 88%: {adm_low(nm)}; under 93% where p5j40 is not: {p3_fail(nm)}")
    out.append("admitted coverage in the many-miss cells: " + "; ".join(
        f"{k[0]} n {k[1]} ({by[(*k, 'p5j40')]['adm']}): " + ", ".join(
            f"{nm} {admcov(nm, k):.1f} r {by[(*k, nm)]['ratio']:.3f} f {by[(*k, nm)]['fired']}" for nm in CANDS[1:])
        for k in MANY if (*k, "p5j40") in by))
    for nm in ("v2", "tp10", "tp25", "tp1"):
        p1 = sum(admcov(nm, k) >= 88.0 for k in MANY if (*k, nm) in by)
        out.append(f"P1 {nm} lifts {p1} of the {len(MANY)} many-miss cells to 88%+ admitted"
                   + (f": {'yes' if p1 >= 4 else 'no'} (tp10 needs 4)" if nm == "tp10" else ""))
    g0, n0 = gain("p5j40", go), gain("p5j40", na)
    out.append("P2 share of p5j40's GoEmotions gain kept: " + ", ".join(
        f"{nm} {gain(nm, go) / g0:.3f}" for nm in ("v2", "tp10", "tp25", "tp1")))
    out.append("P3 no cell under 93% where p5j40 covers: " + ", ".join(
        f"{nm} {'yes' if not p3_fail(nm) else 'no'}" for nm in ("v2", "tp10", "tp25", "tp1")))
    nweak = [k for k in na if k in weak]
    p0w = pooled_adm("p5j40", nweak)[0]

    def p4(nm):
        return gain(nm, na) >= 0.9 * n0 and pooled_adm(nm, nweak)[0] >= p0w

    out.append(f"P4 NaijaSenti: 90%+ of p5j40's gain ({n0:.3f}) and weak admitted coverage at least {p0w:.1f}%: " + ", ".join(
        f"{nm} {gain(nm, na):.3f} / {pooled_adm(nm, nweak)[0]:.1f}% {'yes' if p4(nm) else 'no'}"
        for nm in ("v2", "tp10", "tp25", "tp1")))
    p0wc, p0bad = pooled_adm("p5j40", weak)[0], len(adm_low("p5j40"))

    def checks(nm):
        return dict(a=not p3_fail(nm), b=pooled_adm(nm, weak)[0] >= p0wc, c=len(adm_low(nm)) < p0bad,
                    d=gain(nm, go) >= 0.9 * g0, e=p4(nm))

    for nm in ("v2", "tp10", "tp25"):
        out.append(f"decision checks {nm}: " + ", ".join(f"({x}) {'yes' if v else 'no'}" for x, v in checks(nm).items()))
    ok = [nm for nm in ("v2", "tp10", "tp25") if all(checks(nm).values())]
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
