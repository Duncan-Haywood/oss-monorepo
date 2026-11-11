"""Milestone 115: the routed flow repairs timing up to the clock and no further, so at a relaxed clock routed delay saturates at the
period while the mapped (r2) score keeps rewarding mapped speed the routed result will never show. Does a mapped score clipped at the
period fix the relaxed-clock multiplier miss of the cost-ratio switch? Chosen on the 52 held-out cells, tested blind on seven designs
run for this milestone (experiments/clip_score/run.py).

Usage: python3 score.py [out.txt]

Mechanism (seen before this file was written, on the 52 held-out cells only): at the relaxed clock the median over points of routed
delay / period (period - final WNS, over period) is 0.998 to 1.000 on every multiplier (mult16 to mult40), 1.000 on xbar16 and 0.995
on gf2mat48; at the tight clock it is 1.07 to 1.15 on the multipliers. The routed score area x delay is then area x period, ranked by
routed area alone, while the r2 score area x mapped delay mixes in a mapped-delay spread the routed flow erases.

Score: r2c(alpha) = mapped area x max(period, alpha x mapped delay), mapped delay = period - r2 WNS. alpha = None is the unclipped r2
(area x mapped delay). alpha > 1 allows for wires the mapped netlist does not see: only a point whose mapped delay is below
period / alpha is treated as meeting the clock. Grid {None, 1, 1.25, 1.5, 2, 3}.
SWC(alpha) = the switch SW(3) of milestone 111 with r2c(alpha) in place of r2 in its ladder branch: if routed/r2 > 3 rank every point
by r2c (random tie-breaks) and route the best 8, else route the same wall-clock's worth of uniformly drawn points. Same stages, same
cost as SW; SWC(None) = SW. skip-r1 and random regrets are switch_guard/rule.py's cell(), imported unchanged with each table's earlier
seeds, so SW's numbers equal milestones 111 to 114's. The clipped ladder uses its own seed per cell ("m115" + the cell key).

Selection: alpha with the lowest mean SWC regret on the 52 held-out cells (ties to the earlier grid entry); leave-one-family-out as
milestone 114 (families leave together) for the honest in-sample estimate.

What was seen before this file was written, so it is NOT a test here: one exploratory pass computed skip-r1 regret with r2c on the
held-out cells, milestone 112 and 113's 28 dear-pool cells and milestone 108's fresh pool, at every alpha in the grid. On the held-out
cells with routed/r2 > 3, skip-r1 had 2.07% unclipped and 0.05% at alpha = 1.25 (0.50% at 1); on the 22 dear-pool cells above the
threshold 1.18% unclipped and 1.05% at 1.25, the relaxed misses mult18, mult24 and xbar16 going to 0.00% and barrel128 relaxed rising
from 0.00% to 19.2%. Those tables are reported below as "seen", with that caveat.

Blind test: experiments/clip_score/results.jsonl, seven designs no earlier table ran (mult14, mult26, sq16, sq24, xbar32x2, gf2mat40,
gf2mat56), milestone 108's 120 sequences, both clocks, Yosys 0.70 and OpenROAD 26Q3. Designs and predictions were fixed in this commit
before the flow ran.

Predictions, written in this file before the blind table existed:
 (1) the chosen alpha is 1.25 (known from the exploration above; stated so a different choice by the code would be visible);
 (2) on the blind cells, SWC has lower mean regret than SW;
 (3) on the blind cells, SWC is better than SW in more cells than it is worse;
 (4) on the blind tight cells, SWC is within 0.1 points of SW on the mean (the clip rarely binds at a tight clock);
 (5) on every blind relaxed multiplier or squarer cell, the median routed delay / period is between 0.97 and 1.03 (the mechanism);
 (6) on the blind cells, SWC has lower mean regret than equal-cost random routing.
A design-level bootstrap (both clocks resampled together, 2,000 resamples, seed 115) gives a 95% interval for SWC - SW on the blind
cells; it is reported, not a prediction.
"""
import importlib.util
import random
import re
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


