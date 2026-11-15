"""Milestone 129: a guard whose probes cost the ladder nothing. The timing pilot SWC already routes is the uniform probe, and the best
point of a mapped uniform subset is the ladder probe (the ladder routes it anyway whenever it is a global top-8 point). Priced by replay
(no flow run) on all 90 cells of milestones 119 to 125, against SWC, SWG(32), SWT(3), SWS(24, 3) and equal-cost random.

Usage: python3 analyse.py [out.txt]

Why: milestone 128's staged guard SWS(24, 3) gave a distrusting draw its budget back (9.16% against 16.63% unguarded on the 17 cells
where SWC loses to random by more than a point) but gave up 4.23 points on the 40 cells where SWC is at 0.5% or less, because every
probe routed in a trusting draw is a ladder rank not routed. Its "Next": use the timing pilot as the single uniform probe and the
subset's best as the ladder probe, SWS(32, 1) with the pilot.

Costs in units of one r2 score, per cell from milestone 109's stage times: R = routed/r2; a routed point costs R from scratch and
R - 1 once mapped. Budget B = n + 8 (R - 1), skip-r1's wall-clock, as for every rule since milestone 111. The timing pilot (one
uniformly drawn point routed in full, which SW and SWC route to measure R, milestone 116) is outside B for every rule and, as in SWC,
not counted in the pick, so it is a pure test signal here and the comparison with SWC is like for like.

Rule, fixed in this file before its replay table existed. SWP(s), on the ladder branch (R > theta = 3; below it every rule routes
equal-cost random, as SWC does):
  stage 1: draw the pilot u uniformly from all n points (routed, outside B); map s uniformly drawn points (cost s); route the subset's
           best by r2c(1.25) (random tie-breaks), t (cost R - 1).
  trust (y[t] <= y[u]): map the other n - s points (cost n - s), rank all n by r2c(1.25) and route ladder ranks in order, skipping t,
           until 8 are routed (t counts as one). Total B exactly. When t is a global top-8 point this routes exactly SWC's 8.
  distrust: L = n - s + 7 (R - 1) is left. Route the subset's s - 1 unrouted mapped points in a uniform order while L covers R - 1
           each, then fresh uniform points from the n - s unmapped ones at R each. Total at most B.
The pick is the best routed point (the pilot excluded, as in SWC). Primary SWP(32) (milestone 128's Next). Reported alongside, not
chosen: s in {16, 24, 32, 48} and SWP+(32), the same rule with the pilot counted in the pick (an upper bound on what the free pilot
adds; SWC does not count it). Expected regret over 200 draws per cell, seed "m129" + cell key + s.

All 90 cells are seen (SWG(32) was placed on 74 of them, and milestones 126 to 128 were read before this rule was written), so this
prices SWP, it does not test it blind. The failing/winning split is SWC's own outcome, the split milestones 126 to 128 used.

Predictions, written in this file before the replay table existed (checked in main()):
 (1) over the 90 cells, SWP(32) has lower mean regret than SWC (4.77%);
 (2) over the 90 cells, SWP(32) has higher mean regret than SWG(32) (3.91%);
 (3) the distrust share of SWP(32) is above 0.3 on the cells where SWC loses to random by more than 1 point and below 0.1 on those
     where SWC is at most 0.5% (one pilot against one top point is a coarse test);
 (4) on the cells where SWC is at most 0.5%, SWP(32) gives up less than 1 point against SWC (SWS(24, 3) gave up 4.23);
 (5) on the cells where SWC loses by more than 1 point, SWP(32) is below SWC (16.63%) but above SWS(24, 3) (9.16%): it falls back
     less often;
 (6) the design-bootstrap 95% interval of mean (SWP(32) - SWC) over the 90 cells contains 0 (2,000 resamples, seed 129).
"""
import importlib.util
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 129
DRAWS = 200
S = 32
SS = (16, 24, 32, 48)
EPS = 1e-9


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


