"""Milestone 127: a top-probe guard. Route the clipped ladder's own best m points and m uniformly drawn points; trust the ladder only
if its best routed point is at least as good as the uniform probes' best, else spend what is left of the budget on uniform points.
Priced by replay (no flow run) on all 90 cells of milestones 119 to 125, against SWC, SWG(32), SWCV(4, 0) and equal-cost random.

Usage: python3 analyse.py [out.txt]

Why: milestone 126 found that uniformly drawn probes almost never see where the ladder fails. Post hoc, the clipped score's order
over a cell's points is about as good on the 17 cells where SWC loses to random by more than a point (Kendall tau-b +0.45) as on
the 40 where it reaches 0.5% or less (+0.53), but over the ladder's own top 16 it is -0.18 against +0.23. Its "Next": test the top
of the ranking directly, registered before replay.

Rule, fixed in this file before its replay table existed. SWT(m), on the ladder branch (routed/r2 > theta = 3; below it every rule
routes equal-cost random, as SWC does). Map all n points (n x r2, as SWC does), rank them by r2c(1.25) with random tie-breaks, route
the ladder's best m (m x (r3 + r4)) and m points drawn uniformly from the rest (m x (r3 + r4); they are already mapped).
  best routed of the top m <= best routed of the uniform m (trust): route ladder ranks m+1 onwards (skipping the uniform probes)
      until 8 points are routed. Cost n x r2 + 8 x (r3 + r4) = skip-r1's wall-clock B, exactly SWC's.
  otherwise (distrust): the mapping is spent, so B leaves 8 - 2m routes; route 8 - 2m more uniform points. Same cost B.
The pick is the best routed point. This is the honest accounting: unlike SWCV, the test needs the whole pool mapped, so a
fall-back cannot buy equal-cost random's k points. Reported alongside as a bound, not a rule: SWT*(m), where the fall-back routes
k - 2m uniform points as if the mapping were free (no schedule can spend that; it says how much a perfect fall-back could earn).
Primary SWT(3) ("say 3" in milestone 126's Next); m in {1, 2, 3} reported (m = 4 routes the same 8 points either way).
Expected regret over 200 draws per cell, seed "m127" + cell key + m.

All 90 cells are seen (SWG(32) was placed on 74 of them), so this prices SWT, it does not test it blind. The failing/winning split
in prediction (3) uses SWC's own outcome and is the same split milestone 126 used.

Predictions, written in this file before the replay table existed (checked in main()):
 (1) over the 90 cells, SWT(3) has lower mean regret than SWC;
 (2) over the 90 cells, SWT(3) has higher mean regret than SWG(32);
 (3) the distrust share of SWT(3) is above 0.5 on the ladder-branch cells where SWC loses to random by more than 1 point, and below
     0.25 on those where SWC is at most 0.5%;
 (4) the bound SWT*(3) has lower mean regret than both SWC and random over the 90 cells;
 (5) on the cells of (3) where SWC loses by more than 1 point, SWT(3) is still worse than random on average (8 routes cannot
     match equal-cost random's k);
 (6) the design-bootstrap 95% interval of mean (SWT(3) - SWC) over the 90 cells lies below 0 (2,000 resamples, seed 127).
"""
import importlib.util
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 127
DRAWS = 200
M = 3
MS = (1, 2, 3)


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


pr = _sibling(EXP / "pilot_rank" / "analyse.py", "verified_dse_m127_pr")
ml, score, rule, pool, sp = pr.ml, pr.score, pr.rule, pr.pool, pr.sp
ALPHA = pr.ALPHA
swc, rand, swg, swcv, oracle, mean = pr.swc, pr.rand, pr.swg, pr.swcv, pr.oracle, pr.mean


def top_regret(rs, k, m, seed):
    """SWT(m) and the bound SWT*(m) on one cell: mean regret (%) of each and the distrust share, over DRAWS draws."""
    y = [rule.flow.scores(r)["r4"] for r in rs]
    key = [score.r2c(r, ALPHA) for r in rs]
    best, n = min(y), len(y)
    rng = random.Random(seed)
    honest = bound = fell = 0.0
    for _ in range(DRAWS):
        tb = [rng.random() for _ in range(n)]
        order = sorted(range(n), key=lambda i: (key[i], tb[i]))
        top = order[:m]
        uni = rng.sample(order[m:], m)
        if min(y[i] for i in top) <= min(y[i] for i in uni):
            u = set(uni)
            chosen = top + uni + [i for i in order[m:] if i not in u][:8 - 2 * m]
            honest += rule.draw_regret(y, best, chosen)
            bound += rule.draw_regret(y, best, chosen)
        else:
            fell += 1
            used = set(top) | set(uni)
            rest = [i for i in range(n) if i not in used]
            extra = rng.sample(rest, len(rest))
            honest += rule.draw_regret(y, best, top + uni + extra[:8 - 2 * m])
            bound += rule.draw_regret(y, best, top + uni + extra[:max(k - 2 * m, 8 - 2 * m)])
    return 100 * honest / DRAWS, 100 * bound / DRAWS, fell / DRAWS


