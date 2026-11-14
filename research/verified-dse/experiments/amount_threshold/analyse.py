"""Milestone 122: where between word-level depth 2 and 63 does a shifter's amount stop being "from pins" for the mapped-rung ladder?
The amount-depth guard SWD(8), fixed in milestone 121, tested blind from both sides of its threshold on three new shifter families.

Usage: python3 analyse.py [out.txt]

Why: milestone 121 found the clipped ladder (SWC) losing to random routing on shifters whose amount passes through 1 or 2 word-level
cells (an adder, a subtract-compare-select) and winning on those whose amount comes out of a 63- or 127-cell counter chain. Its
registered alternative SWD(8) (route randomly when shift_width >= 64 and amount_depth < 8) was the best rule on its blind cells, but
k = 8 was a choice, not a measurement: no design had a depth between 2 and 63. Its "Next" asked for shifters whose amount comes from
4 to 32 word-level cells, with SWD(8) fixed as the primary guard.

Designs (run.py; fixed before any flow run of this milestone; checked by check_designs.py against a Python reference with Yosys
`eval`, 30 vectors each; features.py computed before the flow). All 128-bit shifters with a 7-bit or narrower amount; each family has
one shallow design (depth 4 or 5, below k = 8) and one deep design (16 to 23):
  chainsh2, chainsh8  x >> s, s = a then K rounds of (s ^ b) + c          amount_depth 4, 16
  pcnsh6, pcnsh24     x << popcount(m), m an M-bit mask (M << W)          amount_depth 5, 23
  tzcsh4, tzcsh8      x >> (first set bit of an N-bit request) lanes       amount_depth 10, 22
amount_depth counts word-level cells, not gate levels (experiments/amount_depth/features.py, unchanged).

Guards (each replaces SWC by equal-cost random routing on the designs it flags; the timing pilot and its cost are unchanged):
  SWD(8)    primary, fixed in milestone 121: flag when shift_width >= 64 and amount_depth < 8. Flags chainsh2 and pcnsh6.
  SWDG(8)   SWD(8), or 0.75 <= mux_share < 0.9 (milestone 120's band, unchanged). Flags chainsh2, pcnsh6 and pcnsh24 (mux_share 0.80).
  SWD(1)    milestone 121's primary; flags none of these designs, so it equals SWC here.
  SWS(64)   milestone 119's; flags all six, so it equals random routing here.

Predictions, written in this file before the blind table existed (checked in main()):
 (1) on the four designs with amount_depth >= 8 (8 cells), SWC has lower mean regret than random;
 (2) on the two designs with amount_depth < 8 (4 cells), SWC has higher mean regret than random;
 (3) on the blind cells, SWD(8) has lower mean regret than random;
 (4) on the blind cells, SWD(8) has lower mean regret than SWC (= SWD(1));
 (5) on the blind cells, SWD(8) is better than random in more cells than worse;
 (6) over milestones 121 and 122's blind cells (24 cells, 12 designs), SWD(8) is better than random in more cells than worse;
 (7) at least 6 of the 12 blind cells are on the ladder branch (routed/r2 > theta = 3).
Reported, not predicted: SWDG(8) against SWD(8) and random; the family split; per-design SWC minus random against amount_depth
(descriptive: with six depths it cannot place a threshold, only say which side of 8 each family's sign change falls); the
design-bootstrap interval (2,000 resamples, seed 122) of SWD(8) - random on the 12 and the 24 cells; milestones 119 to 122 together.
"""
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 122
BLIND = HERE / "results.jsonl"


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ad = _sibling(EXP / "amount_depth" / "analyse.py", "verified_dse_m122_ad")
sp, nf, pool, score = ad.sp, ad.nf, ad.pool, ad.score
rule = score.rule
swc, rand, fam, mean = nf.swc, nf.rand, nf.fam, nf.mean
NEWF = json.loads((HERE / "features.json").read_text())
FEAT = {**ad.FEAT, **NEWF}


def flag_d(d, k=8):
    a = FEAT[d]["amount_depth"]
    return FEAT[d]["shift_width"] >= 64 and a is not None and a < k


def flag_dg(d):
    return flag_d(d, 8) or 0.75 <= FEAT[d].get("mux_share", sp.FEAT.get(d, {}).get("mux_share", 0)) < 0.9


def guard(flag):
    return lambda c: c["rand"] if flag(c["design"]) else swc(c)


swd8, swdg8, swd1, sws = guard(flag_d), guard(flag_dg), guard(lambda d: flag_d(d, 1)), ad.sws


def m121_blind():
    return ad.blind_table()


def blind_table():
    return nf.build(rule.load_table(BLIND, "amount_threshold"), lambda k: f"m122blind{k[0]}{k[1]}") if BLIND.exists() else []


