"""Milestone 7bh: just above the rare-count trigger the shipped interval misses on its high tail (7bg: an audit of 200
that happens to hold 7 or more positives at a 2% truth puts the control-variate lower bound above the truth). Does
taking the hull of the shipped interval and an exact interval on the labels, only while the audit's positive count is
small, close that gap on fresh cells at a cost 7bf's absolute bar allows? (7bg's next step (1).)

Why. 7bg found every exact band on 3 or 4 positives fails, because the misses are not there: by audit count x, w3
covers 99.9% at x 3 and 99.7% at x 4 but 92.3% at x 7, 84.7% at x 8, 69.1% at x 9 and 42.5% at x 10+ (pooled over
34 near-trigger cells). An exact interval on the labels has its own lower bound well below the control-variate one
when x is small and the coder is good, so the hull widens the interval exactly in the draws that miss. Gating on the
observed count x (not on n, which a user can always raise) keeps it a rare-count rule like w3: at high counts the
label interval is never consulted. The candidate is mid-p, 7bg's cheap exact band (an eighth of Clopper-Pearson's
cost there), hulled for 3 <= x < 10.

Cells (chosen now, before any draw; fresh thinning seed THIN_SEED, new to the line). GoEmotions test part (6,683
comments, the split of `group_shift_reddit`), coder code = score > 0, positives thinned at random to p, every negative
kept, cells at 3 to 5 expected positives:
  n 200 at p 0.015, 0.02, 0.025 (3, 4, 5 expected) and n 300 at p 0.01, 0.015 (3, 4.5 expected),
  Qwen2.5-1.5B-Instruct: admiration, curiosity, disapproval, gratitude, neutral at p 0.01 to 0.025 (5 cells each);
  anger and sadness at p 0.01 to 0.02 (4 each); fear at p 0.01 (n 300 only): 34 cells.
  Qwen2.5-0.5B-Instruct: fear 0.01 (n 300); sadness 0.01, 0.015, 0.02 (4 cells): 5 cells. 39 cells, 2,000 draws each
  (+/- 1.0 point at 95%). Positive counts per category were read in 7bg (labels only); coder J is printed by the run,
  not read before it. Disclosed: the 1.5B anger and sadness corpora at p 0.02 keep 133 of 154 positives, so whatever
  the seed they are near-replications of 7bf's and 7bg's cells; the other corpora are re-thinned with a new seed.

Rules and scheme: exactly 7aw's to 7bg's (`h7aw_rare_fallback_fresh.run`: pooled_F and t10_F), fallback F in:
  cv     no fallback (the bare control-variate interval)
  w3     the library default: Wilson on the labels when x < 3 (asserted equal to `audit_interval(rare_fallback=3)` on
         every draw)
  hm10   (the candidate) w3, and for 3 <= x < 10 the hull of the shipped interval and the mid-p interval on the labels
  hml10  (secondary) w3, and for 3 <= x < 10 only the lower bound is lowered to the mid-p lower bound (the misses are
         lower bounds above the truth, so this is the cheapest fix of the high tail)
  hc10   (secondary) as hm10 with Clopper-Pearson in place of mid-p
  hm15   (secondary) as hm10 for 3 <= x < 15
x = human positives among the pooled plan's labels, as in every earlier fallback; the point estimate is unchanged; the
rules touch pooled plans only (a cells plan in t10 is never changed).

    python3 experiments/h7bh_high_tail_hull.py draws [reps]   # -> h7bh_high_tail_hull_draws.txt
    python3 experiments/h7bh_high_tail_hull.py byx [reps]     # -> h7bh_high_tail_hull_byx.txt (diagnostic, per cell)
    python3 experiments/h7bh_high_tail_hull.py summary        # -> h7bh_high_tail_hull.txt
    python3 experiments/h7bh_high_tail_hull.py smoke [reps]   # first cell only, printed

Prediction (written and committed before any draw; a 10-draw smoke test of one cell may run first and is disclosed):
  P1  (the gap replicates on fresh cells) pooled_w3 or t10_w3 covers under 93% in at least 2 of the 39 cells.
      Guess: 2 to 6, all at n 200.
  P2  (decisive, validity) pooled_hm10 and t10_hm10 cover 93% or more in all 39 cells.
  P3  (do no harm) wherever w3 covers 93% or more (pooled and t10 separately), hm10 does too (a hull can only widen,
      so a failure here would be a bug).
  P4  (cost, 7bf's absolute bar, against w3) over the cells where t10_w3 covers 93% or more:
      P4a mean (t10_hm10 ratio - t10_w3 ratio) at most 0.010; P4b no such cell above 0.050 (ratios to pooled_cv's
      mean half-width). Guess: P4a fails narrowly (mean 0.008 to 0.025), largest in the high-J cells (gratitude,
      admiration), where the control-variate interval is far narrower than any interval on the labels.
  P5  (secondary, decides nothing) hml10 meets P2 and P3 at about half hm10's cost; hc10 costs more than hm10 in every
      cell; hm15 covers at least as well as hm10 and costs more.
  Diagnostic (planned now, decides nothing): `byx` replays the pooled draws of every cell and prints, per cell and
  pooled, the coverage of w3 and hm10 by x (0 to 14, 15+), the per-cell table 7bg asked for.
  Decision rule, fixed now.
    (a) P2, P3 and P4 hold -> the library gains `rare_hull` (mid-p hull for 3 <= x < 10 on a pooled plan), on by
        default, in this PR; every earlier script pins it off, and the paper states it.
    (b) P2 and P3 hold, P4 fails -> the default stays w3; the paper states the price of closing the gap; if hml10
        meets P2, P3 and P4 it is named the candidate for the next fresh check (not adopted on these draws).
    (c) P1 fails (w3 93%+ in all but at most one cell) -> the default stays w3 and 7bg's misses are read as noise.
    (d) hm10 fails P2 -> the default stays w3; the paper states the hull does not reach the line and the diagnostic
        says which counts still miss.
"""
import functools
import random
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))
from llmci import audit_design as A  # noqa: E402
import h7aw_rare_fallback_fresh as W  # noqa: E402  (pins A.RARE_FALLBACK = None, as every earlier script)
import h7av_rare_fallback as V  # noqa: E402
import h7bg_small_count_band as G  # noqa: E402  (mid_p, scores; it sets W's globals, which are reset below)

