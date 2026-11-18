"""Milestone 123: at the cut, is it word-level cells or gates in front of the shift amount that decide whether the mapped-rung ladder
ranks a wide shifter? Two guards that agree on every seen ladder-branch cell, tested blind on designs built to make them disagree.

Usage: python3 analyse.py [out.txt]

Why: milestone 122 placed the cut between word-level amount depth 2 and 4 (post hoc SWD(3), flag when shift_width >= 64 and
amount_depth < 3) and its "Next" asked for designs at depth 3 with a gate-level depth alongside, since word-level depth counts an
8-bit subtract and a 1-bit increment alike. gate_depth.py measures the amount's cone in two-input AND and NOT gates
(seen_gate_depth.json, computed before this milestone's flow). On the seen ladder-branch cells of milestones 119 to 122 with a wide
shift, the ladder loses at gate depth 0 (barrel-like: alignsh128, rotmask128, rotmask64 tight) and 27 to 30 (addsh128, fpalign128)
and reaches 0.00% from 41 up (chainsh2 41, pcnsh24 97, lzcnorm128 98, chainsh8 104, pcsh64 263, pcsh128 517). So SWD(3) and a
gate-depth guard with any threshold in (30, 41] separate the seen cells equally; the midpoint, 36, is fixed here.

Guards (each replaces SWC by equal-cost random routing on the designs it flags; the timing pilot and its cost are unchanged):
  SWG(36)  primary: flag when shift_width >= 64 and amount_gate_depth < 36. Flags xor4, xor8.
  SWD(3)   the word-level rule at milestone 122's cut: flag when shift_width >= 64 and amount_depth < 3. Flags wsum3w, mul2w.
  SWD(8)   milestone 121's (and 122's primary). Flags wsum3w, mul2w, wsum4n, mul3n, xor4, xor8: here equal to random.
  SWC      the clipped ladder on every design.

Designs (run.py; three families no table has run; checked by check_designs.py, features.json computed before the flow run):
  wsum3w  top 7 bits of a + b0 + b1, 32-bit operands      word depth 2, gate depth 118   SWD(3) flags, SWG(36) does not
  mul2w   top 7 bits of two chained 12-bit multiplies     word depth 2, gate depth 159   SWD(3) flags, SWG(36) does not
  xor4    a ^ b0 ^ b1 ^ b2, 7-bit                         word depth 3, gate depth 7     SWG(36) flags, SWD(3) does not
  xor8    the xor of eight 7-bit fields                   word depth 7, gate depth 15    SWG(36) flags, SWD(3) does not
  wsum4n  top 7 bits of a four-term sum, 7-bit operands   word depth 3, gate depth 43    neither flags (control at the cut)
  mul3n   top 7 bits of three chained 7-bit multiplies    word depth 3, gate depth 166   neither flags (control)

Predictions, written in this file before the blind table existed (checked in main()). The mechanism read in milestone 120 is that
the ladder ranks a shifter once its critical path runs through logic the mapped rung sees; that is a gate-level reading, so:
 (1) on wsum3w and mul2w (4 cells), SWC has lower mean regret than random (gates, not word cells, decide);
 (2) on xor4 and xor8 (4 cells), SWC has higher mean regret than random;
 (3) on wsum4n and mul3n (4 cells), SWC has lower mean regret than random;
 (4) on the blind cells, SWG(36) has lower mean regret than SWD(3);
 (5) on the blind cells, SWG(36) has lower mean regret than random;
 (6) on the blind cells, SWG(36) is better than random in more cells than worse;
 (7) at least 6 of the 12 blind cells are on the ladder branch (routed/r2 > theta = 3).
Reported, not predicted: SWD(8) and SWC; the family split; milestones 121 to 123 together (36 cells) and 119 to 123 (60 cells) for
SWG(36), SWD(3), SWD(8) and random, with design-bootstrap intervals (2,000 resamples, seed 123). SWG(36) and SWD(3) were both
chosen after milestones 119 to 122 were read, so only this milestone's cells test them.
"""
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 123
BLIND = HERE / "results.jsonl"
GATE_T = 36


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


