"""Milestone 135: a delay-check guard for the clipped ladder. Route the ladder's own top k (points it routes anyway), and if the
smallest-area of them routes slower than the fastest by more than a margin, spend the rest of the ladder's routes on the next key ranks
inside the larger-area band, or on mapped points at random. Priced by replay (no flow run) on all 90 seen cells of milestones 119 to
125, against SWC, SWG(32), SWP(32) and equal-cost random; the same rule on the 42 pooled blind cells of milestones 125, 132 and 133
is reported as a description only (those cells produced the diagnosis this rule comes from).

Usage: python3 analyse.py [out.txt]

Why: milestone 134 found that the ladder fails where, among netlists of nearly the same mapped size, the smaller ones place and route
slower: delay carries 1.49 of the log regret on failing cells, mapped area stays faithful (tau 0.95), and no pre-route statistic sees
it. Its "Next": a guard that measures routed delay among the ladder's own small-area top, using only routes the ladder pays for anyway
(milestones 127 to 129 found probes outside the ladder's 8 too dear).

Costs as in every rule since milestone 111: budget B = n + 8 (R - 1) in r2-units (skip-r1's wall-clock); SWC maps all n and routes
its top 8 by r2c(1.25) at R - 1 each. Below theta = 3 every rule routes equal-cost random.

Rule, fixed in this file before its replay table existed. SWX(k, f) on the ladder branch: map all n points, rank them by r2c(1.25)
with random tie-breaks, route the top k. Among those k, s is the point with the smallest mapped area A2 and q the one with the
smallest routed delay D4 (period - final WNS). Alarm when D4[s] > (1 + f) D4[q].
  no alarm: route ladder ranks k+1 .. 8. Exactly SWC's 8 routes.
  alarm, band fall-back (SWX): route the next 8 - k unrouted points in key order among those with A2 >= A2[q] (the area band at or
      above the fast point's, where milestone 134 says the routed-fast points sit); if the band runs out, continue in key order.
  alarm, random fall-back (SWXR): route 8 - k unrouted points drawn uniformly from the mapped pool.
Every branch routes 8 mapped points: cost B exactly, the same as SWC. The pick is the best routed point. The k test points are SWC's
own top k, so SWX equals SWC on every draw without an alarm, and whenever SWC's pick lies in the top k SWX's regret is no worse.
Primary SWX(3, 0.02) ("top 2 or 3", milestone 134's Next). Reported alongside, not chosen: k in {2, 3, 4}, f in {0, 0.02, 0.05},
and the random fall-back. Expected regret over 200 draws per cell, seed "m135" + cell key + k + f.

All 90 seen cells were read by milestones 126 to 134, so this prices SWX, it does not test it blind; a blind test needs a flow run on
new designs. Groups (fixed before this file): failing = ladder-branch cells where SWC loses to random by more than 1 point; winning =
ladder-branch cells where SWC <= 0.5%.

Predictions, written in this file before the replay table existed (checked in main()):
 (1) over the 90 seen cells, SWX(3, 0.02) has lower mean regret than SWC (4.77%);
 (2) over the 90 seen cells, SWX(3, 0.02) has higher mean regret than SWG(32) (3.91%);
 (3) the alarm share of SWX(3, 0.02) is above 0.3 on failing seen cells and below 0.2 on winning seen cells;
 (4) on winning seen cells, SWX(3, 0.02) gives up less than 0.5 point against SWC (its test routes are SWC's own);
 (5) on failing seen cells, the band fall-back has lower mean regret than the random fall-back (SWXR(3, 0.02));
 (6) the design-bootstrap 95% interval of mean (SWX(3, 0.02) - SWC) over the 90 seen cells contains 0 (2,000 resamples, seed 135).
Reported, not predicted: per-cell table; the grid; SWX against SWP(32); every rule on the 42 pooled blind cells (descriptive).
"""
import importlib.util
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 135
DRAWS = 200
K, F = 3, 0.02
KS = (2, 3, 4)
FS = (0.0, 0.02, 0.05)


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


pp = _sibling(EXP / "pilot_probe" / "analyse.py", "verified_dse_m135_pp")
ld = _sibling(EXP / "ladder_diagnosis" / "analyse.py", "verified_dse_m135_ld")
score, rule, pool, sp = pp.score, pp.rule, pp.pool, pp.sp
ALPHA = pp.ALPHA
swg, swp, lad, mean = pp.swg, pp.swp, pp.lad, pp.mean


def swc(c):
    return c["SWC"]


def rand(c):
    return c["RAND"]
parts = ld.parts


