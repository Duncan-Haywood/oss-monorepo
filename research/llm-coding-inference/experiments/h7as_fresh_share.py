"""Milestone 7as: does 7ar's new default (`PILOT_SHARE` 0.7 with `budget_cap` on) hold on cells never used to pick a
rule, and does a still larger pilot, up to the whole audit (post-stratifying a simple random sample on the coder's label),
do better? (7ar's next steps (1) and (2).)

Why. 7ar changed the library's suggested pilot share from 0.3 to 0.7 and turned on `plan_audit`'s budget cap, on the
same 51 cells (39 GoEmotions, 12 NaijaSenti) every rule since 7ao was chosen on, and the cap was not pre-registered. Its
gain kept rising with the share (0.5: 4.417, 0.6: 4.879, 0.7: 5.140, all capped), so the trend says a pilot of the
whole audit may do best. At share 1.0 the design reduces to: hand-code a simple random sample of n, then, if the 3-miss
guard and the width forecast pass on it, post-stratify it on the coder's label (the same labels, a different estimator);
otherwise report the pooled interval.

Design.
  Fresh cells (decide part A): 6 GoEmotions categories never used in the pilot-design line (7y to 7ar), chosen before
    any draw or coder statistic: approval, caring, optimism, surprise, excitement, annoyance. Same coder, split and seed
    as 7ao's fresh cells (`h7ao_two_phase.fresh_cells`): the word-presence NB coder of `h6r_rare_pilot`, trained on the
    30% train split, n 500 / 1,000 / 2,000; 18 cells. Disclosed: these categories appear in `floor_rule_heldout.py`
    (the floor rule's held-out set, a different estimator and question); nothing from that run was read for this one.
  Old cells (part B): 7ar's 51 cells, same seeds.
  One scheme for every cell: per draw one random ordering prefix of n items (seed + 13 stream), a simple random sample
    of n. The share-s pilot is its first round(s n) items (nested across shares). A pooled plan labels the whole prefix
    (common random numbers with the pooled reference, 7aq's argument). A cells plan labels the pilot plus `plan_audit`'s
    capped top-ups, drawn from the cells' unpiloted items with a per-draw stream (seed + 7 d). At share 1.0 there are no
    top-ups: cells and pooled see the same n labels.
  Rules (all `plan_audit` defaults of this commit: tau 0.1, neg_guard 3, width_margin 0, budget_cap True): pooled;
    s30, s50, s70, s80, s90, s100 (the shipped rule at that share). 1,000 draws per cell (+/- 1.4 points).
  Gains are sums of (1 - ratio to pooled). Coverage is also split by whether the deciding pilot passed the 3-miss guard.
  No library code changed before the run.

    python3 experiments/h7as_fresh_share.py draws [reps]   # -> h7as_fresh_share_draws.txt
    python3 experiments/h7as_fresh_share.py summary        # predictions and decision rule -> h7as_fresh_share.txt

Prediction (written and committed before any draw; a smoke test of one cell at 10 draws, to check the script, may run
first and is disclosed in LOG.md):
  P1  (fresh, the confirmation) on the 18 fresh cells, s70 covers 93% or more in every cell, and its gain is at least
      s50's and at least 0.05 above s30's.
  P2  every rule covers 93% or more in all 69 cells.
  P3  the gain rises with the share on the 69 cells: s30 < s50 < s70 < s80 < s90 < s100. Guess for s100 over s70:
      +0.3 to +0.9 on the 51 old cells (7ar's +0.26 per 0.1 step, slowing).
  P4  the same order holds on the 18 fresh cells alone, s100 > s70.
  P5  (observation) guard-pass conditional coverage: at most 2 cells per rule with 50 or more guard-pass cells draws and
      coverage under 88%.
  P6  (observation) at s100 no cell is wider than 1.010 times pooled (the forecast should refuse post-stratification
      that does not pay, and both use the same labels).
  Decision rule, fixed now.
    A (keep 0.7?): if s70 covers 93% or more in all 18 fresh cells and its fresh gain is no more than 0.02 below s50's,
      `PILOT_SHARE` stays 0.7. Otherwise it changes to whichever of 0.5 and 0.3 covers on the fresh cells with the larger
      fresh gain (0.3 if neither does), and part B does not apply.
    B (go higher?): let s* be the largest share in {0.8, 0.9, 1.0} reached stepwise, each step counting only if that
      rule covers 93% or more in all 69 cells and its total gain over the 69 cells is at least 0.05 above the previous
      share's (0.8 against s70, 0.9 against s80, 1.0 against s90), and its fresh gain is no lower than s70's. If s*
      exists, `PILOT_SHARE` changes to s* and the docstring says what it means at that share; every earlier script
      already pins its share, so none needs a change.
"""
import random
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))
from llmci import audit_design as A  # noqa: E402
A.RARE_FALLBACK = None  # pinned: replays as committed (LOG.md 7aw)
A.NEG_FLOOR = None  # pinned (LOG.md 7az): replays as committed
import h7ao_two_phase as T  # noqa: E402