PS = {"admiration": (0.01, 0.015, 0.02, 0.025), "curiosity": (0.01, 0.015, 0.02, 0.025),
      "disapproval": (0.01, 0.015, 0.02, 0.025), "gratitude": (0.01, 0.015, 0.02, 0.025),
      "neutral": (0.01, 0.015, 0.02, 0.025), "anger": (0.01, 0.015, 0.02), "sadness": (0.01, 0.015, 0.02),
      "fear": (0.01,)}
CORPORA = [("Qwen2.5-1.5B-Instruct", c, p) for c in sorted(PS) for p in PS[c]] + \
    [("Qwen2.5-0.5B-Instruct", "fear", 0.01)] + [("Qwen2.5-0.5B-Instruct", "sadness", p) for p in (0.01, 0.015, 0.02)]
NS_BY_P = {0.01: (300,), 0.015: (200, 300), 0.02: (200,), 0.025: (200,)}
THIN_SEED = 20261201
SEED = 20261202
OUT = HERE / "h7bh_high_tail_hull_draws.txt"
BYX = HERE / "h7bh_high_tail_hull_byx.txt"
SUMMARY = HERE / "h7bh_high_tail_hull.txt"
ABS_MEAN, ABS_MAX = 0.010, 0.050
CATS = "admiration anger curiosity disapproval fear gratitude neutral sadness".split()

# ("hull", top, kind, lower_only): w3's Wilson when x < 3; for 3 <= x < top the exact interval `kind` on the labels is
# hulled with the shipped one (lower bound only when lower_only).
FALLBACKS = {"cv": None, "w3": ("hull", 3, None, False), "hm10": ("hull", 10, "midp", False),
             "hml10": ("hull", 10, "midp", True), "hc10": ("hull", 10, "cp", False), "hm15": ("hull", 15, "midp", False)}