def delay_check(rs, seed):
    """SWX(k, f) and SWXR(k, f) on one cell for every (k, f) of the grid: {(k, f): (band %, random %, alarm share, SWC check %)}.
    One draw's tie-breaks and fall-back order are shared by both fall-backs and by the SWC check, so they are paired."""
    y = [rule.flow.scores(r)["r4"] for r in rs]
    key = [score.r2c(r, ALPHA) for r in rs]
    q = [parts(r) for r in rs]
    A2 = [x["A2"] for x in q]
    D4 = [x["D4"] for x in q]
    best, n = min(y), len(y)
    out = {}
    for k in KS:
        for f in FS:
            rng = random.Random(f"{seed}{k}{f}")
            band = rnd = alarm = chk = 0.0
            for _ in range(DRAWS):
                tb = [rng.random() for _ in range(n)]
                order = sorted(range(n), key=lambda i: (key[i], tb[i]))
                top = order[:k]
                chk += rule.draw_regret(y, best, order[:8])
                s = min(top, key=lambda i: (A2[i], tb[i]))
                qf = min(top, key=lambda i: (D4[i], tb[i]))
                rest = order[k:]
                shuffled = rest[:]
                rng.shuffle(shuffled)
                if D4[s] > (1 + f) * D4[qf]:
                    alarm += 1
                    inband = [i for i in rest if A2[i] >= A2[qf]]
                    outband = [i for i in rest if A2[i] < A2[qf]]
                    band += rule.draw_regret(y, best, top + (inband + outband)[:8 - k])
                    rnd += rule.draw_regret(y, best, top + shuffled[:8 - k])
                else:
                    r = rule.draw_regret(y, best, order[:8])
                    band += r
                    rnd += r
            out[(k, f)] = (100 * band / DRAWS, 100 * rnd / DRAWS, alarm / DRAWS, 100 * chk / DRAWS)
    return out


def attach(rows, raw, tag, f_swc, f_rand):
    for c in rows:
        c["SWC"], c["RAND"] = f_swc(c), f_rand(c)
        if lad(c):
            c["x"] = delay_check(raw[(c["clock"], c["design"], c["table"])], f"m135{tag}{c['table']}{c['clock']}{c['design']}")
    return rows


def seen_cells():
    rows = pp.cells()
    raw = {}
    for t in sorted({c["table"] for c in rows}):
        raw.update(rule.load_table(EXP / t / "results.jsonl", t))
    return attach(rows, raw, "seen", pp.swc, pp.rand)


def blind_cells():
    out = []
    for name, mod, path, src in ld.SOURCES:
        raw = rule.load_table(path, src)
        out += attach(mod.blind_table(), raw, name, ld.swc, ld.rand)
    return out


def swx(c, k=K, f=F):
    return c["x"][(k, f)][0] if lad(c) else rand(c)


def swxr(c, k=K, f=F):
    return c["x"][(k, f)][1] if lad(c) else rand(c)


def alarm(c, k=K, f=F):
    return c["x"][(k, f)][2]


def check(c):
    return c["x"][(K, F)][3] if lad(c) else rand(c)


def amean(cs, k=K, f=F):
    return statistics.mean(alarm(c, k, f) for c in cs) if cs else float("nan")


def groups(rows):
    ladder = [c for c in rows if lad(c)]
    return ladder, [c for c in ladder if swc(c) > rand(c) + 1], [c for c in ladder if swc(c) <= 0.5]


