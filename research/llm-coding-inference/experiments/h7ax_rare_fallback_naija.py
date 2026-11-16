"""Milestone 7ax: does the new library default (the rare-count fallback w3, LOG.md 7aw) stay valid, and stay cheap,
on a second corpus and with real LLM coders, in cells never used to choose it? (7aw's next step (1).)

Why. 7aw made `audit_interval(rare_fallback=3)` the default: a pooled plan whose audit holds fewer than 3 human
positives is closed by a Wilson interval on the labels alone. It was the cheapest of four candidates judged on the same
GoEmotions draws, with one coder family on the fresh cells and a 95% width bar set after 7av; its log says the choice
needs its own fresh check. This is that check: a different corpus (NaijaSenti, four Nigerian languages, label 1 =
negative sentiment), two coder kinds (the in-language naive Bayes coder of milestone 3b and two zero-shot local LLMs,
Qwen2.5 1.5B and 3B, whose scores milestone 5 committed), and small audits at 0.5 to 2% prevalence.

Corpora (chosen now, before any draw). The positives (label 1) are thinned at random (seed THIN_SEED) so that they are
a share p of the corpus, keeping every negative; the coder is fitted (NB) or prompted (LLM) without the thinned labels,
so its per-item codes are unchanged (as 7ac).
  nb    the whole NaijaSenti test part (44,485 items), nb-in-language coder (fitted on the train part), p 0.005 / 0.01
        / 0.02.
  q15   the 6,000-item LLM-coded subsample (`h3_llm_width.corpus`), Qwen2.5-1.5B-Instruct, code = score > 0, same p.
  q3    the same subsample, Qwen2.5-3B-Instruct (whole-subsample J 0.06, a near-useless coder: the plan should go
        pooled), same p.
n 200 / 300 / 500 / 1,000. 36 cells, all fresh; none was used in the pilot-design or fallback line. 1,000 draws per
cell (+/- 1.4 points). Coder J and corpus sizes are printed by the run, not read before it (the whole-subsample J of
each coder at the native 33% prevalence was read before this was written: nb 0.388 on the subsample, 1.5B 0.208, 3B
0.061, 0.5B 0.008; 0.5B is left out as having no signal).

Rules and scheme: exactly 7aw's (`h7aw_rare_fallback_fresh.run`): pooled_F and t10_F (the shipped rule: pilot 0.7 n,
budget cap, tau 0.1, 3-miss guard) for F in cv (no fallback), w3 (the default), w5, w5f, w5k. Every draw also asserts
that w3 equals the library's own `audit_interval(..., rare_fallback=3)` to 1e-12.

    python3 experiments/h7ax_rare_fallback_naija.py draws [reps]   # -> h7ax_rare_fallback_naija_draws.txt
    python3 experiments/h7ax_rare_fallback_naija.py summary        # -> h7ax_rare_fallback_naija.txt
    python3 experiments/h7ax_rare_fallback_naija.py smoke [reps]   # first cell only, printed

Prediction (written and committed before any draw; a 10-draw smoke test of one cell may run first and is disclosed):
  P1  (the defect on this corpus) pooled_cv covers under 93% in at least 6 of the 9 cells whose expected positives
      p n are under 3 (p 0.005 at n 200, 300, 500 and p 0.01 at n 200, for each of the three corpora).
  P2  (decisive, validity) pooled_w3 and t10_w3 cover 93% or more in all 36 cells.
  P3  (do no harm) wherever pooled_cv (t10_cv) covers 93% or more, pooled_w3 (t10_w3) does too.
  P4  (cost) over the cells where t10_cv covers 93% or more, t10_w3 keeps at least 95% of t10_cv's summed gain (sum of
      1 - ratio to pooled_cv). Guess 97%+, as on GoEmotions. If t10_cv's summed gain there is under 0.05 (the shipped
      rule gains little at these sizes, 7aw), P4 is reported but cannot fail the rule (nothing to keep).
  P5  (secondary, decides nothing) w5 also meets P2 and P3; w5f fails P2 in at least one p 0.005 cell.
  Decision rule, fixed now. If w3 meets P2 and P3 (and P4 where it applies), the default stays 3 and the paper says it
  replicated on a second corpus and on LLM coders. If w3 fails P2 or P3 and w5 meets both here and met both in 7aw,
  the default changes to 5 (validity before width, 7av's reading), every earlier script stays pinned, and the paper
  states the change. If both fail, the default stays 3 and the paper states the failing cells as a limitation.
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

PREVS = (0.005, 0.01, 0.02)
NS = (200, 300, 500, 1000)
CODERS = (("nb", "nb-in-language"), ("q15", "llm-Qwen2.5-1.5B-Instruct"), ("q3", "llm-Qwen2.5-3B-Instruct"))
THIN_SEED = 20261116
SEED = 20261117
OUT = HERE / "h7ax_rare_fallback_naija_draws.txt"
SUMMARY = HERE / "h7ax_rare_fallback_naija.txt"
RULES = W.RULES
FALLBACKS = W.FALLBACKS

_orig_fallback = W.fallback


def checked_fallback(plan, f_all, labels, fb):
    """7aw's fallback, plus: w3 must equal the library default's interval on every draw."""
    out = _orig_fallback(plan, f_all, labels, fb)
    if fb == ("w", 3):
        lib = A.audit_interval(plan, f_all, labels, rare_fallback=3)
        assert abs(lib[1] - out[1]) < 1e-12 and abs(lib[2] - out[2]) < 1e-12, (lib, out)
    return out


W.fallback = checked_fallback


def cells():
    import h3_llm_width as H3
    train, test, idx = H3.corpus()
    k = 0
    for tag, cname in CODERS:
        codes, sc = H3.coder(cname, train, test)
        if sc is None:
            base = list(range(len(test)))
            code = {i: int(codes[i]) for i in base}
        else:
            base = [i for i in idx if i in sc]
            code = {i: int(sc[i] > 0) for i in base}
        zeros = [i for i in base if test[i][2] == 0]
        ones = [i for i in base if test[i][2] == 1]
        for p in PREVS:
            m = round(p / (1 - p) * len(zeros))
            keep = sorted(zeros + random.Random(THIN_SEED + int(p * 1e4)).sample(ones, m))
            h = [test[i][2] for i in keep]
            f = [code[i] for i in keep]
            for n in NS:
                k += 1
                yield dict(label=f"{tag} p{p}", n=n, h=h, f=f, J=A.informedness(h, f), prev=sum(h) / len(h),
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
               f"{'yes' if len(bad) >= 6 else 'no'} ({', '.join(f'{a} n {b}' for a, b in bad)})")

    def p2_fail(nm):
        return [(k, b, by[(*k, f'{b}_{nm}')]['cov']) for k in keys for b in ("pooled", "t10")
                if by[(*k, f'{b}_{nm}')]['cov'] < 93.0]

    def p3_fail(nm):
        return [(k, b, by[(*k, f'{b}_{nm}')]['cov']) for k in keys for b in ("pooled", "t10")
                if by[(*k, f'{b}_cv')]["cov"] >= 93.0 and by[(*k, f'{b}_{nm}')]['cov'] < 93.0]

    valid = [k for k in keys if by[(*k, "t10_cv")]["cov"] >= 93.0]

    def gain(r, ks):
        return sum(1 - by[(*k, r)]["ratio"] for k in ks)

    g0 = gain("t10_cv", valid)
    out.append(f"P4 reference: t10_cv covers 93%+ in {len(valid)} of {len(keys)} cells; summed gain there {g0:.3f}"
               + (" (under 0.05: P4 reported, cannot fail the rule)" if g0 < 0.05 else ""))
    kept = {}
    for nm in FALLBACKS:
        kept[nm] = gain('t10_' + nm, valid) / g0 if g0 > 0 else float("nan")
        lowest = min(min(by[(*k, f'{b}_{nm}')]['cov'] for b in ("pooled", "t10")) for k in keys)
        out.append(f"{nm}: lowest coverage {lowest:.1f}; validity failures (P2) {p2_fail(nm)}; do-no-harm failures "
                   f"(P3) {p3_fail(nm)}; gain kept in valid cells {gain('t10_' + nm, valid):.3f} ({kept[nm]:.4f}); "
                   f"mean ratio to pooled_cv {sum(by[(*k, 't10_' + nm)]['ratio'] for k in keys) / len(keys):.3f}")
    p4 = g0 < 0.05 or kept["w3"] >= 0.95
    w3ok = not p2_fail("w3") and not p3_fail("w3")
    out.append(f"P2 w3 93%+ in every cell: {'yes' if not p2_fail('w3') else 'no'}; P3 w3 no harm: "
               f"{'yes' if not p3_fail('w3') else 'no'}; P4 w3 95%+ of gain: {'yes' if p4 else 'no'}")
    out.append(f"P5 w5 meets P2 and P3: {'yes' if not p2_fail('w5') and not p3_fail('w5') else 'no'}; w5f fails P2 in a "
               f"p 0.005 cell: {'yes' if any('p0.005' in k[0] for k, _, _ in p2_fail('w5f')) else 'no'}")
    if w3ok and p4:
        out.append("Decision rule: w3 replicates; the library default stays rare_fallback=3")
    elif w3ok:
        # Added after the run (LOG.md 7ax): the committed text switches to w5 only when w3 fails P2 or P3; the first
        # version of this branch also switched when w3 failed P4 alone, contradicting the text. The text governs.
        out.append("Decision rule: w3 meets P2 and P3 but not P4; the committed text names no change for that case, "
                   "so the default stays rare_fallback=3 and P4's failure is stated (w5 keeps less gain still)")
    elif not p2_fail("w5") and not p3_fail("w5"):
        out.append("Decision rule: w3 fails and w5 holds (and held in 7aw); the default changes to rare_fallback=5")
    else:
        out.append("Decision rule: both fail; the default stays 3 and the paper states the failing cells")
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
