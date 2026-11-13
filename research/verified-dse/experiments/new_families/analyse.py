"""Milestone 118: does the clipped switch SWC beat equal-cost random routing on design families no table has run, and does a guard that
checks which mapped score ranks a few routed points better fix its shifter failure? Tested blind on six designs run for this milestone
(experiments/new_families/run.py).

Usage: python3 analyse.py [out.txt]

Why: milestone 117 found that, counted only on cells run after its parameter was fixed, SWC beat equal-cost random routing in 18 of
24 cells (sign p = 0.011) but its design-bootstrap interval of the mean difference (-2.45 to +0.22 points) included 0, through the
barrel-shifter family. Its "Next" asked for a bigger blind test on new families with a barrel guard pre-registered alongside.

Rules, all fixed in this file before the blind table existed (every one routes the same wall-clock):
  SW    milestone 111's switch: time one routed point (the pilot); if routed/r2 > 3 rank every point by r2 = mapped area x mapped delay
        and route the best 8, else route the same wall-clock's worth of uniformly drawn points.
  SWC   SW ranking by milestone 115's clipped score r2c(1.25) = mapped area x max(period, 1.25 x mapped delay). The rule under test.
  SWCG  SWC with a rank-agreement guard (new). Above the threshold, route the pilot and 3 more uniformly drawn points (4 probes); over
        their 6 pairs, count the pairs each mapped score (r2c(1.25) and the unclipped r2) orders the same way as the routed score
        (routed area x routed delay). Rank by the score with more concordant pairs (ties to r2c, the default) and route its best 5
        points not already probed. The pick is the best routed point among the 3 non-pilot probes and those 5: 8 routed points
        beyond the pilot, as SW and SWC, and the pilot's own result is not used for the pick (as in SW). Why this guard: milestone 116
        found the clip right on two relaxed barrel cells and wrong on one, and that the pilot's routed share could not tell them apart;
        whether the clipped or unclipped mapped score orders routed points better is the direct question, at the price of 3 of the 8.
        Expected regret over the probe draw by Monte Carlo (200 draws, seed "m118g" + cell key, tie-breaks random).
Skip-r1, clipped skip-r1, random regrets and the cost ratio are clip_score/score.py's build(), imported unchanged, so SW and SWC on
the earlier tables equal milestones 111 to 117's numbers.

Blind test: experiments/new_families/results.jsonl, six designs from three families no earlier table ran: funnel64, funnel128 (a
funnel shifter, the rotate and double-word shift of CPU datapaths), fir8x12, fir8x16 (8 constant-coefficient taps into an adder
tree), cordic8x16, cordic12x16 (unrolled CORDIC rotation stages). Milestone 108's 120 sequences, both clocks, Yosys 0.70 and
OpenROAD 26Q3.

Predictions, written in this file before the blind table existed:
 (1) on the blind cells, SWC has lower mean regret than equal-cost random routing;
 (2) on the blind cells, SWC is better than random in more cells than it is worse;
 (3) on the blind cells, SWC has mean regret no higher than SW;
 (4) on the relaxed funnel cells the median routed delay / period is below 0.8 (shifters do not repair to the clock), and on the
     relaxed FIR and CORDIC cells it is between 0.97 and 1.03 (arithmetic does, like the multipliers);
 (5) at least 4 of the 12 blind cells have routed/r2 > 3 (the ladder branch is exercised);
 (6) on the blind cells, SWCG is within 0.5 points of SWC on the mean;
 (7) on the blind funnel cells above the threshold, SWCG has lower mean regret than SWC;
 (8) pooled over SWC's whole test set (milestones 115, 116 and these 12 cells), the design-bootstrap 95% interval of the mean of
     SWC - random lies below 0 (2,000 resamples, both clocks of a design together, seed 118).
Also reported, not predicted: SWCG on every earlier table (seen, so not a test), the family split, sign tests.
"""
import importlib.util
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


guard = _sibling(EXP / "pilot_clip" / "guard.py", "verified_dse_m118_guard")
pool = _sibling(EXP / "switch_pooled" / "pool.py", "verified_dse_m118_pool")
score = guard.score
rule = score.rule
ALPHA = guard.ALPHA
PROBES, TOP = 4, 5
DRAWS = 200
SEED = 118
BLIND = HERE / "results.jsonl"


