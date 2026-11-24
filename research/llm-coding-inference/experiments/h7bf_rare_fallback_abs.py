"""Milestone 7bf: with the cost bar stated in absolute width and fixed before any draw, does the rare-count fallback
(w3, the library default since 7aw) stay valid and cheap on a third set of fresh cells: GoEmotions with a zero-shot
LLM coder (Qwen2.5-1.5B-Instruct), positives thinned to 0.5 to 2%? (7ax's next step (1).)

Why. 7ax replicated w3's validity on NaijaSenti (36 fresh cells, lowest 93.1%) but failed its cost bar P4, which asked
w3 to keep 95% of the shipped rule's summed width gain where the shipped interval is valid. That bar is a share of a
near-zero reference: at 200 to 1,000 labels and 0.5 to 2% prevalence the shipped rule gains about 1.3% of width, so
any fallback width is a large share of it, while the absolute cost was 0.7% of width on average and at most 3.5%. The
log's step (1) was to restate the bar in absolute width and pre-register it before the next fresh check. This is it.

Cells (chosen now, before any draw). GoEmotions test part (6,683 Reddit comments, the split of `group_shift_reddit`),
the eight categories whose Qwen2.5-1.5B-Instruct scores are committed (`gollm_<cat>_Qwen2.5-1.5B-Instruct.tsv`,
milestone 6ab; code = score > 0, the fixed cut of 6ab). For each category, positives are thinned at random (seed
THIN_SEED) to a share p in {0.005, 0.01, 0.02} of the corpus, keeping every negative; the codes are unchanged (as 7ac,
7ax). A (category, p) pair is run only if the category has enough positives (fear, 77 positives, has no 2% corpus: it
would need 133). Native positive counts were read before this was written (labels only, no coder statistic): admiration
542, anger 154, curiosity 250, disapproval 186, fear 77, gratitude 342, neutral 1,555, sadness 154. n 200 / 300 / 500 /
1,000. 23 corpora x 4 = 92 cells, all fresh to the fallback line (7av to 7ax ran GoEmotions with the lr coder at native
prevalence and NaijaSenti thinned; no thinned GoEmotions corpus with an LLM coder was run in it). 1,000 draws per cell
(+/- 1.4 points). Coder J is printed by the run, not read before it.

Rules and scheme: exactly 7aw's and 7ax's (`h7aw_rare_fallback_fresh.run`: pooled_F and t10_F, F in cv (no fallback),
w3 (the default), w5, w5f, w5k), plus one candidate added here, w2 (Wilson on the labels when fewer than 2 positives),
so that a P4 failure names a cheaper candidate for the next fresh check. Every draw asserts w3 equals the library's own
`audit_interval(..., rare_fallback=3)` to 1e-12.

    python3 experiments/h7bf_rare_fallback_abs.py draws [reps]   # -> h7bf_rare_fallback_abs_draws.txt
    python3 experiments/h7bf_rare_fallback_abs.py summary        # -> h7bf_rare_fallback_abs.txt
    python3 experiments/h7bf_rare_fallback_abs.py smoke [reps]   # first cell only, printed

Prediction (written and committed before any draw; a 10-draw smoke test of one cell may run first and is disclosed):
  P1  (the defect here) pooled_cv covers under 93% in at least 24 of the 32 cells whose expected positives p n are
      under 3 (p 0.005 at n 200, 300, 500 and p 0.01 at n 200, for each of the eight categories; 7ax: 12 of 12).
  P2  (decisive, validity) pooled_w3 and t10_w3 cover 93% or more in all 92 cells.
  P3  (do no harm) wherever pooled_cv (t10_cv) covers 93% or more, pooled_w3 (t10_w3) does too.
  P4  (cost, the new absolute bar) over the cells where t10_cv covers 93% or more:
      P4a the mean of (t10_w3 ratio - t10_cv ratio), both ratios to pooled_cv's mean half-width, is at most 0.010;
      P4b no such cell has t10_w3 ratio - t10_cv ratio above 0.050.
      Guess: mean 0.003 to 0.008, largest 0.02 to 0.04 (7ax: 0.007 and 0.035).
  P5  (secondary, decides nothing) w5 meets P2 and P3; w5f fails P2 in at least one p 0.005 cell; w2 fails P2 in at
      least one cell (one positive in 200 labels gives the control-variate interval with near-zero se).
  Decision rule, fixed now.
    (a) w3 meets P2, P3 and P4 -> the default stays 3, and the paper replaces the share bar of 7aw/7ax with P4's
        absolute bar, citing this run as the first held-out test of it.
    (b) w3 fails P2 or P3, and w5 meets both here (it met both in 7aw and 7ax) -> the default changes to 5, every
        earlier script stays pinned, and the paper states it.
    (c) w3 meets P2 and P3 but fails P4 -> the default stays 3 (validity first; no cheaper candidate has a held-out
        test), the cost is stated as a limitation, and if w2 meets P2, P3 and P4 here, w2 is named the candidate for
        the next fresh check (not adopted on these draws).
    (d) w3 and w5 both fail P2 or P3 -> the default stays 3 and the paper states the failing cells as a limitation.
"""
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

