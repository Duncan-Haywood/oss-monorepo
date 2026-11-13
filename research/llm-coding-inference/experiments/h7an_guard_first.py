"""Milestone 7an: does a guard-first fallback (keep the shipped plan when the pilot passes the 3-miss guard, and use the
plus-four floored cells design only when it does not) keep the shipped rule's coverage and gain and add the good
coder's? (7am's next step.)

7am found that the miss guard and the pseudo-count floor fail in opposite places. The guard (neg_guard 3) refuses the
coders that miss too few positives to show it in a 250 to 1,000 item pilot, which are the best ones (gratitude, J 0.78,
n 500: cells in 10% of draws, 0.980 of pooled against an oracle forecast of 0.669). The floor (neg_guard 0, pseudo
a = 2) lets them in (gratitude n 500: 0.846) but charges every middling coder for the thin-cell risk and keeps only
79% of the shipped rule's total gain (2.17 against 2.76). This milestone tests the rule that uses each where it wins:

    gf2: if the pilot holds >= 3 human positives the coder labelled 0, plan exactly as the shipped rule; otherwise plan
         with neg_guard 0 and pseudo 2 (tau 0.1, guard 0, width_margin 0 as shipped). Library: `plan_audit(...,
         fallback_pseudo=2)`; default FALLBACK_PSEUDO = None, so nothing earlier changes.
    gf1: the same with pseudo 1 in the fallback (secondary; reported, never adopted in this PR).

Cells: 7am's 39 (7ak's 27 and 7al's 12), same seeds and draw streams, plus 6 fresh cells chosen before any draw or any
coder statistic was computed for them, so the rule is not fitted to gratitude: GoEmotions `amusement` and `love` coded
by the repo's word-presence logistic coder (`h6r_rare_pilot.coder`: trained on the 30% train part, threshold at 3x
the train prevalence, capped at half the items), on the same 6,683-item test part as 7al, n 500 / 1,000 / 2,000,
pilot n/2. Neither category appears in 7ak, 7al or 7am; amusement was last used in 7t (old screen, a 6,000-item
subsample, n 1,000 only), love never. Rules: pooled; shipped (neg_guard 3, pseudo 0); a2 (neg_guard 0, pseudo 2; the
7am rule); gf2; gf1. 1,000 draws per cell (+/- 1.4 points on coverage).

    python3 experiments/h7an_guard_first.py draws [reps]  # -> h7an_guard_first_draws.txt
    python3 experiments/h7an_guard_first.py summary       # applies the decision rule -> h7an_guard_first.txt

Arithmetic, before any draw: on the GoEmotions cells the pilots and per-draw streams are shared across rules, so in
each draw gf2 gives exactly the shipped rule's interval when the guard passes and exactly a2's when it fails. Where the
guard passes in nearly every draw (1.5B admiration n 2,000, anger n 2,000) gf2 must equal shipped; where it almost never
passes (gratitude n 500) gf2 must be close to a2. The NaijaSenti cells use one random stream per rule (7ak's design),
so there gf2 is a fresh stream and differences carry extra Monte Carlo noise.

Prediction (written and committed before any draw):
  P0  (replay) shipped and a2 reproduce 7am's committed ratios in all 39 cells to three decimals.
  P1  gf2 covers 93% or more in every one of the 45 cells. Risk named in advance: the fallback runs exactly on the
      thin pilots where a2's floor binds, so gf2's coverage there is a2's conditional coverage, not its average.
  P2  gf2 is no more than 1.010 times pooled in every one of the 45 cells.
  P3  gf2's total gain over the 39 cells (sum of 1 - ratio) is at least the shipped rule's (7am: 2.760). Guess: 3.0
      to 3.3 (gratitude n 500 and n 1,000 alone should add about 0.25).
  P4  gratitude n 500: gf2 <= 0.930 (shipped 0.980). Guess about 0.86.
  P5  fresh cells: in each of the 6, gf2 is no wider than shipped by more than 0.005, and in at least one it is
      narrower by 0.03 or more (needs a coder that the guard refuses often; if the guard passes in nearly every draw in
      all six, P5's second half is reported as untested, not refuted).
  Guess, not a test: gf1 covers under 93% in at least one cell (7am: a1 missed two).
  Decision rule, fixed now: if P1, P2 and P3 hold, the library default becomes FALLBACK_PSEUDO = 2 in this PR, and
  every earlier script that calls plan_audit is pinned to fallback_pseudo=None in the same PR so each replays as
  committed (7an's own shipped and a2 rules already pass None). Otherwise the default stays None and the summary
  reports where gf2 fails. gf1 is never adopted here: picking between a = 1 and a = 2 on these cells would fit them.
  A 3-draw smoke run checked only that the script executes; its output was discarded and no coder statistic of the
  fresh cells was read.
"""
import random
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))
from llmci import audit_design as A  # noqa: E402
import h7am_pseudo_guard as M  # noqa: E402

