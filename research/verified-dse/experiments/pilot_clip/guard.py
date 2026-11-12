"""Milestone 116: milestone 115's clipped mapped score fails where the routed flow lands far below the clock period (barrel128 relaxed,
routed delay / period 0.40, clipped skip-r1 regret 19.2% against 0.00% unclipped). The switch already routes one point to time the
routed stage; does that pilot's routed delay / period tell it when to clip? Tested blind on five designs run for this milestone
(experiments/pilot_clip/run.py).

Usage: python3 guard.py [out.txt]

Rule, fixed in this file before the blind table existed. SWCP(s): the switch SW(3) of milestone 111. Below the cost threshold
(routed/r2 <= 3) it routes the same wall-clock's worth of uniformly drawn points, as SW and SWC do. Above it, it reads the routed delay /
period of its timing pilot, one uniformly drawn point routed in full (period - final WNS, over period). If that share is >= s it ranks
every point by milestone 115's clipped score r2c(1.25) = mapped area x max(period, 1.25 x mapped delay); otherwise by the unclipped r2
(area x mapped delay). Either way it routes the best 8. The pilot is the point SW and SWC already route to measure the cost ratio, so
SWCP has the same stages and the same cost; the pilot is not added to the 8. Its expected regret over the pilot draw is exact:
q x clipped + (1 - q) x unclipped, with q the share of the cell's points whose routed delay / period is >= s. Clipped and unclipped
skip-r1 regrets, random regrets and the cost ratio are clip_score/score.py's build(), imported unchanged with each table's earlier
seeds, so SW and SWC equal milestones 111 to 115's numbers.

s = 0.9, fixed by the mechanism, not selected: the clip is right where the routed flow repairs timing up to the clock and stops
(share about 1), and wrong where routed delay sits well below the period. Seen before this file was written, on milestone 112, 113 and
115's tables (per-point shares; not a test): every point of every mult, sq, gf2mat, xbar and bcastadd cell above the threshold has share
>= 0.84 and all but bcastadd64 relaxed have >= 0.95 at the tenth percentile; barrel128's points lie in 0.32 to 0.54 (relaxed) and 0.47
to 0.80 (tight). Other s values are reported as a descriptive sensitivity line, not a choice.

Blind test: experiments/pilot_clip/results.jsonl, five designs no earlier table ran: barrel96, barrel192, barrel256 (the family where
the clip failed), mult30 and sq28 (families where it held). Milestone 108's 120 sequences, both clocks, Yosys 0.70 and OpenROAD 26Q3.

Predictions, written in this file before the blind table existed:
 (1) every blind barrel cell at the relaxed clock has median routed delay / period below 0.7, and q(0.9) = 0;
 (2) every blind mult30 and sq28 cell has q(0.9) >= 0.95;
 (3) at least two of the three blind barrel designs have routed/r2 > 3 at the relaxed clock (so the guard is exercised);
 (4) on blind barrel cells above the threshold where the clip binds (relaxed), clipped skip-r1 is worse than unclipped in more cells
     than it is better (the clip's failure recurs);
 (5) on the blind cells, SWCP(0.9) has lower mean regret than both SW and SWC;
 (6) on the blind cells, SWCP(0.9) has lower mean regret than equal-cost random routing.
A design-level bootstrap (both clocks resampled together, 2,000 resamples, seed 116) gives 95% intervals for SWCP - SWC and SWCP - SW
on the blind cells, and the pooled table of milestones 110 to 116 (every cell; only the blind ones are a test) is reported for the
paper section.
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


score = _sibling(EXP / "clip_score" / "score.py", "verified_dse_clip_score")
rule = score.rule
ALPHA = 1.25
S = 0.9
SENS = (0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 0.97)
BOOT = 2000
BLIND = HERE / "results.jsonl"


def shares(rs):
    return [(r["period_ns"] - r["final_wns"]) / r["period_ns"] for r in rs]


def build(raw, tagfn):
    rows = score.build(raw, tagfn)
    for c in rows:
        sh = shares(raw[(c["clock"], c["design"], c["table"])])
        c["q"] = {s: statistics.mean(x >= s for x in sh) for s in SENS}
    return rows


def sw(c):
    return score.sw(c)


def swc(c):
    return score.swc(c, ALPHA)


def swcp(c, s=S):
    if c["ratio"] <= score.THETA:
        return c["rand"]
    q = c["q"][s]
    return q * c["clip"][ALPHA] + (1 - q) * c["skip"]


def mean(rows, f):
    return statistics.mean(f(c) for c in rows)


def boot_ci(rows, f, seed=116):
    return score.boot_ci(rows, f, seed)


def tables():
    held = build(rule.replay.load(), lambda k: f"m111held{k[0]}{k[1]}{k[2]}")
    dear = (build(rule.load_table(EXP / "fresh_dear" / "results.jsonl", "fresh_dear"), lambda k: f"m112{k[0]}{k[1]}") +
            build(rule.load_table(EXP / "fresh_designs" / "results.jsonl", "fresh_designs"), lambda k: f"m113{k[0]}{k[1]}"))
    pool = build(rule.load_table(EXP / "fresh_pool" / "results.jsonl", "fresh_pool"), lambda k: f"m111fresh{k[0]}{k[1]}")
    m115 = build(rule.load_table(score.BLIND, "clip_score"), lambda k: f"m115blind{k[0]}{k[1]}")
    blind = build(rule.load_table(BLIND, "pilot_clip"), lambda k: f"m116blind{k[0]}{k[1]}") if BLIND.exists() else []
    return held, dear, pool, m115, blind


def summary(label, rows):
    w, l = sum(swcp(c) < swc(c) for c in rows), sum(swcp(c) > swc(c) for c in rows)
    return (f"{label}: {len(rows)} cells; mean regret SW {mean(rows, sw):.2f}%, SWC {mean(rows, swc):.2f}%, SWCP {mean(rows, swcp):.2f}%, "
            f"skip-r1 {mean(rows, lambda c: c['skip']):.2f}%, random {mean(rows, lambda c: c['rand']):.2f}%; "
            f"SWCP vs SWC better {w}, worse {l}")


def main(dst):
    held, dear, pool, m115, blind = tables()
    out = ["# Milestone 116: the switch's timing pilot decides whether to clip the mapped score; s = 0.9 fixed by mechanism, tested "
           "blind on 5 new designs (cached tables plus one flow run)", "",
           f"SW theta = {score.THETA}, clip alpha = {ALPHA}, pilot threshold s = {S}; {rule.DRAWS} draws per cell for the skip-r1 and "
           "random regrets; the pilot is integrated exactly.", ""]
    head = ("table | clock | design | routed/r2 | routed delay/period | q(0.9) | skip-r1 % | clipped skip-r1 % | random % | SW % | "
            "SWC % | SWCP %")
    sections = (("Held-out cells of milestone 110 (seen)", held), ("Dear-pool cells of milestones 112, 113 (seen)", dear),
                ("Fresh pool of milestone 108 (seen)", pool), ("Blind cells of milestone 115 (seen)", m115),
                ("Blind test: five new designs (milestone 116 flow run)", blind))
    for label, rows in sections:
        if not rows:
            out += ["", f"## {label}: no table yet"]
            continue
        out += ["", f"## {label}: {len(rows)} cells", "", head]
        for c in rows:
            out.append(f"{c['table']} | {c['clock']} | {c['design']} | {c['ratio']:.2f} | {c['share']:.3f} | {c['q'][S]:.2f} | "
                       f"{c['skip']:.2f} | {c['clip'][ALPHA]:.2f} | {c['rand']:.2f} | {sw(c):.2f} | {swc(c):.2f} | {swcp(c):.2f}")
        out += ["", summary("mean", rows)]
    seen = held + dear + pool + m115
    allrows = seen + blind
    out += ["", "## Pooled (milestones 110 to 116; only the milestone 116 blind cells are a test of SWCP)", "",
            summary("seen tables", seen)]
    if blind:
        out.append(summary("all tables", allrows))
    out += ["", "Sensitivity to s (descriptive, not a choice): mean SWCP regret % on the seen cells" + (" | blind cells" if blind else "")]
    for s in SENS:
        out.append(f"  s = {s:g}: {mean(seen, lambda c: swcp(c, s)):.2f}" + (f" | {mean(blind, lambda c: swcp(c, s)):.2f}" if blind else ""))
    if not blind:
        Path(dst).write_text("\n".join(out) + "\n")
        print("\n".join(out))
        return
    fam = lambda c: score.family(c["design"])
    lo1, hi1 = boot_ci(blind, lambda c: swcp(c) - swc(c))
    lo2, hi2 = boot_ci(blind, lambda c: swcp(c) - sw(c))
    rb = [c for c in blind if fam(c) == "barrel" and c["clock"] == "relaxed"]
    ms = [c for c in blind if fam(c) in ("mult", "sq")]
    above = [c for c in rb if c["ratio"] > score.THETA]
    worse = sum(c["clip"][ALPHA] > c["skip"] for c in above)
    better = sum(c["clip"][ALPHA] < c["skip"] for c in above)
    out += ["", f"design bootstrap 95% interval of mean (SWCP - SWC) on the blind cells: {lo1:+.2f} to {hi1:+.2f} points",
            f"design bootstrap 95% interval of mean (SWCP - SW) on the blind cells: {lo2:+.2f} to {hi2:+.2f} points", "",
            f"(1) blind relaxed barrel median share < 0.7 and q(0.9) = 0: {all(c['share'] < 0.7 and c['q'][S] == 0 for c in rb)} ("
            + ", ".join(f"{c['design']} {c['share']:.3f} q {c['q'][S]:.2f}" for c in rb) + ")",
            f"(2) blind mult30/sq28 q(0.9) >= 0.95: {all(c['q'][S] >= 0.95 for c in ms)} ("
            + ", ".join(f"{c['design']} {c['clock']} {c['q'][S]:.2f}" for c in ms) + ")",
            f"(3) at least two blind barrel designs above theta at the relaxed clock: {len(above) >= 2} ("
            + ", ".join(f"{c['design']} {c['ratio']:.2f}" for c in rb) + ")",
            f"(4) on those cells clipped skip-r1 worse than unclipped in more cells than better: {worse > better} ({worse} worse, "
            f"{better} better)",
            f"(5) blind SWCP below SW and SWC: {mean(blind, swcp) < mean(blind, sw) and mean(blind, swcp) < mean(blind, swc)}",
            f"(6) blind SWCP below equal-cost random: {mean(blind, swcp) < mean(blind, lambda c: c['rand'])}"]
    out += ["", "post hoc (lines added after the blind table was read):",
            f"post hoc: blind SWC {mean(blind, swc):.2f}% against equal-cost random {mean(blind, lambda c: c['rand']):.2f}%; SWC vs random "
            f"better {sum(swc(c) < c['rand'] for c in blind)}, worse {sum(swc(c) > c['rand'] for c in blind)}",
            "post hoc: barrel cells above the threshold, Kendall tau-b of mapped delay vs routed delay, of mapped area vs routed "
            "area x delay (what a fully binding clip ranks by) and of r2 vs routed area x delay; clipped and unclipped skip-r1 %:"]
    raws = {"fresh_dear": rule.load_table(EXP / "fresh_dear" / "results.jsonl", "fresh_dear"),
            "pilot_clip": rule.load_table(BLIND, "pilot_clip")}
    for c in [c for c in dear + blind if fam(c) == "barrel" and c["ratio"] > score.THETA]:
        rs = raws[c["table"]][(c["clock"], c["design"], c["table"])]
        per = rs[0]["period_ns"]
        y = [rule.flow.scores(r)["r4"] for r in rs]
        md = [per - r["synth_netlist_wns"] for r in rs]
        ma = [r["synth_netlist_area"] for r in rs]
        tau = rule.stats.kendall_tau_b
        out.append(f"  {c['table']} {c['clock']} {c['design']}: tau(md, rd) {tau(md, [per - r['final_wns'] for r in rs]):+.2f}, "
                   f"tau(ma, y) {tau(ma, y):+.2f}, tau(r2, y) {tau([a * d for a, d in zip(ma, md)], y):+.2f}; "
                   f"clipped {c['clip'][ALPHA]:.2f}, unclipped {c['skip']:.2f}")
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
