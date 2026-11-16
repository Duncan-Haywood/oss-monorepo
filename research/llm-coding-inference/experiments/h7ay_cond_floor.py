"""Milestone 7ay: does a coder-negative variance floor that bites only when the evidence is thin (few coder misses)
keep most of the shipped rule's width gain while repairing its weak-coder conditional undercoverage? (7au's next
step (1); 7aw's next step (2), "the rare-count question for the cells interval".)

Why. 7au floored the coder-negative cell's variance in every cells plan: the floors repaired 6 of 8 failing cells but
kept only 37% (n2) or less of the shipped rule's gain, because the floor is paid by every admitted draw while the
undercoverage lives in the draws whose pilot under-saw the coder's misses. 7at's post hoc replay
(`h7at_posthoc.txt`) gives the missed draws' mean pilot coder misses: 3.75 (lr caring n 1,000), 3.00 (lr annoyance
n 500), 3.71 (lr realization), 3.64 (lr disgust), against 6.8 to 7.3 in the draws that covered; but 7.33 (1.5B
disapproval n 1,000), 11.46 (lr approval n 1,000) and 21.7 (lr annoyance n 2,000) in the other three. The 3-miss guard
already forces 3 or more pilot misses in every cells plan. So a floor conditioned on the miss count can reach the
first group and, by construction, not the second: this is said before the run.

Candidates (each changes only the coder-negative cell's variance in a cells plan; plan and labels are the shipped
rule's (t10: pilot 0.7 n, budget cap, tau 0.1, 3-miss guard), common random numbers, `h7au_neg_floor.interval`):
  t10    shipped, no floor (replays 7au).
  n2     7au's unconditional plus-four floor in that cell (replays 7au; the reference for what a floor can repair).
  p5n2   n2's floor only when the pilot holds fewer than 5 coder misses (human 1, coder 0), i.e. 3 or 4.
  p5n4   the same trigger, 4 pseudo-counts per side.
  p8n2   n2's floor only when the pilot holds fewer than 8 coder misses.
  a8n2   n2's floor only when the coder-negative cell's audited labels (pilot plus top-up) hold fewer than 8 positives.
m = 5 and 8 are chosen from the 7at miss counts quoted above (5 sits above the 3.0 to 3.75 of the first group's missed
draws; 8 sits above their covering draws' 6.8 to 7.3 too, for more margin); no other value is run.

Cells. Old: 7au's 105, same seeds and scheme (`h7au_neg_floor.cells`, `run`'s scheme), so t10 and n2 replay 7au.
Fresh: the lr coder on three GoEmotions categories it has never been run on in this line (admiration, gratitude,
neutral), n 500 / 1,000 / 2,000; 9 cells. Disclosed: before this was committed a loading check printed their corpus
positive counts (admiration 786, gratitude 516, neutral 2,240 of 9,547; also pride 18, relief 31, grief 11, left out
as too rare for a cells plan); no coder statistic or draw was seen. Admiration and gratitude are in the old cells with
the 1.5B coder (a different coder, so a new cell). 1,000 draws per cell (+/- 1.4 points).

Measures per (cell, rule), as 7au: coverage; ratio of mean half-width to pooled; admitted draws and their coverage;
plus, per candidate, the draws where its floor fired. "Weak": true J < 0.30; "good": J >= 0.40.

    python3 experiments/h7ay_cond_floor.py draws [reps]   # -> h7ay_cond_floor_draws.txt
    python3 experiments/h7ay_cond_floor.py summary        # predictions and decision rule -> h7ay_cond_floor.txt
    python3 experiments/h7ay_cond_floor.py smoke [reps]   # first cell only, printed

Prediction (written and committed before any draw; a 10-draw smoke test of one cell may run first and is disclosed):
  P0  (replication) t10 and n2 equal 7au's (coverage, ratio, admitted draws) in all 105 old cells.
  P1  (repair where it can reach) in the four 7au failing cells whose missed draws averaged under 4 pilot misses (lr
      caring n 1,000, lr annoyance n 500, lr realization n 1,000, lr disgust n 1,000), p5n2's admitted coverage is
      88% or more in at least 3 of the 4. Guess: all 4, close to n2's 96.6 to 100%.
  P2  (cannot reach, said in advance) 1.5B disapproval n 1,000 and lr approval n 1,000 stay under 88% under every
      conditional candidate, so 7au's P2 (at most 1 such cell) fails for all of them.
  P3  (do no harm) every candidate covers 93% or more wherever pooled does (t10 fails this at 1.5B anger n 2,000).
  P4  (cost) gain kept against t10 over all 114 cells: p5n2 85 to 97%, p5n4 75 to 95%, p8n2 60 to 85%, a8n2 50 to 85%
      (n2 kept 37% in 7au). Good coders (J >= 0.40) keep 90% or more under p5n2.
  P5  weak-cell admitted coverage (pooled over weak cells) 95% or more under every candidate (t10 94.7% in 7au).
  Decision rule, fixed now. 7au's bar (P2's at most one failing cell) cannot be met by any count trigger (P2 above), so
  this run asks a narrower, stated question: is a candidate a strict improvement on the shipped interval? A candidate
  qualifies if (a) it meets P3, (b) its weak-cell admitted coverage is at least t10's, (c) it has fewer cells with 30+
  admitted draws under 88% than t10, (d) it keeps 90% or more of t10's total gain over all 114 cells, and (e) it loses
  no more than 0.05 of t10's gain on the 9 fresh cells. Of those that qualify the one with the largest total gain
  becomes the library default (`audit_interval` gains a `neg_floor` option for cells plans; every earlier script
  pinned so it replays) and the paper states the cells it still does not repair. If none qualifies the default stays
  t10, and the paper says the conditional undercoverage has no cheap fix on either side of the interval.
"""
import random
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))
from llmci import audit_design as A  # noqa: E402
A.RARE_FALLBACK = None  # pinned, as 7au: a cells plan never uses it, and the pooled reference must replay 7au
A.NEG_FLOOR = None  # pinned (LOG.md 7az): replays as committed
import h7au_neg_floor as U  # noqa: E402