# name, neg_guard, pseudo, fallback_pseudo (all non-pooled rules: tau 0.1, guard 0, width_margin 0)
RULES = [("pooled", 0, 0.0, None), ("shipped", 3, 0.0, None), ("a2", 0, 2.0, None), ("gf2", 3, 0.0, 2.0),
         ("gf1", 3, 0.0, 1.0)]
FRESH = ("amusement", "love")  # chosen before any draw or coder statistic (docstring)
NS = (500, 1000, 2000)
OUT = HERE / "h7an_guard_first_draws.txt"
HEAD = ("cell | n | J | rule | observed cells % | fallback % | coverage % | half-width pts | ratio to pooled")


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
            yield dict(part="goemo", label=f"lr {cat}", n=n, pilot=n // 2, h=h, f=f, J=A.informedness(h, f),
                       seed=H.GO_SEED, prev=sum(h) / len(h), fresh=True)


def cells():
    yield from M.cells()
    yield from fresh_cells()


def committed():
    got = {}
    for line in (HERE / "h7am_pseudo_guard_draws.txt").read_text().splitlines()[1:]:
        x = [s.strip() for s in line.split("|")]
        if x[3] in ("shipped", "a2"):
            got[(x[0], int(x[1]), x[3])] = float(x[7])
    return got


