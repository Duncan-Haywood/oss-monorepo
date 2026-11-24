"""Milestone 165: the shifter guard's per-design evidence under the naming tie rule (replay, no flow run)

Usage: python experiments/tie_rule/run.py            # writes experiments/tie_rule/results.txt and designs.json

Why: milestone 164's "Next". Milestones 162 to 164 measured how far a renaming of the mapped netlists moves one design's edge
d = SWC regret - random regret (points): one whole-table naming moves it by up to 3.8 points, so per-design differences under
about 4 points read off one naming are ties. The shifter-depth claims of milestones 118 to 133 (the ladder loses on wide
shifters whose amount sits behind few gates, wins behind many; the gate-depth guard SWG(32) routes randomly below 32 gates)
were all read off one naming per design (build A, Yosys's names). This replay re-reads every blind design of those
milestones and asks which of their wins and losses survive the rule, and whether the gate-depth cut is still drawn by
decided designs or by ties.

Data: the "## Blind test" table of each milestone's results.txt (milestones 118 new_families, 119 struct_guard,
120 shift_power, 121 amount_depth, 122 amount_threshold, 123 amount_cut, 124 amount_place, 125 amount_lanes, 132 blind_probe,
133 ladder_blind), columns design, clock, "random %" and the first column whose name starts "SWC". Every cell of the blind
table is used, on or off the ladder branch, so a design's d is the mean of (SWC - random) over its cells (two clocks). Gate
depth of the shift amount (amount_gate_depth) comes from the table if it has the column, else the milestone's features.json,
else experiments/amount_cut/seen_gate_depth.json; designs with none (no data shifter) are left out of the depth questions.
A design that appears in two blind tables keeps its first (earliest milestone) value. Nothing is rerouted.

Classes, tau = 4 (milestone 164's whole-table rule): win d <= -tau, loss d >= +tau, tie otherwise. A sweep of tau = 0 to 6
is reported, not predicted. Depth separation: for a cut t, a decided design is misplaced if it is a win with depth < t or a
loss with depth >= t (the guard routes randomly below t, ladders at or above); the best cuts are the integer t in 1..600
with fewest misplaced decided designs.

Predictions, written here and committed before this script first runs (disclosed: in this session, before writing them,
the blind tables of milestones 118, 119 and 123, milestone 125's 20-to-50-gate table and milestone 133's per-design table
were read; no per-design d had been computed under the rule and no count below was known):
 (1) PRIMARY: the rule turns a large share of the blind evidence into ties: at least a third of the designs with a gate depth
     have |d| < 4. Prior 70%.
 (2) the cut is still drawn by decided designs: among designs with a gate depth and |d| >= 4, the cut t = 32 misplaces at most
     4. Prior 55%.
 (3) 32 lies inside the set of best cuts on decided designs, or within 5 gates of it. Prior 60%.
 (4) above the cut the ladder still wins: among decided designs with depth >= 32, wins are at least three times losses.
     Prior 65%.
 (5) below the cut the evidence is weak: among designs with depth < 32, decided losses are no more than 6. Prior 70%.
 (6) the mean d over all blind designs (with or without a depth) has a design-bootstrap 95% interval (2,000 resamples, seed
     165) that contains 0. Prior 60%.
"""
import json
import os
import random
import re
import statistics

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.dirname(HERE)
SETS = [(118, "new_families"), (119, "struct_guard"), (120, "shift_power"), (121, "amount_depth"),
        (122, "amount_threshold"), (123, "amount_cut"), (124, "amount_place"), (125, "amount_lanes"),
        (132, "blind_probe"), (133, "ladder_blind")]
TAU = 4.0
CUT = 32
BOOT = 2000
SEED = 165


def blind_table(path):
    """Rows of the first '## Blind test' table of a results.txt, as dicts keyed by column name."""
    lines = open(path).read().splitlines()
    start = next(i for i, l in enumerate(lines) if l.startswith("## Blind test"))
    i = start + 1
    while "|" not in lines[i]:
        i += 1
    cols = [c.strip() for c in lines[i].split("|")]
    rows = []
    for l in lines[i + 1:]:
        if "|" not in l:
            break
        rows.append(dict(zip(cols, [c.strip() for c in l.split("|")])))
    return cols, rows