def cells():
    rows = pr.cells()
    raw = {}
    for t in sorted({c["table"] for c in rows}):
        raw.update(rule.load_table(EXP / t / "results.jsonl", t))
    for c in rows:
        rs = raw[(c["clock"], c["design"], c["table"])]
        c["t"], c["tb"], c["tfell"] = {}, {}, {}
        for m in MS:
            c["t"][m], c["tb"][m], c["tfell"][m] = top_regret(rs, c["k"], m, f"m127{c['table']}{c['clock']}{c['design']}{m}")
    return rows


def lad(c):
    return c["ratio"] > score.THETA


def swt(c, m=M):
    return c["t"][m] if lad(c) else c["rand"]


def swtb(c, m=M):
    return c["tb"][m] if lad(c) else c["rand"]


RULES = (("SWC", swc), ("SWG(32)", swg), ("SWCV(4,0)", swcv), ("SWT(3)", swt), ("SWT*(3) bound", swtb), ("random", rand),
         ("oracle switch", oracle))


def means(rows):
    return ", ".join(f"{n} {mean(rows, f):.2f}" for n, f in RULES)


def main(dst):
    rows = cells()
    ladder = [c for c in rows if lad(c)]
    bad = [c for c in ladder if swc(c) > c["rand"] + 1]
    good = [c for c in ladder if swc(c) <= 0.5]
    fs = lambda cs, m=M: statistics.mean(c["tfell"][m] for c in cs) if cs else float("nan")
    out = ["# Milestone 127: a top-probe guard SWT(m) priced by replay on milestones 119 to 125 (no flow run)", "",
           f"theta = {score.THETA}, alpha = {ALPHA}; {DRAWS} draws per cell; design bootstrap {pool.BOOT} resamples, seed {SEED}.",
           f"{len(rows)} cells on {len({(c['table'], c['design']) for c in rows})} designs; {len(ladder)} on the ladder branch. All are "
           "seen (see the docstring); SWT's parameters were fixed before this table existed.", "",
           "## Per cell, ladder branch (distrust = share of draws where SWT(3) falls back)", "",
           "table | clock | design | routed/r2 | k | random % | SWC % | SWT(3) % | distrust | SWT*(3) bound %"]
    for c in sorted(ladder, key=lambda c: (swc(c) - c["rand"], c["table"], c["design"], c["clock"])):
        out.append(f"{c['table']} | {c['clock']} | {c['design']} | {c['ratio']:.2f} | {c['k']} | {c['rand']:.2f} | {swc(c):.2f} | "
                   f"{swt(c):.2f} | {c['tfell'][M]:.2f} | {swtb(c):.2f}")
    out += ["", f"## Mean regret % over all {len(rows)} cells", "", means(rows), "",
            f"ladder-branch cells only ({len(ladder)}): {means(ladder)}",
            f"cells where SWC loses to random by > 1 point ({len(bad)}): {means(bad)}",
            f"cells where SWC <= 0.5% ({len(good)}): {means(good)}", ""]
    out += sp.compare_lines(rows, ((swt, swc, "SWT(3)", "SWC"), (swt, rand, "SWT(3)", "random"), (swt, swg, "SWT(3)", "SWG(32)"),
                                   (swtb, rand, "SWT*(3)", "random")), SEED)
    out += ["", "## SWT(m) for m in 1 to 3 (descriptive; 3 was fixed before the table)", "",
            "m | SWT mean %, all cells | ladder branch | SWT* bound, all cells | distrust share where SWC loses | where SWC <= 0.5%"]
    for m in MS:
        out.append(f"{m} | {mean(rows, lambda c: swt(c, m)):.2f} | {mean(ladder, lambda c: swt(c, m)):.2f} | "
                   f"{mean(rows, lambda c: swtb(c, m)):.2f} | {fs(bad, m):.2f} | {fs(good, m):.2f}")
    lo, hi = pool.boot_ci(rows, lambda c: swt(c) - swc(c), seed=SEED)
    a, s, g, r, b = mean(rows, swt), mean(rows, swc), mean(rows, swg), mean(rows, rand), mean(rows, swtb)
    out += ["", "## Predictions", "",
            f"(1) SWT(3) below SWC: {a < s} ({a:.2f}% against {s:.2f}%)",
            f"(2) SWT(3) above SWG(32): {a > g} ({a:.2f}% against {g:.2f}%)",
            f"(3) distrust share above 0.5 where SWC loses by > 1 point ({len(bad)} cells, {fs(bad):.2f}) and below 0.25 where SWC <= "
            f"0.5% ({len(good)} cells, {fs(good):.2f}): {fs(bad) > 0.5 and fs(good) < 0.25}",
            f"(4) bound SWT*(3) below SWC and random: {b < s and b < r} ({b:.2f}% against {s:.2f}% and {r:.2f}%)",
            f"(5) where SWC loses by > 1 point, SWT(3) above random: {mean(bad, swt) > mean(bad, rand)} "
            f"({mean(bad, swt):.2f}% against {mean(bad, rand):.2f}%)",
            f"(6) design-bootstrap 95% interval of mean (SWT(3) - SWC) below 0: {hi < 0} ({lo:+.2f} to {hi:+.2f} points)"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
