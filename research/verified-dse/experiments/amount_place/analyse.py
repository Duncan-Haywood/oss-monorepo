"""Milestone 124: where inside (30, 41] gates in front of the shift amount does the mapped-rung ladder start to rank a wide shifter,
and does the cut move with shift width? Milestone 123's gate-depth guard, unchanged, tested blind on seven shifters whose amount sits
31 to 41 AND/NOT gates deep.

Usage: python3 analyse.py [out.txt]

Why: milestone 123 found that gates, not word-level cells, in front of the shift amount decide whether the clipped ladder (SWC) ranks
a wide shifter, and fixed SWG(36) at the midpoint of (30, 41], the gap on the seen cells (the ladder loses at gate depth 0 and 27 to
30, wins from 41 up). Its "Next" asked for amounts of about 30 to 45 gates from several families, and a check of whether the cut
scales with shift width.

Guards (each replaces SWC by equal-cost random routing on the designs it flags; the timing pilot and its cost are unchanged):
  SWG(36)  primary, milestone 123's, not re-chosen: flag when shift_width >= 64 and amount_gate_depth < 36.
           Flags sad1b8 (31), max3b5 (33), sat1b9 (35).
  SWD(3)   the word-level rule: flag when shift_width >= 64 and amount_depth < 3. Flags sad1b8, sat1b9.
  SWC      the clipped ladder on every design.
  Reported, not predicted: SWG(t) for every t from 30 to 42 on these cells and on all of milestones 119 to 124's cells.

Designs (run.py; three families no table has run; checked by check_designs.py, features.json computed before the flow run):
  sad1b8   |a - b|, 8-bit operands                        word depth 2, gate depth 31
  max3b5   largest of three 5-bit fields                  word depth 4, gate depth 33
  sat1b9   one 9-bit saturating add                       word depth 2, gate depth 35
  max3b6   largest of three 6-bit fields, 128-bit shift   word depth 4, gate depth 36
  max3b6n  the same amount cone, 64-bit shift             word depth 4, gate depth 36   (width twin of max3b6)
  sad2b5   |a0 - b0| + |a1 - b1|, 5-bit operands          word depth 3, gate depth 40
  sat2b5   two chained 5-bit saturating adds              word depth 4, gate depth 41

Predictions, written in this file before the blind table existed (checked in main()). The reading of milestones 120 to 123 is that the
ladder ranks a wide shifter once the critical path runs through enough logic in front of the amount for the mapped rung to see it:
 (1) on sad2b5 and sat2b5 (gate depth 40 and 41; 4 cells), SWC has lower mean regret than random;
 (2) on sad1b8 (gate depth 31; 2 cells), SWC has higher mean regret than random;
 (3) on max3b5 (gate depth 33 but word depth 4; 2 cells), SWC has higher mean regret than random (gates decide, as in 123);
 (4) on the blind cells, SWG(36) has lower mean regret than random;
 (5) on the blind cells, SWG(36) is better than random in more cells than worse;
 (6) max3b6n (64-bit) has a lower routed/r2 ratio than max3b6 (128-bit) at both clocks (a narrower shifter is less wire-bound);
 (7) at least 8 of the 14 blind cells are on the ladder branch (routed/r2 > theta = 3).
Reported, not predicted: per-design SWC - random along gate depth (where the sign changes); max3b6 against max3b6n; milestones 121 to
124 (blind to the gate idea from 123 on) and 119 to 124 together, with design-bootstrap intervals (2,000 resamples, seed 124).
"""
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 124
BLIND = HERE / "results.jsonl"
GATE_T = 36
SWEEP = range(30, 43)


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ac = _sibling(EXP / "amount_cut" / "analyse.py", "verified_dse_m124_ac")
at, sp, nf, pool, score = ac.at, ac.sp, ac.nf, ac.pool, ac.score
rule = score.rule
swc, rand, fam, mean = nf.swc, nf.rand, nf.fam, nf.mean
NEWF = json.loads((HERE / "features.json").read_text())
FEAT = ac.FEAT  # the same dict ac's flags read, so its guards see this milestone's designs too
FEAT.update(NEWF)


