"""Milestone 112: does milestone 111's cost-ratio switch hold on a fresh pool where routing is dear? (analysis of the flow table)

Usage: python3 analyse.py [out.txt]

Milestone 111 chose the switch SW(theta = 3) (skip-r1 if a routed point costs more than 3x an r2 score, else equal-cost random
routing) on 26 held-out designs and tested it on the milestone 108 fresh pool, whose small designs have routed/r2 ratios of 1.3 to
3.4: the test covered only the "route randomly" branch. This table (experiments/fresh_dear/run.py) runs milestone 108's 120 fresh
sequences on six held-out designs whose routed/r2 ratio exceeded 3 in milestone 110 (mult16, mult24, xbar16, gf2mat48, barrel128,
bcastadd64), both clocks: 12 cells. The sequences are new to these designs; the designs informed theta = 3, so this is a fresh-sample
test of the dear branch, not a fresh-design test. Tool versions are Yosys 0.70 and OpenROAD 26Q3 (milestone 108's), not the held-out
tables' older ones.

Everything is fixed from milestone 111 (experiments/switch_guard/results.txt): SW theta = 3; G (p = 6, tau0 = -1), a six-point random
pilot inside skip-r1's budget; SWG (3, (6, -1)). Cell construction, costs and regret are rule.py's cell(), imported unchanged, 200
draws per cell. A design-level bootstrap (both clocks resampled together, 2,000 resamples, seed 112) gives a 95% interval for the
mean regret difference SW - random.

Predictions, written in this file before the flow table was read:
 (1) routed/r2 > 3 in at least 9 of the 12 cells;
 (2) in the cells with routed/r2 > 3, skip-r1 has lower mean regret than equal-cost random routing;
 (3) over the 12 cells, SW has lower mean regret than equal-cost random;
 (4) SW is better than equal-cost random in more cells than it is worse;
 (5) on mult24 at the relaxed clock (milestone 9's unfaithful family) skip-r1 has higher regret than equal-cost random;
 (6) SWG's worst cell is lower than SW's worst cell.
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
THETA, G = 3, (6, -1)
BOOT = 2000


def rows(path=HERE / "results.jsonl"):
    return rule.build(rule.load_table(path, "fresh_dear"), lambda k: f"m112{k[0]}{k[1]}")


def boot_ci(rs, f, seed=112):
    designs = sorted({c["design"] for c in rs})
    by = {d: [c for c in rs if c["design"] == d] for d in designs}
    rng = random.Random(seed)
    ms = sorted(statistics.mean(f(c) for d in rng.choices(designs, k=len(designs)) for c in by[d]) for _ in range(BOOT))
    return ms[int(0.025 * BOOT)], ms[int(0.975 * BOOT) - 1]


def main(dst):
    rs = rows()
    sw = lambda c: rule.sw(c, THETA)
    swg = lambda c: rule.swg(c, THETA, G)
    out = ["# Milestone 112: milestone 111's cost-ratio switch on a fresh pool where routing is dear (120 fresh sequences, "
           "six held-out designs, two clocks)", "",
           f"Parameters fixed from milestone 111: SW theta = {THETA}, G = {G}, SWG = ({THETA}, {G}); 200 draws per cell.", "",
           "clock | design | n | routed/r2 | k | skip-r1 % | random % | SW % | G % | SWG %"]
    for c in rs:
        out.append(f"{c['clock']} | {c['design']} | {c['n']} | {c['ratio']:.2f} | {c['k']} | {c['skip']:.2f} | {c['rand']:.2f} | "
                   f"{sw(c):.2f} | {c['g'][G]:.2f} | {swg(c):.2f}")
    out.append("")
    pol = {"skip-r1": lambda c: c["skip"], "random": lambda c: c["rand"], "SW": sw, "G": lambda c: c["g"][G], "SWG": swg}
    for name, f in pol.items():
        v = [f(c) for c in rs]
        w = sum(f(c) < c["rand"] for c in rs)
        l = sum(f(c) > c["rand"] for c in rs)
        out.append(f"mean regret {name}: {statistics.mean(v):.2f}%, worst {max(v):.2f}%; vs random better {w}, worse {l} "
                   f"(sign p = {rule.sign_p(w, l):.3f})")
    dear = [c for c in rs if c["ratio"] > THETA]
    lo, hi = boot_ci(rs, lambda c: sw(c) - c["rand"])
    out += ["", f"cells with routed/r2 > {THETA}: {len(dear)} of {len(rs)}"]
    if dear:
        out.append(f"in them: skip-r1 {statistics.mean(c['skip'] for c in dear):.2f}%, random {statistics.mean(c['rand'] for c in dear):.2f}%")
    out.append(f"design bootstrap 95% interval of mean (SW - random): {lo:+.2f} to {hi:+.2f} points")
    m24 = [c for c in rs if c["design"] == "mult24" and c["clock"] == "relaxed"]
    W = lambda f: max(f(c) for c in rs)
    out += ["",
            f"(1) routed/r2 > 3 in at least 9 of 12 cells: {len(dear) >= 9}",
            f"(2) in those cells skip-r1 below random: {bool(dear) and statistics.mean(c['skip'] for c in dear) < statistics.mean(c['rand'] for c in dear)}",
            f"(3) SW mean below random: {statistics.mean(sw(c) for c in rs) < statistics.mean(c['rand'] for c in rs)}",
            f"(4) SW better than random in more cells than worse: {sum(sw(c) < c['rand'] for c in rs) > sum(sw(c) > c['rand'] for c in rs)}",
            f"(5) mult24 relaxed skip-r1 above random: {bool(m24) and m24[0]['skip'] > m24[0]['rand']}",
            f"(6) SWG worst cell below SW worst cell: {W(swg) < W(sw)}"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