def run(c, reps):
    """7am's draw loop with fallback_pseudo added (goemo: common pilots, then a per-draw stream; naija: one stream per
    rule)."""
    h, f, n = c["h"], c["f"], c["n"]
    N, truth = len(h), sum(h) / len(h)
    res = {}
    if c["part"] == "goemo":
        rr = random.Random(c["seed"] + 5)
        pilots = [rr.sample(range(N), n // 2) for _ in range(reps)]
    for name, ng, a, fb in RULES:
        out = []
        if c["part"] != "goemo":
            rr = random.Random(c["seed"])
        tau = 2.0 if name == "pooled" else A.TAU
        for d in range(reps):
            if c["part"] == "goemo":
                pilot, sb = pilots[d], random.Random(c["seed"] + 7 * d)
            else:
                pilot, sb = rr.sample(range(N), round(A.PILOT_SHARE * n)), rr
            labels = {i: h[i] for i in pilot}
            plan = A.plan_audit(f, labels, n, tau=tau, guard=0, neg_guard=ng, width_margin=0.0, pseudo=a,
                                fallback_pseudo=fb)
            for cell, t in zip(plan["cells"], plan["to_label"]):
                for i in sb.sample([i for i in cell if i not in labels], t):
                    labels[i] = h[i]
            _, lo, hi = A.audit_interval(plan, f, labels)
            out.append(((hi - lo) / 2, lo <= truth <= hi, plan["design"] == "cells", bool(plan.get("fallback"))))
        res[name] = out
    return res


def one_cell(args):
    c, reps = args
    res = run(c, reps)
    wp = sum(x[0] for x in res["pooled"]) / reps
    lines = []
    for name, *_r in RULES:
        r = res[name]
        w = sum(x[0] for x in r) / reps
        lines.append(f"{c['label']} | {c['n']} | {c['J']:.3f} | {name} | {100 * sum(x[2] for x in r) / reps:.1f} | "
                     f"{100 * sum(x[3] for x in r) / reps:.1f} | {100 * sum(x[1] for x in r) / reps:.1f} | "
                     f"{100 * w:.3f} | {w / wp:.3f}")
    print("\n".join(lines), flush=True)
    return lines


def draws(reps):
    cs = list(cells())
    with Pool(4) as p:
        got = p.map(one_cell, [(c, reps) for c in cs], chunksize=1)
    OUT.write_text("\n".join([HEAD] + [l for g in got for l in g]) + "\n")


def summary():
    rows = []
    for line in OUT.read_text().splitlines()[1:]:
        cell, n, J, rule, obs, fbk, cov, hw, ratio = [x.strip() for x in line.split("|")]
        rows.append(dict(cell=cell, n=int(n), J=float(J), rule=rule, obs=float(obs), fb=float(fbk), cov=float(cov),
                         ratio=float(ratio)))
    by = {(r["cell"], r["n"], r["rule"]): r for r in rows}
    keys = list(dict.fromkeys((r["cell"], r["n"]) for r in rows))
    old = [k for k in keys if not k[0].startswith("lr ")]
    new = [k for k in keys if k[0].startswith("lr ")]
    com = committed()
    out = [f"cells run: {len(keys)} ({len(old)} from 7am, {len(new)} fresh)"]
    diff = [(k, nm) for k in old for nm in ("shipped", "a2")
            if (*k, nm) in com and abs(com[(*k, nm)] - by[(*k, nm)]["ratio"]) > 0.0005]
    out.append(f"P0 replay of 7am shipped and a2 ratios: {2 * len(old) - len(diff)} of {2 * len(old)} identical; "
               f"differ {diff}")
    for k in keys:
        out.append(f"{k[0]} n {k[1]} (J {by[(*k, 'pooled')]['J']:.3f}; pooled cov {by[(*k, 'pooled')]['cov']:.1f}): "
                   + ", ".join(f"{nm} {by[(*k, nm)]['ratio']:.3f} ({by[(*k, nm)]['obs']:.0f}% cells"
                               + (f", {by[(*k, nm)]['fb']:.0f}% fallback" if nm.startswith("gf") else "")
                               + f", cov {by[(*k, nm)]['cov']:.1f})" for nm, *_r in RULES[1:]))

    def low(nm, ks):
        return [(k, by[(*k, nm)]["cov"]) for k in ks if by[(*k, nm)]["cov"] < 93.0]

    def over(nm, ks):
        return [(k, by[(*k, nm)]["ratio"]) for k in ks if by[(*k, nm)]["ratio"] > 1.010]

    def gain(nm, ks):
        return sum(1 - by[(*k, nm)]["ratio"] for k in ks)

    for nm, *_r in RULES[1:]:
        out.append(f"{nm}: total gain 7am cells {gain(nm, old):.3f}, fresh cells {gain(nm, new):.3f}; min coverage "
                   f"{min(by[(*k, nm)]['cov'] for k in keys):.1f}; cells under 93%: {low(nm, keys)}; "
                   f"cells above 1.010: {over(nm, keys)}")
    p1, p2, p3 = not low("gf2", keys), not over("gf2", keys), gain("gf2", old) >= gain("shipped", old)
    out.append(f"P1 gf2 covers >= 93% in all {len(keys)} cells: {'yes' if p1 else 'no'}")
    out.append(f"P2 gf2 <= 1.010 in all {len(keys)} cells: {'yes' if p2 else 'no'}")
    out.append(f"P3 gf2 total gain on the 7am cells >= shipped: {'yes' if p3 else 'no'} "
               f"({gain('gf2', old):.3f} vs {gain('shipped', old):.3f})")
    g = ("1.5B gratitude", 500)
    out.append(f"P4 gratitude n 500 gf2 {by[(*g, 'gf2')]['ratio']:.3f} vs shipped {by[(*g, 'shipped')]['ratio']:.3f}: "
               f"{'yes' if by[(*g, 'gf2')]['ratio'] <= 0.930 else 'no'}")
    d = [(k, round(by[(*k, 'gf2')]["ratio"] - by[(*k, 'shipped')]["ratio"], 3)) for k in new]
    worse = [x for x in d if x[1] > 0.005]
    better = [x for x in d if x[1] <= -0.03]
    fbmax = max((by[(*k, 'gf2')]["fb"] for k in new), default=0.0)
    out.append(f"P5 fresh cells gf2 - shipped: {d}; wider by > 0.005: {worse}; narrower by >= 0.03: {better}; "
               f"largest fallback share {fbmax:.0f}%: "
               + ("yes" if not worse and better else "second half untested (guard rarely refuses)" if not worse and
                  fbmax < 20 else "no"))
    out.append("Decision rule: " + ("P1, P2, P3 hold; default becomes FALLBACK_PSEUDO = 2" if p1 and p2 and p3 else
                                    "not met; default stays FALLBACK_PSEUDO = None"))
    text = "\n".join(out); print(text); (HERE / "h7an_guard_first.txt").write_text(text + "\n")


def main():
    mode = ARGS[0] if ARGS else "summary"
    if mode == "summary":
        summary()
    else:
        draws(int(ARGS[1]) if len(ARGS) > 1 else 1000)


if __name__ == "__main__":
    main()