def flag_g(d, t=GATE_T):
    return ac.flag_g(d, t)


def flag_d(d, k=3):
    return ac.flag_d(d, k)


def guard(flag):
    return lambda c: c["rand"] if flag(c["design"]) else swc(c)


swg, swd3 = guard(flag_g), guard(flag_d)
GUARDS = (("SWC", swc), ("SWG(36)", swg), ("SWD(3)", swd3), ("random", rand))


def blind_table():
    return nf.build(rule.load_table(BLIND, "amount_place"), lambda k: f"m124blind{k[0]}{k[1]}") if BLIND.exists() else []


def seen_tables():
    return ac.seen_tables() + ac.blind_table()


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
    out = ["# Milestone 124: placing the gate-depth threshold inside (30, 41] blind, and a width twin", "",
           f"theta = {score.THETA}, alpha = {nf.ALPHA}; design bootstrap {pool.BOOT} resamples, seed {SEED}.", "",
           "## Blind designs' features (computed before the flow run)", "",
           "design | shift_width | amount_depth | amount_gate_depth | amount_gates | mux_share | SWG(36) flags | SWD(3) flags"]
    for d in sorted(NEWF, key=lambda d: (NEWF[d]["amount_gate_depth"], d)):
        f = FEAT[d]
        out.append(f"{d} | {f['shift_width']} | {f['amount_depth']} | {f['amount_gate_depth']} | {f['amount_gates']} | "
                   f"{f['mux_share']:.3f} | {flag_g(d)} | {flag_d(d)}")
    seen = seen_tables()
    out += ["", f"seen mean regret % (milestones 119 to 123, {len(seen)} cells): {means(seen)}"]
    blind = blind_table()
    if not blind:
        out += ["", "## Blind test: no table yet"]
        Path(dst).write_text("\n".join(out) + "\n")
        print("\n".join(out))
        return
    out += ["", f"## Blind test (milestone 124 flow run): {len(blind)} cells", "",
            "clock | design | shift_width | amount_gate_depth | routed/r2 | routed delay/period | skip-r1 % | clipped skip-r1 % | "
            "random % | SWC % | SWG(36) % | SWD(3) %"]
    for c in sorted(blind, key=lambda c: (FEAT[c["design"]]["amount_gate_depth"], c["design"], c["clock"])):
        f = FEAT[c["design"]]
        out.append(f"{c['clock']} | {c['design']} | {f['shift_width']} | {f['amount_gate_depth']} | {c['ratio']:.2f} | "
                   f"{c['share']:.3f} | {c['skip']:.2f} | {c['clip'][nf.ALPHA]:.2f} | {c['rand']:.2f} | {swc(c):.2f} | "
                   f"{swg(c):.2f} | {swd3(c):.2f}")
    out += ["", f"blind mean regret %: {means(blind)}", ""]
    out += ["blind " + s for s in sp.compare_lines(blind, ((swg, rand, "SWG(36)", "random"), (swg, swd3, "SWG(36)", "SWD(3)"),
                                                           (swd3, rand, "SWD(3)", "random")), SEED)]
    out += ["", "## Per design along gate depth (descriptive)", "",
            "design | shift_width | amount_gate_depth | cells on ladder branch | SWC % | random % | SWC - random (points)"]
    for d in sorted(NEWF, key=lambda d: (FEAT[d]["amount_gate_depth"], d)):
        rs = [c for c in blind if c["design"] == d]
        out.append(f"{d} | {FEAT[d]['shift_width']} | {FEAT[d]['amount_gate_depth']} | {sum(c['ratio'] > score.THETA for c in rs)} | "
                   f"{mean(rs, swc):.2f} | {mean(rs, rand):.2f} | {mean(rs, swc) - mean(rs, rand):+.2f}")
    allc = seen + blind
    lad = sorted((c for c in allc if c["ratio"] > score.THETA and FEAT[c["design"]].get("shift_width", 0) >= 64
                  and FEAT[c["design"]].get("amount_gate_depth") is not None and 20 <= FEAT[c["design"]]["amount_gate_depth"] <= 45),
                 key=lambda c: (FEAT[c["design"]]["amount_gate_depth"], c["design"], c["clock"]))
    out += ["", "## Ladder-branch wide-shift cells with amount gate depth 20 to 45, milestones 119 to 124 (124's blind, the rest seen)",
            "", "design | clock | amount_gate_depth | SWC % | random % | ladder wins"]
    out += [f"{c['design']} | {c['clock']} | {FEAT[c['design']]['amount_gate_depth']} | {swc(c):.2f} | {c['rand']:.2f} | "
            f"{swc(c) < c['rand']}" for c in lad]
    out += ["", "## SWG(t) for t = 30 to 42 on the blind cells (descriptive; 36 was fixed in milestone 123)", ""] + sweep_lines(blind)
    out += ["", f"## SWG(t) on milestones 119 to 124 together ({len(allc)} cells; post hoc for every t but 36 on 124's cells)", ""]
    out += sweep_lines(allc)
    four = at.m121_blind() + at.blind_table() + ac.blind_table() + blind
    out += ["", f"## Milestones 121 to 124 blind cells together ({len(four)} cells, {len({c['design'] for c in four})} designs)", "",
            f"mean regret %: {means(four)}", ""]
    out += sp.compare_lines(four, ((swg, rand, "SWG(36)", "random"), (swd3, rand, "SWD(3)", "random")), SEED)
    out += ["", f"## Milestones 119 to 124 together ({len(allc)} cells, {len({c['design'] for c in allc})} designs)", "",
            f"mean regret %: {means(allc)}", ""]
    out += sp.compare_lines(allc, ((swg, rand, "SWG(36)", "random"),), SEED)
    sel = lambda names: [c for c in blind if c["design"] in names]
    p1, p2, p3 = sel({"sad2b5", "sat2b5"}), sel({"sad1b8"}), sel({"max3b5"})
    b, w, _ = pool.compare(blind, swg, rand)
    ratio = {(c["design"], c["clock"]): c["ratio"] for c in blind}
    clocks = sorted({c["clock"] for c in blind})
    twin = all(ratio[("max3b6n", k)] < ratio[("max3b6", k)] for k in clocks)
    ladder = sum(c["ratio"] > score.THETA for c in blind)
    out += ["", "## Predictions", "",
            f"(1) sad2b5 and sat2b5 ({len(p1)} cells), SWC below random: {mean(p1, swc) < mean(p1, rand)} "
            f"({mean(p1, swc):.2f}% against {mean(p1, rand):.2f}%)",
            f"(2) sad1b8 ({len(p2)} cells), SWC above random: {mean(p2, swc) > mean(p2, rand)} "
            f"({mean(p2, swc):.2f}% against {mean(p2, rand):.2f}%)",
            f"(3) max3b5 ({len(p3)} cells), SWC above random: {mean(p3, swc) > mean(p3, rand)} "
            f"({mean(p3, swc):.2f}% against {mean(p3, rand):.2f}%)",
            f"(4) blind SWG(36) below random: {mean(blind, swg) < mean(blind, rand)} ({mean(blind, swg):.2f}% against "
            f"{mean(blind, rand):.2f}%)",
            f"(5) blind SWG(36) better than random in more cells than worse: {b > w} ({b} better, {w} worse)",
            f"(6) max3b6n routed/r2 below max3b6 at both clocks: {twin} ("
            + ", ".join(f"{k} {ratio[('max3b6n', k)]:.2f} against {ratio[('max3b6', k)]:.2f}" for k in clocks) + ")",
            f"(7) at least 8 of 14 blind cells on the ladder branch: {ladder >= 8} ({ladder})"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