CATS = ("admiration", "anger", "curiosity", "disapproval", "fear", "gratitude", "neutral", "sadness")
MODEL = "Qwen2.5-1.5B-Instruct"
PREVS = (0.005, 0.01, 0.02)
NS = (200, 300, 500, 1000)
THIN_SEED = 20261124
SEED = 20261125
OUT = HERE / "h7bf_rare_fallback_abs_draws.txt"
SUMMARY = HERE / "h7bf_rare_fallback_abs.txt"
ABS_MEAN, ABS_MAX = 0.010, 0.050

# The candidate set: 7aw's five plus w2. W.run and W.one_cell read the module globals FALLBACKS and RULES at call
# time, so they are extended there (Pool forks after this, so the workers see the same set).
FALLBACKS = dict(W.FALLBACKS, w2=("w", 2))
RULES = [f"{base}_{nm}" for nm in FALLBACKS for base in ("pooled", "t10")]
W.FALLBACKS, W.RULES = FALLBACKS, RULES

_orig_fallback = W.fallback


def checked_fallback(plan, f_all, labels, fb):
    """7aw's fallback, plus: w3 must equal the library default's interval on every draw."""
    out = _orig_fallback(plan, f_all, labels, fb)
    if fb == ("w", 3):
        lib = A.audit_interval(plan, f_all, labels, rare_fallback=3)
        assert abs(lib[1] - out[1]) < 1e-12 and abs(lib[2] - out[2]) < 1e-12, (lib, out)
    return out


W.fallback = checked_fallback


def scores(cat, n):
    d = {}
    for line in (HERE / f"gollm_{cat}_{MODEL}.tsv").read_text().splitlines():
        i, x = line.split("\t")
        d[int(i)] = float(x)
    assert len(d) == n, (cat, len(d), n)
    return [d[i] for i in range(n)]


def cells():
    import group_shift_reddit as R
    import h6r_rare_pilot as P
    k = 0
    for cat in CATS:
        rows = P.load(cat)
        rng = random.Random(R.SPLIT_SEED); order = list(range(len(rows))); rng.shuffle(order)
        cut = int(R.TRAIN_SHARE * len(rows))
        test = [rows[i] for i in order[cut:]]
        sc = scores(cat, len(test))
        zeros = [i for i in range(len(test)) if test[i][2] == 0]
        ones = [i for i in range(len(test)) if test[i][2] == 1]
        for p in PREVS:
            m = round(p / (1 - p) * len(zeros))
            if m > len(ones):
                continue
            keep = sorted(zeros + random.Random(THIN_SEED + int(p * 1e4) + 7 * CATS.index(cat)).sample(ones, m))
            h = [test[i][2] for i in keep]
            f = [int(sc[i] > 0) for i in keep]
            for n in NS:
                k += 1
                yield dict(label=f"{cat} p{p}", n=n, h=h, f=f, J=A.informedness(h, f), prev=sum(h) / len(h),
                           fresh=True, seed=SEED + 101 * k, N=len(h))


def draws(reps):
    cs = list(cells())
    for c in cs[::4]:
        print(f"{c['label']}: N {c['N']}, positives {sum(c['h'])}, prevalence {c['prev']:.5f}, J {c['J']:.3f}",
              flush=True)
    with Pool(4) as p:
        got = p.map(W.one_cell, [(c, reps) for c in cs], chunksize=1)
    OUT.write_text("\n".join([W.HEAD] + [l for g in got for l in g]) + "\n")


