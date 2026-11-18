"""Milestone 7at: can a stricter admission test for coder cells remove the shipped rule's undercoverage on the draws
where it uses cells with a weak coder, without giving back the width gain of good coders? (7as's next step (1).)

Why. 7as ran the shipped rule (pilot 0.7 n, budget cap, tau 0.1, 3-miss guard) on 69 cells. Unconditional coverage is
93% or more almost everywhere, but conditional on the plan using cells, coverage falls to 69.8 to 89.4% in cells whose
coder is weak (Youden J 0.12 to 0.27) and where cells are admitted in a minority of draws: lr approval n 1,000 (J 0.117,
69.8% of 43), lr annoyance n 500 (0.125, 82.5% of 80), 1.5B disapproval n 1,000 (0.135, 74.3% of 35), lr excitement
n 1,000 (0.200, 88.4% of 250), lr caring n 1,000 (0.255, 87.8% of 295), 0.5B sadness n 1,000 (0.265, 89.4% of 312).
Mechanism (7an, 7ao): the pilot that chose cells is reused in the estimate, and for a weak coder the pilots that pass
are the lucky ones (a J_hat far above the true J). A practitioner sees one draw and is told "cells"; in those cells the
interval they get is too short. The admission test today is J_hat >= 0.1 on the pilot's point estimate.

Rules (all at pilot share 0.7, `plan_audit` defaults of this commit otherwise: neg_guard 3, width_margin 0, budget cap):
  pooled  the reference (tau 2).
  t10     shipped: J_hat >= 0.10.
  t20     J_hat >= 0.20.
  t30     J_hat >= 0.30 (the pre-7ai value).
  l10     J_hat - 1.000 se(J_hat) >= 0.10, se(J_hat)^2 = sens(1-sens)/n_pos + spec(1-spec)/n_neg on the pilot (Wald).
  l16     J_hat - 1.645 se(J_hat) >= 0.10.
  The l-rules are implemented here, not in the library: the script computes the pilot's lower bound and, if it fails,
  calls `plan_audit` with tau 2 (pooled); otherwise with tau 0.1. No library code changes before the run.

Cells. Old: 7as's 69 (39 + 18 GoEmotions, 12 NaijaSenti), same seeds and scheme. Fresh (decide the gain part): 6
GoEmotions categories never used in the pilot-design line (7y to 7as), chosen before any draw or coder statistic:
confusion, desire, disappointment, realization, disgust, nervousness; 7as's NB coder and split, n 500 / 1,000 / 2,000;
18 cells. Disclosed: disgust and nervousness appear in `group_shift_reddit.py` (another question) and all six in
`floor_rule_heldout.py` (a different estimator); nothing from those runs was read for this one. Grief, pride and relief
(also unused) were left out before any draw because their prevalence in this corpus is under 0.5%, too few positives
for a cells audit at these n. Scheme as in 7as: per draw one simple random sample of n, the pilot its first 0.7 n
items; a pooled plan labels the whole sample (common random numbers); a cells plan tops up from a per-draw stream.
1,000 draws per cell (+/- 1.4 points).

Measures per (cell, rule): unconditional coverage; ratio of mean half-width to pooled; admitted draws (cells used) and
their coverage. "Weak cells": true J < 0.30 (J from the full test split, as 7as reports it).

    python3 experiments/h7at_weak_admit.py draws [reps]   # -> h7at_weak_admit_draws.txt
    python3 experiments/h7at_weak_admit.py summary        # predictions and decision rule -> h7at_weak_admit.txt

Prediction (written and committed before any draw; a 10-draw smoke test of one cell may run first and is disclosed):
  P1  (replication) t10 shows the defect again: at least 3 cells with 30 or more admitted draws whose admitted coverage
      is under 88%, all with J < 0.30.
  P2  (decisive, conditional validity) the admitted draws pooled over all weak cells cover 92% or more under t20, t30,
      l10 and l16 (t10: guess 88 to 91%), and each of those rules has at most 1 cell with 30 or more admitted draws
      under 88%.
  P3  every rule covers 93% or more in every cell where pooled covers 93% or more (the 7as tail cell 1.5B disapproval
      n 1,000, where pooled itself covered 92.6%, is judged against pooled).
  P4  gain (sum of 1 - ratio) kept, against t10, over all 87 cells: t20 85 to 95%, t30 50 to 75%, l10 85 to 98%,
      l16 70 to 90%. On the fresh cells the same order.
  P5  the l-rules keep more of t10's gain on good coders (J >= 0.40) than the t-rules with the same weak-cell
      conditional coverage, because a good coder's lower bound clears 0.1 easily while t30 bites on J 0.3 to 0.45.
  Decision rule, fixed now. Candidates t20, t30, l10, l16. A candidate qualifies if it meets P2 (both parts) and P3,
  keeps 90% or more of t10's total gain over all 87 cells, and loses no more than 0.05 of t10's fresh gain. If any
  qualifies, the one with the largest total gain becomes the library default (a t-rule changes `TAU`; an l-rule adds
  a `tau_z` parameter to `screen` and `plan_audit` with that default, and every earlier script is pinned so it replays).
  If none qualifies, the default stays t10, and the paper states the conditional undercoverage as a limitation of
  reusing the pilot, with the cells and numbers.
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
A.RARE_FALLBACK = None  # pinned: replays as committed (LOG.md 7aw)
A.NEG_FLOOR = None  # pinned (LOG.md 7az): replays as committed
import h7as_fresh_share as S  # noqa: E402

FRESH = ("confusion", "desire", "disappointment", "realization", "disgust", "nervousness")  # chosen before any draw
NS = (500, 1000, 2000)
SHARE = 0.7
RULES = {"pooled": None, "t10": (0.10, 0.0), "t20": (0.20, 0.0), "t30": (0.30, 0.0), "l10": (0.10, 1.0),
         "l16": (0.10, 1.645)}
WEAK_J, GOOD_J = 0.30, 0.40
OUT = HERE / "h7at_weak_admit_draws.txt"
HEAD = ("cell | n | J | rule | fresh | coverage % | half-width pts | ratio to pooled | admitted draws | "
        "admitted covered | errors")


def j_lower(y, f, z):
    """Wald lower bound J_hat - z se(J_hat) from paired pilot labels; -1 when the pilot has no positive or negative."""
    pos = [b for a, b in zip(y, f) if a]
    neg = [b for a, b in zip(y, f) if not a]
    if not pos or not neg:
        return -1.0
    se_, sp = sum(pos) / len(pos), sum(1 - b for b in neg) / len(neg)
    return se_ + sp - 1 - z * math.sqrt(se_ * (1 - se_) / len(pos) + sp * (1 - sp) / len(neg))


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
    for c in S.cells():
        yield dict(c, fresh=False)
    yield from fresh_cells()


def run(c, reps):
    h, f, n = c["h"], c["f"], c["n"]
    N, truth = len(h), sum(h) / len(h)
    rr = random.Random(c["seed"] + 13)
    srs = [rr.sample(range(N), n) for _ in range(reps)]
    k = round(SHARE * n)
    res = {}
    for name, rule in RULES.items():
        out = []
        for d in range(reps):
            full, sb = srs[d], random.Random(c["seed"] + 7 * d)
            pilot = full[:k] if rule else full
            labels = {i: h[i] for i in pilot}
            if rule is None:
                tau, ng = 2.0, 0
            else:
                tau, z = rule
                ng = A.NEG_GUARD
                if z and j_lower([h[i] for i in pilot], [f[i] for i in pilot], z) < tau:
                    tau = 2.0
            plan = A.plan_audit(f, labels, n, tau=tau, neg_guard=ng)
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
            assert len(labels) <= n, (c["label"], n, name, len(labels))
            out.append(((hi - lo) / 2, lo <= truth <= hi, plan["design"] == "cells", err))
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
        adm = [x for x in r if x[2]]
        lines.append(f"{c['label']} | {c['n']} | {c['J']:.3f} | {name} | {int(c['fresh'])} | "
                     f"{100 * sum(x[1] for x in r) / reps:.1f} | {100 * w:.3f} | {w / ref:.3f} | {len(adm)} | "
                     f"{sum(x[1] for x in adm)} | {sum(x[3] for x in r)}")
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
        by[(x[0], int(x[1]), x[3])] = dict(J=float(x[2]), fresh=x[4] == "1", cov=float(x[5]), ratio=float(x[7]),
                                            adm=int(x[8]), admc=int(x[9]), err=int(x[10]))
    keys = list(dict.fromkeys((k[0], k[1]) for k in by))
    fr = [k for k in keys if by[(*k, "pooled")]["fresh"]]
    weak = [k for k in keys if by[(*k, "pooled")]["J"] < WEAK_J]
    good = [k for k in keys if by[(*k, "pooled")]["J"] >= GOOD_J]
    names = [nm for nm in RULES if nm != "pooled"]
    out = [f"cells run: {len(keys)} ({len(keys) - len(fr)} old, {len(fr)} fresh; {len(weak)} weak J < {WEAK_J}, "
           f"{len(good)} good J >= {GOOD_J}); errors (cell with < 2 labels): "
           f"{sum(by[(*k, nm)]['err'] for k in keys for nm in names)}"]
    for k in fr:
        out.append(f"fresh {k[0]} n {k[1]} (J {by[(*k, 'pooled')]['J']:.3f}): " + ", ".join(
            f"{nm} {by[(*k, nm)]['ratio']:.3f} ({by[(*k, nm)]['adm'] / 10:.0f}% cells, cov {by[(*k, nm)]['cov']:.1f})"
            for nm in names))

    def gain(nm, ks=keys):
        return sum(1 - by[(*k, nm)]["ratio"] for k in ks)

    def adm_low(nm):
        return [(k, by[(*k, nm)]["adm"], round(100 * by[(*k, nm)]["admc"] / by[(*k, nm)]["adm"], 1)) for k in keys
                if by[(*k, nm)]["adm"] >= 30 and by[(*k, nm)]["admc"] < 0.88 * by[(*k, nm)]["adm"]]

    def weak_cond(nm):
        a = sum(by[(*k, nm)]["adm"] for k in weak)
        return (100 * sum(by[(*k, nm)]["admc"] for k in weak) / a if a else float("nan")), a

    def p3_fail(nm):
        return [(k, by[(*k, nm)]["cov"]) for k in keys
                if by[(*k, nm)]["cov"] < 93.0 and by[(*k, "pooled")]["cov"] >= 93.0]

    for nm in names:
        wc, wa = weak_cond(nm)
        out.append(f"{nm}: gain all {gain(nm):.3f} (fresh {gain(nm, fr):.3f}, weak {gain(nm, weak):.3f}, good "
                   f"{gain(nm, good):.3f}); weak-cell admitted coverage {wc:.1f}% of {wa}; admitted >= 30 under 88%: "
                   f"{adm_low(nm)}; under 93% where pooled is not: {p3_fail(nm)}; min coverage "
                   f"{min(by[(*k, nm)]['cov'] for k in keys):.1f}; max ratio {max(by[(*k, nm)]['ratio'] for k in keys):.3f}")
    low = adm_low("t10")
    out.append(f"P1 t10 has >= 3 such cells, all J < {WEAK_J}: {len(low)} cells, max J "
               f"{max((by[(*k, 'pooled')]['J'] for k, _, _ in low), default=float('nan')):.3f}: "
               f"{'yes' if len(low) >= 3 and all(by[(*k, 'pooled')]['J'] < WEAK_J for k, _, _ in low) else 'no'}")
    p2 = {nm: weak_cond(nm)[0] >= 92.0 and len(adm_low(nm)) <= 1 for nm in names}
    out.append("P2 weak admitted coverage >= 92% and <= 1 cell under 88%: " + ", ".join(
        f"{nm} {'yes' if p2[nm] else 'no'}" for nm in names[1:]))
    out.append("P3 no cell under 93% where pooled covers: " + ", ".join(
        f"{nm} {'yes' if not p3_fail(nm) else 'no'}" for nm in names))
    g0, f0 = gain("t10"), gain("t10", fr)
    out.append("P4 share of t10's gain kept (all / fresh): " + ", ".join(
        f"{nm} {gain(nm) / g0:.3f} / {gain(nm, fr) / f0 if f0 else float('nan'):.3f}" for nm in names[1:]))
    out.append("P5 share of t10's good-coder gain kept: " + ", ".join(
        f"{nm} {gain(nm, good) / gain('t10', good):.3f}" for nm in names[1:]))
    ok = [nm for nm in names[1:] if p2[nm] and not p3_fail(nm) and gain(nm) >= 0.9 * g0 and gain(nm, fr) >= f0 - 0.05]
    if ok:
        best = max(ok, key=gain)
        out.append(f"Decision rule: qualifying {ok}; default changes to {best}")
    else:
        out.append("Decision rule: none qualifies; default stays t10; the paper states the conditional undercoverage")
    text = "\n".join(out); print(text); (HERE / "h7at_weak_admit.txt").write_text(text + "\n")


def main():
    mode = ARGS[0] if ARGS else "summary"
    if mode == "summary":
        summary()
    elif mode == "smoke":
        c = next(c for c in S.T.cells() if c["part"] == "goemo")
        print("\n".join(one_cell((dict(c, fresh=False), int(ARGS[1]) if len(ARGS) > 1 else 10))))
    else:
        draws(int(ARGS[1]) if len(ARGS) > 1 else 1000)


if __name__ == "__main__":
    main()