def concordant(a, b):
    """Pairs ordered the same way (strictly) by the two lists."""
    n = len(a)
    return sum((a[i] - a[j]) * (b[i] - b[j]) > 0 for i in range(n) for j in range(i + 1, n))


def guard_regret(rs, seed):
    """SWCG's ladder branch: mean regret (%) over DRAWS probe draws."""
    y = [rule.flow.scores(r)["r4"] for r in rs]
    clip = [score.r2c(r, ALPHA) for r in rs]
    raw = [score.r2c(r, None) for r in rs]
    best, n = min(y), len(y)
    rng = random.Random(seed)
    tot, used_clip = 0.0, 0
    for _ in range(DRAWS):
        probe = rng.sample(range(n), PROBES)  # probe[0] is the timing pilot
        yy = [y[i] for i in probe]
        use = clip if concordant([clip[i] for i in probe], yy) >= concordant([raw[i] for i in probe], yy) else raw
        used_clip += use is clip
        tb = [rng.random() for _ in range(n)]
        rest = sorted((i for i in range(n) if i not in probe), key=lambda i: (use[i], tb[i]))[:TOP]
        tot += rule.draw_regret(y, best, probe[1:] + rest)
    return 100 * tot / DRAWS, used_clip / DRAWS


def build(raw, tagfn):
    rows = guard.build(raw, tagfn)
    for c in rows:
        c["g"], c["gclip"] = guard_regret(raw[(c["clock"], c["design"], c["table"])], f"m118g{c['clock']}{c['design']}{c['table']}")
    return rows


def sw(c):
    return guard.sw(c)


def swc(c):
    return guard.swc(c)


def swcg(c):
    return c["g"] if c["ratio"] > score.THETA else c["rand"]


def rand(c):
    return c["rand"]


def mean(rows, f):
    return statistics.mean(f(c) for c in rows)


def fam(c):
    return score.family(c["design"])


def tables():
    held, dear, fresh, m115, m116 = guard.tables()
    blind = build(rule.load_table(BLIND, "new_families"), lambda k: f"m118blind{k[0]}{k[1]}") if BLIND.exists() else []
    return held, dear, fresh, m115, m116, blind


