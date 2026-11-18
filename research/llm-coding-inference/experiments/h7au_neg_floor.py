"""Milestone 7au: can a variance floor on the coder-negative cell alone remove the shipped rule's undercoverage on the
draws where it uses cells with a weak coder, leaving design and allocation unchanged? (7at's next step (1).)

Why. 7at found no admission rule on J_hat fixes the weak-coder conditional undercoverage: in the 7 failing cells all
118 missed intervals lie below the truth, and the draws that miss are those whose pilot under-saw the coder's misses,
so their coder-negative cell variance is 0.36 to 0.69 of its true value (0.68 to 0.90 in covering draws). The fault is
on the variance side. The candidates below change only `audit_interval`'s variance for the coder-negative cell
(f = 0) of a cells plan; the plan (shipped rule t10: pilot 0.7 n, budget cap, tau 0.1, 3-miss guard) and its labels
are identical across candidates, so every comparison uses common random numbers.

Inside a coder cell f is constant, so the residual y - lambda f has the variance of y, the cell's 0/1 labels.
Candidates (v is the cell's sample variance of y, a its audited labels, x its positives among them):
  t10   shipped: no floor (the library's `audit_interval`).
  n2    v >= p~(1 - p~), p~ = (x + 2) / (a + 4) in the coder-negative cell only (7am's plus-four, one cell).
  n4    the same with 4 pseudo-positives and 4 pseudo-negatives, p~ = (x + 4) / (a + 8).
  wu1   v >= p_u(1 - p_u), p_u the Wilson upper bound (z = 1) of the cell's positive rate x / a: a floor that tracks
        how few misses the audit saw, at any a.
  b2    7am's library floor (`pseudo` 2 in both cells), for comparison.
  pooled the reference.
Implemented here (`interval`), no library change before the run. P0 checks, on every draw, that `interval` with no
floor equals the library's `audit_interval` to 1e-12, and that b2 equals the library with plan pseudo 2.

Cells. Old: 7at's 87 (69 of 7as plus 7at's 18 fresh), same seeds and scheme, so t10 replays 7at's t10. Fresh (decide
the gain part and P2 together with the old weak cells): the lr (NB) coder on six GoEmotions categories it has not been
run on in the pilot-design line (7y to 7at), chosen before any draw or coder statistic: embarrassment, anger,
curiosity, disapproval, fear, sadness; n 500 / 1,000 / 2,000; 18 cells. Disclosed: anger, curiosity, disapproval,
fear and sadness are in the old cells with Qwen coders (a different coder, so a new cell); all six are in
`floor_rule_heldout.py` and some in `rare_audit.py`, `group_shift_reddit.py` and `h7w_library_negguard.py` (other
estimators and questions); nothing from those runs was read for this one. Also disclosed: before this prediction was
committed, a data-loading check printed each fresh category's positive count in the corpus (embarrassment 47, anger
225, curiosity 350, disapproval 264, fear 104, sadness 227 of 9,547); no coder statistic or draw was seen, and the
list was not changed after it (embarrassment, at 0.49%, is kept). 1,000 draws per cell (+/- 1.4 points).

Measures per (cell, rule): coverage; ratio of mean half-width to pooled; admitted draws (cells used) and their
coverage. "Weak": true J < 0.30; "good": J >= 0.40.

    python3 experiments/h7au_neg_floor.py draws [reps]   # -> h7au_neg_floor_draws.txt
    python3 experiments/h7au_neg_floor.py summary        # predictions and decision rule -> h7au_neg_floor.txt

Prediction (written and committed before any draw; a 10-draw smoke test of one cell may run first and is disclosed):
  P0  (replication) t10 equals 7at's t10 (coverage, ratio, admitted draws) in all 87 old cells, and the in-run
      library checks pass on every draw.
  P1  t10 fails as in 7at: 3 or more cells with 30+ admitted draws under 88%, all J < 0.30 (fresh cells included).
  P2  (decisive, conditional validity) admitted draws pooled over all weak cells cover 92% or more, and at most 1
      cell with 30+ admitted draws is under 88%. Guess: n2 fails (with 5 to 15 audited misses the plus-four moves the
      variance by 10 to 30%, less than the 0.36 to 0.69 shortfall), n4 borderline, wu1 meets it, b2 as n2.
  P3  every rule covers 93% or more in every cell where pooled does.
  P4  gain (sum of 1 - ratio) kept against t10 over all 105 cells: n2 95 to 99%, n4 88 to 97%, wu1 80 to 95%,
      b2 85 to 97%. Good coders (J >= 0.40) keep 90% or more under every candidate.
  P5  floors widen only: every candidate's ratio is at least t10's in every cell (to 0.001).
  Decision rule, fixed now. Candidates n2, n4, wu1, b2. A candidate qualifies if it meets P2 and P3, keeps 90% or
  more of t10's total gain over all 105 cells, and loses no more than 0.05 of t10's gain on the 18 fresh cells. If
  any qualifies, the one with the largest total gain becomes the library default (`audit_interval` gains a
  `neg_floor` option for cells plans, default that candidate; every earlier script pinned so it replays). If none
  qualifies, the default stays t10 and the paper states the limitation with these numbers.
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
import h7at_weak_admit as W  # noqa: E402

FRESH = ("embarrassment", "anger", "curiosity", "disapproval", "fear", "sadness")  # chosen before any draw
NS = (500, 1000, 2000)
SHARE = 0.7
FLOORS = {"t10": None, "n2": ("neg", "pseudo", 2), "n4": ("neg", "pseudo", 4), "wu1": ("neg", "wilson", 1.0),
          "b2": ("both", "pseudo", 2)}
RULES = ["pooled"] + list(FLOORS)
WEAK_J, GOOD_J = 0.30, 0.40
OUT = HERE / "h7au_neg_floor_draws.txt"
HEAD = ("cell | n | J | rule | fresh | coverage % | half-width pts | ratio to pooled | admitted draws | "
        "admitted covered | errors")


def floor_var(y, kind, k):
    x, a = sum(y), len(y)
    if kind == "pseudo":
        p = (x + k) / (a + 2 * k)
    else:  # Wilson upper bound at z = k
        ph, z2 = x / a, k * k
        p = (ph + z2 / (2 * a) + k * math.sqrt(ph * (1 - ph) / a + z2 / (4 * a * a))) / (1 + z2 / a)
    return p * (1 - p)


def interval(plan, f_all, labels, fl, z=1.959964):
    """`A.audit_interval` for a one-phase plan, with the variance floor `fl` (None, or (cells, kind, k); cells "neg"
    floors the coder-negative cell only, "both" every cell of a cells plan)."""
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
        r = [a - lam * b for a, b in zip(y, f)]
        mr = sum(r) / len(r)
        v = sum((x - mr) ** 2 for x in r) / (len(r) - 1)
        if fl and len(cells) > 1 and (fl[0] == "both" or h == 0):
            v = max(v, floor_var(y, fl[1], fl[2]))
        w = len(c) / total
        value += w * (lam * sum(f_all[i] for i in c) / len(c) + mr)
        var += w * w * (1 - len(y) / len(c)) * v / len(y)
    return A._wilson(value, var, z)


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
    for c in W.cells():
        yield dict(c, fresh=False, old_fresh=c["fresh"])
    yield from fresh_cells()


def run(c, reps):
    """Same scheme and seeds as `h7at_weak_admit.run`: pooled labels the whole sample; t10 plans from the 0.7 n pilot
    and tops up from the per-draw stream. The floors reuse t10's plan and labels."""
    h, f, n = c["h"], c["f"], c["n"]
    N, truth = len(h), sum(h) / len(h)
    rr = random.Random(c["seed"] + 13)
    srs = [rr.sample(range(N), n) for _ in range(reps)]
    k = round(SHARE * n)
    res = {nm: [] for nm in RULES}
    for d in range(reps):
        full = srs[d]
        labels = {i: h[i] for i in full}
        plan = A.plan_audit(f, labels, n, tau=2.0, neg_guard=0)
        _, lo, hi = A.audit_interval(plan, f, labels)
        res["pooled"].append(((hi - lo) / 2, lo <= truth <= hi, False, False))
        sb = random.Random(c["seed"] + 7 * d)
        labels = {i: h[i] for i in full[:k]}
        plan = A.plan_audit(f, labels, n, tau=0.10, neg_guard=A.NEG_GUARD)
        if plan["design"] == "pooled":
            labels = {i: h[i] for i in full}
            plan = dict(plan, to_label=[0])
        for cell, t in zip(plan["cells"], plan["to_label"]):
            for i in sb.sample([i for i in cell if i not in labels], t):
                labels[i] = h[i]
        assert len(labels) <= n, (c["label"], n, len(labels))
        cl = plan["design"] == "cells"
        try:
            lib = A.audit_interval(plan, f, labels)
            mine = interval(plan, f, labels, None)
            assert max(abs(a - b) for a, b in zip(lib, mine)) < 1e-12, (c["label"], n, d, lib, mine)
            if cl:
                lib2 = A.audit_interval(dict(plan, pseudo=2.0), f, labels)
                mine2 = interval(plan, f, labels, FLOORS["b2"])
                assert max(abs(a - b) for a, b in zip(lib2, mine2)) < 1e-12, (c["label"], n, d, lib2, mine2)
            for nm, fl in FLOORS.items():
                _, lo, hi = interval(plan, f, labels, fl)
                res[nm].append(((hi - lo) / 2, lo <= truth <= hi, cl, False))
        except ValueError:  # a cell with fewer than two labels; counted and reported, never silently dropped
            _, lo, hi = A.audit_interval({"design": "pooled", "cells": [list(range(N))]}, f, labels)
            for nm in FLOORS:
                res[nm].append(((hi - lo) / 2, lo <= truth <= hi, cl, True))
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


