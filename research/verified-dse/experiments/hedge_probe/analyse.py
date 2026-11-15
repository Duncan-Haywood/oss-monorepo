"""Milestone 130: hedge the pilot-probe guard's fall-back instead of abandoning the ladder. Priced by replay (no flow run) on all
90 cells of milestones 119 to 125, paired draw for draw with milestone 129's SWP(32), against SWC, SWG(32) and equal-cost random.

Usage: python3 analyse.py [out.txt]

Why: milestone 129's SWP(32) beat the unguarded ladder SWC on mean regret (4.39% against 4.77%) but lost on 48 cells and won on 19.
Its trust branch is nearly free, so what it costs is false alarms: in about 12% of draws on a cell where SWC is at 0.5% or less, one
uniform point beats the subset's best and the draw falls back to uniform routing, paying random's regret. Its "Next": on distrust,
hedge rather than abandon, routing some ladder ranks and random for the rest.

Costs, budget and the pilot are milestone 129's (units of one r2 score; R = routed/r2; a routed point costs R from scratch and R - 1
once mapped; B = n + 8 (R - 1); the pilot u is routed outside B and not counted in the pick). Stage 1 and the trust branch are
SWP(s)'s exactly. Only the distrust branch changes.

Rule, fixed in this file before its replay table existed. SWH(s, h), on the ladder branch (R > theta = 3; below it, equal-cost random):
  stage 1 and trust: as SWP(s) (map s uniform points, route the subset's best t by r2c(1.25); trust when y[t] <= y[u]).
  distrust: L = n - s + 7 (R - 1) is left. Route the subset's clipped-ladder ranks 2 to h + 1 (already mapped, R - 1 each): the
           hedge, which needs no mapping beyond the subset. Then spend what is left exactly as SWP does: the subset's other mapped
           points in SWP's uniform order at R - 1 while L covers it, then fresh uniform points at R. Total at most B.
  So a distrusting draw keeps h of the subset's best-ranked points and gives up at most h of SWP's uniform routes.
Primary SWH(32, 3). Reported alongside, not chosen: h in {1, 2, 3, 5, 7} at s = 32, and SWHM(32, h) for h in {3, 5}, the hedge that
maps the rest first (cost n - s) and routes the global ladder's next h ranks (skipping t) then 7 - h uniform points at R - 1; it is
the hedge milestone 127 showed starved of budget, kept as a contrast.

Paired design: every rule here reuses SWP's draws (same seed "m129" + cell key + s, same pilot, subset, tie-breaks and uniform
order; SWHM's uniform points come from a separate stream, seed + "-hm"), so SWH(32, h) and SWP(32) differ only on distrusting draws, and the SWP numbers must reproduce milestone 129's table.

All 90 cells are seen (SWG(32) was placed on 74 of them, and milestones 126 to 129 were read before this rule was written), so this
prices SWH, it does not test it blind. The failing/winning split is SWC's own outcome, as in milestones 126 to 129.

Predictions, written in this file before the replay table existed (checked in main()):
 (1) over the 90 cells, SWH(32, 3) has lower mean regret than SWP(32) (4.39%);
 (2) over the 90 cells, SWH(32, 3) has higher mean regret than SWG(32) (3.91%);
 (3) on the cells where SWC is at most 0.5%, SWH(32, 3) gives up less against SWC than SWP(32) does (1.15 points), but still more
     than 0.5 points: the hedge sees only the subset, which holds about a third of the global top ranks;
 (4) on the cells where SWC loses to random by more than 1 point, SWH(32, 3) is within 1 point of SWP(32) (11.83%): three routes
     out of a fall-back of about k cost little there;
 (5) per cell, SWH(32, 3) is better than SWP(32) on more cells than it is worse (ties within 0.01 points);
 (6) SWHM(32, 3) has higher mean regret over the 90 cells than SWP(32): mapping first starves the fall-back where the ladder fails.
"""
import importlib.util
import statistics
import sys
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 130
DRAWS = 200
S = 32
H = 3
HS = (1, 2, 3, 5, 7)
HMS = (3, 5)
EPS = 1e-9


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


pp = _sibling(EXP / "pilot_probe" / "analyse.py", "verified_dse_m130_pp")
st, tp = pp.st, pp.tp
score, rule, pool, sp = tp.score, tp.rule, tp.pool, tp.sp
ALPHA = tp.ALPHA
swc, rand, swg, oracle, mean, lad = tp.swc, tp.rand, tp.swg, tp.oracle, tp.mean, st.lad


