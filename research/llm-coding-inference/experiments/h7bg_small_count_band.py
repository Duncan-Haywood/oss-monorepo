"""Milestone 7bg: is there a real coverage gap at 3 to 6 expected human positives under the shipped rare-count
fallback (w3), and does an exact interval on draws with 3 or 4 positives close it at a cost the absolute bar allows?
(7bf's next step (1).)

Why. 7bf replicated w3 (Wilson on the labels when the audit holds fewer than 3 human positives) in all 33 cells under 3
expected positives, but two cells just above the trigger's range missed the 93% line: sadness 2% n 200 (expected
positives 4.0; pooled 91.7%, shipped 91.6%) and gratitude 1% n 1,000 shipped (92.6%, a coder-cells cell the fallback
never touches). Raising the count trigger did not help (w5 92.0%): the Wilson interval itself undercovers at 3 or 4
positives in 200 labels (7bf: w5 failed all eight 0.5% n 200 cells). The candidate the log named is an exact
(Clopper-Pearson) interval for 3 or 4 positives, keeping w3's Wilson below 3. At 1,000 draws a miss of 1.4 points is
inside the noise, so this run uses 2,000 draws per cell (+/- 1.0 point) and asks first whether the gap is real.

Cells (chosen now, before any draw). GoEmotions test part (6,683 comments, the split of `group_shift_reddit`).
  Coder Qwen2.5-1.5B-Instruct (committed scores, code = score > 0, milestone 6ab), positives thinned at random
  (seed THIN_SEED, new) to p in {0.015, 0.02, 0.025, 0.03}, every negative kept, where the category has enough
  positives (counts read before writing this, labels only: admiration and curiosity, gratitude, neutral all four;
  disapproval 0.015 to 0.025; anger and sadness 0.015 and 0.02; fear none): 23 corpora.
  Coder Qwen2.5-0.5B-Instruct (committed scores for fear and sadness, never used in the fallback line): fear 0.01;
  sadness 0.01, 0.015, 0.02: 4 corpora.
  n 200 and 300: 54 cells, expected positives 2 to 9 (the range just above w3's trigger). The 1.5B p 0.02 corpora
  are re-thinned with a new seed, but for anger and sadness they keep 133 of 154 positives, so those cells are close
  replications of 7bf's, not fresh; every other corpus (prevalence or coder) is new to the fallback line. Coder J is
  printed by the run, not read before it. 2,000 draws per cell.

Rules and scheme: exactly 7aw's, 7ax's and 7bf's (`h7aw_rare_fallback_fresh.run`: pooled_F and t10_F), with the
fallback F in:
  cv    no fallback (the bare control-variate interval)
  w3    the library default: Wilson on the labels when x < 3 (asserted equal to `audit_interval(rare_fallback=3)` on
        every draw)
  w3c5  (the candidate) w3, and Clopper-Pearson 95% on the labels when 3 <= x < 5
  w3m5  (secondary) w3, and the mid-p exact interval when 3 <= x < 5 (less conservative than CP)
  c5    (secondary, 7av's cp5) Clopper-Pearson when x < 5
  w3c7  (secondary) w3, and Clopper-Pearson when 3 <= x < 7
x = human positives among the pooled plan's labels, as in every earlier fallback; the point estimate is unchanged.

    python3 experiments/h7bg_small_count_band.py draws [reps]   # -> h7bg_small_count_band_draws.txt
    python3 experiments/h7bg_small_count_band.py byx            # -> h7bg_small_count_band_byx.txt (diagnostic)
    python3 experiments/h7bg_small_count_band.py summary        # -> h7bg_small_count_band.txt
    python3 experiments/h7bg_small_count_band.py smoke [reps]   # first cell only, printed

Prediction (written and committed before any draw; a 10-draw smoke test of one cell may run first and is disclosed):
  P1  (is the gap real) pooled_w3 or t10_w3 covers under 93% in at least 2 of the cells with 3 <= expected positives
      < 6. Guess: 1 to 4 such cells, sadness p0.02 n 200 (1.5B) among them.
  P2  (decisive, validity) pooled_w3c5 and t10_w3c5 cover 93% or more in all 54 cells.
  P3  (do no harm) wherever w3 covers 93% or more (pooled and t10 separately), w3c5 does too.
  P4  (cost, 7bf's absolute bar, now against w3) over the cells where t10_w3 covers 93% or more:
      P4a mean (t10_w3c5 ratio - t10_w3 ratio) at most 0.010; P4b no such cell above 0.050 (ratios to pooled_cv's
      mean half-width). Guess: P4 fails: CP on 3 or 4 positives in 200 is far wider than the control-variate interval
      and fires in about a third of draws at 4 expected positives; mean 0.010 to 0.030, largest 0.04 to 0.10.
  P5  (secondary, decides nothing) w3m5 meets P2 and P3 and costs about half of w3c5; c5 costs more than w3c5 in
      every cell under 3 expected positives; w3c7 meets P2 and costs most.
  Diagnostic (planned now, decides nothing): `byx` replays the pooled draws of every cell with 3 <= expected
  positives < 6 and prints the coverage of cv, w3 and w3c5 by x (0 to 9, 10+), to say which counts hold the misses.
  Decision rule, fixed now.
    (a) P1 holds and w3c5 meets P2, P3 and P4 -> the library adds the exact band (default: Clopper-Pearson for
        3 <= x < 5 on a pooled plan), every earlier script stays pinned, and the paper states it.
    (b) P1 holds, w3c5 meets P2 and P3 but fails P4 -> the default stays w3; the paper states the price of closing
        the gap at about 4 expected positives; if w3m5 meets P2, P3 and P4 it is named the candidate for the next
        fresh check (not adopted on these draws).
    (c) P1 fails (w3 93%+ in all but at most one cell near the trigger) -> the default stays w3 and 7bf's two misses
        are read as noise of 1,000 draws; nothing is added.
    (d) w3c5 fails P2 -> the default stays w3 and the paper states that the gap is not in the 3- and 4-positive
        draws (the diagnostic says where it is).
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
import h7aw_rare_fallback_fresh as W  # noqa: E402  (pins A.RARE_FALLBACK = None, as every earlier script)
import h7av_rare_fallback as V  # noqa: E402

CORPORA = [("Qwen2.5-1.5B-Instruct", c, p) for c, ps in (
    ("admiration", (0.015, 0.02, 0.025, 0.03)), ("anger", (0.015, 0.02)), ("curiosity", (0.015, 0.02, 0.025, 0.03)),
    ("disapproval", (0.015, 0.02, 0.025)), ("gratitude", (0.015, 0.02, 0.025, 0.03)),
    ("neutral", (0.015, 0.02, 0.025, 0.03)), ("sadness", (0.015, 0.02))) for p in ps] + \
    [("Qwen2.5-0.5B-Instruct", "fear", 0.01)] + [("Qwen2.5-0.5B-Instruct", "sadness", p) for p in (0.01, 0.015, 0.02)]
NS = (200, 300)
THIN_SEED = 20261126
SEED = 20261127
OUT = HERE / "h7bg_small_count_band_draws.txt"
BYX = HERE / "h7bg_small_count_band_byx.txt"
SUMMARY = HERE / "h7bg_small_count_band.txt"
ABS_MEAN, ABS_MAX = 0.010, 0.050
Z = 1.959964

FALLBACKS = {"cv": None, "w3": ("band", 3, 3, None), "w3c5": ("band", 3, 5, "cp"), "w3m5": ("band", 3, 5, "midp"),
             "c5": ("band", 0, 5, "cp"), "w3c7": ("band", 3, 7, "cp")}
RULES = [f"{base}_{nm}" for nm in FALLBACKS for base in ("pooled", "t10")]


def _pmf(k, a, p):
    return math.exp(math.lgamma(a + 1) - math.lgamma(k + 1) - math.lgamma(a - k + 1)
                    + k * math.log(p) + (a - k) * math.log1p(-p))


def _bisect(g):
    """Root of g, increasing in p on (0, 1) from negative to positive."""
    lo, hi = 0.0, 1.0
    for _ in range(80):
        mid = (lo + hi) / 2
        if g(mid) < 0:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def mid_p(x, a, level=0.95):
    """Mid-p exact interval: lower solves P(X > x) + P(X = x)/2 = alpha/2, upper P(X < x) + P(X = x)/2 = alpha/2."""
    al = (1 - level) / 2
    lower = 0.0 if x == 0 else _bisect(lambda p: (1 - V._binom_cdf(x, a, p)) + 0.5 * _pmf(x, a, p) - al)
    upper = 1.0 if x == a else _bisect(lambda p: al - (V._binom_cdf(x - 1, a, p) + 0.5 * _pmf(x, a, p))
                                       if x > 0 else al - 0.5 * _pmf(0, a, p))
    return lower, upper


def band_interval(x, a, lo, hi, fb):
    """The fallback for x positives of a labels; (low, high, fired). fb = ("band", w, m, kind): Wilson when x < w,
    the exact interval `kind` when w <= x < m, else the shipped (lo, hi)."""
    _, w, m, kind = fb
    if x < w:
        l2, h2 = V.wilson_labels(x, a)
        return l2, h2, True
    if x < m:
        l2, h2 = V.clopper_pearson(x, a) if kind == "cp" else mid_p(x, a)
        return l2, h2, True
    return lo, hi, False


def fallback(plan, f_all, labels, fb):
    est, lo, hi = A.audit_interval(plan, f_all, labels)  # A.RARE_FALLBACK is None here (pinned by h7aw's import)
    if fb is None or plan["design"] != "pooled":
        return est, lo, hi, False
    y = [labels[i] for i in plan["cells"][0] if i in labels]
    l2, h2, fired = band_interval(sum(y), len(y), lo, hi, fb)
    if fb == ("band", 3, 3, None):
        lib = A.audit_interval(plan, f_all, labels, rare_fallback=3)
        assert abs(lib[1] - l2) < 1e-12 and abs(lib[2] - h2) < 1e-12, (lib, l2, h2)
    return est, l2, h2, fired


# W.run and W.one_cell read these module globals at call time; Pool forks after this, so workers see the same set.
W.FALLBACKS, W.RULES, W.fallback = FALLBACKS, RULES, fallback


def scores(model, cat, n):
    d = {}
    for line in (HERE / f"gollm_{cat}_{model}.tsv").read_text().splitlines():
        i, x = line.split("\t")
        d[int(i)] = float(x)
    assert len(d) == n, (cat, len(d), n)
    return [d[i] for i in range(n)]


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
        sc = scores(model, cat, len(test))
        zeros = [i for i in range(len(test)) if test[i][2] == 0]
        ones = [i for i in range(len(test)) if test[i][2] == 1]
        m = round(p / (1 - p) * len(zeros))
        assert m <= len(ones), (cat, p, m, len(ones))
        rs = random.Random(THIN_SEED + int(p * 1e4) + 7 * ("admiration anger curiosity disapproval fear gratitude "
                                                           "neutral sadness").split().index(cat) + 1000 * ("0.5B" in model))
        keep = sorted(zeros + rs.sample(ones, m))
        h = [test[i][2] for i in keep]
        f = [int(sc[i] > 0) for i in keep]
        tag = "q15" if "1.5B" in model else "q05"
        for n in NS:
            k += 1
            yield dict(label=f"{tag} {cat} p{p}", n=n, h=h, f=f, J=A.informedness(h, f), prev=sum(h) / len(h),
                       fresh=True, seed=SEED + 101 * k, N=len(h))


def draws(reps):
    cs = list(cells())
    for c in cs[::2]:
        print(f"{c['label']}: N {c['N']}, positives {sum(c['h'])}, prevalence {c['prev']:.5f}, J {c['J']:.3f}",
              flush=True)
    with Pool(4) as p:
        got = p.map(W.one_cell, [(c, reps) for c in cs], chunksize=1)
    OUT.write_text("\n".join([W.HEAD] + [l for g in got for l in g]) + "\n")


def near(c):
    return 3 <= c["prev"] * c["n"] < 6


def byx_cell(args):
    """The pooled half of `W.run` for one cell (same seeds), coverage tallied by x for cv, w3 and w3c5."""
    c, reps = args
    h, f, n = c["h"], c["f"], c["n"]
    N, truth = len(h), sum(h) / len(h)
    rr = random.Random(c["seed"] + 13)
    srs = [rr.sample(range(N), n) for _ in range(reps)]
    tally = {}
    for d in range(reps):
        labels = {i: h[i] for i in srs[d]}
        plan = A.plan_audit(f, labels, n, tau=2.0, neg_guard=0)
        x = min(10, sum(labels.values()))
        t = tally.setdefault(x, [0, 0, 0, 0])
        t[0] += 1
        for j, nm in enumerate(("cv", "w3", "w3c5")):
            _, lo, hi, _ = fallback(plan, f, labels, FALLBACKS[nm])
            t[j + 1] += lo <= truth <= hi
    return tally


def byx(reps):
    cs = [c for c in cells() if near(c)]
    with Pool(4) as p:
        got = p.map(byx_cell, [(c, reps) for c in cs], chunksize=1)
    tot = {}
    for g in got:
        for x, t in g.items():
            tt = tot.setdefault(x, [0, 0, 0, 0])
            for j in range(4):
                tt[j] += t[j]
    out = [f"pooled draws of the {len(cs)} cells with 3 <= expected positives < 6, {reps} draws each, by human "
           f"positives x in the audit (10 = 10 or more): draws | cv cov % | w3 cov % | w3c5 cov %"]
    for x in sorted(tot):
        d, a, b, e = tot[x]
        out.append(f"x {x}: {d} | {100 * a / d:.1f} | {100 * b / d:.1f} | {100 * e / d:.1f}")
    by = V.parse(OUT)
    for k, c in enumerate(cs):  # the replay must equal the draws file's pooled coverage
        for nm in ("cv", "w3", "w3c5"):
            cov = 100 * sum(t[["cv", "w3", "w3c5"].index(nm) + 1] for t in got[k].values()) / reps
            assert f"{cov:.1f}" == f"{by[(c['label'], c['n'], 'pooled_' + nm)]['cov']:.1f}", (c["label"], nm, cov)
    out.append("replay check: pooled cv, w3 and w3c5 coverage equal the draws file in every cell")
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
    nr = [k for k in keys if 3 <= by[(*k, "pooled_cv")]["prev"] * k[1] < 6]
    miss = [(k, min(by[(*k, 'pooled_w3')]['cov'], by[(*k, 't10_w3')]['cov'])) for k in nr
            if min(by[(*k, 'pooled_w3')]['cov'], by[(*k, 't10_w3')]['cov']) < 93.0]
    p1 = len(miss) >= 2
    out.append(f"P1 w3 under 93% in {len(miss)} of {len(nr)} cells with 3 <= expected positives < 6: "
               f"{'yes' if p1 else 'no'} ({', '.join(f'{a} n {b} {v:.1f}' for (a, b), v in miss)})")

    def p2_fail(nm):
        return [(k, b, by[(*k, f'{b}_{nm}')]['cov']) for k in keys for b in ("pooled", "t10")
                if by[(*k, f'{b}_{nm}')]['cov'] < 93.0]

    def p3_fail(nm):
        return [(k, b, by[(*k, f'{b}_{nm}')]['cov']) for k in keys for b in ("pooled", "t10")
                if by[(*k, f'{b}_w3')]["cov"] >= 93.0 and by[(*k, f'{b}_{nm}')]['cov'] < 93.0]

    valid = [k for k in keys if by[(*k, "t10_w3")]["cov"] >= 93.0]
    out.append(f"P4 reference: t10_w3 covers 93%+ in {len(valid)} of {len(keys)} cells (mean ratio to pooled_cv "
               f"{sum(by[(*k, 't10_w3')]['ratio'] for k in valid) / max(1, len(valid)):.4f})")

    def cost(nm):
        d = [(by[(*k, 't10_' + nm)]['ratio'] - by[(*k, 't10_w3')]['ratio'], k) for k in valid]
        return sum(x for x, _ in d) / max(1, len(d)), max(d) if d else (0.0, None)

    def p4(nm):
        mean, (mx, _) = cost(nm)
        return mean <= ABS_MEAN and mx <= ABS_MAX

    for nm in FALLBACKS:
        lowest = min(min(by[(*k, f'{b}_{nm}')]['cov'] for b in ("pooled", "t10")) for k in keys)
        mean, (mx, mk) = cost(nm)
        out.append(f"{nm}: lowest coverage {lowest:.1f}; validity failures (P2) {p2_fail(nm)}; do-no-harm failures "
                   f"against w3 (P3) {p3_fail(nm)}; cost against w3 in w3-valid cells: mean {mean:+.4f}, largest "
                   f"{mx:+.4f} ({mk})")
    ok = {nm: not p2_fail(nm) and not p3_fail(nm) for nm in FALLBACKS}
    m5, (x5, _) = cost("w3c5")
    out.append(f"P2 w3c5 93%+ in every cell: {'yes' if not p2_fail('w3c5') else 'no'}; P3 w3c5 no harm: "
               f"{'yes' if not p3_fail('w3c5') else 'no'}; P4a mean cost {m5:.4f} <= {ABS_MEAN}: "
               f"{'yes' if m5 <= ABS_MEAN else 'no'}; P4b largest {x5:.4f} <= {ABS_MAX}: "
               f"{'yes' if x5 <= ABS_MAX else 'no'}")
    under3 = [k for k in keys if by[(*k, "pooled_cv")]["prev"] * k[1] < 3]
    c5_more = all(by[(*k, 't10_c5')]['ratio'] > by[(*k, 't10_w3c5')]['ratio'] for k in under3)
    out.append(f"P5 w3m5 meets P2 and P3: {'yes' if ok['w3m5'] else 'no'} (cost {cost('w3m5')[0]:+.4f} against "
               f"w3c5 {m5:+.4f}); c5 wider than w3c5 in all {len(under3)} cells under 3 expected positives: "
               f"{'yes' if c5_more else 'no'}; w3c7 meets P2: {'yes' if not p2_fail('w3c7') else 'no'} "
               f"(cost {cost('w3c7')[0]:+.4f})")
    if not ok["w3c5"] and p2_fail("w3c5"):
        out.append("Decision rule (d): w3c5 fails P2; the default stays w3 and the gap is not in the 3- and "
                   "4-positive draws alone")
    elif not p1:
        out.append("Decision rule (c): P1 fails; the default stays w3 and 7bf's two misses read as noise")
    elif ok["w3c5"] and p4("w3c5"):
        out.append("Decision rule (a): the library adds the Clopper-Pearson band for 3 <= x < 5")
    elif ok["w3c5"]:
        nxt = "w3m5 meets P2, P3 and P4 and is named for the next fresh check" if ok["w3m5"] and p4("w3m5") else \
            "no cheaper candidate qualifies here"
        out.append(f"Decision rule (b): w3c5 valid but fails P4; the default stays w3, price stated; {nxt}")
    else:
        out.append("Decision rule: w3c5 meets P2 but fails P3 (harm against w3); outside (a) to (d) as written, "
                   "read as (d): the default stays w3")
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
