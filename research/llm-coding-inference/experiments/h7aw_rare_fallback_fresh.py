"""Milestone 7aw: with the do-no-harm clause measured against the shipped rule's own coverage and the width cost
counted only where the shipped interval is valid, does a rare-count fallback for the pooled interval qualify as the
library default, on fresh small audits at 0.5 to 2% prevalence? (7av's next step (1).)

Why. 7av found the library's pooled interval (control-variate estimate, Wilson on n_eff) invalid below about 1%
prevalence (13 of 21 such cells under 93%), and that a Wilson interval on the hand labels alone, used when the audit
holds fewer than 5 positives (w5), repaired all 21. It failed its decision rule on two counts that 7av's log calls
specification errors or reference artefacts: (a) its do-no-harm clause compared the shipped rule under w5 to *pooled*
coverage, so 1.5B anger n 2,000 (where w5 never fires and the shipped rule covers 92.3%) failed every candidate and
no fallback alike; (b) its width bar counted the "gain" of an invalid interval as a gain to keep (0.43 of w5's 0.71
lost was in three cells where the shipped interval undercovered).

This run fixes both clauses and tests on cells never used: the audit sizes where the fallback fires most often.

Candidates (each changes only the interval of a pooled plan; every cells plan, and every pooled plan that does not
trigger, keeps the library's interval). x is the number of human positives in the labels, a their number, N the
corpus (the pooled plan's single cell).
  cv    shipped: no fallback.
  w5    x < 5: Wilson on x of a (no coder, no finite-population correction). It is the library's opt-in
        `audit_interval(..., rare_fallback=5)`; asserted equal on every draw to 1e-12.
  w3    x < 3: the same, smaller trigger (cheaper; may not be valid at x = 3 or 4).
  w5f   x < 5: Wilson with the finite-population correction (Wilson on a' = a / (1 - a / N) labels; narrower at large
        a / N).
  w5k   x < 5, or the implied n_eff = p(1 - p) / se^2 of the shipped interval exceeds 3 a / (1 - a / N): a trigger
        that reads the coder. A pooled control-variate interval can legitimately reach n_eff up to a / ((1 - rho^2)
        (1 - a / N)); 3 times that means rho^2 > 2/3, far above any coder in this programme, so it fires only on a
        collapsed se.

Rules per candidate F: pooled_F (the pooled reference's draw closed by F) and t10_F (the shipped rule: pilot 0.7 n,
budget cap, tau 0.1, 3-miss guard; its pooled draws closed by F, its cells draws untouched). Same scheme, seeds and
common random numbers as 7av, so pooled_cv, t10_cv, pooled_w5 and t10_w5 replay 7av in its 117 cells.

Cells. Old: 7av's 117 (7au's 105 plus grief, pride, relief). Fresh, chosen now before any draw: the lr (naive Bayes)
coder on the eleven GoEmotions categories whose prevalence on this split lies in 0.5 to 2% (embarrassment, remorse,
desire, fear, disappointment, confusion, excitement, disgust, surprise, realization, caring; prevalences read from
7av's committed draws file, which holds those categories only at n 500 to 2,000), at n 200 and 300, never run in the
pilot-design line: 22 cells, expected human positives 1.1 to 5.9. "Rare": prevalence under 1%. 1,000 draws per cell
(+/- 1.4 points).

    python3 experiments/h7aw_rare_fallback_fresh.py draws [reps]   # -> h7aw_rare_fallback_fresh_draws.txt
    python3 experiments/h7aw_rare_fallback_fresh.py summary        # -> h7aw_rare_fallback_fresh.txt

Prediction (written and committed before any draw; a 10-draw smoke test of one cell may run first and is disclosed):
  P0  (replication) pooled_cv, t10_cv, pooled_w5 and t10_w5 equal 7av's in all 117 old cells (coverage, ratio,
      admitted, fired); the w5 library check passes on every draw.
  P1  (the defect on fresh cells) pooled_cv covers under 93% in at least 8 of the 11 fresh n 200 cells and at least 4
      of the 11 n 300 cells (at n 200 and 1% prevalence about 13% of audits hold no positive).
  P2  (decisive, validity) under F, pooled_F and t10_F cover 93% or more in every rare cell (prevalence < 1%) and
      every fresh cell. Guess: w5 and w5k meet it; w5f meets it or misses one cell by under 1.5 points (grief n 2,000,
      where a / N is largest); w3 fails at 2 or more cells.
  P3  (do no harm, corrected) in every cell where t10_cv covers 93% or more, t10_F does too; in every cell where
      pooled_cv covers 93% or more, pooled_F does too. Guess: every candidate meets it.
  P4  (cost, corrected) over the cells where t10_cv covers 93% or more (old and fresh), t10_F keeps at least 95% of
      t10_cv's summed gain (sum of 1 - ratio to pooled_cv). Disclosed: the 95% bar was set after seeing 7av, where w5
      kept about 96% of the gain in cells where the shipped interval was valid; on the old cells it is therefore not a
      test, and it is the fresh cells (where t10_cv's validity and gain are unknown) that can fail it. Guess: w5 96 to
      98%, w5k within 0.2 points of w5, w5f 0.5 to 1.5 points above w5, w3 98%+.
  Decision rule, fixed now. A candidate qualifies if it meets P2, P3 and P4. If any qualifies, the one keeping the
  most gain in P4 becomes the library default for pooled plans (`audit_interval`'s `rare_fallback` default changes;
  every earlier script that calls `audit_interval` is pinned to no fallback so it replays). If none qualifies, the
  default stays off and the paper says so with these numbers.
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
import h7au_neg_floor as U  # noqa: E402
import h7av_rare_fallback as V  # noqa: E402

FRESH = ("embarrassment", "remorse", "desire", "fear", "disappointment", "confusion", "excitement", "disgust",
         "surprise", "realization", "caring")  # chosen before any draw
FRESH_NS = (200, 300)
SHARE = V.SHARE
Z = V.Z
FALLBACKS = {"cv": None, "w5": ("w", 5), "w3": ("w", 3), "w5f": ("wf", 5), "w5k": ("wk", 5)}
RULES = [f"{base}_{nm}" for nm in FALLBACKS for base in ("pooled", "t10")]
RARE = 0.01
K = 3.0
OUT = HERE / "h7aw_rare_fallback_fresh_draws.txt"
HEAD = ("cell | n | J | prevalence | rule | fresh | coverage % | half-width pts | ratio to pooled_cv | "
        "admitted draws | fallback draws | errors")


def pooled_neff(f_all, labels):
    """n_eff = p(1 - p) / se^2 of the library's pooled interval (single cell = the corpus), as `audit_interval`."""
    N = len(f_all)
    idx = list(labels)
    y = [labels[i] for i in idx]; f = [f_all[i] for i in idx]
    a = len(y)
    mf = sum(f) / a; my = sum(y) / a
    vf = sum((v - mf) ** 2 for v in f) / (a - 1)
    lam = 0.0 if vf == 0 else min(1.0, max(0.0, sum((u - my) * (v - mf) for u, v in zip(y, f)) / (a - 1) / vf))
    r = [u - lam * v for u, v in zip(y, f)]
    mr = sum(r) / a
    v = sum((x - mr) ** 2 for x in r) / (a - 1)
    var = (1 - a / N) * v / a
    value = lam * sum(f_all) / N + mr
    p = min(0.9995, max(0.0005, value))
    return p * (1 - p) / max(math.sqrt(var), 1e-9) ** 2


