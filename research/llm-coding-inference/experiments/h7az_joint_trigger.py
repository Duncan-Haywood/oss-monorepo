"""Milestone 7az: does a coder-negative floor that fires only when the pilot holds few coder misses AND its J_hat is
low spare the good coders that paid for 7ay's count trigger, while keeping its repair of the weak-coder cells? (7ay's
next step (1).)

Why. 7ay's p5n2 (plus-two floor in the coder-negative cell when the pilot holds fewer than 5 coder misses) lifted all
four reachable failing cells to 96.6 to 100% admitted coverage but kept only 78.8% of the shipped rule's (t10's) gain,
and 62% of what it cost (1.04 of 1.68) fell on good coders (true J >= 0.40), whose pilots often hold 3 or 4 misses
because they rarely miss. A good coder's pilot J_hat should sit near its true J (0.40 to 0.78 here), while 7at's post
hoc replay (`h7at_posthoc.txt`) puts the missed draws' mean pilot J_hat in the four reachable cells at 0.406 to 0.483
(true J 0.13 to 0.26). So a J_hat ceiling on the trigger can spare a share of good-coder draws; it cannot separate a
weak coder's lucky pilot (J_hat 0.45) from a moderate coder's typical one (J 0.46). This is said before the run.

Candidates (each changes only the coder-negative cell's variance in a cells plan; plan and labels are t10's, common
random numbers, `h7au_neg_floor.interval`; the floor is 7au's n2, plus-two pseudo-counts in that cell):
  t10     shipped, no floor (replays 7ay).
  p5n2    7ay's trigger: pilot coder misses < 5 (replays 7ay).
  p5j40   pilot coder misses < 5 and pilot J_hat < 0.40.
  p5j50   pilot coder misses < 5 and pilot J_hat < 0.50.
  p5j60   pilot coder misses < 5 and pilot J_hat < 0.60.
J_hat is the pilot's sensitivity + specificity - 1 (`h7at_weak_admit.j_lower(..., z=0)`, the statistic the shipped
admission test reads). The three ceilings are fixed now from 7at's 0.406 to 0.483 above; no other value is run.

Cells. Old: 7ay's 114, same seeds and scheme, so t10 and p5n2 replay 7ay. Fresh: the lr coder at two audit sizes never
run in this line, n 750 and n 1,500, on eight categories chosen before any draw: caring, annoyance, realization,
disgust (7ay's reachable cells), approval, disapproval (unreachable or partly reachable), gratitude and love (good
coders: the cost test). 16 cells. Disclosed: the categories and their true J at other n are known from 7ay's draws
(gratitude J 0.747; love's J was not looked up before this commit); what is new is the audit size, so the draws are
fresh but the coders are not. The 1.5B neutral codes (`gollm_neutral_...tsv`) were considered and dropped before any
draw: they cover 6,682 of the 9,547 test items. 1,000 draws per cell (+/- 1.4 points).

Measures per (cell, rule), as 7ay: coverage; ratio of mean half-width to pooled; admitted draws and their coverage;
draws where the floor fired. "Weak": true J < 0.30; "good": J >= 0.40.

    python3 experiments/h7az_joint_trigger.py draws [reps]   # -> h7az_joint_trigger_draws.txt
    python3 experiments/h7az_joint_trigger.py summary        # predictions and decision rule -> h7az_joint_trigger.txt
    python3 experiments/h7az_joint_trigger.py smoke [reps]   # first cell only, printed

Prediction (written and committed before any draw; a 10-draw smoke test of one cell may run first and is disclosed):
  P0  (replication) pooled, t10 and p5n2 equal 7ay's (coverage, ratio, admitted draws, fired) in all 114 old cells.
  P1  (repair kept) p5j50 lifts 3 or more of the four reachable cells (lr caring n 1,000, lr annoyance n 500, lr
      realization n 1,000, lr disgust n 1,000) to 88%+ admitted coverage. Guess: p5j60 all 4, p5j50 3, p5j40 1 or 2
      (half the missed draws have J_hat above 0.40 if the 7at means are typical).
  P2  (cost spared) good-coder gain kept against t10 over the 130 cells: p5j40 97%+, p5j50 92%+, p5j60 88%+ (p5n2 kept
      83.2% in 7ay); total gain kept p5j40 95%+, p5j50 88 to 95%, p5j60 84 to 92%.
  P3  (do no harm, as corrected in 7ay's disclosure) no cell where t10 covers 93%+ falls under 93% under a candidate.
  P4  (fresh) on the 16 fresh cells, each candidate's admitted coverage pooled over the fresh weak cells is at least
      t10's, and it loses at most 0.05 of t10's fresh gain.
  Decision rule, fixed now: a candidate qualifies if (a) P3, (b) its weak-cell admitted coverage over all cells is at
  least t10's, (c) fewer cells with 30+ admitted draws under 88% than t10, (d) 90%+ of t10's total gain over the 130
  cells, (e) loses at most 0.05 of t10's gain on the 16 fresh cells. Of those that qualify the one with the largest
  total gain becomes the library default (`audit_interval` gains the floor for cells plans, every earlier script
  pinned so it replays). If none qualifies, the default stays t10 and the paper's limitation 6 adds that no pilot
  statistic tried (J_hat, its lower bound, the miss count, or both together) repairs the conditional undercoverage at
  90% of the gain.
"""
import random
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))
from llmci import audit_design as A  # noqa: E402
A.RARE_FALLBACK = None  # pinned, as 7ay: the pooled reference must replay it
import h7au_neg_floor as U  # noqa: E402
import h7ay_cond_floor as Y  # noqa: E402
import h7at_weak_admit as W  # noqa: E402

