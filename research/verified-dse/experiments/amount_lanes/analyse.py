"""Milestone 125: SWG(32), placed post hoc in milestone 124 inside (31, 33], registered and tested blind on five 128-bit shifters
whose amount sits 28 to 36 AND/NOT gates deep, and on three 64-bit multi-lane shifters built to reach the ladder branch, to check
whether the cut moves with shift width.

Usage: python3 analyse.py [out.txt]

Why: milestone 124 found every ladder-branch cell with 33 or more gates in front of a wide shift amount has the clipped ladder (SWC)
below random, and its sweep put the threshold at 32 or 33 (post hoc). Its "Next" asked for SWG(32) registered and tested blind on new
families at 29 to 35 gates, and for 64-bit shifters dear enough to reach the ladder branch, since its 64-bit twin (routed/r2 about
2.56) fell under the cost threshold and said nothing about width.

Guards (each replaces SWC by equal-cost random routing on the designs it flags; the timing pilot and its cost are unchanged):
  SWG(32)  primary, registered here: flag when shift_width >= 64 and amount_gate_depth < 32. Flags pmul3 (28), avg5 (31), lane4k1 (25).
  SWG(36)  milestone 123's, alongside: also flags sel64 (33) and avg6 (35).
  SWD(3)   the word-level rule: flags pmul3, avg5, sel64, avg6, pmul4 (word depth 1 or 2) and lane4k1.
  SWC      the clipped ladder on every design.
  Reported, not predicted: SWG(t) for every t from 24 to 40 on these cells and on all of milestones 119 to 125's cells.

Designs (run.py; four families no table has run; checked by check_designs.py, features.json computed before the flow run):
  pmul3    low 7 bits of a 3-bit by 7-bit product, 128-bit shift            word depth 1, gate depth 28
  avg5     top 7 bits of a sum of three 5-bit operands, 128-bit shift       word depth 2, gate depth 31
  sel64    64-bit compare picks one of two 7-bit amounts, 128-bit shift     word depth 2, gate depth 33
  avg6     the same with 6-bit operands                                     word depth 2, gate depth 35
  pmul4    a 4-bit by 7-bit product                                         word depth 1, gate depth 36
  lane2k2  2 lanes of a 64-bit shift, amount 2 chained 6-bit saturating adds word depth 4, gate depth 48
  lane4k2  4 lanes, the same amount                                         word depth 4, gate depth 48
  lane4k1  4 lanes, 1 saturating add                                        word depth 2, gate depth 25

Predictions, written in this file before the blind table existed (checked in main()). The reading of milestones 120 to 124 is that the
ladder ranks a wide shifter once about 32 gates sit in front of its amount, whatever the family:
 (1) on pmul3 and avg5 (28 and 31 gates; 4 cells), SWC has higher mean regret than random;
 (2) on sel64, avg6 and pmul4 (33 to 36 gates; 6 cells), SWC has lower mean regret than random;
 (3) on the 128-bit blind cells, SWG(32) has lower mean regret than random;
 (4) on the blind cells, SWG(32) is better than random in more cells than worse;
 (5) on the blind cells, SWG(32) has lower mean regret than SWG(36) and lower than SWD(3);
 (6) lane4k2 has a higher routed/r2 ratio than lane2k2 at both clocks (more lanes, more wire per shift);
 (7) at least one lane cell is on the ladder branch (routed/r2 > theta = 3);
 (8) on the K = 2 lane cells that are on the ladder branch (48 gates), SWC has lower mean regret than random (the cut does not
     move up at 64 bits); untestable, and reported as such, if (7) fails for them.
Reported, not predicted: per-design SWC - random along gate depth; milestones 121 to 125 blind and 119 to 125 together, with
design-bootstrap intervals (2,000 resamples, seed 125).
"""
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 125
BLIND = HERE / "results.jsonl"
GATE_T = 32
SWEEP = range(24, 41)


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ap = _sibling(EXP / "amount_place" / "analyse.py", "verified_dse_m125_ap")
ac, at, sp, nf, pool, score = ap.ac, ap.at, ap.sp, ap.nf, ap.pool, ap.score
rule = score.rule
swc, rand, mean = nf.swc, nf.rand, nf.mean
NEWF = json.loads((HERE / "features.json").read_text())
FEAT = ap.FEAT  # the dict ac's flags read
FEAT.update(NEWF)


def flag_g(d, t=GATE_T):
    return ac.flag_g(d, t)


def flag_d(d, k=3):
    return ac.flag_d(d, k)