def hedge_regret(rs, s, seed):
    """One cell's ladder branch, draw for draw as pilot_probe.pilot_regret: mean regret (%) of SWP(s), SWH(s, h) for h in HS and
    SWHM(s, h) for h in HMS, the distrust share, and the share of distrusting draws whose hedge routes the cell's best point."""
    y = [rule.flow.scores(r)["r4"] for r in rs]
    key = [score.r2c(r, ALPHA) for r in rs]
    best, n = min(y), len(y)
    t_ = rule.stage_times(rs)
    R = (t_["r2"] + t_["r3"] + t_["r4"]) / t_["r2"]
    s = min(s, n)
    rng = random.Random(seed)
    rng_m = random.Random(f"{seed}-hm")
    tot_p = 0.0
    tot_h = {h: 0.0 for h in HS}
    tot_m = {h: 0.0 for h in HMS}
    fell = hit = 0
    for _ in range(DRAWS):
        tb = [rng.random() for _ in range(n)]
        u = rng.randrange(n)
        sub = rng.sample(range(n), s)
        t = min(sub, key=lambda i: (key[i], tb[i]))
        if y[t] <= y[u]:
            order = sorted(range(n), key=lambda i: (key[i], tb[i]))
            chosen = [t] + [i for i in order if i != t][:7]
            r = rule.draw_regret(y, best, chosen)
            tot_p += r
            for h in HS:
                tot_h[h] += r
            for h in HMS:
                tot_m[h] += r
            continue
        fell += 1
        L = n - s + 7 * (R - 1)
        mapped = [i for i in sub if i != t]
        rng.shuffle(mapped)
        sset = set(sub)
        fresh = [i for i in range(n) if i not in sset]
        rng.shuffle(fresh)
        sub_rank = sorted((i for i in sub if i != t), key=lambda i: (key[i], tb[i]))

        def fallback(chosen, left, skip):
            for i in mapped:
                if i in skip:
                    continue
                if left + EPS < R - 1:
                    break
                chosen.append(i)
                left -= R - 1
            for i in fresh:
                if left + EPS < R:
                    break
                chosen.append(i)
                left -= R
            return chosen

        tot_p += rule.draw_regret(y, best, fallback([t], L, set()))
        hit += any(y[i] == best for i in sub_rank[:H])
        for h in HS:
            hedge = sub_rank[:h]
            tot_h[h] += rule.draw_regret(y, best, fallback([t] + hedge, L - len(hedge) * (R - 1), set(hedge)))
        order = sorted(range(n), key=lambda i: (key[i], tb[i]))
        for h in HMS:
            lad_ = [i for i in order if i != t][:h]
            others = [i for i in range(n) if i != t and i not in set(lad_)]
            rest = rng_m.sample(others, min(7 - h, len(others)))
            tot_m[h] += rule.draw_regret(y, best, [t] + lad_ + rest)
    return (100 * tot_p / DRAWS, {h: 100 * v / DRAWS for h, v in tot_h.items()}, {h: 100 * v / DRAWS for h, v in tot_m.items()},
            fell / DRAWS, hit / fell if fell else float("nan"))


def cells():
    rows = st.cells()
    raw = {}
    for t in sorted({c["table"] for c in rows}):
        raw.update(rule.load_table(EXP / t / "results.jsonl", t))
    for c in rows:
        rs = raw[(c["clock"], c["design"], c["table"])]
        c["p"], c["h"], c["m"], c["fell"], c["hit"] = hedge_regret(rs, S, f"m129{c['table']}{c['clock']}{c['design']}{S}")
    return rows


def swp(c):
    return c["p"] if lad(c) else c["rand"]


def swh(c, h=H):
    return c["h"][h] if lad(c) else c["rand"]


def swhm(c, h):
    return c["m"][h] if lad(c) else c["rand"]


RULES = (("SWC", swc), ("SWG(32)", swg), ("SWP(32)", swp), ("SWH(32,3)", swh), ("SWHM(32,3)", lambda c: swhm(c, 3)),
         ("random", rand), ("oracle switch", oracle))


def means(rows):
    return ", ".join(f"{n} {mean(rows, f):.2f}" for n, f in RULES)


def sign(rows, f, g):
    b = sum(f(c) < g(c) - 0.01 for c in rows)
    w = sum(f(c) > g(c) + 0.01 for c in rows)
    return b, w, len(rows) - b - w


