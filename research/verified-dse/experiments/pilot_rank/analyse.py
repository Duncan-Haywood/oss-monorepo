"""Milestone 126: instead of guessing from the RTL which shifters the mapped rung misranks, route a few probe points and check whether
the clipped mapped score orders them the way the routed flow does; trust the ladder only if it does. Priced by replay (no flow run)
on all 90 cells of milestones 119 to 125, against equal-cost random routing, the unguarded clipped ladder SWC and the structural
guard SWG(32).

Usage: python3 analyse.py [out.txt]

Why: milestones 119 to 125 tried four structural guards (shift operator, mux share, word-level amount depth, gate-level amount depth).
Each was placed on seen cells and failed or moved on the next blind set; milestone 125 found the same family winning at 28 gates and
losing at 36 (pmul3, pmul4). Its "Next" asked to stop guessing structure and measure it: a pilot-side guard priced by replay first,
then blind. Milestone 111 tried the unclipped form of this test, G(p, tau0) on r2, on its held-out cells: it flagged bcastmix192 but its
false alarms cost more than it saved. Two things are different here: the ladder now ranks by the clipped score r2c(1.25), and on these
90 cells the ladder's failures are large (SWC up to 27.73% against 4.32% random) and confined to shifters, so a test that catches
them has more to gain.

Rule, fixed in this file before its replay table existed. SWCV(p, tau0): below the cost threshold (routed/r2 <= theta = 3) route the
same wall-clock's worth of uniformly drawn points, as SWC and random do. Above it, route p uniformly drawn points in full (the timing
pilot SWC already pays for is one of them) and compute Kendall tau-b between r2c(1.25) = mapped area x max(period, 1.25 x mapped
delay) and the routed score r4 = routed area x routed delay on those p points (an undefined tau, a constant score, counts as 0).
  tau >= tau0: rank the other n - p points by r2c(1.25) (random tie-breaks) and route the best 8 - p; the pick is the best routed of
               all 8. Cost (n - p) x r2 + (8 - p) x (r3 + r4) + p x routed = skip-r1's wall-clock B, milestone 111's accounting.
  tau <  tau0: route k - p more uniformly drawn points (k = equal-cost random's count) and pick the best routed of the k.
The probes count toward the pick, as in milestone 111's G, so every rule spends B. Primary SWCV(4, 0), fixed by mechanism: 4 probes
(6 pairs) as milestone 118's SWCG, and tau0 = 0, "fall back only when the mapped score's order on the probes is no better than
chance". Reported alongside, not predicted: p in {3, 4, 6} x tau0 in {-1, 0, 0.2, 0.4} (tau0 = -1 never falls back and prices the
probes alone), the oracle switch min(clipped ladder, random) per cell (a floor for any ladder-or-random switch), and SWGV = SWG(32)
then SWCV(4, 0) on the designs SWG(32) does not flag. Expected regret over 200 probe draws per cell, seed "m126" + cell key + (p, tau0).

All 90 cells are seen: SWG(32) was placed on 74 of them (milestone 124) and tested blind on the other 16 (milestone 125). This replay
therefore prices SWCV, it does not test it blind; SWCV's parameters were not chosen on these cells, SWG(32)'s threshold partly was.

Predictions, written in this file before the replay table existed (checked in main()):
 (1) over the 90 cells, SWCV(4, 0) has lower mean regret than SWC;
 (2) over the 90 cells, SWCV(4, 0) has lower mean regret than equal-cost random;
 (3) over the 90 cells, SWCV(4, 0) has higher mean regret than SWG(32) (the probe test is noisy at 6 pairs and the structural cut
     was placed on most of these cells);
 (4) on the ladder-branch cells where SWC is worse than random by more than 1 point, the mean fall-back share of SWCV(4, 0) exceeds
     0.5; on the ladder-branch cells where SWC is at most 0.5%, it is below 0.25;
 (5) on the 67 ladder-branch cells, SWCV(4, 0) has lower mean regret than SWCV(4, -1) (the test earns more than it costs);
 (6) the design-bootstrap 95% interval of mean (SWCV(4, 0) - random) over the 90 cells lies below 0 (2,000 resamples, seed 126).
"""
import importlib.util
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 126
DRAWS = 200
P, TAU0 = 4, 0
GRID = tuple((p, t) for p in (3, 4, 6) for t in (-1, 0, 0.2, 0.4))


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ml = _sibling(EXP / "amount_lanes" / "analyse.py", "verified_dse_m126_ml")
score, rule, pool, sp, nf = ml.score, ml.rule, ml.pool, ml.sp, ml.nf
ALPHA = nf.ALPHA
swc, rand, swg, mean = ml.swc, ml.rand, ml.swg, ml.mean
M125 = {"amount_lanes"}