def summary():
    by = V.parse(OUT)
    keys = list(dict.fromkeys((k[0], k[1]) for k in by))
    out = [f"cells run: {len(keys)}; errors (cell with < 2 labels): "
           f"{sum(by[(*k, r)]['err'] for k in keys for r in RULES)}; w3 library check asserted on every draw"]
    for k in keys:
        p = by[(*k, "pooled_cv")]
        out.append(f"{k[0]} n {k[1]} (prev {100 * p['prev']:.2f}%, J {p['J']:.3f}, expected positives "
                   f"{p['prev'] * k[1]:.1f}, t10 cells in {by[(*k, 't10_cv')]['adm'] / 10:.0f}%): "
                   + ", ".join(f"{nm} cov {by[(*k, 'pooled_' + nm)]['cov']:.1f}/{by[(*k, 't10_' + nm)]['cov']:.1f} "
                               f"ratio {by[(*k, 't10_' + nm)]['ratio']:.3f} fired {by[(*k, 't10_' + nm)]['fired']}"
                               for nm in FALLBACKS))
    small = [k for k in keys if by[(*k, "pooled_cv")]["prev"] * k[1] < 3]
    bad = [k for k in small if by[(*k, "pooled_cv")]["cov"] < 93.0]
    out.append(f"P1 pooled_cv under 93% in {len(bad)} of {len(small)} cells with expected positives under 3: "
               f"{'yes' if len(bad) >= 24 else 'no'} ({', '.join(f'{a} n {b}' for a, b in bad)})")

    def p2_fail(nm):
        return [(k, b, by[(*k, f'{b}_{nm}')]['cov']) for k in keys for b in ("pooled", "t10")
                if by[(*k, f'{b}_{nm}')]['cov'] < 93.0]

    def p3_fail(nm):
        return [(k, b, by[(*k, f'{b}_{nm}')]['cov']) for k in keys for b in ("pooled", "t10")
                if by[(*k, f'{b}_cv')]["cov"] >= 93.0 and by[(*k, f'{b}_{nm}')]['cov'] < 93.0]

    valid = [k for k in keys if by[(*k, "t10_cv")]["cov"] >= 93.0]
    g0 = sum(1 - by[(*k, "t10_cv")]["ratio"] for k in valid)
    out.append(f"P4 reference: t10_cv covers 93%+ in {len(valid)} of {len(keys)} cells; its summed gain over pooled_cv "
               f"there {g0:.3f} (mean ratio {sum(by[(*k, 't10_cv')]['ratio'] for k in valid) / max(1, len(valid)):.4f})")

    def cost(nm):
        d = [(by[(*k, 't10_' + nm)]['ratio'] - by[(*k, 't10_cv')]['ratio'], k) for k in valid]
        return sum(x for x, _ in d) / max(1, len(d)), max(d) if d else (0.0, None)

    for nm in FALLBACKS:
        lowest = min(min(by[(*k, f'{b}_{nm}')]['cov'] for b in ("pooled", "t10")) for k in keys)
        mean, (mx, mk) = cost(nm)
        share = (sum(1 - by[(*k, 't10_' + nm)]['ratio'] for k in valid) / g0) if g0 > 0 else float("nan")
        out.append(f"{nm}: lowest coverage {lowest:.1f}; validity failures (P2) {p2_fail(nm)}; do-no-harm failures "
                   f"(P3) {p3_fail(nm)}; absolute cost in valid cells: mean {mean:+.4f}, largest {mx:+.4f} ({mk}); "
                   f"old share bar (gain kept) {share:.4f}")

    def p4(nm):
        mean, (mx, _) = cost(nm)
        return mean <= ABS_MEAN and mx <= ABS_MAX

    ok = {nm: not p2_fail(nm) and not p3_fail(nm) for nm in FALLBACKS}
    m3, (x3, _) = cost("w3")
    out.append(f"P2 w3 93%+ in every cell: {'yes' if not p2_fail('w3') else 'no'}; P3 w3 no harm: "
               f"{'yes' if not p3_fail('w3') else 'no'}; P4a mean cost {m3:.4f} <= {ABS_MEAN}: "
               f"{'yes' if m3 <= ABS_MEAN else 'no'}; P4b largest {x3:.4f} <= {ABS_MAX}: "
               f"{'yes' if x3 <= ABS_MAX else 'no'}")
    out.append(f"P5 w5 meets P2 and P3: {'yes' if ok['w5'] else 'no'}; w5f fails P2 in a p 0.005 cell: "
               f"{'yes' if any('p0.005' in k[0] for k, _, _ in p2_fail('w5f')) else 'no'}; w2 fails P2: "
               f"{'yes' if p2_fail('w2') else 'no'}")
    if ok["w3"] and p4("w3"):
        out.append("Decision rule (a): w3 meets P2, P3 and P4; the default stays rare_fallback=3 and the paper adopts "
                   "the absolute cost bar")
    elif not ok["w3"] and ok["w5"]:
        out.append("Decision rule (b): w3 fails P2 or P3 and w5 holds; the default changes to rare_fallback=5")
    elif ok["w3"]:
        nxt = "w2 meets P2, P3 and P4 and is named for the next fresh check" if ok["w2"] and p4("w2") else \
            "no cheaper candidate qualifies here"
        out.append(f"Decision rule (c): w3 valid but fails P4; the default stays 3, cost stated; {nxt}")
    else:
        out.append("Decision rule (d): w3 and w5 both fail; the default stays 3 and the paper states the failing cells")
    text = "\n".join(out); print(text); SUMMARY.write_text(text + "\n")


def main():
    mode = ARGS[0] if ARGS else "summary"
    if mode == "summary":
        summary()
    elif mode == "smoke":
        c = next(cells())
        print("\n".join(W.one_cell((c, int(ARGS[1]) if len(ARGS) > 1 else 10))))
    else:
        draws(int(ARGS[1]) if len(ARGS) > 1 else 1000)


if __name__ == "__main__":
    main()
