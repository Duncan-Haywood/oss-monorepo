"""Milestone 132: the pilot-probe guard SWP(32) and the gate-depth guard SWG(32), registered side by side and tested blind with a
flow run on six 128-bit shifters from three families no table has run (experiments/blind_probe/run.py).

Usage: python3 analyse.py [out.txt]

Why: milestones 126 to 131 priced six pilot-side guards by replay on the 90 seen cells of milestones 119 to 125. The best of them on
the mean, SWP(32) (milestone 129), had 4.39% against 4.77% for the unguarded clipped ladder SWC and 3.91% for SWG(32); milestones
130 and 131 found its refinements flat or worse, and 131's "Next" asked to stop refining on seen cells and test SWP(32) and SWG(32)
blind with a flow run on new shifter families. SWG(32) has one blind test behind it (milestone 125, where it lost to random: 6.79%
against 5.69%); SWP(32) has none.

Rules (unchanged from the files that define them; nothing here is tuned on this table):
  SWC      the clipped ladder (milestone 115) on the ladder branch (routed/r2 > theta = 3), equal-cost random below it.
  SWG(32)  SWC, but equal-cost random on designs with shift_width >= 64 and amount_gate_depth < 32 (milestone 124/125). On this
           blind set it flags gray0 (24 gates) and mod8 (27).
  SWP(32)  experiments/pilot_probe/analyse.py's pilot_regret, unchanged: on the ladder branch, test the subset-of-32's clipped best
           against the timing pilot; trust means route SWC's ladder, distrust means route mapped then fresh points at random. 200
           draws per cell, seed "m132" + clock + design.
  random   equal-cost random routing.
  Reported, not predicted: SWGP(32), SWG(32)'s flag in front of SWP(32) (random on flagged designs, SWP elsewhere).

Designs (run.py; checked by check_designs.py; features.json computed before the flow run). Gates = AND/NOT gate depth of the
amount (experiments/amount_cut/gate_depth.py), words = word-level depth (experiments/amount_depth/features.py):
  gray0   Gray-coded 7-bit field decoded to binary (prefix xor chain)      words 6, gates 24
  mod8    an 8-bit value mod 97                                            words 1, gates 27
  gray1   Gray decode plus one 7-bit offset                                words 7, gates 43
  lut1    one round of a fixed 7-bit substitution table, keyed by xor      words 3, gates 51
  mod10   a 10-bit value mod 97                                            words 1, gates 55
  mod12   a 12-bit value mod 97                                            words 1, gates 80

Predictions, written in this file before the blind table existed (checked in main()). The reading of milestones 124 to 131 is that
the ladder ranks a wide shifter well once enough logic sits in front of the amount, that SWP(32)'s single pilot is a coarse but real
test, and that the structural rule was better on seen cells:
 (1) on the blind cells, SWP(32) has lower mean regret than SWC;
 (2) on the blind cells, SWG(32) has lower mean regret than SWP(32);
 (3) on the blind cells, SWP(32) has lower mean regret than random;
 (4) on the blind cells, SWG(32) has lower mean regret than random;
 (5) on gray0 and mod8 (24 and 27 gates; 4 cells), SWC has higher mean regret than random;
 (6) on gray1, lut1, mod10 and mod12 (43 to 80 gates; 8 cells), SWC has lower mean regret than random;
 (7) SWP(32)'s distrust share is higher, averaged over the ladder-branch blind cells where SWC loses to random by more than 1 point,
     than over those where SWC is at most 0.5% (untestable, and reported as such, if either group is empty);
 (8) the design-bootstrap 95% interval of mean (SWP(32) - SWG(32)) over the blind cells contains 0 (2,000 resamples, seed 132).
Reported, not predicted: per-cell table, sign counts, SWGP(32), and the pooled table of every blind set SWG(32) has faced
(milestones 125 and 132; SWP(32) is blind only here, since it was priced on milestones 119 to 125).
"""
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 132
S = 32
BLIND = HERE / "results.jsonl"


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