FRESH = ("approval", "caring", "optimism", "surprise", "excitement", "annoyance")  # chosen before any draw (docstring)
NS = (500, 1000, 2000)
SHARES = {"s30": 0.3, "s50": 0.5, "s70": 0.7, "s80": 0.8, "s90": 0.9, "s100": 1.0}
RULES = ["pooled"] + list(SHARES)
OUT = HERE / "h7as_fresh_share_draws.txt"
HEAD = ("cell | n | J | rule | observed cells % | fresh | coverage % | half-width pts | ratio to pooled | "
        "guard-pass cells draws | coverage there % | guard-fail cells draws | coverage there % | errors")


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
    for c in T.cells():
        yield dict(c, fresh=False)
    yield from fresh_cells()


def run(c, reps):
    h, f, n = c["h"], c["f"], c["n"]
    N, truth = len(h), sum(h) / len(h)
    rr = random.Random(c["seed"] + 13)
    srs = [rr.sample(range(N), n) for _ in range(reps)]
    res = {}
    for name in RULES:
        out = []
        pooled = name == "pooled"
        k = n if pooled else round(SHARES[name] * n)
        for d in range(reps):
            full, sb = srs[d], random.Random(c["seed"] + 7 * d)
            pilot = full[:k]
            labels = {i: h[i] for i in pilot}
            passed = sum(1 for i in pilot if h[i] and not f[i]) >= A.NEG_GUARD
            plan = A.plan_audit(f, labels, n, tau=2.0 if pooled else A.TAU, neg_guard=0 if pooled else A.NEG_GUARD)
            if plan["design"] == "pooled":
                labels = {i: h[i] for i in full}  # common random numbers with the pooled reference
                plan = dict(plan, to_label=[0])
            for cell, t in zip(plan["cells"], plan["to_label"]):
                for i in sb.sample([i for i in cell if i not in labels], t):
                    labels[i] = h[i]
            try:
                est, lo, hi = A.audit_interval(plan, f, labels)
                err = False
            except ValueError:  # a cell with fewer than two labels; counted and reported, never silently dropped
                est, lo, hi = A.audit_interval({"design": "pooled", "cells": [list(range(N))]}, f, labels)
                err = True
            out.append(((hi - lo) / 2, lo <= truth <= hi, plan["design"] == "cells", len(labels), passed, err))
        res[name] = out
    return res


def one_cell(args):
    c, reps = args
    res = run(c, reps)
    ref = sum(x[0] for x in res["pooled"]) / reps
    lines = []
    for name in RULES:
        r = res[name]
        w = sum(x[0] for x in r) / reps
        gp = [x for x in r if x[2] and x[4]]
        gf = [x for x in r if x[2] and not x[4]]
        over = max(x[3] for x in r)
        assert over <= c["n"], (c["label"], c["n"], name, over)  # the cap: no plan labels more than n

        def cov(xs):
            return f"{100 * sum(x[1] for x in xs) / len(xs):.1f}" if xs else "nan"
        lines.append(f"{c['label']} | {c['n']} | {c['J']:.3f} | {name} | {100 * sum(x[2] for x in r) / reps:.1f} | "
                     f"{int(c['fresh'])} | {100 * sum(x[1] for x in r) / reps:.1f} | {100 * w:.3f} | {w / ref:.3f} | "
                     f"{len(gp)} | {cov(gp)} | {len(gf)} | {cov(gf)} | {sum(x[5] for x in r)}")
    print("\n".join(lines), flush=True)
    return lines


def draws(reps):
    cs = list(cells())
    with Pool(4) as p:
        got = p.map(one_cell, [(c, reps) for c in cs], chunksize=1)
    OUT.write_text("\n".join([HEAD] + [l for g in got for l in g]) + "\n")