def fallback(plan, f_all, labels, fb):
    est, lo, hi = A.audit_interval(plan, f_all, labels)
    if fb is None or plan["design"] != "pooled":
        return est, lo, hi, False
    kind, m = fb
    y = [labels[i] for i in plan["cells"][0] if i in labels]
    x, a = sum(y), len(y)
    N = len(plan["cells"][0])
    fire = x < m
    if kind == "wk" and not fire:
        fire = pooled_neff(f_all, labels) > K * a / (1 - a / N)
    if not fire:
        return est, lo, hi, False
    if kind == "wf":
        l2, h2 = V.wilson_labels(x, a)  # reused for x / a; replaced below by the corrected size
        a2 = a / (1 - a / N) if a < N else 1e12
        p, z2 = x / a, Z * Z
        d = 1 + z2 / a2
        mid = (p + z2 / (2 * a2)) / d
        half = Z * math.sqrt(p * (1 - p) / a2 + z2 / (4 * a2 * a2)) / d
        l2, h2 = max(0.0, mid - half), min(1.0, mid + half)
    else:
        l2, h2 = V.wilson_labels(x, a)
        if kind == "w" and m == 5:
            lib = A.audit_interval(plan, f_all, labels, rare_fallback=5)
            assert abs(lib[1] - l2) < 1e-12 and abs(lib[2] - h2) < 1e-12, (lib, l2, h2)
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
        for n in FRESH_NS:
            yield dict(part="goemo", label=f"lr {cat}", n=n, h=h, f=f, J=A.informedness(h, f), seed=H.GO_SEED,
                       prev=sum(h) / len(h), fresh=True)


def cells():
    for c in V.cells():
        yield dict(c, fresh=False)
    yield from fresh_cells()


def run(c, reps):
    """Same scheme and seeds as `h7av_rare_fallback.run`."""
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