def depth_lookup(dirname):
    out = {}
    for p in (os.path.join(EXP, "amount_cut", "seen_gate_depth.json"), os.path.join(EXP, dirname, "features.json")):
        if os.path.exists(p):
            for k, v in json.load(open(p)).items():
                if isinstance(v, dict) and v.get("amount_gate_depth") is not None:
                    out[k] = v["amount_gate_depth"]
    return out


def collect():
    designs = {}
    for ms, dirname in SETS:
        cols, rows = blind_table(os.path.join(EXP, dirname, "results.txt"))
        swc = next(c for c in cols if c.startswith("SWC"))
        depth = depth_lookup(dirname)
        per = {}
        for r in rows:
            d = r["design"]
            per.setdefault(d, {"cells": [], "depth": None})
            per[d]["cells"].append((r["clock"], float(r[swc]), float(r["random %"])))
            g = r.get("amount_gate_depth")
            if g not in (None, "", "None", "-"):
                per[d]["depth"] = int(float(g))
        for d, v in per.items():
            if d in designs:
                continue
            if v["depth"] is None and d in depth:
                v["depth"] = int(depth[d])
            diffs = [s - q for _, s, q in v["cells"]]
            designs[d] = {"milestone": ms, "set": dirname, "depth": v["depth"], "cells": len(diffs),
                          "swc": statistics.mean(s for _, s, _ in v["cells"]),
                          "random": statistics.mean(q for _, _, q in v["cells"]),
                          "d": statistics.mean(diffs)}
    return designs


def cls(d, tau):
    return "win" if d <= -tau else "loss" if d >= tau else "tie"


def misplaced(rows, t, tau):
    n = 0
    for r in rows:
        c = cls(r["d"], tau)
        if (c == "win" and r["depth"] < t) or (c == "loss" and r["depth"] >= t):
            n += 1
    return n


def best_cuts(rows, tau):
    scores = {t: misplaced(rows, t, tau) for t in range(1, 601)}
    m = min(scores.values())
    return m, [t for t, s in scores.items() if s == m]


def runs(ts):
    """Compress a sorted integer list into 'a-b' ranges."""
    out, i = [], 0
    while i < len(ts):
        j = i
        while j + 1 < len(ts) and ts[j + 1] == ts[j] + 1:
            j += 1
        out.append(f"{ts[i]}" if i == j else f"{ts[i]}-{ts[j]}")
        i = j + 1
    return ", ".join(out)


def boot_ci(vals, seed=SEED, n=BOOT):
    rng = random.Random(seed)
    means = sorted(statistics.mean(rng.choice(vals) for _ in vals) for _ in range(n))
    return means[int(0.025 * n)], means[int(0.975 * n) - 1]