def main(dst):
    out = ["# Milestone 122: the amount-depth threshold, tested blind from both sides of k = 8 on three new shifter families", "",
           f"theta = {score.THETA}, alpha = {nf.ALPHA}; design bootstrap {pool.BOOT} resamples, seed {SEED}.", "",
           "## Blind designs' features (computed before the flow run)", "",
           "design | shift_width | amount_depth | amount_cells | mux_share | SWD(8) | SWDG(8)"]
    for d in sorted(NEWF):
        f = FEAT[d]
        out.append(f"{d} | {f['shift_width']} | {f['amount_depth']} | {f['amount_cells']} | {f['mux_share']:.3f} | {flag_d(d)} | "
                   f"{flag_dg(d)}")
    blind = blind_table()
    if not blind:
        out += ["", "## Blind test: no table yet"]
        Path(dst).write_text("\n".join(out) + "\n")
        print("\n".join(out))
        return
    out += ["", f"## Blind test (milestone 122 flow run): {len(blind)} cells", "",
            "clock | design | amount_depth | routed/r2 | routed delay/period | skip-r1 % | clipped skip-r1 % | random % | "
            "SWC = SWD(1) % | SWD(8) % | SWDG(8) %"]
    for c in sorted(blind, key=lambda c: (FEAT[c["design"]]["amount_depth"], c["design"], c["clock"])):
        out.append(f"{c['clock']} | {c['design']} | {FEAT[c['design']]['amount_depth']} | {c['ratio']:.2f} | {c['share']:.3f} | "
                   f"{c['skip']:.2f} | {c['clip'][nf.ALPHA]:.2f} | {c['rand']:.2f} | {swc(c):.2f} | {swd8(c):.2f} | {swdg8(c):.2f}")
    out += ["", f"blind mean regret %: SWC = SWD(1) {mean(blind, swc):.2f}, SWD(8) {mean(blind, swd8):.2f}, "
            f"SWDG(8) {mean(blind, swdg8):.2f}, SWS(64) = random {mean(blind, rand):.2f}", ""]
    out += ["blind " + s for s in sp.compare_lines(blind, ((swd8, rand, "SWD(8)", "random"), (swd8, swc, "SWD(8)", "SWC"),
                                                           (swdg8, rand, "SWDG(8)", "random")), SEED)]
    out += ["", "## Per design, by amount depth (descriptive)", "",
            "design | amount_depth | cells on ladder branch | SWC % | random % | SWC - random (points)"]
    for d in sorted(NEWF, key=lambda d: (FEAT[d]["amount_depth"], d)):
        rs = [c for c in blind if c["design"] == d]
        out.append(f"{d} | {FEAT[d]['amount_depth']} | {sum(c['ratio'] > score.THETA for c in rs)} | {mean(rs, swc):.2f} | "
                   f"{mean(rs, rand):.2f} | {mean(rs, swc) - mean(rs, rand):+.2f}")
    out += ["", "## Blind cells by family (descriptive)", "", "family | cells | ladder branch | SWC % | SWD(8) % | SWDG(8) % | random %"]
    for fm in sorted({fam(c) for c in blind}):
        rs = [c for c in blind if fam(c) == fm]
        out.append(f"{fm} | {len(rs)} | {sum(c['ratio'] > score.THETA for c in rs)} | {mean(rs, swc):.2f} | {mean(rs, swd8):.2f} | "
                   f"{mean(rs, swdg8):.2f} | {mean(rs, rand):.2f}")
    two = m121_blind() + blind
    out += ["", f"## Milestones 121 and 122 blind cells together ({len(two)} cells, {len({c['design'] for c in two})} designs)", "",
            f"mean regret %: SWC {mean(two, swc):.2f}, SWD(8) {mean(two, swd8):.2f}, SWDG(8) {mean(two, swdg8):.2f}, "
            f"random {mean(two, rand):.2f}", ""]
    out += sp.compare_lines(two, ((swd8, rand, "SWD(8)", "random"), (swd8, swc, "SWD(8)", "SWC")), SEED)
    four = sp.m119_blind() + sp.blind_table() + two
    out += ["", f"## Milestones 119 to 122 blind cells together ({len(four)} cells, {len({c['design'] for c in four})} designs; "
            "only 121's and 122's were blind to amount_depth, and only 122's to k = 8)", "",
            f"mean regret %: SWC {mean(four, swc):.2f}, SWS(64) {mean(four, sws):.2f}, SWD(8) {mean(four, swd8):.2f}, "
            f"SWDG(8) {mean(four, swdg8):.2f}, random {mean(four, rand):.2f}", ""]
    out += sp.compare_lines(four, ((swd8, rand, "SWD(8)", "random"), (swdg8, rand, "SWDG(8)", "random")), SEED)
    deep = [c for c in blind if FEAT[c["design"]]["amount_depth"] >= 8]
    shallow = [c for c in blind if FEAT[c["design"]]["amount_depth"] < 8]
    b1, w1, _ = pool.compare(blind, swd8, rand)
    b2, w2, _ = pool.compare(two, swd8, rand)
    ladder = sum(c["ratio"] > score.THETA for c in blind)
    out += ["", f"(1) amount_depth >= 8 ({len(deep)} cells), SWC below random: {mean(deep, swc) < mean(deep, rand)} "
            f"({mean(deep, swc):.2f}% against {mean(deep, rand):.2f}%)",
            f"(2) amount_depth < 8 ({len(shallow)} cells), SWC above random: {mean(shallow, swc) > mean(shallow, rand)} "
            f"({mean(shallow, swc):.2f}% against {mean(shallow, rand):.2f}%)",
            f"(3) blind SWD(8) below random: {mean(blind, swd8) < mean(blind, rand)} ({mean(blind, swd8):.2f}% against "
            f"{mean(blind, rand):.2f}%)",
            f"(4) blind SWD(8) below SWC: {mean(blind, swd8) < mean(blind, swc)} ({mean(blind, swd8):.2f}% against "
            f"{mean(blind, swc):.2f}%)",
            f"(5) blind SWD(8) better than random in more cells than worse: {b1 > w1} ({b1} better, {w1} worse)",
            f"(6) 121 and 122 blind cells, SWD(8) better than random in more cells than worse: {b2 > w2} ({b2} better, {w2} worse)",
            f"(7) at least 6 of 12 blind cells on the ladder branch: {ladder >= 6} ({ladder})"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