at = _sibling(EXP / "amount_threshold" / "analyse.py", "verified_dse_m123_at")
sp, nf, pool, score = at.sp, at.nf, at.pool, at.score
rule = score.rule
swc, rand, fam, mean = nf.swc, nf.rand, nf.fam, nf.mean
NEWF = json.loads((HERE / "features.json").read_text())
SEEN_GD = json.loads((HERE / "seen_gate_depth.json").read_text())
FEAT = {k: dict(v) for k, v in at.FEAT.items()}
for k, v in SEEN_GD.items():
    FEAT.setdefault(k, {}).update(v)
FEAT.update(NEWF)


def flag_d(d, k=3):
    a = FEAT[d].get("amount_depth")
    return FEAT[d].get("shift_width", 0) >= 64 and a is not None and a < k


def flag_g(d, t=GATE_T):
    g = FEAT[d].get("amount_gate_depth")
    return FEAT[d].get("shift_width", 0) >= 64 and g is not None and g < t


def guard(flag):
    return lambda c: c["rand"] if flag(c["design"]) else swc(c)


swg, swd3, swd8 = guard(flag_g), guard(flag_d), guard(lambda d: flag_d(d, 8))
GUARDS = (("SWC", swc), ("SWG(36)", swg), ("SWD(3)", swd3), ("SWD(8)", swd8), ("random", rand))


def blind_table():
    return nf.build(rule.load_table(BLIND, "amount_cut"), lambda k: f"m123blind{k[0]}{k[1]}") if BLIND.exists() else []


def seen_tables():
    return sp.m119_blind() + sp.blind_table() + at.m121_blind() + at.blind_table()


def means(rows):
    return ", ".join(f"{n} {mean(rows, g):.2f}" for n, g in GUARDS)