guard = ap.guard
swg, swg36, swd3 = guard(flag_g), guard(lambda d: flag_g(d, 36)), guard(flag_d)
GUARDS = (("SWC", swc), ("SWG(32)", swg), ("SWG(36)", swg36), ("SWD(3)", swd3), ("random", rand))
LANES = {"lane2k2", "lane4k2", "lane4k1"}


def blind_table():
    return nf.build(rule.load_table(BLIND, "amount_lanes"), lambda k: f"m125blind{k[0]}{k[1]}") if BLIND.exists() else []


def seen_tables():
    return ap.seen_tables() + ap.blind_table()


def means(rows):
    return ", ".join(f"{n} {mean(rows, g):.2f}" for n, g in GUARDS)


def sweep_lines(rows):
    out = ["t | mean regret % | better than random | worse than random"]
    for t in SWEEP:
        g = guard(lambda d, t=t: flag_g(d, t))
        b, w, _ = pool.compare(rows, g, rand)
        out.append(f"{t} | {mean(rows, g):.2f} | {b} | {w}")
    return out


def main(dst):
    out = ["# Milestone 125: SWG(32) tested blind at 28 to 36 gates, and 64-bit multi-lane shifters", "",
           f"theta = {score.THETA}, alpha = {nf.ALPHA}; design bootstrap {pool.BOOT} resamples, seed {SEED}.", "",
           "## Blind designs' features (computed before the flow run)", "",
           "design | shift_width | amount_depth | amount_gate_depth | amount_gates | mux_share | SWG(32) flags | SWG(36) flags | "
           "SWD(3) flags"]
    for d in sorted(NEWF, key=lambda d: (NEWF[d]["amount_gate_depth"], d)):
        f = FEAT[d]
        out.append(f"{d} | {f['shift_width']} | {f['amount_depth']} | {f['amount_gate_depth']} | {f['amount_gates']} | "
                   f"{f['mux_share']:.3f} | {flag_g(d)} | {flag_g(d, 36)} | {flag_d(d)}")
    seen = seen_tables()
    out += ["", f"seen mean regret % (milestones 119 to 124, {len(seen)} cells): {means(seen)}"]
    blind = blind_table()
    if not blind:
        out += ["", "## Blind test: no table yet"]
        Path(dst).write_text("\n".join(out) + "\n")
        print("\n".join(out))
        return
    out += ["", f"## Blind test (milestone 125 flow run): {len(blind)} cells", "",
            "clock | design | shift_width | amount_gate_depth | routed/r2 | routed delay/period | skip-r1 % | clipped skip-r1 % | "
            "random % | SWC % | SWG(32) % | SWG(36) % | SWD(3) %"]
    for c in sorted(blind, key=lambda c: (FEAT[c["design"]]["amount_gate_depth"], c["design"], c["clock"])):
        f = FEAT[c["design"]]
        out.append(f"{c['clock']} | {c['design']} | {f['shift_width']} | {f['amount_gate_depth']} | {c['ratio']:.2f} | "
                   f"{c['share']:.3f} | {c['skip']:.2f} | {c['clip'][nf.ALPHA]:.2f} | {c['rand']:.2f} | {swc(c):.2f} | "
                   f"{swg(c):.2f} | {swg36(c):.2f} | {swd3(c):.2f}")
    out += ["", f"blind mean regret %: {means(blind)}", ""]
    out += ["blind " + s for s in sp.compare_lines(blind, ((swg, rand, "SWG(32)", "random"), (swg, swg36, "SWG(32)", "SWG(36)"),
                                                           (swg, swd3, "SWG(32)", "SWD(3)")), SEED)]
    out += ["", "## Per design along gate depth (descriptive)", "",
            "design | shift_width | amount_gate_depth | cells on ladder branch | SWC % | random % | SWC - random (points)"]
    for d in sorted(NEWF, key=lambda d: (FEAT[d]["amount_gate_depth"], d)):
        rs = [c for c in blind if c["design"] == d]
        out.append(f"{d} | {FEAT[d]['shift_width']} | {FEAT[d]['amount_gate_depth']} | {sum(c['ratio'] > score.THETA for c in rs)} | "
                   f"{mean(rs, swc):.2f} | {mean(rs, rand):.2f} | {mean(rs, swc) - mean(rs, rand):+.2f}")
    allc = seen + blind
    lad = sorted((c for c in allc if c["ratio"] > score.THETA and FEAT[c["design"]].get("shift_width", 0) >= 64
                  and FEAT[c["design"]].get("amount_gate_depth") is not None and 20 <= FEAT[c["design"]]["amount_gate_depth"] <= 50),
                 key=lambda c: (FEAT[c["design"]]["amount_gate_depth"], c["design"], c["clock"]))
    out += ["", "## Ladder-branch wide-shift cells with amount gate depth 20 to 50, milestones 119 to 125 (125's blind, the rest seen)",
            "", "design | clock | shift_width | amount_gate_depth | SWC % | random % | ladder wins"]
    out += [f"{c['design']} | {c['clock']} | {FEAT[c['design']]['shift_width']} | {FEAT[c['design']]['amount_gate_depth']} | "
            f"{swc(c):.2f} | {c['rand']:.2f} | {swc(c) < c['rand']}" for c in lad]
    out += ["", "## SWG(t) for t = 24 to 40 on the blind cells (descriptive; 32 was fixed before the run)", ""] + sweep_lines(blind)
    out += ["", f"## SWG(t) on milestones 119 to 125 together ({len(allc)} cells; post hoc for every t but 32 on 125's cells)", ""]
    out += sweep_lines(allc)
    five = at.m121_blind() + at.blind_table() + ac.blind_table() + ap.blind_table() + blind
    out += ["", f"## Milestones 121 to 125 blind cells together ({len(five)} cells, {len({c['design'] for c in five})} designs)", "",
            f"mean regret %: {means(five)}", ""]
    out += sp.compare_lines(five, ((swg, rand, "SWG(32)", "random"), (swg36, rand, "SWG(36)", "random"),
                                   (swd3, rand, "SWD(3)", "random")), SEED)
    out += ["", f"## Milestones 119 to 125 together ({len(allc)} cells, {len({c['design'] for c in allc})} designs)", "",
            f"mean regret %: {means(allc)}", ""]
    out += sp.compare_lines(allc, ((swg, rand, "SWG(32)", "random"),), SEED)
    sel = lambda names: [c for c in blind if c["design"] in names]
    p1, p2 = sel({"pmul3", "avg5"}), sel({"sel64", "avg6", "pmul4"})
    wide = [c for c in blind if c["design"] not in LANES]
    b, w, _ = pool.compare(blind, swg, rand)
    ratio = {(c["design"], c["clock"]): c["ratio"] for c in blind}
    clocks = sorted({c["clock"] for c in blind})
    lane_cells = sel(LANES)
    on_branch = [c for c in lane_cells if c["ratio"] > score.THETA]
    p8 = [c for c in on_branch if c["design"] != "lane4k1"]
    p8s = (f"{mean(p8, swc) < mean(p8, rand)} ({len(p8)} cells, {mean(p8, swc):.2f}% against {mean(p8, rand):.2f}%)" if p8
           else "untestable (no K = 2 lane cell on the ladder branch)")
    out += ["", "## Predictions", "",
            f"(1) pmul3 and avg5 ({len(p1)} cells), SWC above random: {mean(p1, swc) > mean(p1, rand)} "
            f"({mean(p1, swc):.2f}% against {mean(p1, rand):.2f}%)",
            f"(2) sel64, avg6 and pmul4 ({len(p2)} cells), SWC below random: {mean(p2, swc) < mean(p2, rand)} "
            f"({mean(p2, swc):.2f}% against {mean(p2, rand):.2f}%)",
            f"(3) 128-bit blind cells ({len(wide)}), SWG(32) below random: {mean(wide, swg) < mean(wide, rand)} "
            f"({mean(wide, swg):.2f}% against {mean(wide, rand):.2f}%)",
            f"(4) blind SWG(32) better than random in more cells than worse: {b > w} ({b} better, {w} worse)",
            f"(5) blind SWG(32) below SWG(36) and SWD(3): {mean(blind, swg) < mean(blind, swg36) and mean(blind, swg) < mean(blind, swd3)} "
            f"({mean(blind, swg):.2f}% against {mean(blind, swg36):.2f}% and {mean(blind, swd3):.2f}%)",
            f"(6) lane4k2 routed/r2 above lane2k2 at both clocks: {all(ratio[('lane4k2', k)] > ratio[('lane2k2', k)] for k in clocks)} ("
            + ", ".join(f"{k} {ratio[('lane4k2', k)]:.2f} against {ratio[('lane2k2', k)]:.2f}" for k in clocks) + ")",
            f"(7) at least one lane cell on the ladder branch: {bool(on_branch)} ("
            + ", ".join(f"{c['design']} {c['clock']} {c['ratio']:.2f}" for c in sorted(lane_cells, key=lambda c: (c['design'], c['clock'])))
            + ")",
            f"(8) K = 2 lane cells on the ladder branch, SWC below random: {p8s}"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