RULES = [f"{base}_{nm}" for nm in FALLBACKS for base in ("pooled", "t10")]


@functools.lru_cache(maxsize=None)
def exact(x, a, kind):
    return V.clopper_pearson(x, a) if kind == "cp" else G.mid_p(x, a)


def hull_interval(x, a, lo, hi, fb):
    """(low, high, fired) for x positives of a labels and the shipped (lo, hi)."""
    _, top, kind, lower_only = fb
    if x < 3:
        l2, h2 = V.wilson_labels(x, a)
        return l2, h2, True
    if x < top:
        el, eh = exact(x, a, kind)
        l2, h2 = min(lo, el), (hi if lower_only else max(hi, eh))
        return l2, h2, (l2, h2) != (lo, hi)
    return lo, hi, False


def fallback(plan, f_all, labels, fb):
    est, lo, hi = A.audit_interval(plan, f_all, labels)  # A.RARE_FALLBACK is None here (pinned by h7aw's import)
    if fb is None or plan["design"] != "pooled":
        return est, lo, hi, False
    y = [labels[i] for i in plan["cells"][0] if i in labels]
    l2, h2, fired = hull_interval(sum(y), len(y), lo, hi, fb)
    if fb == FALLBACKS["w3"]:
        lib = A.audit_interval(plan, f_all, labels, rare_fallback=3)
        assert abs(lib[1] - l2) < 1e-12 and abs(lib[2] - h2) < 1e-12, (lib, l2, h2)
    return est, l2, h2, fired


# W.run and W.one_cell read these module globals at call time; Pool forks after this, so workers see the same set.
W.FALLBACKS, W.RULES, W.fallback = FALLBACKS, RULES, fallback


def cells():
    import group_shift_reddit as R
    import h6r_rare_pilot as P
    k, cache = 0, {}
    for model, cat, p in CORPORA:
        if cat not in cache:
            rows = P.load(cat)
            rng = random.Random(R.SPLIT_SEED); order = list(range(len(rows))); rng.shuffle(order)
            cache[cat] = [rows[i] for i in order[int(R.TRAIN_SHARE * len(rows)):]]
        test = cache[cat]
        sc = G.scores(model, cat, len(test))
        zeros = [i for i in range(len(test)) if test[i][2] == 0]
        ones = [i for i in range(len(test)) if test[i][2] == 1]
        m = round(p / (1 - p) * len(zeros))
        assert m <= len(ones), (cat, p, m, len(ones))
        rs = random.Random(THIN_SEED + int(p * 1e4) + 7 * CATS.index(cat) + 1000 * ("0.5B" in model))
        keep = sorted(zeros + rs.sample(ones, m))
        h = [test[i][2] for i in keep]
        f = [int(sc[i] > 0) for i in keep]
        tag = "q15" if "1.5B" in model else "q05"
        for n in NS_BY_P[p]:
            k += 1
            yield dict(label=f"{tag} {cat} p{p}", n=n, h=h, f=f, J=A.informedness(h, f), prev=sum(h) / len(h),
                       fresh=True, seed=SEED + 101 * k, N=len(h))


def draws(reps):
    cs = list(cells())
    seen = set()
    for c in cs:
        if c["label"] not in seen:
            seen.add(c["label"])
            print(f"{c['label']}: N {c['N']}, positives {sum(c['h'])}, prevalence {c['prev']:.5f}, J {c['J']:.3f}",
                  flush=True)
    with Pool(4) as p:
        got = p.map(W.one_cell, [(c, reps) for c in cs], chunksize=1)
    OUT.write_text("\n".join([W.HEAD] + [l for g in got for l in g]) + "\n")


BYX_RULES = ("w3", "hm10")