al = _sibling(EXP / "amount_lanes" / "analyse.py", "verified_dse_m132_al")
pp = _sibling(EXP / "pilot_probe" / "analyse.py", "verified_dse_m132_pp")
nf, pool, score, sp = al.nf, al.pool, al.score, al.sp
rule = score.rule
swc, rand, mean = nf.swc, nf.rand, nf.mean
NEWF = json.loads((HERE / "features.json").read_text())
al.FEAT.update(NEWF)
FEAT = al.FEAT
flag_g = al.flag_g
swg = al.swg


def lad(c):
    return c["ratio"] > score.THETA


def swp(c):
    return c["p"] if lad(c) else c["rand"]


def swgp(c):
    return c["rand"] if flag_g(c["design"]) else swp(c)


RULES = (("SWC", swc), ("SWG(32)", swg), ("SWP(32)", swp), ("SWGP(32)", swgp), ("random", rand))


def blind_table():
    if not BLIND.exists():
        return []
    raw = rule.load_table(BLIND, "blind_probe")
    rows = nf.build(raw, lambda k: f"m132blind{k[0]}{k[1]}")
    for c in rows:
        rs = raw[(c["clock"], c["design"], c["table"])]
        c["p"], c["pp"], c["pfell"], c["prouted"], c["psame"] = pp.pilot_regret(rs, S, f"m132{c['clock']}{c['design']}")
    return rows


def means(rows):
    return ", ".join(f"{n} {mean(rows, f):.2f}" for n, f in RULES)