FRESH = ("caring", "annoyance", "realization", "disgust", "approval", "disapproval", "gratitude", "love")
FRESH_NS = (750, 1500)
SHARE = U.SHARE
FLOOR = ("neg", "pseudo", 2)
# name -> None (no floor) or (miss bound, J_hat ceiling or None)
CANDS = {"t10": None, "p5n2": (5, None), "p5j40": (5, 0.40), "p5j50": (5, 0.50), "p5j60": (5, 0.60)}
RULES = ["pooled"] + list(CANDS)
JOINT = ["p5j40", "p5j50", "p5j60"]
REACH = Y.REACH
WEAK_J, GOOD_J = U.WEAK_J, U.GOOD_J
OUT = HERE / "h7az_joint_trigger_draws.txt"
SUMMARY = HERE / "h7az_joint_trigger.txt"
HEAD = Y.HEAD


def fresh_cells():
    import group_shift_reddit as R
    import h6r_rare_pilot as P
    import h7ah_tau as H
    for cat in FRESH:
        rows = P.load(cat)
        rng = random.Random(R.SPLIT_SEED); order = list(range(len(rows))); rng.shuffle(order)
        cut = int(R.TRAIN_SHARE * len(rows))
        train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
        h, f = [t[2] for t in test], P.coder(train, test)
        for n in FRESH_NS:
            yield dict(part="goemo", label=f"lr {cat}", n=n, h=h, f=f, J=A.informedness(h, f), seed=H.GO_SEED,
                       prev=sum(h) / len(h), fresh=True)


def cells():
    for c in Y.cells():
        yield dict(c, fresh=False)
    yield from fresh_cells()