def summary():
    by = {}
    for line in OUT.read_text().splitlines()[1:]:
        x = [s.strip() for s in line.split("|")]
        by[(x[0], int(x[1]), x[3])] = dict(J=float(x[2]), obs=float(x[4]), fresh=x[5] == "1", cov=float(x[6]),
                                            ratio=float(x[8]), gp=int(x[9]),
                                            gpc=float(x[10]) if x[10] != "nan" else None, err=int(x[13]))
    keys = list(dict.fromkeys((k[0], k[1]) for k in by))
    fr = [k for k in keys if by[(*k, "pooled")]["fresh"]]
    old = [k for k in keys if k not in fr]
    names = list(SHARES)
    out = [f"cells run: {len(keys)} ({len(old)} old, {len(fr)} fresh); errors (cell with < 2 labels): "
           f"{sum(by[(*k, nm)]['err'] for k in keys for nm in names)}"]
    for k in fr:
        out.append(f"fresh {k[0]} n {k[1]} (J {by[(*k, 'pooled')]['J']:.3f}): " + ", ".join(
            f"{nm} {by[(*k, nm)]['ratio']:.3f} ({by[(*k, nm)]['obs']:.0f}% cells, cov {by[(*k, nm)]['cov']:.1f})"
            for nm in names))

    def gain(nm, ks=keys):
        return sum(1 - by[(*k, nm)]["ratio"] for k in ks)

    def low(nm, ks=keys):
        return [(k, by[(*k, nm)]["cov"]) for k in ks if by[(*k, nm)]["cov"] < 93.0]

    def gp_low(nm):
        return [(k, by[(*k, nm)]["gp"], by[(*k, nm)]["gpc"]) for k in keys
                if by[(*k, nm)]["gp"] >= 50 and by[(*k, nm)]["gpc"] < 88.0]

    for nm in names:
        out.append(f"{nm}: gain all {gain(nm):.3f} (old {gain(nm, old):.3f}, fresh {gain(nm, fr):.3f}); min coverage "
                   f"{min(by[(*k, nm)]['cov'] for k in keys):.1f}; under 93%: {low(nm)}; guard-pass >= 50 draws under "
                   f"88%: {gp_low(nm)}; max ratio {max(by[(*k, nm)]['ratio'] for k in keys):.3f}")
    out.append("by n (old GoEmotions / fresh): " + "; ".join(
        f"{nm} " + " ".join(f"n{n_} {gain(nm, [k for k in old if k[1] == n_ and not k[0].startswith(('lexicon', 'nb'))]):.3f}"
                            f"/{gain(nm, [k for k in fr if k[1] == n_]):.3f}" for n_ in NS) for nm in names))
    p1 = not low("s70", fr) and gain("s70", fr) >= gain("s50", fr) and gain("s70", fr) >= gain("s30", fr) + 0.05
    out.append(f"P1 fresh: s70 covers {not low('s70', fr)}, gain s30 {gain('s30', fr):.3f} s50 {gain('s50', fr):.3f} "
               f"s70 {gain('s70', fr):.3f}: {'yes' if p1 else 'no'}")
    out.append(f"P2 every rule >= 93% everywhere: {'yes' if all(not low(nm) for nm in names) else 'no'}; failing "
               f"{[nm for nm in names if low(nm)]}")
    g = [gain(nm) for nm in names]
    out.append(f"P3 gain rises with share (69 cells): {[round(v, 3) for v in g]}: "
               f"{'yes' if all(a < b for a, b in zip(g, g[1:])) else 'no'}; s100 - s70 on old cells "
               f"{gain('s100', old) - gain('s70', old):+.3f}")
    gf = [gain(nm, fr) for nm in names]
    out.append(f"P4 same order on fresh: {[round(v, 3) for v in gf]}: "
               f"{'yes' if all(a < b for a, b in zip(gf, gf[1:])) else 'no'}; s100 > s70: "
               f"{'yes' if gain('s100', fr) > gain('s70', fr) else 'no'}")
    out.append("P5 guard-pass cells under 88% (>= 50 draws): " + ", ".join(f"{nm} {len(gp_low(nm))}" for nm in names))
    over = [(k, by[(*k, 's100')]['ratio']) for k in keys if by[(*k, 's100')]['ratio'] > 1.010]
    out.append(f"P6 s100 above 1.010: {over}: {'yes' if not over else 'no'}")
    a_ok = not low("s70", fr) and gain("s70", fr) >= gain("s50", fr) - 0.02
    if not a_ok:
        ok = [nm for nm in ("s50", "s30") if not low(nm, fr)]
        new = SHARES[max(ok, key=lambda nm: gain(nm, fr))] if ok else 0.3
        out.append(f"Decision rule A: not met; PILOT_SHARE changes to {new}; B does not apply")
    else:
        best, prev = 0.7, "s70"
        for nm in ("s80", "s90", "s100"):
            if low(nm) or gain(nm) - gain(prev) < 0.05 or gain(nm, fr) < gain("s70", fr):
                break
            best, prev = SHARES[nm], nm
        out.append(f"Decision rule A: met, PILOT_SHARE stays 0.7 unless B moves it. B: s* "
                   f"{best if best > 0.7 else 'none'}; PILOT_SHARE {'changes to ' + str(best) if best > 0.7 else 'stays 0.7'}")
    text = "\n".join(out); print(text); (HERE / "h7as_fresh_share.txt").write_text(text + "\n")


def main():
    mode = ARGS[0] if ARGS else "summary"
    if mode == "summary":
        summary()
    elif mode == "smoke":
        c = next(c for c in T.cells() if c["part"] == "goemo")
        print("\n".join(one_cell((dict(c, fresh=False), int(ARGS[1]) if len(ARGS) > 1 else 10))))
    else:
        draws(int(ARGS[1]) if len(ARGS) > 1 else 1000)


if __name__ == "__main__":
    main()