def main(dst):
    rows = cells()
    ladder = [c for c in rows if lad(c)]
    bad = [c for c in ladder if swc(c) > c["rand"] + 1]
    good = [c for c in ladder if swc(c) <= 0.5]
    fs = lambda cs: statistics.mean(c["fell"] for c in cs) if cs else float("nan")
    hs = lambda cs: statistics.mean(c["hit"] for c in cs if c["hit"] == c["hit"])
    out = ["# Milestone 130: a hedged fall-back SWH(32, h) for the pilot-probe guard, priced by replay on milestones 119 to 125 "
           "(no flow run)", "",
           f"theta = {score.THETA}, alpha = {ALPHA}; {DRAWS} draws per cell, paired with milestone 129's SWP(32) draws; design "
           f"bootstrap {pool.BOOT} resamples, seed {SEED}.",
           f"{len(rows)} cells on {len({(c['table'], c['design']) for c in rows})} designs; {len(ladder)} on the ladder branch. All are "
           "seen (see the docstring); SWH's parameters were fixed before this table existed.", "",
           "## Per cell, ladder branch (distrust = share of draws that fall back; hit = share of distrusting draws whose t or "
           "3-point hedge holds the cell's best point)", "",
           "table | clock | design | k | random % | SWC % | SWP(32) % | SWH(32,3) % | SWHM(32,3) % | distrust | hit"]
    for c in sorted(ladder, key=lambda c: (swc(c) - c["rand"], c["table"], c["design"], c["clock"])):
        out.append(f"{c['table']} | {c['clock']} | {c['design']} | {c['k']} | {c['rand']:.2f} | {swc(c):.2f} | {swp(c):.2f} | "
                   f"{swh(c):.2f} | {swhm(c, 3):.2f} | {c['fell']:.2f} | {c['hit']:.2f}")
    out += ["", f"## Mean regret % over all {len(rows)} cells", "", means(rows), "",
            f"ladder-branch cells only ({len(ladder)}): {means(ladder)}",
            f"cells where SWC loses to random by > 1 point ({len(bad)}): {means(bad)}",
            f"cells where SWC <= 0.5% ({len(good)}): {means(good)}",
            f"distrust share: {fs(bad):.2f} where SWC loses, {fs(good):.2f} where SWC <= 0.5% (SWP(32)'s, by construction)",
            f"hit share (descriptive): {hs(bad):.2f} where SWC loses, {hs(good):.2f} where SWC <= 0.5%", ""]
    out += sp.compare_lines(rows, ((swh, swp, "SWH(32,3)", "SWP(32)"), (swh, swc, "SWH(32,3)", "SWC"),
                                   (swh, rand, "SWH(32,3)", "random"), (swh, swg, "SWH(32,3)", "SWG(32)")), SEED)
    out += ["", "## SWH(32, h) and SWHM(32, h) grid (descriptive; h = 3 was fixed before the table)", "",
            "rule | mean %, all cells | ladder branch | where SWC loses | where SWC <= 0.5% | better / worse / tied against SWP(32)"]
    grid = [(f"SWH(32,{h})", lambda c, h=h: swh(c, h)) for h in HS] + [(f"SWHM(32,{h})", lambda c, h=h: swhm(c, h)) for h in HMS]
    for name, f in grid:
        b, w, t = sign(ladder, f, swp)
        out.append(f"{name} | {mean(rows, f):.2f} | {mean(ladder, f):.2f} | {mean(bad, f):.2f} | {mean(good, f):.2f} | "
                   f"{b} / {w} / {t}")
    lo, hi = pool.boot_ci(rows, lambda c: swh(c) - swp(c), seed=SEED)
    a, p_, g = mean(rows, swh), mean(rows, swp), mean(rows, swg)
    gap_h = mean(good, swh) - mean(good, swc)
    gap_p = mean(good, swp) - mean(good, swc)
    b, w, t = sign(rows, swh, swp)
    m3 = mean(rows, lambda c: swhm(c, 3))
    out += ["", "## Predictions", "",
            f"(1) SWH(32,3) below SWP(32): {a < p_} ({a:.2f}% against {p_:.2f}%)",
            f"(2) SWH(32,3) above SWG(32): {a > g} ({a:.2f}% against {g:.2f}%)",
            f"(3) where SWC <= 0.5%, SWH(32,3) gives up less than SWP(32) but more than 0.5 points: {0.5 < gap_h < gap_p} "
            f"({gap_h:.2f} against {gap_p:.2f} points)",
            f"(4) where SWC loses by > 1 point, SWH(32,3) within 1 point of SWP(32): {abs(mean(bad, swh) - mean(bad, swp)) < 1} "
            f"({mean(bad, swh):.2f}% against {mean(bad, swp):.2f}%)",
            f"(5) SWH(32,3) better than SWP(32) on more cells than worse: {b > w} (better {b}, worse {w}, tied {t})",
            f"(6) SWHM(32,3) above SWP(32): {m3 > p_} ({m3:.2f}% against {p_:.2f}%)",
            "",
            f"design-bootstrap 95% interval of mean (SWH(32,3) - SWP(32)): {lo:+.2f} to {hi:+.2f} points"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