def run(c, reps):
    """`h7ay_cond_floor.run`'s scheme and seeds, line for line; the candidates reuse t10's plan and labels."""
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
            assert jh >= 0.10, (c["label"], n, d, jh)  # the shipped admission test, recomputed
        try:
            lib = A.audit_interval(plan, f, labels)
            mine = U.interval(plan, f, labels, None)
            assert max(abs(a - b) for a, b in zip(lib, mine)) < 1e-12, (c["label"], n, d, lib, mine)
            for nm, trig in CANDS.items():
                on = trig is not None and cl and pm < trig[0] and (trig[1] is None or jh < trig[1])
                fired[nm] += on
                _, lo, hi = U.interval(plan, f, labels, FLOOR if on else None)
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
        lines.append(f"{c['label']} | {c['n']} | {c['J']:.3f} | {name} | {int(c['fresh'])} | "
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
    old = Y.parse(HERE / "h7ay_cond_floor_draws.txt")
    keys = list(dict.fromkeys((k[0], k[1]) for k in by))
    fr = [k for k in keys if by[(*k, "pooled")]["fresh"]]
    olds = [k for k in keys if k not in fr]
    weak = [k for k in keys if by[(*k, "pooled")]["J"] < WEAK_J]
    good = [k for k in keys if by[(*k, "pooled")]["J"] >= GOOD_J]
    fweak = [k for k in fr if k in weak]
    names = list(CANDS)
    out = [f"cells run: {len(keys)} ({len(olds)} old, {len(fr)} fresh; {len(weak)} weak J < {WEAK_J}, {len(good)} good "
           f"J >= {GOOD_J}); errors (cell with < 2 labels): {sum(by[(*k, nm)]['err'] for k in keys for nm in names)}"]
    same = [k for k in olds if all(by[(*k, r)][m] == old[(*k, r)][m] for r in ("pooled", "t10", "p5n2")
                                   for m in ("cov", "ratio", "adm", "admc", "fired"))]
    out.append(f"P0 pooled, t10 and p5n2 replay 7ay in {len(same)} of {len(olds)} old cells: "
               f"{'yes' if len(same) == len(olds) else 'no'} (library check asserted on every draw)")
    for k in fr:
        b = by[(*k, "t10")]
        out.append(f"fresh {k[0]} n {k[1]} (J {b['J']:.3f}, pooled cov {by[(*k, 'pooled')]['cov']:.1f}, cells in "
                   f"{b['adm']}, t10 admitted cov {100 * b['admc'] / b['adm'] if b['adm'] else float('nan'):.1f}): "
                   + ", ".join(f"{nm} {by[(*k, nm)]['ratio']:.3f} cov {by[(*k, nm)]['cov']:.1f} adm "
                               f"{100 * by[(*k, nm)]['admc'] / by[(*k, nm)]['adm'] if by[(*k, nm)]['adm'] else float('nan'):.1f}"
                               f" fired {by[(*k, nm)]['fired']}" for nm in names))

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
                if by[(*k, nm)]["cov"] < 93.0 and by[(*k, "t10")]["cov"] >= 93.0]

    adm_all = sum(by[(*k, "t10")]["adm"] for k in keys)
    for nm in names:
        wc, wa = pooled_adm(nm, weak)
        fd = sum(by[(*k, nm)]["fired"] for k in keys)
        fg = sum(by[(*k, nm)]["fired"] for k in good)
        out.append(f"{nm}: gain all {gain(nm):.3f} (fresh {gain(nm, fr):.3f}, weak {gain(nm, weak):.3f}, good "
                   f"{gain(nm, good):.3f}); floor fired in {fd} of {adm_all} admitted draws ({fg} in good cells); "
                   f"weak-cell admitted coverage {wc:.1f}% of {wa}; fresh weak {pooled_adm(nm, fweak)[0]:.1f}%; "
                   f"admitted >= 30 under 88%: {adm_low(nm)}; under 93% where t10 is not: {p3_fail(nm)}")
    bad = sorted(set(k for k, _, _ in adm_low("t10")) | set(REACH), key=keys.index)
    out.append("admitted coverage in t10's failing cells: " + "; ".join(
        f"{k[0]} n {k[1]} ({by[(*k, 't10')]['adm']}): " + ", ".join(f"{nm} {admcov(nm, k):.1f}" for nm in names)
        for k in bad))
    for nm in JOINT:
        p1 = sum(admcov(nm, k) >= 88.0 for k in REACH)
        out.append(f"P1 {nm} admitted coverage 88%+ in {p1} of the 4 reachable cells"
                   + (f": {'yes' if p1 >= 3 else 'no'} (decisive for p5j50)" if nm == "p5j50" else ""))
    g0, f0, gg = gain("t10"), gain("t10", fr), gain("t10", good)
    bars = {"p5j40": (0.97, 0.95), "p5j50": (0.92, 0.88), "p5j60": (0.88, 0.84)}
    out.append("P2 share of t10's gain kept (good / all; predicted good bar, all bar): " + ", ".join(
        f"{nm} {gain(nm, good) / gg:.3f} / {gain(nm) / g0:.3f}"
        + (f" ({bars[nm][0]}, {bars[nm][1]}: {'yes' if gain(nm, good) / gg >= bars[nm][0] and gain(nm) / g0 >= bars[nm][1] else 'no'})"
           if nm in bars else "") for nm in names[1:]))
    out.append("P3 no cell under 93% where t10 covers: " + ", ".join(
        f"{nm} {'yes' if not p3_fail(nm) else 'no'}" for nm in names[1:]))
    t10_fw = pooled_adm("t10", fweak)[0]
    out.append(f"P4 fresh weak admitted coverage at least t10's ({t10_fw:.1f}%) and fresh loss <= 0.05 (t10 fresh gain "
               f"{f0:.3f}): " + ", ".join(
                   f"{nm} {pooled_adm(nm, fweak)[0]:.1f}% / {f0 - gain(nm, fr):.3f} "
                   f"{'yes' if pooled_adm(nm, fweak)[0] >= t10_fw and gain(nm, fr) >= f0 - 0.05 else 'no'}"
                   for nm in names[1:]))
    t10_wc, t10_bad = pooled_adm("t10", weak)[0], len(adm_low("t10"))

    def checks(nm):
        return dict(a=not p3_fail(nm), b=pooled_adm(nm, weak)[0] >= t10_wc, c=len(adm_low(nm)) < t10_bad,
                    d=gain(nm) >= 0.9 * g0, e=gain(nm, fr) >= f0 - 0.05)

    for nm in ["p5n2"] + JOINT:
        out.append(f"decision checks {nm}: " + ", ".join(f"({x}) {'yes' if v else 'no'}" for x, v in checks(nm).items()))
    ok = [nm for nm in JOINT if all(checks(nm).values())]
    if ok:
        best = max(ok, key=gain)
        out.append(f"Decision rule: qualifying {ok}; the library default becomes {best}")
    else:
        out.append("Decision rule: none qualifies; the default stays t10 (no coder-negative floor)")
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
