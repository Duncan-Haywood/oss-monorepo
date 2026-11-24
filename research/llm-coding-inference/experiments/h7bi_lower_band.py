"""Milestone 7bi: 7bh found the shipped interval's misses just above the rare-count trigger are lower bounds above the
truth in audits that happen to hold 7 to 9 positives, and that an exact hull for 3 <= x < 10 closes them but spends
most of its width at x 3 to 6, which already cover. Does lowering only the lower bound, only for 7 <= x < 10, to the
mid-p lower bound on the labels close the gap on fresh cells at a cost 7bf's absolute bar allows? (7bh's next step (1).)

Why. 7bh's by-count table (pooled over 39 cells): w3 covers 99.8, 99.4, 98.2 and 92.5% at x 3 to 6 and 80.3, 69.8,
43.3% at x 7 to 9; the mid-p hull lifts x 7 to 9 to 85.8, 88.5 and 77.4%. Lowering the lower bound alone (hml10) had
exactly the hull's coverage at 79% of its cost (+0.035 of pooled width), so the upper extension buys nothing. If most
of that cost is at x 3 to 6, a band 7 <= x < 10 keeps the coverage that matters for a fraction of the width. Whether
the x 7 to 9 draws alone carry enough coverage to lift a cell from 92% to 93% is the open question: they are a minority
of draws at 3 to 5 expected positives, so the candidate may be cheap and still fall short.

Cells (chosen now, before any draw; fresh thinning seed THIN_SEED, new to the line). GoEmotions test part (6,683
comments, the split of `group_shift_reddit`), coder code = score > 0, positives thinned at random to p, every negative
kept. The 39 near-trigger cells of 7bh's design (n 200 at p 0.015, 0.02, 0.025 and n 300 at p 0.01, 0.015, same
categories and coders), plus 13 cost cells where 7 to 9 positives are typical rather than a tail, so the band's price
is measured where it fires most: n 300 at p 0.02 (6 expected; 1.5B admiration, anger, curiosity, disapproval,
gratitude, neutral, sadness and 0.5B sadness) and n 300 at p 0.025 (7.5 expected; the five 1.5B categories that have a
2.5% corpus). 52 cells, 2,000 draws each (+/- 1.0 point at 95%). Coder J is printed by the run, not read before it.
Disclosed: the 1.5B anger and sadness corpora at p 0.02 keep 133 of 154 positives whatever the seed, so they are
near-replications of 7bf's to 7bh's cells (sadness 2% n 200 has now missed three times: 91.6, 92.7, 92.0%).

Rules and scheme: exactly 7aw's to 7bh's (`h7aw_rare_fallback_fresh.run`: pooled_F and t10_F), fallback F in:
  cv     no fallback (the bare control-variate interval)
  w3     the library default: Wilson on the labels when x < 3 (asserted equal to `audit_interval(rare_fallback=3)` on
         every draw)
  l7     (the candidate) w3, and for 7 <= x < 10 the lower bound is lowered to the 95% mid-p lower bound on the labels
         (min of the two); the upper bound is unchanged
  l7n    (secondary) as l7 with the 90% mid-p lower bound (a one-sided 95% bound; cheaper, less lift)
  l5     (secondary) as l7 for 5 <= x < 10 (x 6 covered 92.5% in 7bh)
  l3     (reference) as l7 for 3 <= x < 10: 7bh's hml10 replayed on these cells, so the saving is read on the same draws
x = human positives among the pooled plan's labels, as in every earlier fallback; the point estimate is unchanged; the
rules touch pooled plans only (a cells plan in t10 is never changed).

    python3 experiments/h7bi_lower_band.py draws [reps]   # -> h7bi_lower_band_draws.txt
    python3 experiments/h7bi_lower_band.py byx [reps]     # -> h7bi_lower_band_byx.txt (diagnostic, per cell)
    python3 experiments/h7bi_lower_band.py summary        # -> h7bi_lower_band.txt
    python3 experiments/h7bi_lower_band.py smoke [reps]   # first cell only, printed

Prediction (written and committed before any draw; a 10-draw smoke test of one cell may run first and is disclosed):
  P1  (the gap replicates) pooled_w3 or t10_w3 covers under 93% in at least 2 of the 39 near-trigger cells.
      Guess: 2 to 5, all at n 200, sadness 2% among them.
  P2  (decisive, validity) pooled_l7 and t10_l7 cover 93% or more in all 52 cells.
      Guess: at risk. l7 lifts each w3 miss by 0.3 to 1.5 points; it reaches the line in most misses and may leave one.
  P3  (do no harm) wherever w3 covers 93% or more (pooled and t10 separately), l7 does too (it can only widen).
  P4  (cost, 7bf's absolute bar, against w3) over the cells where t10_w3 covers 93% or more:
      P4a mean (t10_l7 ratio - t10_w3 ratio) at most 0.010; P4b no such cell above 0.050 (ratios to pooled_cv's
      mean half-width). Guess: P4a holds over the 39 near-trigger cells (mean 0.003 to 0.010) and is tighter over all
      52 (0.005 to 0.015, the cost cells costing most); P4b holds (largest 0.02 to 0.045).
  P5  (secondary, decides nothing) l7n costs less than l7 in every cell and leaves more misses; l5 covers at least as
      well as l7 and costs more; l3 costs more than l5 and equals or beats its coverage (as hml10 in 7bh).
  Diagnostic (planned now, decides nothing): `byx` replays the pooled draws of every cell and prints, per cell and
  pooled, the coverage of w3 and l7 by x (0 to 14, 15+).
  Decision rule, fixed now.
    (a) P1, P2, P3 and P4 (over all 52 cells) hold -> l7 is named for adoption; the library gains it (a pooled plan with
        7 <= x < 10 human positives takes min(lower, mid-p lower)) in a follow-up PR after the paper states it, since
        it is the first fresh test of this exact rule.
    (b) P2 and P3 hold, P4 fails -> the default stays w3; the paper states the price; the reporting rule (flag audits
        of 200 at about 2%, recommend 300) is the recommended fix.
    (c) P1 fails -> the default stays w3 and the gap is read as noise at this audit size.
    (d) l7 fails P2 -> the default stays w3; the paper states that the high-tail band alone does not reach the line
        and the reporting rule is the recommended fix.
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
NS_BY_P = {0.01: (300,), 0.015: (200, 300), 0.02: (200, 300), 0.025: (200, 300)}
THIN_SEED = 20261211
SEED = 20261212
OUT = HERE / "h7bi_lower_band_draws.txt"
BYX = HERE / "h7bi_lower_band_byx.txt"
SUMMARY = HERE / "h7bi_lower_band.txt"
ABS_MEAN, ABS_MAX = 0.010, 0.050
CATS = "admiration anger curiosity disapproval fear gratitude neutral sadness".split()

# ("low", bottom, top, level): w3's Wilson when x < 3; for bottom <= x < top the lower bound is min(shipped lower,
# mid-p lower at `level`); the upper bound is never changed.
FALLBACKS = {"cv": None, "w3": ("low", 3, 3, 0.95), "l7": ("low", 7, 10, 0.95), "l7n": ("low", 7, 10, 0.90),
             "l5": ("low", 5, 10, 0.95), "l3": ("low", 3, 10, 0.95)}
RULES = [f"{base}_{nm}" for nm in FALLBACKS for base in ("pooled", "t10")]


@functools.lru_cache(maxsize=None)
def midp_lower(x, a, level):
    return G.mid_p(x, a, level)[0]


def hull_interval(x, a, lo, hi, fb):
    """(low, high, fired) for x positives of a labels and the shipped (lo, hi)."""
    _, bottom, top, level = fb
    if x < 3:
        l2, h2 = V.wilson_labels(x, a)
        return l2, h2, True
    if bottom <= x < top:
        l2 = min(lo, midp_lower(x, a, level))
        return l2, hi, l2 != lo
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


BYX_RULES = ("w3", "l7")


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
           f"x: draws, w3 cov %, l7 cov %"]
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

    def is_cost(k):  # n 300 at p 0.02 or 0.025: the 13 cost cells
        return k[1] == 300 and (k[0].endswith("p0.02") or k[0].endswith("p0.025"))

    near = [k for k in keys if not is_cost(k)]
    out = [f"cells run: {len(keys)} ({len(near)} near-trigger, {len(keys) - len(near)} cost); errors (cell with < 2 "
           f"labels): {sum(by[(*k, r)]['err'] for k in keys for r in RULES)}; w3 library check asserted on every draw"]
    for k in keys:
        p = by[(*k, "pooled_cv")]
        out.append(f"{k[0]} n {k[1]}{' [cost]' if is_cost(k) else ''} (prev {100 * p['prev']:.2f}%, J {p['J']:.3f}, "
                   f"expected positives {p['prev'] * k[1]:.1f}, t10 cells in {by[(*k, 't10_cv')]['adm'] / 20:.0f}%): "
                   + ", ".join(f"{nm} cov {by[(*k, 'pooled_' + nm)]['cov']:.1f}/{by[(*k, 't10_' + nm)]['cov']:.1f} "
                               f"ratio {by[(*k, 't10_' + nm)]['ratio']:.3f} fired {by[(*k, 't10_' + nm)]['fired']}"
                               for nm in FALLBACKS))

    def low(k, nm):
        return min(by[(*k, f'pooled_{nm}')]['cov'], by[(*k, f't10_{nm}')]['cov'])

    miss = [(k, low(k, "w3")) for k in near if low(k, "w3") < 93.0]
    miss_cost = [(k, low(k, "w3")) for k in keys if is_cost(k) and low(k, "w3") < 93.0]
    p1 = len(miss) >= 2
    out.append(f"P1 w3 under 93% in {len(miss)} of {len(near)} near-trigger cells: {'yes' if p1 else 'no'} "
               f"({', '.join(f'{a} n {b} {v:.1f}' for (a, b), v in miss)}); cost cells under 93% (decides nothing): "
               f"{', '.join(f'{a} n {b} {v:.1f}' for (a, b), v in miss_cost) or 'none'}")

    def p2_fail(nm):
        return [(k, b, by[(*k, f'{b}_{nm}')]['cov']) for k in keys for b in ("pooled", "t10")
                if by[(*k, f'{b}_{nm}')]['cov'] < 93.0]

    def p3_fail(nm):
        return [(k, b, by[(*k, f'{b}_{nm}')]['cov']) for k in keys for b in ("pooled", "t10")
                if by[(*k, f'{b}_w3')]["cov"] >= 93.0 and by[(*k, f'{b}_{nm}')]['cov'] < 93.0]

    valid = [k for k in keys if by[(*k, "t10_w3")]["cov"] >= 93.0]
    out.append(f"P4 reference: t10_w3 covers 93%+ in {len(valid)} of {len(keys)} cells")

    def cost(nm, ks):
        d = [(by[(*k, 't10_' + nm)]['ratio'] - by[(*k, 't10_w3')]['ratio'], k) for k in ks]
        return sum(x for x, _ in d) / max(1, len(d)), max(d) if d else (0.0, None)

    def p4(nm):
        mean, (mx, _) = cost(nm, valid)
        return mean <= ABS_MEAN and mx <= ABS_MAX

    vnear = [k for k in valid if not is_cost(k)]
    for nm in FALLBACKS:
        lowest = min(low(k, nm) for k in keys)
        mean, (mx, mk) = cost(nm, valid)
        mn, _ = cost(nm, vnear)
        out.append(f"{nm}: lowest coverage {lowest:.1f}; validity failures (P2) {p2_fail(nm)}; do-no-harm failures "
                   f"against w3 (P3) {p3_fail(nm)}; cost against w3 in w3-valid cells: mean {mean:+.4f} (near-trigger "
                   f"only {mn:+.4f}), largest {mx:+.4f} ({mk})")
    ok = {nm: not p2_fail(nm) and not p3_fail(nm) for nm in FALLBACKS}
    m7, (x7, _) = cost("l7", valid)
    out.append(f"P2 l7 93%+ in every cell: {'yes' if not p2_fail('l7') else 'no'}; P3 l7 no harm: "
               f"{'yes' if not p3_fail('l7') else 'no'}; P4a mean cost {m7:.4f} <= {ABS_MEAN}: "
               f"{'yes' if m7 <= ABS_MEAN else 'no'}; P4b largest {x7:.4f} <= {ABS_MAX}: "
               f"{'yes' if x7 <= ABS_MAX else 'no'}")
    n_cheaper = all(by[(*k, 't10_l7n')]['ratio'] <= by[(*k, 't10_l7')]['ratio'] for k in keys)
    l5_cov = all(by[(*k, f'{b}_l5')]['cov'] >= by[(*k, f'{b}_l7')]['cov'] for k in keys for b in ("pooled", "t10"))
    l3_cov = all(by[(*k, f'{b}_l3')]['cov'] >= by[(*k, f'{b}_l5')]['cov'] for k in keys for b in ("pooled", "t10"))
    out.append(f"P5 l7n at most as wide as l7 in every cell: {'yes' if n_cheaper else 'no'} (cost "
               f"{cost('l7n', valid)[0]:+.4f}, P2 failures {len(p2_fail('l7n'))} against l7 {len(p2_fail('l7'))}); "
               f"l5 covers at least as well as l7 everywhere: {'yes' if l5_cov else 'no'} (cost "
               f"{cost('l5', valid)[0]:+.4f}); l3 covers at least as well as l5 everywhere: {'yes' if l3_cov else 'no'} "
               f"(cost {cost('l3', valid)[0]:+.4f})")
    if not p1:
        out.append("Decision rule (c): P1 fails; the default stays w3 and the gap reads as noise")
    elif p2_fail("l7"):
        out.append("Decision rule (d): l7 fails P2; the default stays w3; the reporting rule is the recommended fix")
    elif ok["l7"] and p4("l7"):
        out.append("Decision rule (a): l7 named for adoption (library change in a follow-up PR)")
    elif ok["l7"]:
        out.append("Decision rule (b): l7 valid but fails P4; the default stays w3, price stated; reporting rule")
    else:
        out.append("Decision rule: l7 meets P2 but fails P3 (a bug: lowering a bound cannot narrow); default stays w3")
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