st = _sibling(EXP / "staged_probe" / "analyse.py", "verified_dse_m129_st")
tp = st.tp
score, rule, pool, sp = tp.score, tp.rule, tp.pool, tp.sp
ALPHA = tp.ALPHA
swc, rand, swg, swt, oracle, mean = tp.swc, tp.rand, tp.swg, tp.swt, tp.oracle, tp.mean


def pilot_regret(rs, s, seed):
    """SWP(s)'s ladder branch on one cell: mean regret (%) without and with the pilot in the pick, distrust share, mean routed, and
    the share of trusting draws whose 8 routes equal SWC's (t a global top-8 point)."""
    y = [rule.flow.scores(r)["r4"] for r in rs]
    key = [score.r2c(r, ALPHA) for r in rs]
    best, n = min(y), len(y)
    t_ = rule.stage_times(rs)
    R = (t_["r2"] + t_["r3"] + t_["r4"]) / t_["r2"]
    s = min(s, n)
    rng = random.Random(seed)
    tot = totp = fell = routed = same = 0.0
    for _ in range(DRAWS):
        tb = [rng.random() for _ in range(n)]
        u = rng.randrange(n)
        sub = rng.sample(range(n), s)
        t = min(sub, key=lambda i: (key[i], tb[i]))
        chosen = [t]
        if y[t] <= y[u]:
            order = sorted(range(n), key=lambda i: (key[i], tb[i]))
            same += t in order[:8]
            for i in order:
                if len(chosen) >= 8:
                    break
                if i != t:
                    chosen.append(i)
        else:
            fell += 1
            left = n - s + 7 * (R - 1)
            mapped = [i for i in sub if i != t]
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
        totp += rule.draw_regret(y, best, chosen + [u])
    trust = DRAWS - fell
    return (100 * tot / DRAWS, 100 * totp / DRAWS, fell / DRAWS, routed / DRAWS,
            same / trust if trust else float("nan"))


def cells():
    rows = st.cells()
    raw = {}
    for t in sorted({c["table"] for c in rows}):
        raw.update(rule.load_table(EXP / t / "results.jsonl", t))
    for c in rows:
        rs = raw[(c["clock"], c["design"], c["table"])]
        c["p"], c["pp"], c["pfell"], c["prouted"], c["psame"] = {}, {}, {}, {}, {}
        for s in SS:
            (c["p"][s], c["pp"][s], c["pfell"][s], c["prouted"][s],
             c["psame"][s]) = pilot_regret(rs, s, f"m129{c['table']}{c['clock']}{c['design']}{s}")
    return rows


lad = st.lad
sws = st.sws


def swp(c, s=S):
    return c["p"][s] if lad(c) else c["rand"]


def swpp(c, s=S):
    return c["pp"][s] if lad(c) else c["rand"]


RULES = (("SWC", swc), ("SWG(32)", swg), ("SWT(3)", swt), ("SWS(24,3)", sws), ("SWP(32)", swp), ("SWP+(32)", swpp),
         ("random", rand), ("oracle switch", oracle))


def means(rows):
    return ", ".join(f"{n} {mean(rows, f):.2f}" for n, f in RULES)