def vet_regret(rs, k, p, tau0, seed):
    """SWCV(p, tau0)'s ladder branch: mean regret (%) and fall-back share over DRAWS probe draws."""
    y = [rule.flow.scores(r)["r4"] for r in rs]
    key = [score.r2c(r, ALPHA) for r in rs]
    best, n = min(y), len(y)
    rng = random.Random(seed)
    tot = fell = 0.0
    for _ in range(DRAWS):
        probe = rng.sample(range(n), p)
        tau = rule.stats.kendall_tau_b([key[i] for i in probe], [y[i] for i in probe])
        pr = set(probe)
        rest = [i for i in range(n) if i not in pr]
        if (0.0 if tau is None else tau) >= tau0:
            tb = {i: rng.random() for i in rest}
            chosen = probe + sorted(rest, key=lambda i: (key[i], tb[i]))[:8 - p]
        else:
            fell += 1
            chosen = probe + rng.sample(rest, max(k - p, 0))
        tot += rule.draw_regret(y, best, chosen)
    return 100 * tot / DRAWS, fell / DRAWS


def cells():
    rows = ml.seen_tables() + ml.blind_table()
    raw = {}
    for t in sorted({c["table"] for c in rows}):
        raw.update(rule.load_table(EXP / t / "results.jsonl", t))
    for c in rows:
        rs = raw[(c["clock"], c["design"], c["table"])]
        c["v"], c["vfell"] = {}, {}
        c["tau_all"] = rule.stats.kendall_tau_b([score.r2c(r, ALPHA) for r in rs], [rule.flow.scores(r)["r4"] for r in rs])
        top = sorted(range(len(rs)), key=lambda i: score.r2c(rs[i], ALPHA))[:16]
        c["tau_top"] = rule.stats.kendall_tau_b([score.r2c(rs[i], ALPHA) for i in top], [rule.flow.scores(rs[i])["r4"] for i in top])
        for p, t in GRID:
            c["v"][(p, t)], c["vfell"][(p, t)] = vet_regret(rs, c["k"], p, t, f"m126{c['table']}{c['clock']}{c['design']}{p}{t}")
    return rows


def swcv(c, p=P, tau0=TAU0):
    return c["v"][(p, tau0)] if c["ratio"] > score.THETA else c["rand"]


def swgv(c):
    return c["rand"] if ml.flag_g(c["design"]) else swcv(c)


def oracle(c):
    return min(c["clip"][ALPHA], c["rand"]) if c["ratio"] > score.THETA else c["rand"]


RULES = (("SWC", swc), ("SWG(32)", swg), ("SWCV(4,0)", swcv), ("SWGV", swgv), ("random", rand), ("oracle switch", oracle))


def means(rows):
    return ", ".join(f"{n} {mean(rows, f):.2f}" for n, f in RULES)


