"""Milestone 128: a staged top-probe guard. Decide whether to trust the clipped ladder before the pool is mapped, so a fall-back
still has budget. Priced by replay (no flow run) on all 90 cells of milestones 119 to 125, against SWC, SWG(32), SWT(3) and
equal-cost random.

Usage: python3 analyse.py [out.txt]

Why: milestone 127's top-probe guard SWT(3) saw where the ladder fails (distrust share 0.54 on the 17 cells where SWC loses to random
by more than a point, 0.07 on the 40 where SWC is at 0.5% or less) but could not act: it mapped every point first, so a distrusting
draw had only 8 - 2m routes left, against equal-cost random's k (about 30). Its "Next": map a uniform subset of s points, run the
top-probe test inside it, and either map the rest and finish the ladder or route randomly with what is left.

Costs in units of one r2 score, per cell from milestone 109's stage times: R = routed/r2, a routed point costs R from scratch
(r2 + r3 + r4) and R - 1 once mapped. The budget is skip-r1's wall-clock B = n + 8 (R - 1), as for every rule since milestone 111.

Rule, fixed in this file before its replay table existed. SWS(s, m), on the ladder branch (R > theta = 3; below it every rule routes
equal-cost random, as SWC does):
  stage 1: map s uniformly drawn points (cost s); rank them by r2c(1.25) (random tie-breaks); route the best m of them and m drawn
           uniformly from the other s - m (cost 2m (R - 1)).
  trust (best routed of the top m <= best routed of the uniform m): map the other n - s points (cost n - s), rank all n by r2c(1.25)
           and route ladder ranks in order, skipping points already routed, until 8 are routed. Total B exactly.
  distrust: what is left is L = n - s + (8 - 2m)(R - 1). Route the s - 2m unrouted mapped points of the subset in a uniform order
           while L covers R - 1 each, then fresh uniform points from the n - s unmapped ones at R each. Total at most B.
The pick is the best routed point. The subset's unrouted points are not quite uniform (the subset's own top m were taken out); on a
cell where the ladder misleads that costs nothing, and it is disclosed rather than corrected.
Primary SWS(24, 3) ("say 24" in milestone 127's Next; m = 3 as milestone 127's primary). Reported alongside, not chosen:
s in {16, 24, 32} x m in {1, 2, 3}. Expected regret over 200 draws per cell, seed "m128" + cell key + (s, m).

All 90 cells are seen (SWG(32) was placed on 74 of them, and milestone 127's numbers were read before this rule was written), so this
prices SWS, it does not test it blind. The failing/winning split is SWC's own outcome, the split milestones 126 and 127 used.

Predictions, written in this file before the replay table existed (checked in main()):
 (1) over the 90 cells, SWS(24, 3) has lower mean regret than SWC (4.77%);
 (2) over the 90 cells, SWS(24, 3) has higher mean regret than SWG(32) (3.91%);
 (3) the distrust share of SWS(24, 3) is above 0.4 on the cells where SWC loses to random by more than 1 point, and below 0.2 on
     those where SWC is at most 0.5% (lower than SWT(3)'s 0.54: the subset's top 3 is a weaker sample of the ladder's top);
 (4) on the cells where SWC loses by more than 1 point, SWS(24, 3) has lower mean regret than SWT(3) (13.32%): the fall-back now
     has budget;
 (5) on the cells where SWC is at most 0.5%, SWS(24, 3) gives up more than 1 point against SWC (trust leaves only 2 global ladder
     routes after the 6 probes);
 (6) the design-bootstrap 95% interval of mean (SWS(24, 3) - SWC) over the 90 cells contains 0 (2,000 resamples, seed 128).
"""
import importlib.util
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 128
DRAWS = 200
S, M = 24, 3
GRID = tuple((s, m) for s in (16, 24, 32) for m in (1, 2, 3))
EPS = 1e-9


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


tp = _sibling(EXP / "top_probe" / "analyse.py", "verified_dse_m128_tp")
score, rule, pool, sp = tp.score, tp.rule, tp.pool, tp.sp
ALPHA = tp.ALPHA
swc, rand, swg, swt, oracle, mean = tp.swc, tp.rand, tp.swg, tp.swt, tp.oracle, tp.mean


def staged_regret(rs, s, m, seed):
    """SWS(s, m)'s ladder branch on one cell: mean regret (%), distrust share and mean points routed, over DRAWS draws."""
    y = [rule.flow.scores(r)["r4"] for r in rs]
    key = [score.r2c(r, ALPHA) for r in rs]
    best, n = min(y), len(y)
    t = rule.stage_times(rs)
    R = (t["r2"] + t["r3"] + t["r4"]) / t["r2"]
    s = min(s, n)
    rng = random.Random(seed)
    tot = fell = routed = 0.0
    for _ in range(DRAWS):
        tb = [rng.random() for _ in range(n)]
        sub = rng.sample(range(n), s)
        sub_order = sorted(sub, key=lambda i: (key[i], tb[i]))
        top = sub_order[:m]
        uni = rng.sample(sub_order[m:], m)
        chosen = top + uni
        if min(y[i] for i in top) <= min(y[i] for i in uni):
            done = set(chosen)
            for i in sorted(range(n), key=lambda i: (key[i], tb[i])):
                if len(chosen) >= 8:
                    break
                if i not in done:
                    chosen.append(i)
                    done.add(i)
        else:
            fell += 1
            left = n - s + (8 - 2 * m) * (R - 1)
            done = set(chosen)
            mapped = [i for i in sub if i not in done]
            rng.shuffle(mapped)
            for i in mapped:
                if left + EPS < R - 1:
                    break
                chosen.append(i)
                left -= R - 1
            sset = set(sub)
            fresh = [i for i in range(n) if i not in sset]
            rng.shuffle(fresh)
            for i in fresh:
                if left + EPS < R:
                    break
                chosen.append(i)
                left -= R
        routed += len(chosen)
        tot += rule.draw_regret(y, best, chosen)
    return 100 * tot / DRAWS, fell / DRAWS, routed / DRAWS


