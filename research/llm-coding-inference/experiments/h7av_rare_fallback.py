"""Milestone 7av: when the audit holds only a handful of human positives, does a rare-count fallback make the pooled
interval valid again, at no cost where the category is common? (7at's next step (2), 7au's next step (2).)

Why. `audit_interval` closes a pooled plan with the control-variate estimate and a Wilson interval on
n_eff = p(1 - p) / se^2. With a handful of positives in the audit, se is estimated from those few and can collapse
(no positive: se 0, n_eff huge, an interval pinned near 0). 7at's side finding: lr nervousness (0.28%, J -0.008) makes
the pooled reference itself cover 72.1% at n 500 and 90.2% at n 1,000 (96.9% at n 2,000); the shipped rule is pooled
there in every draw, so it inherits that. The programme's 4b finding (`rare_coverage.py`, simulated) was the same
defect for the stratified interval at 1 to 3% prevalence.

Candidates. Each changes only the interval of a pooled plan, and only when the audit's labelled items hold fewer
than m human positives (x < m); otherwise, and for every cells plan, the library's interval is used unchanged.
Every candidate reuses the shipped rule's plan and labels (common random numbers); in a pooled draw those labels
are the whole simple random sample, the same as the pooled reference's.
  cv     shipped: no fallback (the library's `audit_interval`).
  w5     x < 5: Wilson score interval on the labels alone (x of a, no coder, no finite-population correction), point
         estimate unchanged.
  w10    the same with m = 10.
  cp5    x < 5: Clopper-Pearson exact interval on the labels alone.
  h5     x < 5: the hull (union) of the shipped interval and w5's.
Implemented here (`fallback`), no library change before the run. In-run check: with no fallback the interval equals
the library's `audit_interval` to 1e-12 on every draw.

Rules reported per candidate F: pooled_F (the pooled reference's draw, closed by F) and t10_F (the shipped rule: pilot
0.7 n, budget cap, tau 0.1, 3-miss guard; its pooled draws closed by F, its cells draws untouched).

Cells. Old: 7au's 105 (7at's 87 plus 7au's 18 fresh), same seeds and scheme, so pooled_cv and t10_cv replay 7au's
pooled and t10. Fresh: the lr (NB) coder on grief, pride and relief, the three GoEmotions categories 7at left out as
too rare before any draw (under 0.5% by its pre-run belief; no coder statistic, count or draw for them has been read
in the pilot-design line; they are in `rare_audit.py`, run on another split and question), n 200 / 500 / 1,000 /
2,000; 12 cells, chosen now. "Rare": true corpus prevalence under 1%. 1,000 draws per cell (+/- 1.4 points).

Measures per (cell, rule): coverage; ratio of mean half-width to pooled_cv; draws where the fallback fired.

    python3 experiments/h7av_rare_fallback.py draws [reps]   # -> h7av_rare_fallback_draws.txt
    python3 experiments/h7av_rare_fallback.py summary        # predictions and decision rule -> h7av_rare_fallback.txt

Prediction (written and committed before any draw; a 10-draw smoke test of one cell may run first and is disclosed):
  P0  (replication) pooled_cv and t10_cv equal 7au's pooled and t10 (coverage, ratio, admitted draws) in all 105 old
      cells, and the in-run library check passes on every draw.
  P1  the defect: pooled_cv covers under 93% in at least 3 rare cells (lr nervousness n 500 and n 1,000 among them,
      as in 7at), and in at least 2 of the 12 fresh cells. The misses lie mostly in draws with x <= 1.
  P2  (decisive, validity) under a candidate, pooled_F and t10_F cover 93% or more in every rare cell. Guess: cp5
      meets it (exact, and conservative without the finite-population correction), w5 and h5 meet it or miss one cell
      by under 2 points (Wilson under-covers near x = 1 at tiny n p), w10 meets it.
  P3  (do no harm) in every cell where pooled_cv covers 93% or more, pooled_F and t10_F do too; and t10_F keeps 98% or
      more of t10_cv's total gain (sum of 1 - ratio to pooled_cv) over the 105 old cells. Guess: the fallback fires in
      under 1% of draws in every cell with prevalence of 3% or more, and the gain kept is 99.5%+ for every candidate.
  P4  width: in the rare cells where pooled_cv fails P2, the candidates' ratio to pooled_cv is 1.2 to 3.0 (the
      shipped interval is too narrow there), ordered w5 <= h5 <= w10 and w5 < cp5.
  Decision rule, fixed now. A candidate qualifies if it meets P2 and P3. If any qualifies, the one with the smallest
  mean ratio (pooled_F) over the rare cells becomes the library default for pooled plans (`audit_interval` gains a
  `RARE_FALLBACK` setting; every earlier script that calls `audit_interval` is pinned to none so it replays). If none
  qualifies, the default stays cv and the paper states the rare-count limitation with these numbers.
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
import h7au_neg_floor as U  # noqa: E402

FRESH = ("grief", "pride", "relief")  # chosen before any draw
NS = (200, 500, 1000, 2000)
SHARE = 0.7
Z = 1.959964
FALLBACKS = {"cv": None, "w5": ("wilson", 5), "w10": ("wilson", 10), "cp5": ("cp", 5), "h5": ("hull", 5)}
RULES = [f"{base}_{nm}" for nm in FALLBACKS for base in ("pooled", "t10")]
RARE = 0.01
OUT = HERE / "h7av_rare_fallback_draws.txt"
HEAD = ("cell | n | J | prevalence | rule | fresh | coverage % | half-width pts | ratio to pooled_cv | "
        "admitted draws | fallback draws | errors")


def wilson_labels(x, a, z=Z):
    p, z2 = x / a, z * z
    d = 1 + z2 / a
    mid = (p + z2 / (2 * a)) / d
    half = z * math.sqrt(p * (1 - p) / a + z2 / (4 * a * a)) / d
    return max(0.0, mid - half), min(1.0, mid + half)


def _binom_cdf(x, a, p):
    """P(X <= x), X ~ Binomial(a, p), summed in log space."""
    if p <= 0:
        return 1.0
    if p >= 1:
        return 1.0 if x >= a else 0.0
    lp, lq = math.log(p), math.log1p(-p)
    tot = 0.0
    for k in range(x + 1):
        tot += math.exp(math.lgamma(a + 1) - math.lgamma(k + 1) - math.lgamma(a - k + 1) + k * lp + (a - k) * lq)
    return min(1.0, tot)


def clopper_pearson(x, a, level=0.95):
    al = (1 - level) / 2

    def solve(g):  # g increasing in p from negative to positive
        lo, hi = 0.0, 1.0
        for _ in range(80):
            mid = (lo + hi) / 2
            if g(mid) < 0:
                lo = mid
            else:
                hi = mid
        return (lo + hi) / 2
    lower = 0.0 if x == 0 else solve(lambda p: (1 - _binom_cdf(x - 1, a, p)) - al)
    upper = 1.0 if x == a else solve(lambda p: al - _binom_cdf(x, a, p))
    return lower, upper


def fallback(plan, f_all, labels, fb):
    """(estimate, low, high, fired): the library interval, replaced or widened for a pooled plan whose labels hold
    fewer than m positives."""
    est, lo, hi = A.audit_interval(plan, f_all, labels)
    if fb is None or plan["design"] != "pooled":
        return est, lo, hi, False
    kind, m = fb
    y = [labels[i] for i in plan["cells"][0] if i in labels]
    x, a = sum(y), len(y)
    if x >= m:
        return est, lo, hi, False
    if kind == "cp":
        l2, h2 = clopper_pearson(x, a)
    else:
        l2, h2 = wilson_labels(x, a)
        if kind == "hull":
            l2, h2 = min(lo, l2), max(hi, h2)
    return est, l2, h2, True


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
        yield dict(c, fresh=False, prev=sum(c["h"]) / len(c["h"]))
    yield from fresh_cells()


def run(c, reps):
    """Same scheme and seeds as `h7au_neg_floor.run`."""
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
        for nm, fb in FALLBACKS.items():
            _, lo, hi, fired = fallback(plan, f, labels, fb)
            res[f"pooled_{nm}"].append(((hi - lo) / 2, lo <= truth <= hi, False, fired, False))
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
            mine = U.interval(plan, f, labels, None) if cl else lib
            assert max(abs(a - b) for a, b in zip(lib, mine)) < 1e-12, (c["label"], n, d, lib, mine)
            for nm, fb in FALLBACKS.items():
                _, lo, hi, fired = fallback(plan, f, labels, fb)
                res[f"t10_{nm}"].append(((hi - lo) / 2, lo <= truth <= hi, cl, fired, False))
        except ValueError:  # a cell with fewer than two labels; counted and reported, never silently dropped
            pp = {"design": "pooled", "cells": [list(range(N))]}
            for nm, fb in FALLBACKS.items():
                _, lo, hi, fired = fallback(pp, f, labels, fb)
                res[f"t10_{nm}"].append(((hi - lo) / 2, lo <= truth <= hi, cl, fired, True))
    return res


def one_cell(args):
    c, reps = args
    res = run(c, reps)
    ref = sum(x[0] for x in res["pooled_cv"]) / reps
    lines = []
    for name in RULES:
        r = res[name]
        w = sum(x[0] for x in r) / reps
        lines.append(f"{c['label']} | {c['n']} | {c['J']:.3f} | {c['prev']:.5f} | {name} | {int(c['fresh'])} | "
                     f"{100 * sum(x[1] for x in r) / reps:.1f} | {100 * w:.3f} | {w / ref:.3f} | "
                     f"{sum(x[2] for x in r)} | {sum(x[3] for x in r)} | {sum(x[4] for x in r)}")
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
        by[(x[0], int(x[1]), x[4])] = dict(J=float(x[2]), prev=float(x[3]), fresh=x[5] == "1", cov=float(x[6]),
                                            ratio=float(x[8]), adm=int(x[9]), fired=int(x[10]), err=int(x[11]))
    return by


def summary():
    by = parse(OUT)
    old = U.parse(HERE / "h7au_neg_floor_draws.txt")
    keys = list(dict.fromkeys((k[0], k[1]) for k in by))
    fr = [k for k in keys if by[(*k, "pooled_cv")]["fresh"]]
    olds = [k for k in keys if k not in fr]
    rare = [k for k in keys if by[(*k, "pooled_cv")]["prev"] < RARE]
    cands = [nm for nm in FALLBACKS if nm != "cv"]
    out = [f"cells run: {len(keys)} ({len(olds)} old, {len(fr)} fresh; {len(rare)} rare, prevalence < {RARE}); "
           f"errors (cell with < 2 labels): {sum(by[(*k, r)]['err'] for k in keys for r in RULES)}"]
    same = [k for k in olds if all(by[(*k, r)][m] == old[(*k, r2)][m] for r, r2 in
                                   (("t10_cv", "t10"), ("pooled_cv", "pooled")) for m in ("cov", "ratio", "adm"))]
    out.append(f"P0 pooled_cv and t10_cv replay 7au in {len(same)} of {len(olds)} old cells "
               f"(in-run library check: asserted on every draw)")
    for k in rare:
        p = by[(*k, "pooled_cv")]
        out.append(f"rare {k[0]} n {k[1]} (prev {100 * p['prev']:.2f}%, J {p['J']:.3f}, expected positives "
                   f"{p['prev'] * k[1]:.1f}, t10 cells in {by[(*k, 't10_cv')]['adm'] / 10:.0f}%): " + ", ".join(
                       f"{nm} cov {by[(*k, 'pooled_' + nm)]['cov']:.1f}/{by[(*k, 't10_' + nm)]['cov']:.1f} ratio "
                       f"{by[(*k, 'pooled_' + nm)]['ratio']:.3f} fired {by[(*k, 'pooled_' + nm)]['fired']}"
                       for nm in FALLBACKS))
    p1 = [k for k in rare if by[(*k, "pooled_cv")]["cov"] < 93.0]
    p1f = [k for k in p1 if k in fr]
    nerv = all(by[(*k, "pooled_cv")]["cov"] < 93.0 for k in (("lr nervousness", 500), ("lr nervousness", 1000)))
    out.append(f"P1 pooled_cv under 93% in {len(p1)} rare cells ({len(p1f)} fresh; nervousness n 500 and 1,000 "
               f"both: {'yes' if nerv else 'no'}): {'yes' if len(p1) >= 3 and len(p1f) >= 2 and nerv else 'no'}: "
               f"{[(k, by[(*k, 'pooled_cv')]['cov']) for k in p1]}")

    def p2_fail(nm):
        return [(k, b, by[(*k, f'{b}_{nm}')]['cov']) for k in rare for b in ("pooled", "t10")
                if by[(*k, f'{b}_{nm}')]['cov'] < 93.0]

    def p3_fail(nm):
        return [(k, b, by[(*k, f'{b}_{nm}')]['cov']) for k in keys for b in ("pooled", "t10")
                if by[(*k, "pooled_cv")]["cov"] >= 93.0 and by[(*k, f'{b}_{nm}')]['cov'] < 93.0]

    def gain(r, ks=olds):
        return sum(1 - by[(*k, r)]["ratio"] for k in ks)

    g0 = gain("t10_cv")
    common = [k for k in keys if by[(*k, "pooled_cv")]["prev"] >= 0.03]
    for nm in FALLBACKS:
        out.append(f"{nm}: rare-cell failures (P2) {p2_fail(nm)}; do-no-harm failures {p3_fail(nm)}; t10 gain over "
                   f"old cells {gain('t10_' + nm):.3f} ({gain('t10_' + nm) / g0:.4f} of cv); fired in common cells "
                   f"(prev >= 3%) max {max(by[(*k, 'pooled_' + nm)]['fired'] for k in common)} of 1000; mean rare "
                   f"ratio {sum(by[(*k, 'pooled_' + nm)]['ratio'] for k in rare) / len(rare):.3f}")
    out.append("P2 every rare cell 93%+ (pooled_F and t10_F): " + ", ".join(
        f"{nm} {'yes' if not p2_fail(nm) else 'no'}" for nm in cands))
    out.append("P3 no harm and 98%+ of t10 gain kept: " + ", ".join(
        f"{nm} {'yes' if not p3_fail(nm) and gain('t10_' + nm) >= 0.98 * g0 else 'no'}" for nm in cands))
    if p1:
        out.append("P4 ratio to pooled_cv in the rare cells pooled_cv fails: " + "; ".join(
            f"{k[0]} n {k[1]}: " + ", ".join(f"{nm} {by[(*k, 'pooled_' + nm)]['ratio']:.3f}" for nm in cands)
            for k in p1))
    ok = [nm for nm in cands if not p2_fail(nm) and not p3_fail(nm) and gain("t10_" + nm) >= 0.98 * g0]
    if ok:
        best = min(ok, key=lambda nm: sum(by[(*k, 'pooled_' + nm)]['ratio'] for k in rare))
        out.append(f"Decision rule: qualifying {ok}; library default for pooled plans changes to {best}")
    else:
        out.append("Decision rule: none qualifies; default stays cv; the paper states the rare-count limitation")
    text = "\n".join(out); print(text); (HERE / "h7av_rare_fallback.txt").write_text(text + "\n")


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