def main(dst):
    out = ["# Milestone 132: SWP(32) and SWG(32) tested blind on six new 128-bit shifters (flow run)", "",
           f"theta = {score.THETA}, alpha = {nf.ALPHA}; {pp.DRAWS} draws per cell for SWP; design bootstrap {pool.BOOT} resamples, "
           f"seed {SEED}.", "", "## Blind designs' features (computed before the flow run)", "",
           "design | shift_width | amount_depth | amount_gate_depth | amount_gates | mux_share | SWG(32) flags"]
    for d in sorted(NEWF, key=lambda d: (NEWF[d]["amount_gate_depth"], d)):
        f = NEWF[d]
        out.append(f"{d} | {f['shift_width']} | {f['amount_depth']} | {f['amount_gate_depth']} | {f['amount_gates']} | "
                   f"{f['mux_share']:.3f} | {flag_g(d)}")
    blind = blind_table()
    if not blind:
        out += ["", "## Blind test: no table yet"]
        Path(dst).write_text("\n".join(out) + "\n")
        print("\n".join(out))
        return
    out += ["", f"## Blind test (milestone 132 flow run): {len(blind)} cells", "",
            "clock | design | amount_gate_depth | routed/r2 | routed delay/period | random % | SWC % | SWG(32) % | SWP(32) % | "
            "SWP distrust | SWP same | SWP routed"]
    for c in sorted(blind, key=lambda c: (FEAT[c["design"]]["amount_gate_depth"], c["design"], c["clock"])):
        out.append(f"{c['clock']} | {c['design']} | {FEAT[c['design']]['amount_gate_depth']} | {c['ratio']:.2f} | {c['share']:.3f} | "
                   f"{c['rand']:.2f} | {swc(c):.2f} | {swg(c):.2f} | {swp(c):.2f} | "
                   + (f"{c['pfell']:.2f} | {c['psame']:.2f} | {c['prouted']:.1f}" if lad(c) else "- | - | -"))
    ladder = [c for c in blind if lad(c)]
    bad = [c for c in ladder if swc(c) > c["rand"] + 1]
    good = [c for c in ladder if swc(c) <= 0.5]
    out += ["", f"blind mean regret %: {means(blind)}",
            f"ladder-branch cells only ({len(ladder)}): {means(ladder) if ladder else '-'}",
            f"cells where SWC loses to random by > 1 point ({len(bad)}): {means(bad) if bad else '-'}",
            f"cells where SWC <= 0.5% ({len(good)}): {means(good) if good else '-'}", ""]
    out += ["blind " + s for s in sp.compare_lines(blind, ((swp, swc, "SWP(32)", "SWC"), (swp, swg, "SWP(32)", "SWG(32)"),
                                                           (swp, rand, "SWP(32)", "random"), (swg, rand, "SWG(32)", "random"),
                                                           (swgp, rand, "SWGP(32)", "random")), SEED)]
    out += ["", "## Per design along gate depth (descriptive)", "",
            "design | amount_gate_depth | cells on ladder branch | SWC % | SWP(32) % | random % | SWC - random (points)"]
    for d in sorted(NEWF, key=lambda d: (NEWF[d]["amount_gate_depth"], d)):
        rs = [c for c in blind if c["design"] == d]
        out.append(f"{d} | {NEWF[d]['amount_gate_depth']} | {sum(lad(c) for c in rs)} | {mean(rs, swc):.2f} | {mean(rs, swp):.2f} | "
                   f"{mean(rs, rand):.2f} | {mean(rs, swc) - mean(rs, rand):+.2f}")
    prev = al.blind_table()
    both = prev + blind
    out += ["", f"## Every blind set SWG(32) has faced: milestones 125 and 132 ({len(both)} cells, "
            f"{len({c['design'] for c in both})} designs)", "",
            "mean regret %: " + ", ".join(f"{n} {mean(both, f):.2f}" for n, f in (("SWC", swc), ("SWG(32)", swg), ("random", rand))), ""]
    out += sp.compare_lines(both, ((swg, rand, "SWG(32)", "random"), (swg, swc, "SWG(32)", "SWC")), SEED)
    fs = lambda cs: sum(c["pfell"] for c in cs) / len(cs)
    lo, hi = pool.boot_ci(blind, lambda c: swp(c) - swg(c), seed=SEED)
    a, s_, g, r = mean(blind, swp), mean(blind, swc), mean(blind, swg), mean(blind, rand)
    sel = lambda names: [c for c in blind if c["design"] in names]
    p5, p6 = sel({"gray0", "mod8"}), sel({"gray1", "lut1", "mod10", "mod12"})
    p7 = (f"{fs(bad) > fs(good)} ({len(bad)} cells {fs(bad):.2f} against {len(good)} cells {fs(good):.2f})" if bad and good
          else f"untestable ({len(bad)} cells where SWC loses by > 1 point, {len(good)} where SWC <= 0.5%)")
    out += ["", "## Predictions", "",
            f"(1) SWP(32) below SWC: {a < s_} ({a:.2f}% against {s_:.2f}%)",
            f"(2) SWG(32) below SWP(32): {g < a} ({g:.2f}% against {a:.2f}%)",
            f"(3) SWP(32) below random: {a < r} ({a:.2f}% against {r:.2f}%)",
            f"(4) SWG(32) below random: {g < r} ({g:.2f}% against {r:.2f}%)",
            f"(5) gray0 and mod8 ({len(p5)} cells), SWC above random: {mean(p5, swc) > mean(p5, rand)} "
            f"({mean(p5, swc):.2f}% against {mean(p5, rand):.2f}%)",
            f"(6) gray1, lut1, mod10 and mod12 ({len(p6)} cells), SWC below random: {mean(p6, swc) < mean(p6, rand)} "
            f"({mean(p6, swc):.2f}% against {mean(p6, rand):.2f}%)",
            f"(7) SWP(32) distrust share higher where SWC loses by > 1 point than where SWC <= 0.5%: {p7}",
            f"(8) design-bootstrap 95% interval of mean (SWP(32) - SWG(32)) contains 0: {lo <= 0 <= hi} ({lo:+.2f} to {hi:+.2f} points)"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