rule = _sibling(EXP / "switch_guard" / "rule.py", "verified_dse_switch_rule")
THETA = 3
ALPHAS = (None, 1, 1.25, 1.5, 2, 3)
DRAWS = rule.DRAWS
BOOT = 2000
BLIND = EXP / "clip_score" / "results.jsonl"


def family(design):
    return re.sub(r"\d+(x\d+)?$", "", design)


def r2c(r, alpha):
    p = r["period_ns"]
    d = p - r["synth_netlist_wns"]
    return r["synth_netlist_area"] * (d if alpha is None else max(p, alpha * d))


def clipped_skip(rs, alpha, seed):
    """skip-r1 (n, 8, 8) ranked by r2c(alpha): mean regret (%) over DRAWS random tie-breaks."""
    y = [rule.flow.scores(r)["r4"] for r in rs]
    key = [r2c(r, alpha) for r in rs]
    best, n = min(y), len(y)
    rng = random.Random(seed)
    tot = 0.0
    for _ in range(DRAWS):
        tb = [rng.random() for _ in range(n)]
        tot += rule.draw_regret(y, best, sorted(range(n), key=lambda i: (key[i], tb[i]))[:8])
    return 100 * tot / DRAWS


def build(raw, tagfn):
    rows = []
    for key in sorted(raw, key=lambda k: (k[2], k[1], k[0])):
        rs = raw[key]
        c = rule.cell(rs, tagfn(key))
        c.update(clock=key[0], design=key[1], table=key[2])
        c["clip"] = {a: (c["skip"] if a is None else clipped_skip(rs, a, f"m115{key[0]}{key[1]}{key[2]}{a}")) for a in ALPHAS}
        p = rs[0]["period_ns"]
        c["share"] = statistics.median((p - r["final_wns"]) / p for r in rs)
        c["binds"] = statistics.mean(1.25 * (p - r["synth_netlist_wns"]) < p for r in rs)
        rows.append(c)
    return rows


def sw(c):
    return rule.sw(c, THETA)


def swc(c, a):
    return c["clip"][a] if c["ratio"] > THETA else c["rand"]


def mean(rows, f):
    return statistics.mean(f(c) for c in rows)


def choose(rows):
    return min(ALPHAS, key=lambda a: (round(mean(rows, lambda c: swc(c, a)), 9), ALPHAS.index(a)))


def lofo(rows):
    out = []
    for fam in sorted({family(c["design"]) for c in rows}):
        a = choose([c for c in rows if family(c["design"]) != fam])
        out += [swc(c, a) for c in rows if family(c["design"]) == fam]
    return statistics.mean(out)


def boot_ci(rows, f, seed=115):
    designs = sorted({(c["table"], c["design"]) for c in rows})
    by = {d: [c for c in rows if (c["table"], c["design"]) == d] for d in designs}
    rng = random.Random(seed)
    ms = sorted(statistics.mean(f(c) for d in rng.choices(designs, k=len(designs)) for c in by[d]) for _ in range(BOOT))
    return ms[int(0.025 * BOOT)], ms[int(0.975 * BOOT) - 1]


def aname(a):
    return "unclipped" if a is None else f"{a:g}"


def tables():
    held = build(rule.replay.load(), lambda k: f"m111held{k[0]}{k[1]}{k[2]}")
    dear = (build(rule.load_table(EXP / "fresh_dear" / "results.jsonl", "fresh_dear"), lambda k: f"m112{k[0]}{k[1]}") +
            build(rule.load_table(EXP / "fresh_designs" / "results.jsonl", "fresh_designs"), lambda k: f"m113{k[0]}{k[1]}"))
    pool = build(rule.load_table(EXP / "fresh_pool" / "results.jsonl", "fresh_pool"), lambda k: f"m111fresh{k[0]}{k[1]}")
    blind = build(rule.load_table(BLIND, "clip_score"), lambda k: f"m115blind{k[0]}{k[1]}") if BLIND.exists() else []
    return held, dear, pool, blind