def cells():
    rows = tp.cells()
    raw = {}
    for t in sorted({c["table"] for c in rows}):
        raw.update(rule.load_table(EXP / t / "results.jsonl", t))
    for c in rows:
        rs = raw[(c["clock"], c["design"], c["table"])]
        c["s"], c["sfell"], c["srouted"] = {}, {}, {}
        for s, m in GRID:
            c["s"][(s, m)], c["sfell"][(s, m)], c["srouted"][(s, m)] = staged_regret(
                rs, s, m, f"m128{c['table']}{c['clock']}{c['design']}{s}{m}")
    return rows


def lad(c):
    return c["ratio"] > score.THETA


def sws(c, s=S, m=M):
    return c["s"][(s, m)] if lad(c) else c["rand"]


RULES = (("SWC", swc), ("SWG(32)", swg), ("SWT(3)", swt), ("SWS(24,3)", sws), ("random", rand), ("oracle switch", oracle))


def means(rows):
    return ", ".join(f"{n} {mean(rows, f):.2f}" for n, f in RULES)


def main(dst):
    rows = cells()
    ladder = [c for c in rows if lad(c)]
    bad = [c for c in ladder if swc(c) > c["rand"] + 1]
    good = [c for c in ladder if swc(c) <= 0.5]
    fs = lambda cs, g=(S, M): statistics.mean(c["sfell"][g] for c in cs) if cs else float("nan")
    out = ["# Milestone 128: a staged top-probe guard SWS(s, m) priced by replay on milestones 119 to 125 (no flow run)", "",
           f"theta = {score.THETA}, alpha = {ALPHA}; {DRAWS} draws per cell; design bootstrap {pool.BOOT} resamples, seed {SEED}.",
           f"{len(rows)} cells on {len({(c['table'], c['design']) for c in rows})} designs; {len(ladder)} on the ladder branch. All are "
           "seen (see the docstring); SWS's parameters were fixed before this table existed.", "",
           "## Per cell, ladder branch (distrust = share of draws where SWS(24, 3) falls back; routed = mean points routed per draw)", "",
           "table | clock | design | routed/r2 | k | random % | SWC % | SWT(3) % | SWS(24,3) % | distrust | routed"]
    for c in sorted(ladder, key=lambda c: (swc(c) - c["rand"], c["table"], c["design"], c["clock"])):
        out.append(f"{c['table']} | {c['clock']} | {c['design']} | {c['ratio']:.2f} | {c['k']} | {c['rand']:.2f} | {swc(c):.2f} | "
                   f"{swt(c):.2f} | {sws(c):.2f} | {c['sfell'][(S, M)]:.2f} | {c['srouted'][(S, M)]:.1f}")
    out += ["", f"## Mean regret % over all {len(rows)} cells", "", means(rows), "",
            f"ladder-branch cells only ({len(ladder)}): {means(ladder)}",
            f"cells where SWC loses to random by > 1 point ({len(bad)}): {means(bad)}",
            f"cells where SWC <= 0.5% ({len(good)}): {means(good)}", ""]
    out += sp.compare_lines(rows, ((sws, swc, "SWS(24,3)", "SWC"), (sws, rand, "SWS(24,3)", "random"),
                                   (sws, swg, "SWS(24,3)", "SWG(32)"), (sws, swt, "SWS(24,3)", "SWT(3)")), SEED)
    out += ["", "## SWS(s, m) grid (descriptive; (24, 3) was fixed before the table)", "",
            "s | m | mean %, all cells | ladder branch | where SWC loses | where SWC <= 0.5% | distrust where SWC loses | "
            "distrust where SWC <= 0.5%"]
    for g in GRID:
        f = lambda c, g=g: sws(c, *g)
        out.append(f"{g[0]} | {g[1]} | {mean(rows, f):.2f} | {mean(ladder, f):.2f} | {mean(bad, f):.2f} | {mean(good, f):.2f} | "
                   f"{fs(bad, g):.2f} | {fs(good, g):.2f}")
    lo, hi = pool.boot_ci(rows, lambda c: sws(c) - swc(c), seed=SEED)
    a, s, g = mean(rows, sws), mean(rows, swc), mean(rows, swg)
    out += ["", "## Predictions", "",
            f"(1) SWS(24,3) below SWC: {a < s} ({a:.2f}% against {s:.2f}%)",
            f"(2) SWS(24,3) above SWG(32): {a > g} ({a:.2f}% against {g:.2f}%)",
            f"(3) distrust share above 0.4 where SWC loses by > 1 point ({len(bad)} cells, {fs(bad):.2f}) and below 0.2 where SWC <= "
            f"0.5% ({len(good)} cells, {fs(good):.2f}): {fs(bad) > 0.4 and fs(good) < 0.2}",
            f"(4) where SWC loses by > 1 point, SWS(24,3) below SWT(3): {mean(bad, sws) < mean(bad, swt)} "
            f"({mean(bad, sws):.2f}% against {mean(bad, swt):.2f}%)",
            f"(5) where SWC <= 0.5%, SWS(24,3) more than 1 point above SWC: {mean(good, sws) > mean(good, swc) + 1} "
            f"({mean(good, sws):.2f}% against {mean(good, swc):.2f}%)",
            f"(6) design-bootstrap 95% interval of mean (SWS(24,3) - SWC) contains 0: {lo <= 0 <= hi} ({lo:+.2f} to {hi:+.2f} points)"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