def byx_cell(args):
    """The pooled half of `W.run` for one cell (same seeds), coverage tallied by x for w3 and hm10."""
    c, reps = args
    h, f, n = c["h"], c["f"], c["n"]
    N, truth = len(h), sum(h) / len(h)
    rr = random.Random(c["seed"] + 13)
    srs = [rr.sample(range(N), n) for _ in range(reps)]
    tally = {}
    for d in range(reps):
        labels = {i: h[i] for i in srs[d]}
        plan = A.plan_audit(f, labels, n, tau=2.0, neg_guard=0)
        x = min(15, sum(labels.values()))
        t = tally.setdefault(x, [0] * (1 + len(BYX_RULES)))
        t[0] += 1
        for j, nm in enumerate(BYX_RULES):
            _, lo, hi, _ = fallback(plan, f, labels, FALLBACKS[nm])
            t[j + 1] += lo <= truth <= hi
    return tally


def byx(reps):
    cs = list(cells())
    with Pool(4) as p:
        got = p.map(byx_cell, [(c, reps) for c in cs], chunksize=1)
    by = V.parse(OUT)
    out = [f"pooled draws by human positives x in the audit (15 = 15 or more), {reps} draws per cell; "
           f"x: draws, w3 cov %, hm10 cov %"]
    tot = {}
    for c, g in zip(cs, got):
        row = []
        for x in sorted(g):
            d, a, b = g[x]
            row.append(f"{x}:{d},{100 * a / d:.0f},{100 * b / d:.0f}")
            tt = tot.setdefault(x, [0, 0, 0])
            for j in range(3):
                tt[j] += g[x][j]
        out.append(f"{c['label']} n {c['n']} (expected {c['prev'] * c['n']:.1f}): " + " ".join(row))
        for j, nm in enumerate(BYX_RULES):  # the replay must equal the draws file's pooled coverage
            cov = 100 * sum(t[j + 1] for t in g.values()) / reps
            assert f"{cov:.1f}" == f"{by[(c['label'], c['n'], 'pooled_' + nm)]['cov']:.1f}", (c["label"], nm, cov)
    out.append("pooled over all cells:")
    for x in sorted(tot):
        d, a, b = tot[x]
        out.append(f"x {x}: {d} | {100 * a / d:.1f} | {100 * b / d:.1f}")
    out.append("replay check: pooled w3 and hm10 coverage equal the draws file in every cell")
    text = "\n".join(out); print(text); BYX.write_text(text + "\n")