def parse(path):
    by = {}
    for line in path.read_text().splitlines()[1:]:
        x = [s.strip() for s in line.split("|")]
        by[(x[0], int(x[1]), x[3])] = dict(J=float(x[2]), fresh=x[4] == "1", cov=float(x[5]), ratio=float(x[7]),
                                            adm=int(x[8]), admc=int(x[9]), err=int(x[10]))
    return by


def summary():
    by = parse(OUT)
    old = parse(HERE / "h7at_weak_admit_draws.txt")
    keys = list(dict.fromkeys((k[0], k[1]) for k in by))
    fr = [k for k in keys if by[(*k, "pooled")]["fresh"]]
    weak = [k for k in keys if by[(*k, "pooled")]["J"] < WEAK_J]
    good = [k for k in keys if by[(*k, "pooled")]["J"] >= GOOD_J]
    names = list(FLOORS)
    cands = names[1:]
    out = [f"cells run: {len(keys)} ({len(keys) - len(fr)} old, {len(fr)} fresh; {len(weak)} weak J < {WEAK_J}, "
           f"{len(good)} good J >= {GOOD_J}); errors (cell with < 2 labels): "
           f"{sum(by[(*k, nm)]['err'] for k in keys for nm in names)}"]
    same = [k for k in keys if k not in fr and all(by[(*k, r)][m] == old[(*k, r2)][m] for r, r2 in
                                                     (("t10", "t10"), ("pooled", "pooled"))
                                                     for m in ("cov", "ratio", "adm", "admc"))]
    out.append(f"P0 t10 and pooled replay 7at in {len(same)} of {len(keys) - len(fr)} old cells "
               f"(in-run library checks: asserted on every draw)")
    for k in fr:
        out.append(f"fresh {k[0]} n {k[1]} (J {by[(*k, 'pooled')]['J']:.3f}, pooled cov {by[(*k, 'pooled')]['cov']:.1f}"
                   f", cells in {by[(*k, 't10')]['adm'] / 10:.0f}%): " + ", ".join(
                       f"{nm} {by[(*k, nm)]['ratio']:.3f} cov {by[(*k, nm)]['cov']:.1f}" for nm in names))

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
    bad = adm_low("t10")
    out.append("t10's failing cells, admitted coverage by candidate: " + "; ".join(
        f"{k[0]} n {k[1]} ({a}): " + ", ".join(
            f"{nm} {100 * by[(*k, nm)]['admc'] / by[(*k, nm)]['adm']:.1f}" for nm in names) for k, a, _ in bad))
    out.append(f"P1 t10 has >= 3 such cells, all J < {WEAK_J}: {len(bad)} cells: "
               f"{'yes' if len(bad) >= 3 and all(by[(*k, 'pooled')]['J'] < WEAK_J for k, _, _ in bad) else 'no'}")
    p2 = {nm: weak_cond(nm)[0] >= 92.0 and len(adm_low(nm)) <= 1 for nm in names}
    out.append("P2 weak admitted coverage >= 92% and <= 1 cell under 88%: " + ", ".join(
        f"{nm} {'yes' if p2[nm] else 'no'}" for nm in cands))
    out.append("P3 no cell under 93% where pooled covers: " + ", ".join(
        f"{nm} {'yes' if not p3_fail(nm) else 'no'}" for nm in names))
    g0, f0, gg = gain("t10"), gain("t10", fr), gain("t10", good)
    out.append("P4 share of t10's gain kept (all / fresh / good): " + ", ".join(
        f"{nm} {gain(nm) / g0:.3f} / {gain(nm, fr) / f0 if f0 else float('nan'):.3f} / {gain(nm, good) / gg:.3f}"
        for nm in cands))
    out.append("P5 no candidate narrower than t10 in any cell: " + ", ".join(
        f"{nm} {'yes' if all(by[(*k, nm)]['ratio'] >= by[(*k, 't10')]['ratio'] - 0.001 for k in keys) else 'no'}"
        for nm in cands))
    ok = [nm for nm in cands if p2[nm] and not p3_fail(nm) and gain(nm) >= 0.9 * g0 and gain(nm, fr) >= f0 - 0.05]
    if ok:
        best = max(ok, key=gain)
        out.append(f"Decision rule: qualifying {ok}; default changes to {best}")
    else:
        out.append("Decision rule: none qualifies; default stays t10; the paper states the conditional undercoverage")
    text = "\n".join(out); print(text); (HERE / "h7au_neg_floor.txt").write_text(text + "\n")


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
