"""Milestone 113: does milestone 111's cost-ratio switch hold on designs that chose nothing? (analysis of the flow table)

Usage: python3 analyse.py [out.txt]

Milestones 111 and 112 tested the switch SW(theta = 3) (skip-r1 if a routed point costs more than 3x an r2 score, else equal-cost
random routing) on fresh sequences only: every design in its test sets had been run before, and the 26 held-out designs informed
theta. This table (experiments/fresh_designs/run.py) runs milestone 108's 120 fresh sequences on eight designs whose names appear in
no earlier results table: mult18, mult22, sq20 (a squarer, a family never run), xbar32x4, gf2mat64, barrel32, popcount32 and
adder_op32, both clocks, 16 cells. Seven are unseen sizes of seen families; sq20 is the one unseen family. Tool versions are
milestone 108's (Yosys 0.70, OpenROAD 26Q3). The switch decides each cell from the cell's own routed/r2 ratio, so both branches are
tested on whatever the designs turn out to be.

Everything is fixed from milestone 111 (theta = 3); cell construction, costs and regret are switch_guard/rule.py's cell(), imported
unchanged, 200 draws per cell. A design-level bootstrap (both clocks resampled together, 2,000 resamples, seed 113) gives a 95%
interval for the mean regret difference SW - random and SW - skip-r1. Planned descriptive line (not a test, not used to choose
anything): SW at theta 2, 2.5, 4 and 6 on this table.

Predictions, written in this file before the flow table existed:
 (1) over the 16 cells, SW has lower mean regret than equal-cost random routing;
 (2) over the 16 cells, SW has lower mean regret than skip-r1;
 (3) SW's mean regret is within 0.5 points of the per-cell better of skip-r1 and random (the oracle switch);
 (4) routed/r2 > 3 in at least 6 and at most 12 of the 16 cells (both branches get tested);
 (5) in the cells with routed/r2 > 3 skip-r1 has lower mean regret than random, and in the cells at or below 3 random has lower
     mean regret than skip-r1;
 (6) on mult22 at the relaxed clock (between milestone 9's faithful mult16 and unfaithful mult24) skip-r1 has higher regret than
     equal-cost random.
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


rule = _sibling(EXP / "switch_guard" / "rule.py", "verified_dse_switch_rule")
THETA = 3
OTHER_THETAS = (2, 2.5, 4, 6)
BOOT = 2000


def rows(path=HERE / "results.jsonl"):
    return rule.build(rule.load_table(path, "fresh_designs"), lambda k: f"m113{k[0]}{k[1]}")


def boot_ci(rs, f, seed=113):
    designs = sorted({c["design"] for c in rs})
    by = {d: [c for c in rs if c["design"] == d] for d in designs}
    rng = random.Random(seed)
    ms = sorted(statistics.mean(f(c) for d in rng.choices(designs, k=len(designs)) for c in by[d]) for _ in range(BOOT))
    return ms[int(0.025 * BOOT)], ms[int(0.975 * BOOT) - 1]


def main(dst):
    rs = rows()
    sw = lambda c: rule.sw(c, THETA)
    orc = lambda c: min(c["skip"], c["rand"])
    M = lambda f, cs=rs: statistics.mean(f(c) for c in cs)
    out = ["# Milestone 113: milestone 111's cost-ratio switch on eight designs no earlier table ran (120 fresh sequences, two clocks)",
           "", f"Parameters fixed from milestone 111: SW theta = {THETA}; 200 draws per cell.", "",
           "clock | design | n | routed/r2 | k | skip-r1 % | random % | SW branch | SW %"]
    for c in rs:
        out.append(f"{c['clock']} | {c['design']} | {c['n']} | {c['ratio']:.2f} | {c['k']} | {c['skip']:.2f} | {c['rand']:.2f} | "
                   f"{'ladder' if c['ratio'] > THETA else 'random'} | {sw(c):.2f}")
    out.append("")
    for name, f in {"skip-r1": lambda c: c["skip"], "random": lambda c: c["rand"], "SW": sw, "oracle": orc}.items():
        v = [f(c) for c in rs]
        w, l = sum(f(c) < c["rand"] for c in rs), sum(f(c) > c["rand"] for c in rs)
        out.append(f"mean regret {name}: {statistics.mean(v):.2f}%, worst {max(v):.2f}%; vs random better {w}, worse {l} "
                   f"(sign p = {rule.sign_p(w, l):.3f})")
    w, l = sum(sw(c) < c["skip"] for c in rs), sum(sw(c) > c["skip"] for c in rs)
    out.append(f"SW vs skip-r1: better {w}, worse {l}, tied {len(rs) - w - l} (sign p = {rule.sign_p(w, l):.3f})")
    dear = [c for c in rs if c["ratio"] > THETA]
    cheap = [c for c in rs if c["ratio"] <= THETA]
    out += ["", f"cells with routed/r2 > {THETA}: {len(dear)} of {len(rs)}"]
    for lab, cs in (("ratio > 3", dear), ("ratio <= 3", cheap)):
        if cs:
            out.append(f"{lab}: skip-r1 {M(lambda c: c['skip'], cs):.2f}%, random {M(lambda c: c['rand'], cs):.2f}% ({len(cs)} cells)")
    for lab, f in (("SW - random", lambda c: sw(c) - c["rand"]), ("SW - skip-r1", lambda c: sw(c) - c["skip"])):
        lo, hi = boot_ci(rs, f)
        out.append(f"design bootstrap 95% interval of mean ({lab}): {lo:+.2f} to {hi:+.2f} points")
    out.append("planned descriptive line: SW mean regret at theta " +
               ", ".join(f"{t}: {M(lambda c: rule.sw(c, t)):.2f}%" for t in OTHER_THETAS))
    m22 = [c for c in rs if c["design"] == "mult22" and c["clock"] == "relaxed"]
    out += ["",
            f"(1) SW mean below random: {M(sw) < M(lambda c: c['rand'])}",
            f"(2) SW mean below skip-r1: {M(sw) < M(lambda c: c['skip'])}",
            f"(3) SW within 0.5 points of the oracle switch: {M(sw) - M(orc) <= 0.5}",
            f"(4) routed/r2 > 3 in 6 to 12 of 16 cells: {6 <= len(dear) <= 12}",
            f"(5) each branch's choice is the better one on average: {bool(dear) and bool(cheap) and M(lambda c: c['skip'], dear) < M(lambda c: c['rand'], dear) and M(lambda c: c['rand'], cheap) < M(lambda c: c['skip'], cheap)}",
            f"(6) mult22 relaxed skip-r1 above random: {bool(m22) and m22[0]['skip'] > m22[0]['rand']}"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