def main():
    designs = collect()
    names = sorted(designs, key=lambda k: (designs[k]["depth"] is None, designs[k]["depth"] or 0, k))
    dep = [dict(designs[k], design=k) for k in names if designs[k]["depth"] is not None]
    alld = [designs[k]["d"] for k in names]
    out = ["# Milestone 165: the shifter guard's per-design evidence under the naming tie rule (replay, no flow run)", "",
           f"tau = {TAU:g} points (milestone 164: per-design differences under about 4 points from one naming are ties); "
           f"cut t = {CUT}; design bootstrap {BOOT} resamples, seed {SEED}.", "",
           f"Blind designs: {len(names)} from {len(SETS)} milestones ({sum(designs[k]['cells'] for k in names)} cells); "
           f"{len(dep)} have a shift-amount gate depth.", "",
           "## Per design (d = mean over its blind cells of SWC % - random %; class at tau = 4)", "",
           "design | milestone | amount_gate_depth | cells | SWC % | random % | d (points) | class | guard SWG(32) side"]
    for k in names:
        v = designs[k]
        side = "-" if v["depth"] is None else ("ladder" if v["depth"] >= CUT else "random")
        out.append(f"{k} | {v['milestone']} | {v['depth'] if v['depth'] is not None else '-'} | {v['cells']} | "
                   f"{v['swc']:.2f} | {v['random']:.2f} | {v['d']:+.2f} | {cls(v['d'], TAU)} | {side}")
    json.dump({k: designs[k] for k in names}, open(os.path.join(HERE, "designs.json"), "w"), indent=1, sort_keys=True)

    def counts(rows, tau):
        c = [cls(r["d"], tau) for r in rows]
        return c.count("win"), c.count("loss"), c.count("tie")

    out += ["", "## Sweep of tau (reported, not predicted)", "",
            "tau | all designs win / loss / tie | with depth win / loss / tie | t = 32 misplaced (decided) | best cuts | fewest misplaced | depth >= 32 win / loss | depth < 32 win / loss / tie"]
    for tau in (0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0):
        aw = counts([{"d": x} for x in alld], tau) if tau > 0 else (sum(x < 0 for x in alld), sum(x > 0 for x in alld), sum(x == 0 for x in alld))
        if tau > 0:
            dw = counts(dep, tau)
            m, bc = best_cuts(dep, tau)
            hi = [cls(r["d"], tau) for r in dep if r["depth"] >= CUT]
            lo = [cls(r["d"], tau) for r in dep if r["depth"] < CUT]
            mis = misplaced(dep, CUT, tau)
        else:
            dw = (sum(r["d"] < 0 for r in dep), sum(r["d"] > 0 for r in dep), sum(r["d"] == 0 for r in dep))
            tiny = 1e-9
            m, bc = best_cuts(dep, tiny)
            hi = [cls(r["d"], tiny) for r in dep if r["depth"] >= CUT]
            lo = [cls(r["d"], tiny) for r in dep if r["depth"] < CUT]
            mis = misplaced(dep, CUT, tiny)
        out.append(f"{tau:g} | {aw[0]} / {aw[1]} / {aw[2]} | {dw[0]} / {dw[1]} / {dw[2]} | {mis} | {runs(bc)} | {m} | "
                   f"{hi.count('win')} / {hi.count('loss')} | {lo.count('win')} / {lo.count('loss')} / {lo.count('tie')}")
    out.append("(tau = 0 counts every nonzero d as decided: the reading the milestones made.)")

    w, l, t = counts(dep, TAU)
    tie_share = t / len(dep)
    mis32 = misplaced(dep, CUT, TAU)
    m, bc = best_cuts(dep, TAU)
    near = min(abs(b - CUT) for b in bc)
    hi = [cls(r["d"], TAU) for r in dep if r["depth"] >= CUT]
    lo = [cls(r["d"], TAU) for r in dep if r["depth"] < CUT]
    lo_ci = boot_ci(alld)
    out += ["", "## Decided designs at tau = 4, by depth", "",
            "design | amount_gate_depth | d (points) | class | misplaced by t = 32"]
    for r in dep:
        c = cls(r["d"], TAU)
        if c != "tie":
            mp = (c == "win" and r["depth"] < CUT) or (c == "loss" and r["depth"] >= CUT)
            out.append(f"{r['design']} | {r['depth']} | {r['d']:+.2f} | {c} | {mp}")
    out += ["", f"mean d over all {len(alld)} blind designs: {statistics.mean(alld):+.2f} points, "
            f"interval {lo_ci[0]:+.2f} to {lo_ci[1]:+.2f}; median {statistics.median(alld):+.2f}",
            f"mean d over the {len(dep)} with depth: {statistics.mean(r['d'] for r in dep):+.2f}; "
            f"depth >= 32: {statistics.mean([r['d'] for r in dep if r['depth'] >= CUT]):+.2f} "
            f"({sum(r['depth'] >= CUT for r in dep)} designs); depth < 32: "
            f"{statistics.mean([r['d'] for r in dep if r['depth'] < CUT]):+.2f} ({sum(r['depth'] < CUT for r in dep)} designs)",
            "", "## Predictions", "",
            f"(1) PRIMARY, at least a third of depth designs tie: {tie_share >= 1 / 3} ({t} of {len(dep)}, {tie_share:.0%})",
            f"(2) t = 32 misplaces at most 4 decided designs: {mis32 <= 4} ({mis32} of {w + l})",
            f"(3) 32 within 5 gates of a best cut: {near <= 5} (best cuts {runs(bc)}, {m} misplaced; nearest {near} gates away)",
            f"(4) depth >= 32, wins at least 3x losses: {hi.count('win') >= 3 * hi.count('loss')} "
            f"({hi.count('win')} wins, {hi.count('loss')} losses, {hi.count('tie')} ties)",
            f"(5) depth < 32, decided losses at most 6: {lo.count('loss') <= 6} "
            f"({lo.count('win')} wins, {lo.count('loss')} losses, {lo.count('tie')} ties)",
            f"(6) interval of mean d contains 0: {lo_ci[0] <= 0 <= lo_ci[1]} ({lo_ci[0]:+.2f} to {lo_ci[1]:+.2f})"]
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
