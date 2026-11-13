"""Milestone 7ao: does a two-phase fallback (pilot labels counted exactly, the rest of each coder cell estimated from
fresh items only) keep the guard-first rule's width gain without its selection bias? (7an's next step.)

7an's guard-first rule (gf2: shipped plan when the pilot holds >= 3 human positives the coder labelled 0, otherwise the
plus-four floored cells design) added 20% to the shipped rule's total gain but covered 92.4% at gratitude n 2,000 and
92.5% at love n 2,000. The post hoc split located the failure: where the fallback is a tail event, the pilots that fall
back are the ones holding unusually few coder-negative positives, and the estimate reuses them, so in fallback draws
that used cells coverage was 42 to 63% with every miss below the truth. A floor on the variance cannot repair a bias in
the point estimate.

The repair tested here is in the estimator. A two-phase cells plan treats the pilot as a census of its own items: their
labels are summed as known, and only the mean of each cell's R_h unpiloted items is estimated, from a fresh simple
random sample of k_h of them (budget n minus the pilot, split by `cell_allocation` over R_h S_h). Given the pilot, the
second phase is a stratified simple random sample of a fixed finite remainder, so its interval has the ordinary
design-based guarantee conditional on the pilot, and hence conditional on whatever design the pilot chose. The price is
that the pilot no longer informs the rest's estimate (with a pilot of n/2 that can be a large share of the
coder-negative cell's audit); the width forecast (`predicted_ratio(..., two_phase=True)`) prices that cost, so a
pilot whose two-phase plan would be wider than pooled goes to pooled.

Library (new, defaults off so nothing earlier changes): `plan_audit(..., two_phase=True)`, `fallback_two_phase=True`,
`two_phase_allocation`, and `audit_interval` closing a two-phase plan. Rules (all non-pooled: tau 0.1, guard 0,
width_margin 0):
    pooled
    shipped  neg_guard 3, pseudo 0 (the library default)
    gf2      7an's guard-first rule (fallback pseudo 2, reusing the pilot)
    gtp2     the candidate: guard-first, and the fallback plan is two-phase with pseudo 2
    tp2      neg_guard 0, pseudo 2, every cells plan two-phase (secondary; tests whether two-phase alone can replace
             the guard; never adopted in this PR)

Cells: 7an's 45 (same seeds and draw streams) plus 6 fresh, chosen before any draw or coder statistic was computed for
them: GoEmotions `remorse` and `joy` with the same word-presence logistic coder (`h6r_rare_pilot.coder`) on the
6,683-item test part, n 500 / 1,000 / 2,000, pilot n/2. Neither appears in 7ak to 7an. 1,000 draws per cell (+/- 1.4
points on coverage).

    python3 experiments/h7ao_two_phase.py draws [reps]   # -> h7ao_two_phase_draws.txt (per cell and rule, with the
                                                         #    conditional split on GoEmotions cells)
    python3 experiments/h7ao_two_phase.py summary        # applies the decision rule -> h7ao_two_phase.txt

Conditional split, pre-registered this time (7an's was post hoc): on GoEmotions cells (pilots shared across rules),
each draw records whether its pilot holds >= 3 coder misses ("guard-pass"); for every rule the summary reports coverage
among cells draws split by guard-pass and guard-fail pilots, with the draw counts.

Arithmetic, before any draw: on GoEmotions cells gtp2 equals shipped in guard-pass draws exactly, so the two differ only
in draws where the guard fails. Under two-phase, the coder-negative cell's rest is estimated from k_0 fresh items
instead of all its audited items; with the pilot holding about n/2 x 0.94 coder negatives, a fallback plan's
coder-negative variance should rise by roughly the factor (pilot + k_0) / k_0, so the forecast will refuse some pilots
gf2 accepted.

Prediction (written and committed before any draw):
  P0  (replay) shipped and gf2 reproduce 7an's committed ratios in all 45 cells to three decimals.
  P1  gtp2 covers 93% or more in every one of the 51 cells.
  P2  conditional: in every GoEmotions cell with at least 50 guard-fail draws that used cells, gtp2 covers 88% or more
      in those draws (7an's gf2: 42 to 63% in the cells where the fallback was rare).
  P3  gtp2 is no more than 1.010 times pooled in every one of the 51 cells.
  P4  gtp2's total gain over 7am's 39 cells (sum of 1 - ratio) is at least the shipped rule's (2.760). Guess: 2.85 to
      3.05, below gf2's 3.322 because the fallback's estimate no longer uses the pilot.
  P5  (observation) tp2: conditional coverage of 88% or more in guard-pass and guard-fail cells draws wherever there are
      at least 50 such draws; guess: its total gain is below the shipped rule's.
  Decision rule, fixed now: if P1 to P4 hold, the library defaults become FALLBACK_PSEUDO = 2 and FALLBACK_TWO_PHASE =
  True in this PR, and every earlier script that calls plan_audit is pinned to fallback_pseudo=None so each replays as
  committed. Otherwise both defaults stay off and the summary reports where gtp2 fails. tp2 is never adopted here.
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
import h7an_guard_first as G  # noqa: E402

# name, neg_guard, pseudo, fallback_pseudo, two_phase, fallback_two_phase
RULES = [("pooled", 0, 0.0, None, False, False), ("shipped", 3, 0.0, None, False, False),
         ("gf2", 3, 0.0, 2.0, False, False), ("gtp2", 3, 0.0, 2.0, False, True), ("tp2", 0, 2.0, None, True, False)]
FRESH = ("remorse", "joy")  # chosen before any draw or coder statistic (docstring)
NS = (500, 1000, 2000)
OUT = HERE / "h7ao_two_phase_draws.txt"
HEAD = ("cell | n | J | rule | observed cells % | fallback % | coverage % | half-width pts | ratio to pooled | "
        "guard-pass cells draws | coverage there % | guard-fail cells draws | coverage there %")


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
    yield from G.cells()
    yield from fresh_cells()


def run(c, reps, rules=RULES):
    """7an's draw loop (goemo: common pilots, then a per-draw stream; naija: one stream per rule) with the two-phase
    switches; each draw also records whether the pilot passed the 3-miss guard."""
    h, f, n = c["h"], c["f"], c["n"]
    N, truth = len(h), sum(h) / len(h)
    res = {}
    if c["part"] == "goemo":
        rr = random.Random(c["seed"] + 5)
        pilots = [rr.sample(range(N), n // 2) for _ in range(reps)]
    for name, ng, a, fb, tp, ftp in rules:
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
            passed = sum(1 for i in pilot if h[i] and not f[i]) >= A.NEG_GUARD
            plan = A.plan_audit(f, labels, n, tau=tau, guard=0, neg_guard=ng, width_margin=0.0, pseudo=a,
                                fallback_pseudo=fb, two_phase=tp, fallback_two_phase=ftp)
            for cell, t in zip(plan["cells"], plan["to_label"]):
                for i in sb.sample([i for i in cell if i not in labels], t):
                    labels[i] = h[i]
            est, lo, hi = A.audit_interval(plan, f, labels)
            out.append(((hi - lo) / 2, lo <= truth <= hi, plan["design"] == "cells", bool(plan.get("fallback")),
                        passed))
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
        gp = [x for x in r if x[2] and x[4]] if c["part"] == "goemo" else []
        gf = [x for x in r if x[2] and not x[4]] if c["part"] == "goemo" else []

        def cov(xs):
            return f"{100 * sum(x[1] for x in xs) / len(xs):.1f}" if xs else "nan"
        lines.append(f"{c['label']} | {c['n']} | {c['J']:.3f} | {name} | {100 * sum(x[2] for x in r) / reps:.1f} | "
                     f"{100 * sum(x[3] for x in r) / reps:.1f} | {100 * sum(x[1] for x in r) / reps:.1f} | "
                     f"{100 * w:.3f} | {w / wp:.3f} | {len(gp)} | {cov(gp)} | {len(gf)} | {cov(gf)}")
    print("\n".join(lines), flush=True)
    return lines


def draws(reps):
    cs = list(cells())
    with Pool(4) as p:
        got = p.map(one_cell, [(c, reps) for c in cs], chunksize=1)
    OUT.write_text("\n".join([HEAD] + [l for g in got for l in g]) + "\n")


def committed():
    got = {}
    for line in (HERE / "h7an_guard_first_draws.txt").read_text().splitlines()[1:]:
        x = [s.strip() for s in line.split("|")]
        if x[3] in ("shipped", "gf2"):
            got[(x[0], int(x[1]), x[3])] = float(x[8])
    return got


def summary():
    rows = []
    for line in OUT.read_text().splitlines()[1:]:
        x = [s.strip() for s in line.split("|")]
        rows.append(dict(cell=x[0], n=int(x[1]), J=float(x[2]), rule=x[3], obs=float(x[4]), fb=float(x[5]),
                         cov=float(x[6]), ratio=float(x[8]), gp=int(x[9]), gpc=float(x[10]), gf=int(x[11]),
                         gfc=float(x[12])))
    by = {(r["cell"], r["n"], r["rule"]): r for r in rows}
    keys = list(dict.fromkeys((r["cell"], r["n"]) for r in rows))
    fresh = [k for k in keys if k[0] in (f"lr {c}" for c in FRESH)]
    old45 = [k for k in keys if k not in fresh]
    old39 = [k for k in old45 if not k[0].startswith("lr ")]
    com = committed()
    out = [f"cells run: {len(keys)} ({len(old39)} from 7am, {len(old45) - len(old39)} from 7an, {len(fresh)} fresh)"]
    diff = [(k, nm) for k in old45 for nm in ("shipped", "gf2")
            if (*k, nm) in com and abs(com[(*k, nm)] - by[(*k, nm)]["ratio"]) > 0.0005]
    out.append(f"P0 replay of 7an shipped and gf2 ratios: {2 * len(old45) - len(diff)} of {2 * len(old45)} identical; "
               f"differ {diff}")
    for k in keys:
        def tag(nm):
            r = by[(*k, nm)]
            s = f"{nm} {r['ratio']:.3f} ({r['obs']:.0f}% cells, cov {r['cov']:.1f}"
            if r["gf"]:
                s += f"; guard-fail cells {r['gf']} at {r['gfc']:.1f}"
            return s + ")"
        out.append(f"{k[0]} n {k[1]} (J {by[(*k, 'pooled')]['J']:.3f}; pooled cov {by[(*k, 'pooled')]['cov']:.1f}): "
                   + ", ".join(tag(nm) for nm, *_r in RULES[1:]))

    def low(nm, ks):
        return [(k, by[(*k, nm)]["cov"]) for k in ks if by[(*k, nm)]["cov"] < 93.0]

    def over(nm, ks):
        return [(k, by[(*k, nm)]["ratio"]) for k in ks if by[(*k, nm)]["ratio"] > 1.010]

    def gain(nm, ks):
        return sum(1 - by[(*k, nm)]["ratio"] for k in ks)

    def cond(nm, which):
        n_, c_ = ("gf", "gfc") if which == "fail" else ("gp", "gpc")
        return [(k, by[(*k, nm)][n_], by[(*k, nm)][c_]) for k in keys if by[(*k, nm)][n_] >= 50]

    for nm, *_r in RULES[1:]:
        out.append(f"{nm}: total gain 7am cells {gain(nm, old39):.3f}, 7an fresh {gain(nm, old45) - gain(nm, old39):.3f}"
                   f", 7ao fresh {gain(nm, fresh):.3f}; min coverage {min(by[(*k, nm)]['cov'] for k in keys):.1f}; "
                   f"cells under 93%: {low(nm, keys)}; cells above 1.010: {over(nm, keys)}")
        for which in ("pass", "fail"):
            cs = cond(nm, which)
            if cs:
                worst = min(cs, key=lambda t: t[2])
                out.append(f"  {nm} guard-{which} cells draws (cells with >= 50): {len(cs)} cells, worst {worst[0]} "
                           f"{worst[2]:.1f}% of {worst[1]}; under 88%: {[(k, c) for k, _n, c in cs if c < 88.0]}")
    p1 = not low("gtp2", keys)
    p2c = cond("gtp2", "fail")
    p2 = all(c >= 88.0 for _k, _n, c in p2c)
    p3 = not over("gtp2", keys)
    p4 = gain("gtp2", old39) >= gain("shipped", old39)
    out.append(f"P1 gtp2 covers >= 93% in all {len(keys)} cells: {'yes' if p1 else 'no'}")
    out.append(f"P2 gtp2 guard-fail cells coverage >= 88% in all {len(p2c)} cells with >= 50 such draws: "
               f"{'yes' if p2 else 'no'}")
    out.append(f"P3 gtp2 <= 1.010 in all {len(keys)} cells: {'yes' if p3 else 'no'}")
    out.append(f"P4 gtp2 total gain on the 7am cells >= shipped: {'yes' if p4 else 'no'} "
               f"({gain('gtp2', old39):.3f} vs {gain('shipped', old39):.3f}; gf2 {gain('gf2', old39):.3f})")
    p5 = [c for which in ("pass", "fail") for c in cond("tp2", which) if c[2] < 88.0]
    out.append(f"P5 tp2 conditional coverage >= 88% wherever >= 50 draws: {'yes' if not p5 else 'no ' + str(p5)}; "
               f"tp2 total gain 7am cells {gain('tp2', old39):.3f}")
    out.append("Decision rule: " + ("P1 to P4 hold; defaults become FALLBACK_PSEUDO = 2, FALLBACK_TWO_PHASE = True"
                                    if p1 and p2 and p3 and p4 else "not met; defaults stay off"))
    text = "\n".join(out); print(text); (HERE / "h7ao_two_phase.txt").write_text(text + "\n")


def main():
    mode = ARGS[0] if ARGS else "summary"
    if mode == "summary":
        summary()
    else:
        draws(int(ARGS[1]) if len(ARGS) > 1 else 1000)


if __name__ == "__main__":
    main()