def main(dst):
    held, dear, fresh, m115, m116, blind = tables()
    # SWCG on the earlier tables: their cells already carry guard.build()'s numbers; add the guard's.
    raws = {"clip_score": rule.load_table(score.BLIND, "clip_score"), "pilot_clip": rule.load_table(guard.BLIND, "pilot_clip")}
    for c in m115 + m116:
        c["g"], c["gclip"] = guard_regret(raws[c["table"]][(c["clock"], c["design"], c["table"])],
                                          f"m118g{c['clock']}{c['design']}{c['table']}")
    out = ["# Milestone 118: the clipped switch SWC and a rank-agreement guard SWCG, tested blind on three new families "
           "(funnel shifter, FIR taps, CORDIC stages)", "",
           f"theta = {score.THETA}, alpha = {ALPHA}; SWCG: {PROBES} probes, top {TOP}; {DRAWS} draws per cell; design bootstrap "
           f"{pool.BOOT} resamples, seed {SEED}.", ""]
    head = ("table | clock | design | routed/r2 | routed delay/period | skip-r1 % | clipped skip-r1 % | random % | SW % | SWC % | "
            "SWCG % | SWCG uses clip")
    for label, rows in (("Blind cells of milestones 115, 116 (seen; SWCG computed here, not a test)", m115 + m116),
                        ("Blind test: six designs, three new families (milestone 118 flow run)", blind)):
        if not rows:
            out += ["", f"## {label}: no table yet"]
            continue
        out += ["", f"## {label}: {len(rows)} cells", "", head]
        for c in rows:
            out.append(f"{c['table']} | {c['clock']} | {c['design']} | {c['ratio']:.2f} | {c['share']:.3f} | {c['skip']:.2f} | "
                       f"{c['clip'][ALPHA]:.2f} | {c['rand']:.2f} | {sw(c):.2f} | {swc(c):.2f} | {swcg(c):.2f} | {c['gclip']:.2f}")
        out += ["", f"mean regret %: SW {mean(rows, sw):.2f}, SWC {mean(rows, swc):.2f}, SWCG {mean(rows, swcg):.2f}, "
                f"skip-r1 {mean(rows, lambda c: c['skip']):.2f}, clipped skip-r1 {mean(rows, lambda c: c['clip'][ALPHA]):.2f}, "
                f"random {mean(rows, rand):.2f}"]
    if not blind:
        Path(dst).write_text("\n".join(out) + "\n")
        print("\n".join(out))
        return
    out.append("")
    for f, g, nf, ng in ((swc, rand, "SWC", "random"), (swc, sw, "SWC", "SW"), (swcg, swc, "SWCG", "SWC"), (swcg, rand, "SWCG", "random")):
        b, w, t = pool.compare(blind, f, g)
        lo, hi = pool.boot_ci(blind, lambda c: f(c) - g(c), seed=SEED)
        out.append(f"blind {nf} vs {ng}: better {b}, worse {w}, tied {t}; sign p = {pool.sign_p(b, w):.3f}; design bootstrap 95% "
                   f"interval of mean ({nf} - {ng}) {lo:+.2f} to {hi:+.2f} points")
    out += ["", "## Blind cells by family (descriptive)", "",
            "family | cells | ladder branch | SW % | SWC % | SWCG % | random % | SWC better / worse than random"]
    for fm in sorted({fam(c) for c in blind}):
        rs = [c for c in blind if fam(c) == fm]
        b, w, _ = pool.compare(rs, swc, rand)
        out.append(f"{fm} | {len(rs)} | {sum(c['ratio'] > score.THETA for c in rs)} | {mean(rs, sw):.2f} | {mean(rs, swc):.2f} | "
                   f"{mean(rs, swcg):.2f} | {mean(rs, rand):.2f} | {b} / {w}")
    test = m115 + m116 + blind
    out += ["", f"## SWC's whole test set (milestones 115, 116, 118): {len(test)} cells on "
            f"{len({(c['table'], c['design']) for c in test})} designs", "",
            f"mean regret %: SW {mean(test, sw):.2f}, SWC {mean(test, swc):.2f}, SWCG {mean(test, swcg):.2f}, random {mean(test, rand):.2f}, "
            f"oracle switch {mean(test, lambda c: min(c['clip'][ALPHA], c['rand'])):.2f}"]
    for f, g, nf, ng in ((swc, rand, "SWC", "random"), (swc, sw, "SWC", "SW")):
        b, w, t = pool.compare(test, f, g)
        lo, hi = pool.boot_ci(test, lambda c: f(c) - g(c), seed=SEED)
        out.append(f"{nf} vs {ng}: better {b}, worse {w}, tied {t}; sign p = {pool.sign_p(b, w):.3f}; design bootstrap 95% interval "
                   f"of mean ({nf} - {ng}) {lo:+.2f} to {hi:+.2f} points")
    lo8, hi8 = pool.boot_ci(test, lambda c: swc(c) - rand(c), seed=SEED)
    rf = [c for c in blind if c["clock"] == "relaxed" and fam(c) == "funnel"]
    ra = [c for c in blind if c["clock"] == "relaxed" and fam(c) in ("fir", "cordic")]
    fa = [c for c in blind if fam(c) == "funnel" and c["ratio"] > score.THETA]
    b1, w1, _ = pool.compare(blind, swc, rand)
    nl = sum(c["ratio"] > score.THETA for c in blind)
    out += ["", f"(1) blind SWC below equal-cost random: {mean(blind, swc) < mean(blind, rand)}",
            f"(2) blind SWC better than random in more cells than worse: {b1 > w1} ({b1} better, {w1} worse)",
            f"(3) blind SWC no higher than SW: {mean(blind, swc) <= mean(blind, sw)}",
            f"(4) relaxed funnel share < 0.8 and relaxed FIR/CORDIC share in [0.97, 1.03]: "
            f"{all(c['share'] < 0.8 for c in rf) and all(0.97 <= c['share'] <= 1.03 for c in ra)} ("
            + ", ".join(f"{c['design']} {c['share']:.3f}" for c in rf + ra) + ")",
            f"(5) at least 4 of 12 blind cells above theta: {nl >= 4} ({nl})",
            f"(6) blind SWCG within 0.5 points of SWC: {abs(mean(blind, swcg) - mean(blind, swc)) <= 0.5}",
            f"(7) blind funnel cells above theta, SWCG below SWC: "
            + (f"{mean(fa, swcg) < mean(fa, swc)} ({len(fa)} cells)" if fa else "not testable (no funnel cell above theta)"),
            f"(8) pooled SWC - random interval below 0: {hi8 < 0} ({lo8:+.2f} to {hi8:+.2f})"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