def main(dst):
    out = ["# Milestone 123: word-level cells or gates in front of the shift amount, tested blind where the two disagree", "",
           f"theta = {score.THETA}, alpha = {nf.ALPHA}; design bootstrap {pool.BOOT} resamples, seed {SEED}.", "",
           "## Blind designs' features (computed before the flow run)", "",
           "design | shift_width | amount_depth | amount_gate_depth | amount_gates | mux_share | SWG(36) flags | SWD(3) flags"]
    for d in sorted(NEWF):
        f = FEAT[d]
        out.append(f"{d} | {f['shift_width']} | {f['amount_depth']} | {f['amount_gate_depth']} | {f['amount_gates']} | "
                   f"{f['mux_share']:.3f} | {flag_g(d)} | {flag_d(d)}")
    seen = seen_tables()
    out += ["", f"## Seen ladder-branch cells with a wide shift (milestones 119 to 122; where the thresholds were read, not a test)", "",
            "design | clock | amount_depth | amount_gate_depth | SWC % | random %"]
    for c in sorted((c for c in seen if c["ratio"] > score.THETA and FEAT[c["design"]].get("shift_width", 0) >= 64),
                    key=lambda c: (FEAT[c["design"]]["amount_gate_depth"], c["design"], c["clock"])):
        f = FEAT[c["design"]]
        out.append(f"{c['design']} | {c['clock']} | {f['amount_depth']} | {f['amount_gate_depth']} | {swc(c):.2f} | {c['rand']:.2f}")
    out += ["", f"seen mean regret % ({len(seen)} cells): {means(seen)}"]
    blind = blind_table()
    if not blind:
        out += ["", "## Blind test: no table yet"]
        Path(dst).write_text("\n".join(out) + "\n")
        print("\n".join(out))
        return
    out += ["", f"## Blind test (milestone 123 flow run): {len(blind)} cells", "",
            "clock | design | amount_depth | amount_gate_depth | routed/r2 | routed delay/period | skip-r1 % | clipped skip-r1 % | "
            "random % | SWC % | SWG(36) % | SWD(3) %"]
    for c in sorted(blind, key=lambda c: (FEAT[c["design"]]["amount_gate_depth"], c["design"], c["clock"])):
        f = FEAT[c["design"]]
        out.append(f"{c['clock']} | {c['design']} | {f['amount_depth']} | {f['amount_gate_depth']} | {c['ratio']:.2f} | "
                   f"{c['share']:.3f} | {c['skip']:.2f} | {c['clip'][nf.ALPHA]:.2f} | {c['rand']:.2f} | {swc(c):.2f} | "
                   f"{swg(c):.2f} | {swd3(c):.2f}")
    out += ["", f"blind mean regret %: {means(blind)}", ""]
    out += ["blind " + s for s in sp.compare_lines(blind, ((swg, rand, "SWG(36)", "random"), (swg, swd3, "SWG(36)", "SWD(3)"),
                                                           (swd3, rand, "SWD(3)", "random")), SEED)]
    out += ["", "## Per design (descriptive)", "",
            "design | amount_depth | amount_gate_depth | cells on ladder branch | SWC % | random % | SWC - random (points)"]
    for d in sorted(NEWF, key=lambda d: (FEAT[d]["amount_gate_depth"], d)):
        rs = [c for c in blind if c["design"] == d]
        out.append(f"{d} | {FEAT[d]['amount_depth']} | {FEAT[d]['amount_gate_depth']} | {sum(c['ratio'] > score.THETA for c in rs)} | "
                   f"{mean(rs, swc):.2f} | {mean(rs, rand):.2f} | {mean(rs, swc) - mean(rs, rand):+.2f}")
    out += ["", "## Blind cells by family (descriptive)", "", "family | cells | ladder branch | SWC % | SWG(36) % | SWD(3) % | random %"]
    for fm in sorted({fam(c) for c in blind}):
        rs = [c for c in blind if fam(c) == fm]
        out.append(f"{fm} | {len(rs)} | {sum(c['ratio'] > score.THETA for c in rs)} | {mean(rs, swc):.2f} | {mean(rs, swg):.2f} | "
                   f"{mean(rs, swd3):.2f} | {mean(rs, rand):.2f}")
    three = at.m121_blind() + at.blind_table() + blind
    out += ["", f"## Milestones 121 to 123 blind cells together ({len(three)} cells, {len({c['design'] for c in three})} designs)", "",
            f"mean regret %: {means(three)}", ""]
    out += sp.compare_lines(three, ((swg, rand, "SWG(36)", "random"), (swd3, rand, "SWD(3)", "random"),
                                    (swd8, rand, "SWD(8)", "random")), SEED)
    five = seen + blind
    out += ["", f"## Milestones 119 to 123 blind cells together ({len(five)} cells, {len({c['design'] for c in five})} designs; "
            "only 123's were blind to the two thresholds)", "", f"mean regret %: {means(five)}", ""]
    out += sp.compare_lines(five, ((swg, rand, "SWG(36)", "random"), (swd3, rand, "SWD(3)", "random")), SEED)
    sel = lambda names: [c for c in blind if c["design"] in names]
    p1, p2, p3 = sel({"wsum3w", "mul2w"}), sel({"xor4", "xor8"}), sel({"wsum4n", "mul3n"})
    b, w, _ = pool.compare(blind, swg, rand)
    ladder = sum(c["ratio"] > score.THETA for c in blind)
    out += ["", f"(1) wsum3w and mul2w ({len(p1)} cells), SWC below random: {mean(p1, swc) < mean(p1, rand)} "
            f"({mean(p1, swc):.2f}% against {mean(p1, rand):.2f}%)",
            f"(2) xor4 and xor8 ({len(p2)} cells), SWC above random: {mean(p2, swc) > mean(p2, rand)} "
            f"({mean(p2, swc):.2f}% against {mean(p2, rand):.2f}%)",
            f"(3) wsum4n and mul3n ({len(p3)} cells), SWC below random: {mean(p3, swc) < mean(p3, rand)} "
            f"({mean(p3, swc):.2f}% against {mean(p3, rand):.2f}%)",
            f"(4) blind SWG(36) below SWD(3): {mean(blind, swg) < mean(blind, swd3)} ({mean(blind, swg):.2f}% against "
            f"{mean(blind, swd3):.2f}%)",
            f"(5) blind SWG(36) below random: {mean(blind, swg) < mean(blind, rand)} ({mean(blind, swg):.2f}% against "
            f"{mean(blind, rand):.2f}%)",
            f"(6) blind SWG(36) better than random in more cells than worse: {b > w} ({b} better, {w} worse)",
            f"(7) at least 6 of 12 blind cells on the ladder branch: {ladder >= 6} ({ladder})"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