def summary():
    by = V.parse(OUT)
    old = V.parse(HERE / "h7av_rare_fallback_draws.txt")
    keys = list(dict.fromkeys((k[0], k[1]) for k in by))
    fr = [k for k in keys if by[(*k, "pooled_cv")]["fresh"]]
    olds = [k for k in keys if k not in fr]
    rare = [k for k in keys if by[(*k, "pooled_cv")]["prev"] < RARE]
    cands = [nm for nm in FALLBACKS if nm != "cv"]
    out = [f"cells run: {len(keys)} ({len(olds)} old, {len(fr)} fresh; {len(rare)} rare, prevalence < {RARE}); "
           f"errors (cell with < 2 labels): {sum(by[(*k, r)]['err'] for k in keys for r in RULES)}"]
    same = [k for k in olds if all(by[(*k, r)][m] == old[(*k, r)][m] for r in ("t10_cv", "pooled_cv", "t10_w5",
                                                                              "pooled_w5")
                                   for m in ("cov", "ratio", "adm", "fired"))]
    out.append(f"P0 four rules replay 7av in {len(same)} of {len(olds)} old cells (w5 library check asserted on every "
               f"draw)")
    for k in fr + [k for k in rare if k not in fr]:
        p = by[(*k, "pooled_cv")]
        out.append(f"{'fresh' if k in fr else 'rare'} {k[0]} n {k[1]} (prev {100 * p['prev']:.2f}%, J {p['J']:.3f}, "
                   f"expected positives {p['prev'] * k[1]:.1f}, t10 cells in {by[(*k, 't10_cv')]['adm'] / 10:.0f}%): "
                   + ", ".join(f"{nm} cov {by[(*k, 'pooled_' + nm)]['cov']:.1f}/{by[(*k, 't10_' + nm)]['cov']:.1f} "
                               f"ratio {by[(*k, 't10_' + nm)]['ratio']:.3f} fired {by[(*k, 't10_' + nm)]['fired']}"
                               for nm in FALLBACKS))
    f200 = [k for k in fr if k[1] == 200 and by[(*k, "pooled_cv")]["cov"] < 93.0]
    f300 = [k for k in fr if k[1] == 300 and by[(*k, "pooled_cv")]["cov"] < 93.0]
    out.append(f"P1 pooled_cv under 93% in {len(f200)} of 11 fresh n 200 cells and {len(f300)} of 11 n 300: "
               f"{'yes' if len(f200) >= 8 and len(f300) >= 4 else 'no'}")

    target = sorted(set(rare) | set(fr), key=keys.index)

    def p2_fail(nm):
        return [(k, b, by[(*k, f'{b}_{nm}')]['cov']) for k in target for b in ("pooled", "t10")
                if by[(*k, f'{b}_{nm}')]['cov'] < 93.0]

    def p3_fail(nm):
        return [(k, b, by[(*k, f'{b}_{nm}')]['cov']) for k in keys for b in ("pooled", "t10")
                if by[(*k, f'{b}_cv')]["cov"] >= 93.0 and by[(*k, f'{b}_{nm}')]['cov'] < 93.0]

    valid = [k for k in keys if by[(*k, "t10_cv")]["cov"] >= 93.0]

    def gain(r, ks):
        return sum(1 - by[(*k, r)]["ratio"] for k in ks)

    g0 = gain("t10_cv", valid)
    vf = [k for k in valid if k in fr]
    out.append(f"P4 reference: t10_cv covers 93%+ in {len(valid)} of {len(keys)} cells ({len(vf)} of {len(fr)} "
               f"fresh); summed gain there {g0:.3f} (fresh {gain('t10_cv', vf):.3f})")
    common = [k for k in keys if by[(*k, "pooled_cv")]["prev"] >= 0.03]
    kept = {}
    for nm in FALLBACKS:
        kept[nm] = gain('t10_' + nm, valid) / g0
        out.append(f"{nm}: validity failures (P2) {p2_fail(nm)}; do-no-harm failures (P3) {p3_fail(nm)}; gain kept "
                   f"in valid cells {gain('t10_' + nm, valid):.3f} ({kept[nm]:.4f}; fresh {gain('t10_' + nm, vf):.3f}); "
                   f"fired max in common cells (prev >= 3%) {max(by[(*k, 't10_' + nm)]['fired'] for k in common)} of "
                   f"1000; mean ratio over rare and fresh cells "
                   f"{sum(by[(*k, 't10_' + nm)]['ratio'] for k in target) / len(target):.3f}")
    out.append("P2 every rare and fresh cell 93%+: " + ", ".join(
        f"{nm} {'yes' if not p2_fail(nm) else 'no'}" for nm in cands))
    out.append("P3 no harm: " + ", ".join(f"{nm} {'yes' if not p3_fail(nm) else 'no'}" for nm in cands))
    out.append("P4 95%+ of gain kept in valid cells: " + ", ".join(
        f"{nm} {'yes' if kept[nm] >= 0.95 else 'no'}" for nm in cands))
    ok = [nm for nm in cands if not p2_fail(nm) and not p3_fail(nm) and kept[nm] >= 0.95]
    if ok:
        best = max(ok, key=lambda nm: kept[nm])
        out.append(f"Decision rule: qualifying {ok}; library default for pooled plans changes to {best}")
    else:
        out.append("Decision rule: none qualifies; default stays off")
    text = "\n".join(out); print(text); (HERE / "h7aw_rare_fallback_fresh.txt").write_text(text + "\n")


def main():
    mode = ARGS[0] if ARGS else "summary"
    if mode == "summary":
        summary()
    elif mode == "smoke":
        c = list(fresh_cells())[0]
        print("\n".join(one_cell((c, int(ARGS[1]) if len(ARGS) > 1 else 10))))
    else:
        draws(int(ARGS[1]) if len(ARGS) > 1 else 1000)


if __name__ == "__main__":
    main()