def main(dst):
    rows = cells()
    ladder = [c for c in rows if lad(c)]
    bad = [c for c in ladder if swc(c) > c["rand"] + 1]
    good = [c for c in ladder if swc(c) <= 0.5]
    fs = lambda cs, s=S: statistics.mean(c["pfell"][s] for c in cs) if cs else float("nan")
    out = ["# Milestone 129: a pilot-probe guard SWP(s) priced by replay on milestones 119 to 125 (no flow run)", "",
           f"theta = {score.THETA}, alpha = {ALPHA}; {DRAWS} draws per cell; design bootstrap {pool.BOOT} resamples, seed {SEED}.",
           f"{len(rows)} cells on {len({(c['table'], c['design']) for c in rows})} designs; {len(ladder)} on the ladder branch. All are "
           "seen (see the docstring); SWP's parameters were fixed before this table existed.", "",
           "## Per cell, ladder branch (distrust = share of draws where SWP(32) falls back; same = share of trusting draws that route "
           "exactly SWC's 8)", "",
           "table | clock | design | routed/r2 | k | random % | SWC % | SWS(24,3) % | SWP(32) % | SWP+(32) % | distrust | same | routed"]
    for c in sorted(ladder, key=lambda c: (swc(c) - c["rand"], c["table"], c["design"], c["clock"])):
        out.append(f"{c['table']} | {c['clock']} | {c['design']} | {c['ratio']:.2f} | {c['k']} | {c['rand']:.2f} | {swc(c):.2f} | "
                   f"{sws(c):.2f} | {swp(c):.2f} | {swpp(c):.2f} | {c['pfell'][S]:.2f} | {c['psame'][S]:.2f} | "
                   f"{c['prouted'][S]:.1f}")
    out += ["", f"## Mean regret % over all {len(rows)} cells", "", means(rows), "",
            f"ladder-branch cells only ({len(ladder)}): {means(ladder)}",
            f"cells where SWC loses to random by > 1 point ({len(bad)}): {means(bad)}",
            f"cells where SWC <= 0.5% ({len(good)}): {means(good)}", ""]
    out += sp.compare_lines(rows, ((swp, swc, "SWP(32)", "SWC"), (swp, rand, "SWP(32)", "random"),
                                   (swp, swg, "SWP(32)", "SWG(32)"), (swp, sws, "SWP(32)", "SWS(24,3)")), SEED)
    out += ["", "## SWP(s) grid (descriptive; s = 32 was fixed before the table)", "",
            "s | mean %, all cells | ladder branch | where SWC loses | where SWC <= 0.5% | distrust where SWC loses | "
            "distrust where SWC <= 0.5% | SWP+(s) mean %, all cells"]
    for s in SS:
        f = lambda c, s=s: swp(c, s)
        g = lambda c, s=s: swpp(c, s)
        out.append(f"{s} | {mean(rows, f):.2f} | {mean(ladder, f):.2f} | {mean(bad, f):.2f} | {mean(good, f):.2f} | "
                   f"{fs(bad, s):.2f} | {fs(good, s):.2f} | {mean(rows, g):.2f}")
    lo, hi = pool.boot_ci(rows, lambda c: swp(c) - swc(c), seed=SEED)
    a, s_, g = mean(rows, swp), mean(rows, swc), mean(rows, swg)
    out += ["", "## Predictions", "",
            f"(1) SWP(32) below SWC: {a < s_} ({a:.2f}% against {s_:.2f}%)",
            f"(2) SWP(32) above SWG(32): {a > g} ({a:.2f}% against {g:.2f}%)",
            f"(3) distrust share above 0.3 where SWC loses by > 1 point ({len(bad)} cells, {fs(bad):.2f}) and below 0.1 where SWC <= "
            f"0.5% ({len(good)} cells, {fs(good):.2f}): {fs(bad) > 0.3 and fs(good) < 0.1}",
            f"(4) where SWC <= 0.5%, SWP(32) less than 1 point above SWC: {mean(good, swp) < mean(good, swc) + 1} "
            f"({mean(good, swp):.2f}% against {mean(good, swc):.2f}%)",
            f"(5) where SWC loses by > 1 point, SWP(32) below SWC and above SWS(24,3): "
            f"{mean(bad, sws) < mean(bad, swp) < mean(bad, swc)} ({mean(bad, swp):.2f}% against {mean(bad, swc):.2f}% and "
            f"{mean(bad, sws):.2f}%)",
            f"(6) design-bootstrap 95% interval of mean (SWP(32) - SWC) contains 0: {lo <= 0 <= hi} ({lo:+.2f} to {hi:+.2f} points)"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