def main(dst):
    rows = seen_cells()
    ladder, bad, good = groups(rows)
    seen_rules = (("SWC", swc), ("SWG(32)", swg), ("SWP(32)", swp), ("SWX(3,0.02)", swx), ("SWXR(3,0.02)", swxr), ("random", rand))
    ms = lambda cs: ", ".join(f"{n} {mean(cs, f):.2f}" for n, f in seen_rules)
    out = ["# Milestone 135: a delay-check guard SWX(k, f) priced by replay on milestones 119 to 125 (no flow run)", "",
           f"theta = {score.THETA}, alpha = {ALPHA}; {DRAWS} draws per cell; design bootstrap {pool.BOOT} resamples, seed {SEED}.",
           f"{len(rows)} seen cells on {len({(c['table'], c['design']) for c in rows})} designs; {len(ladder)} on the ladder branch; "
           f"{len(bad)} failing, {len(good)} winning. SWX's parameters were fixed before this table existed.",
           f"SWC check (this file's tie-breaks, all {len(rows)} cells): {mean(rows, check):.2f}% against SWC's {mean(rows, swc):.2f}%.", "",
           "## Per cell, ladder branch (alarm = share of draws where SWX(3, 0.02) falls back)", "",
           "table | clock | design | routed/r2 | random % | SWC % | SWP(32) % | SWX(3,0.02) % | SWXR(3,0.02) % | alarm"]
    for c in sorted(ladder, key=lambda c: (swc(c) - rand(c), c["table"], c["design"], c["clock"])):
        out.append(f"{c['table']} | {c['clock']} | {c['design']} | {c['ratio']:.2f} | {rand(c):.2f} | {swc(c):.2f} | {swp(c):.2f} | "
                   f"{swx(c):.2f} | {swxr(c):.2f} | {alarm(c):.2f}")
    out += ["", f"## Mean regret % over all {len(rows)} seen cells", "", ms(rows), "",
            f"ladder-branch cells only ({len(ladder)}): {ms(ladder)}",
            f"failing cells, SWC loses to random by > 1 point ({len(bad)}): {ms(bad)}",
            f"winning cells, SWC <= 0.5% ({len(good)}): {ms(good)}", ""]
    out += sp.compare_lines(rows, ((swx, swc, "SWX(3,0.02)", "SWC"), (swx, rand, "SWX(3,0.02)", "random"),
                                   (swx, swg, "SWX(3,0.02)", "SWG(32)"), (swx, swp, "SWX(3,0.02)", "SWP(32)")), SEED)
    out += ["", "## Grid, seen cells (descriptive; k = 3, f = 0.02 was fixed before the table)", "",
            "k | f | SWX mean %, all | SWXR mean %, all | SWX failing | SWXR failing | SWX winning | alarm failing | alarm winning"]
    for k in KS:
        for f in FS:
            a = lambda c, k=k, f=f: swx(c, k, f)
            b = lambda c, k=k, f=f: swxr(c, k, f)
            out.append(f"{k} | {f} | {mean(rows, a):.2f} | {mean(rows, b):.2f} | {mean(bad, a):.2f} | {mean(bad, b):.2f} | "
                       f"{mean(good, a):.2f} | {amean(bad, k, f):.2f} | {amean(good, k, f):.2f}")

    blind = blind_cells()
    bl, bb, bg = groups(blind)
    blind_rules = (("SWC", swc), ("SWX(3,0.02)", swx), ("SWXR(3,0.02)", swxr), ("random", rand))
    mb = lambda cs: ", ".join(f"{n} {mean(cs, f):.2f}" for n, f in blind_rules)
    out += ["", f"## Pooled blind cells of milestones 125, 132 and 133 (descriptive: milestone 134's diagnosis was drawn from them)", "",
            f"{len(blind)} cells on {len({(c['table'], c['design']) for c in blind})} designs; {len(bl)} on the ladder branch; "
            f"{len(bb)} failing, {len(bg)} winning.", "",
            f"all cells: {mb(blind)}", f"failing ({len(bb)}): {mb(bb)}", f"winning ({len(bg)}): {mb(bg)}",
            f"alarm share of SWX(3,0.02): failing {amean(bb):.2f}, winning {amean(bg):.2f}"]
    out += sp.compare_lines(blind, ((swx, swc, "SWX(3,0.02)", "SWC"), (swx, rand, "SWX(3,0.02)", "random")), SEED)

    lo, hi = pool.boot_ci(rows, lambda c: swx(c) - swc(c), seed=SEED)
    a, s_, g = mean(rows, swx), mean(rows, swc), mean(rows, swg)
    out += ["", "## Predictions (seen cells)", "",
            f"(1) SWX(3,0.02) below SWC: {a < s_} ({a:.2f}% against {s_:.2f}%)",
            f"(2) SWX(3,0.02) above SWG(32): {a > g} ({a:.2f}% against {g:.2f}%)",
            f"(3) alarm share above 0.3 on failing cells ({amean(bad):.2f}) and below 0.2 on winning cells ({amean(good):.2f}): "
            f"{amean(bad) > 0.3 and amean(good) < 0.2}",
            f"(4) on winning cells, SWX(3,0.02) less than 0.5 point above SWC: {mean(good, swx) < mean(good, swc) + 0.5} "
            f"({mean(good, swx):.2f}% against {mean(good, swc):.2f}%)",
            f"(5) on failing cells, band fall-back below random fall-back: {mean(bad, swx) < mean(bad, swxr)} "
            f"({mean(bad, swx):.2f}% against {mean(bad, swxr):.2f}%)",
            f"(6) design-bootstrap 95% interval of mean (SWX(3,0.02) - SWC) contains 0: {lo <= 0 <= hi} ({lo:+.2f} to {hi:+.2f} points)"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))
    return rows, blind


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