def main(dst):
    rows = cells()
    lad = [c for c in rows if c["ratio"] > score.THETA]
    blind = [c for c in rows if c["table"] in M125]
    out = ["# Milestone 126: a probe-rank guard SWCV(p, tau0) priced by replay on milestones 119 to 125 (no flow run)", "",
           f"theta = {score.THETA}, alpha = {ALPHA}; {DRAWS} probe draws per cell; design bootstrap {pool.BOOT} resamples, seed {SEED}.",
           f"{len(rows)} cells on {len({(c['table'], c['design']) for c in rows})} designs; {len(lad)} on the ladder branch. All are seen "
           "(see the docstring); SWCV's parameters were fixed before this table existed.", "",
           "## Per cell, ladder branch (fall-back = share of probe draws where SWCV(4, 0) routes randomly)", "",
           "table | clock | design | routed/r2 | random % | SWC % | SWG(32) % | SWCV(4,0) % | fall-back | SWCV(4,-1) %"]
    for c in sorted(lad, key=lambda c: (swc(c) - c["rand"], c["table"], c["design"], c["clock"])):
        out.append(f"{c['table']} | {c['clock']} | {c['design']} | {c['ratio']:.2f} | {c['rand']:.2f} | {swc(c):.2f} | {swg(c):.2f} | "
                   f"{swcv(c):.2f} | {c['vfell'][(P, TAU0)]:.2f} | {swcv(c, P, -1):.2f}")
    out += ["", f"## Mean regret % over all {len(rows)} cells", "", means(rows), "",
            f"ladder-branch cells only ({len(lad)}): {means(lad)}",
            f"milestone 125's cells only ({len(blind)}): {means(blind)}", ""]
    out += sp.compare_lines(rows, ((swcv, rand, "SWCV(4,0)", "random"), (swcv, swc, "SWCV(4,0)", "SWC"),
                                   (swcv, swg, "SWCV(4,0)", "SWG(32)"), (swgv, swg, "SWGV", "SWG(32)")), SEED)
    out += ["", "## SWCV(p, tau0) grid (descriptive; (4, 0) was fixed before the table)", "",
            "p | tau0 | mean regret %, all cells | ladder-branch cells | mean fall-back share on the ladder branch"]
    for p, t in GRID:
        out.append(f"{p} | {t:g} | {mean(rows, lambda c: swcv(c, p, t)):.2f} | {mean(lad, lambda c: swcv(c, p, t)):.2f} | "
                   f"{statistics.mean(c['vfell'][(p, t)] for c in lad):.2f}")
    bad = [c for c in lad if swc(c) > c["rand"] + 1]
    good = [c for c in lad if swc(c) <= 0.5]
    fb = lambda cs: statistics.mean(c["vfell"][(P, TAU0)] for c in cs) if cs else float("nan")
    lo, hi = pool.boot_ci(rows, lambda c: swcv(c) - rand(c), seed=SEED)
    out += ["", "## Predictions", "",
            f"(1) SWCV(4,0) below SWC: {mean(rows, swcv) < mean(rows, swc)} ({mean(rows, swcv):.2f}% against {mean(rows, swc):.2f}%)",
            f"(2) SWCV(4,0) below random: {mean(rows, swcv) < mean(rows, rand)} ({mean(rows, swcv):.2f}% against {mean(rows, rand):.2f}%)",
            f"(3) SWCV(4,0) above SWG(32): {mean(rows, swcv) > mean(rows, swg)} ({mean(rows, swcv):.2f}% against {mean(rows, swg):.2f}%)",
            f"(4) fall-back share above 0.5 where SWC loses by > 1 point ({len(bad)} cells, {fb(bad):.2f}) and below 0.25 where SWC <= "
            f"0.5% ({len(good)} cells, {fb(good):.2f}): {fb(bad) > 0.5 and fb(good) < 0.25}",
            f"(5) ladder branch SWCV(4,0) below SWCV(4,-1): {mean(lad, swcv) < mean(lad, lambda c: swcv(c, P, -1))} "
            f"({mean(lad, swcv):.2f}% against {mean(lad, lambda c: swcv(c, P, -1)):.2f}%)",
            f"(6) design-bootstrap 95% interval of mean (SWCV(4,0) - random) below 0: {hi < 0} ({lo:+.2f} to {hi:+.2f} points)"]
    tm = lambda cs, k: statistics.mean(c[k] or 0.0 for c in cs)
    out += ["", "post hoc (added after the table above was read): Kendall tau-b of r2c(1.25) against the routed score, over every point "
            "of a cell and over the clipped ladder's own top 16, averaged",
            f"post hoc: cells where SWC loses by > 1 point ({len(bad)}): all points {tm(bad, 'tau_all'):+.2f}, top 16 "
            f"{tm(bad, 'tau_top'):+.2f}",
            f"post hoc: cells where SWC <= 0.5% ({len(good)}): all points {tm(good, 'tau_all'):+.2f}, top 16 {tm(good, 'tau_top'):+.2f}"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