FRESH = ("admiration", "gratitude", "neutral")  # chosen before any draw
NS = (500, 1000, 2000)
SHARE = U.SHARE
# name -> (floor as in h7au, trigger): trigger None = always; ("pilot", m) pilot coder misses < m; ("audit", m) the
# coder-negative cell's audited positives < m
CANDS = {"t10": (None, None), "n2": (U.FLOORS["n2"], None),
         "p5n2": (("neg", "pseudo", 2), ("pilot", 5)), "p5n4": (("neg", "pseudo", 4), ("pilot", 5)),
         "p8n2": (("neg", "pseudo", 2), ("pilot", 8)), "a8n2": (("neg", "pseudo", 2), ("audit", 8))}
RULES = ["pooled"] + list(CANDS)
COND = ["p5n2", "p5n4", "p8n2", "a8n2"]
REACH = (("lr caring", 1000), ("lr annoyance", 500), ("lr realization", 1000), ("lr disgust", 1000))
UNREACH = (("1.5B disapproval", 1000), ("lr approval", 1000))
WEAK_J, GOOD_J = U.WEAK_J, U.GOOD_J
OUT = HERE / "h7ay_cond_floor_draws.txt"
SUMMARY = HERE / "h7ay_cond_floor.txt"
HEAD = U.HEAD + " | floor fired"


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
        for n in NS:
            yield dict(part="goemo", label=f"lr {cat}", n=n, h=h, f=f, J=A.informedness(h, f), seed=H.GO_SEED,
                       prev=sum(h) / len(h), fresh=True)


def cells():
    for c in U.cells():
        yield dict(c, fresh=False)
    yield from fresh_cells()


def fires(trig, pilot_misses, audit_pos):
    if trig is None:
        return True
    return (pilot_misses if trig[0] == "pilot" else audit_pos) < trig[1]


def run(c, reps):
    """`h7au_neg_floor.run`'s scheme and seeds, line for line; the candidates reuse t10's plan and labels."""
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
        ap = sum(labels[i] for i in plan["cells"][0] if i in labels) if cl else None
        if cl:
            assert pm >= A.NEG_GUARD and all(f[i] == 0 for i in plan["cells"][0]), (c["label"], n, d)
        try:
            lib = A.audit_interval(plan, f, labels)
            mine = U.interval(plan, f, labels, None)
            assert max(abs(a - b) for a, b in zip(lib, mine)) < 1e-12, (c["label"], n, d, lib, mine)
            for nm, (fl, trig) in CANDS.items():
                on = fl is not None and cl and fires(trig, pm, ap)
                fired[nm] += on
                _, lo, hi = U.interval(plan, f, labels, fl if on else None)
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


def parse(path):
    by = {}
    for line in path.read_text().splitlines()[1:]:
        x = [s.strip() for s in line.split("|")]
        by[(x[0], int(x[1]), x[3])] = dict(J=float(x[2]), fresh=x[4] == "1", cov=float(x[5]), ratio=float(x[7]),
                                            adm=int(x[8]), admc=int(x[9]), err=int(x[10]),
                                            fired=int(x[11]) if len(x) > 11 else 0)
    return by