def main(dst):
    held, dear, pool, blind = tables()
    a = choose(held)
    X = lambda c: swc(c, a)
    out = ["# Milestone 115: a mapped score clipped at the clock period, chosen on 26 held-out designs, tested blind on 7 new designs "
           "(cached tables plus one flow run)", "",
           f"Chosen alpha: {aname(a)}; SW theta = {THETA}; {DRAWS} draws per cell.", "",
           "## Held-out cells (selection set)", "",
           f"SW {mean(held, sw):.2f}%, SWC in-sample {mean(held, X):.2f}%, SWC leave-one-family-out {lofo(held):.2f}%", "",
           "alpha grid on the held-out cells (mean SWC regret %, worst cell %):"]
    for b in ALPHAS:
        v = [swc(c, b) for c in held]
        out.append(f"  {aname(b)}: {statistics.mean(v):.2f}, worst {max(v):.2f}")
    head = ("table | clock | design | routed/r2 | routed delay/period | clip binds | skip-r1 % | clipped skip-r1 % | random % | "
            "SW % | SWC %")
    sections = (("Held-out (selection)", held), ("Dear-pool cells of milestones 112, 113 (seen in the exploration; not a test)", dear),
                ("Fresh pool of milestone 108 (seen in the exploration; not a test)", pool),
                ("Blind test: seven new designs (milestone 115 flow run)", blind))
    for label, rows in sections:
        if not rows:
            out += ["", f"## {label}: no table yet"]
            continue
        out += ["", f"## {label}: {len(rows)} cells", "", head]
        for c in rows:
            out.append(f"{c['table']} | {c['clock']} | {c['design']} | {c['ratio']:.2f} | {c['share']:.3f} | {c['binds']:.2f} | "
                       f"{c['skip']:.2f} | {c['clip'][a]:.2f} | {c['rand']:.2f} | {sw(c):.2f} | {X(c):.2f}")
        w, l = sum(X(c) < sw(c) for c in rows), sum(X(c) > sw(c) for c in rows)
        out += ["", f"mean regret: SW {mean(rows, sw):.2f}%, SWC {mean(rows, X):.2f}%, skip-r1 {mean(rows, lambda c: c['skip']):.2f}%, "
                f"random {mean(rows, lambda c: c['rand']):.2f}%; SWC vs SW better {w}, worse {l} (sign p = {rule.sign_p(w, l):.3f})"]
    if not blind:
        Path(dst).write_text("\n".join(out) + "\n")
        print("\n".join(out))
        return
    lo, hi = boot_ci(blind, lambda c: X(c) - sw(c))
    w, l = sum(X(c) < sw(c) for c in blind), sum(X(c) > sw(c) for c in blind)
    tight = [c for c in blind if c["clock"] == "tight"]
    mech = [c for c in blind if c["clock"] == "relaxed" and family(c["design"]) in ("mult", "sq")]
    out += ["", f"design bootstrap 95% interval of mean (SWC - SW) on the blind cells: {lo:+.2f} to {hi:+.2f} points", "",
            f"(1) chosen alpha is 1.25: {a == 1.25}",
            f"(2) blind SWC below SW: {mean(blind, X) < mean(blind, sw)}",
            f"(3) blind SWC better than SW in more cells than worse: {w > l} ({w} better, {l} worse)",
            f"(4) blind tight SWC within 0.1 points of SW: {abs(mean(tight, X) - mean(tight, sw)) <= 0.1}",
            f"(5) blind relaxed mult/sq routed delay/period in [0.97, 1.03]: {all(0.97 <= c['share'] <= 1.03 for c in mech)} "
            "(" + ", ".join("%s %.3f" % (c["design"], c["share"]) for c in mech) + ")",
            f"(6) blind SWC below equal-cost random: {mean(blind, X) < mean(blind, lambda c: c['rand'])}"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