def summary():
    by = V.parse(OUT)
    keys = list(dict.fromkeys((k[0], k[1]) for k in by))
    out = [f"cells run: {len(keys)}; errors (cell with < 2 labels): "
           f"{sum(by[(*k, r)]['err'] for k in keys for r in RULES)}; w3 library check asserted on every draw"]
    for k in keys:
        p = by[(*k, "pooled_cv")]
        out.append(f"{k[0]} n {k[1]} (prev {100 * p['prev']:.2f}%, J {p['J']:.3f}, expected positives "
                   f"{p['prev'] * k[1]:.1f}, t10 cells in {by[(*k, 't10_cv')]['adm'] / 20:.0f}%): "
                   + ", ".join(f"{nm} cov {by[(*k, 'pooled_' + nm)]['cov']:.1f}/{by[(*k, 't10_' + nm)]['cov']:.1f} "
                               f"ratio {by[(*k, 't10_' + nm)]['ratio']:.3f} fired {by[(*k, 't10_' + nm)]['fired']}"
                               for nm in FALLBACKS))

    def low(k, nm):
        return min(by[(*k, f'pooled_{nm}')]['cov'], by[(*k, f't10_{nm}')]['cov'])

    miss = [(k, low(k, "w3")) for k in keys if low(k, "w3") < 93.0]
    p1 = len(miss) >= 2
    out.append(f"P1 w3 under 93% in {len(miss)} of {len(keys)} cells: {'yes' if p1 else 'no'} "
               f"({', '.join(f'{a} n {b} {v:.1f}' for (a, b), v in miss)})")

    def p2_fail(nm):
        return [(k, b, by[(*k, f'{b}_{nm}')]['cov']) for k in keys for b in ("pooled", "t10")
                if by[(*k, f'{b}_{nm}')]['cov'] < 93.0]

    def p3_fail(nm):
        return [(k, b, by[(*k, f'{b}_{nm}')]['cov']) for k in keys for b in ("pooled", "t10")
                if by[(*k, f'{b}_w3')]["cov"] >= 93.0 and by[(*k, f'{b}_{nm}')]['cov'] < 93.0]

    valid = [k for k in keys if by[(*k, "t10_w3")]["cov"] >= 93.0]
    out.append(f"P4 reference: t10_w3 covers 93%+ in {len(valid)} of {len(keys)} cells")

    def cost(nm):
        d = [(by[(*k, 't10_' + nm)]['ratio'] - by[(*k, 't10_w3')]['ratio'], k) for k in valid]
        return sum(x for x, _ in d) / max(1, len(d)), max(d) if d else (0.0, None)

    def p4(nm):
        mean, (mx, _) = cost(nm)
        return mean <= ABS_MEAN and mx <= ABS_MAX

    for nm in FALLBACKS:
        lowest = min(low(k, nm) for k in keys)
        mean, (mx, mk) = cost(nm)
        out.append(f"{nm}: lowest coverage {lowest:.1f}; validity failures (P2) {p2_fail(nm)}; do-no-harm failures "
                   f"against w3 (P3) {p3_fail(nm)}; cost against w3 in w3-valid cells: mean {mean:+.4f}, largest "
                   f"{mx:+.4f} ({mk})")
    ok = {nm: not p2_fail(nm) and not p3_fail(nm) for nm in FALLBACKS}
    m10, (x10, _) = cost("hm10")
    out.append(f"P2 hm10 93%+ in every cell: {'yes' if not p2_fail('hm10') else 'no'}; P3 hm10 no harm: "
               f"{'yes' if not p3_fail('hm10') else 'no'}; P4a mean cost {m10:.4f} <= {ABS_MEAN}: "
               f"{'yes' if m10 <= ABS_MEAN else 'no'}; P4b largest {x10:.4f} <= {ABS_MAX}: "
               f"{'yes' if x10 <= ABS_MAX else 'no'}")
    hc_more = all(by[(*k, 't10_hc10')]['ratio'] >= by[(*k, 't10_hm10')]['ratio'] for k in keys)
    hm15_cov = all(by[(*k, f'{b}_hm15')]['cov'] >= by[(*k, f'{b}_hm10')]['cov'] for k in keys for b in ("pooled", "t10"))
    out.append(f"P5 hml10 meets P2 and P3: {'yes' if ok['hml10'] else 'no'} (cost {cost('hml10')[0]:+.4f} against "
               f"hm10 {m10:+.4f}); hc10 at least as wide as hm10 in every cell: {'yes' if hc_more else 'no'} "
               f"(cost {cost('hc10')[0]:+.4f}); hm15 covers at least as well as hm10 everywhere: "
               f"{'yes' if hm15_cov else 'no'} (cost {cost('hm15')[0]:+.4f})")
    if p2_fail("hm10"):
        out.append("Decision rule (d): hm10 fails P2; the default stays w3")
    elif not p1:
        out.append("Decision rule (c): P1 fails; the default stays w3 and 7bg's misses read as noise")
    elif ok["hm10"] and p4("hm10"):
        out.append("Decision rule (a): the library gains rare_hull (mid-p hull for 3 <= x < 10), on by default")
    elif ok["hm10"]:
        nxt = "hml10 meets P2, P3 and P4 and is named for the next fresh check" if ok["hml10"] and p4("hml10") else \
            "no cheaper candidate qualifies here"
        out.append(f"Decision rule (b): hm10 valid but fails P4; the default stays w3, price stated; {nxt}")
    else:
        out.append("Decision rule: hm10 meets P2 but fails P3 (a bug: a hull cannot narrow); default stays w3")
    text = "\n".join(out); print(text); SUMMARY.write_text(text + "\n")


def main():
    mode = ARGS[0] if ARGS else "summary"
    if mode == "summary":
        summary()
    elif mode == "byx":
        byx(int(ARGS[1]) if len(ARGS) > 1 else 2000)
    elif mode == "smoke":
        c = next(cells())
        print("\n".join(W.one_cell((c, int(ARGS[1]) if len(ARGS) > 1 else 10))))
    else:
        draws(int(ARGS[1]) if len(ARGS) > 1 else 2000)


if __name__ == "__main__":
    main()