def summary():
    by = parse(OUT)
    old = U.parse(HERE / "h7au_neg_floor_draws.txt")
    keys = list(dict.fromkeys((k[0], k[1]) for k in by))
    fr = [k for k in keys if by[(*k, "pooled")]["fresh"]]
    olds = [k for k in keys if k not in fr]
    weak = [k for k in keys if by[(*k, "pooled")]["J"] < WEAK_J]
    good = [k for k in keys if by[(*k, "pooled")]["J"] >= GOOD_J]
    names = list(CANDS)
    out = [f"cells run: {len(keys)} ({len(olds)} old, {len(fr)} fresh; {len(weak)} weak J < {WEAK_J}, {len(good)} good "
           f"J >= {GOOD_J}); errors (cell with < 2 labels): {sum(by[(*k, nm)]['err'] for k in keys for nm in names)}"]
    same = [k for k in olds if all(by[(*k, r)][m] == old[(*k, r)][m] for r in ("pooled", "t10", "n2")
                                   for m in ("cov", "ratio", "adm", "admc"))]
    out.append(f"P0 pooled, t10 and n2 replay 7au in {len(same)} of {len(olds)} old cells: "
               f"{'yes' if len(same) == len(olds) else 'no'} (library check asserted on every draw)")
    for k in fr:
        out.append(f"fresh {k[0]} n {k[1]} (J {by[(*k, 'pooled')]['J']:.3f}, pooled cov {by[(*k, 'pooled')]['cov']:.1f}"
                   f", cells in {by[(*k, 't10')]['adm'] / 10:.0f}%): " + ", ".join(
                       f"{nm} {by[(*k, nm)]['ratio']:.3f} cov {by[(*k, nm)]['cov']:.1f}" for nm in names))

    def gain(nm, ks=keys):
        return sum(1 - by[(*k, nm)]["ratio"] for k in ks)

    def admcov(nm, k):
        b = by[(*k, nm)]
        return 100 * b["admc"] / b["adm"] if b["adm"] else float("nan")

    def adm_low(nm):
        return [(k, by[(*k, nm)]["adm"], round(admcov(nm, k), 1)) for k in keys
                if by[(*k, nm)]["adm"] >= 30 and by[(*k, nm)]["admc"] < 0.88 * by[(*k, nm)]["adm"]]

    def weak_cond(nm):
        a = sum(by[(*k, nm)]["adm"] for k in weak)
        return (100 * sum(by[(*k, nm)]["admc"] for k in weak) / a if a else float("nan")), a

    def p3_fail(nm):
        return [(k, by[(*k, nm)]["cov"]) for k in keys
                if by[(*k, nm)]["cov"] < 93.0 and by[(*k, "pooled")]["cov"] >= 93.0]

    adm_all = sum(by[(*k, "t10")]["adm"] for k in keys)
    for nm in names:
        wc, wa = weak_cond(nm)
        fd = sum(by[(*k, nm)]["fired"] for k in keys)
        out.append(f"{nm}: gain all {gain(nm):.3f} (fresh {gain(nm, fr):.3f}, weak {gain(nm, weak):.3f}, good "
                   f"{gain(nm, good):.3f}); floor fired in {fd} of {adm_all} admitted draws; weak-cell admitted "
                   f"coverage {wc:.1f}% of {wa}; admitted >= 30 under 88%: {adm_low(nm)}; under 93% where pooled is "
                   f"not: {p3_fail(nm)}; max ratio {max(by[(*k, nm)]['ratio'] for k in keys):.3f}")
    bad = sorted(set(k for k, _, _ in adm_low("t10")) | set(REACH) | set(UNREACH), key=keys.index)
    out.append("admitted coverage in t10's failing cells: " + "; ".join(
        f"{k[0]} n {k[1]} ({by[(*k, 't10')]['adm']}): " + ", ".join(f"{nm} {admcov(nm, k):.1f}" for nm in names)
        for k in bad))
    p1 = sum(admcov("p5n2", k) >= 88.0 for k in REACH)
    out.append(f"P1 p5n2 admitted coverage 88%+ in {p1} of the 4 reachable cells: {'yes' if p1 >= 3 else 'no'}")
    p2 = all(admcov(nm, k) < 88.0 for nm in COND for k in UNREACH)
    out.append(f"P2 both unreachable cells under 88% under every conditional candidate: {'yes' if p2 else 'no'}")
    out.append("P3 no cell under 93% where pooled covers: " + ", ".join(
        f"{nm} {'yes' if not p3_fail(nm) else 'no'}" for nm in names))
    g0, f0, gg = gain("t10"), gain("t10", fr), gain("t10", good)
    out.append("P4 share of t10's gain kept (all / fresh / good): " + ", ".join(
        f"{nm} {gain(nm) / g0:.3f} / {gain(nm, fr) / f0 if f0 else float('nan'):.3f} / {gain(nm, good) / gg:.3f}"
        for nm in names[1:]))
    out.append("P5 weak admitted coverage 95%+: " + ", ".join(
        f"{nm} {'yes' if weak_cond(nm)[0] >= 95.0 else 'no'}" for nm in COND))
    t10_wc, t10_bad = weak_cond("t10")[0], len(adm_low("t10"))

    def checks(nm):
        return dict(a=not p3_fail(nm), b=weak_cond(nm)[0] >= t10_wc, c=len(adm_low(nm)) < t10_bad,
                    d=gain(nm) >= 0.9 * g0, e=gain(nm, fr) >= f0 - 0.05)

    for nm in COND + ["n2"]:
        out.append(f"decision checks {nm}: " + ", ".join(f"({x}) {'yes' if v else 'no'}" for x, v in checks(nm).items()))
    ok = [nm for nm in COND if all(checks(nm).values())]
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
