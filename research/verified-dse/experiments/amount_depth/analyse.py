"""Milestone 121: is it where a shifter's amount comes from, not whether it has a wide shift operator, that decides whether the
mapped-rung ladder can rank it? A guard on the amount's source, tested blind on three shifter families no table has run.

Usage: python3 analyse.py [out.txt]

Why: milestone 120 found milestone 119's guard SWS(64) (the clipped switch SWC, but route randomly when the RTL has a live shift of
64 bits or more) wrong on the leading-zero normaliser: there the clipped ladder reached 0.00% in all 8 cells of milestones 119 and 120,
against 1.90% to 11.83% for random routing, while it failed on shifters whose amount is a module input (barrel, funnel,
rotate-and-mask, the alignment shifter, the hand-built barrel). Its reading: a shifter whose amount comes out of deep logic puts its
critical path through logic the mapped rung sees. Its "Next" asked for a guard on the amount's source, chosen on the cells seen so
far and tested blind on new shifter families of both kinds.

Feature (features.py, one Yosys 0.70 elaboration per design, no flow run; features.json): amount_depth, the longest chain of
word-level cells from a module input to the amount port of the design's widest live shift cell (0 when the amount is a pin).
On every seen design with a live shift of 64 bits or more, amount_depth is 0 except the normalisers (lzcnorm64 190, lzcnorm96 286,
lzcnorm128 382). So the seen cells cannot place a threshold anywhere between 1 and 190.

Guards (each replaces SWC by equal-cost random routing on the designs it flags; the timing pilot and its cost are unchanged):
  SWS(64)  milestone 119's guard, fixed: flag when shift_width >= 64.
  SWD(k)   flag when shift_width >= 64 and amount_depth < k. On the 160 seen cells every k from 1 to 287 gives the same regret (1.81%, against 1.96% for SWS(64))
           (printed below), so k is fixed by mechanism, not selection. Primary: SWD(1), "the amount comes straight from pins".
           Registered alongside: SWD(8), "a few word-level cells in front of the amount still count as pin-driven".
  SWDG     SWD(1), or 0.75 <= mux_share < 0.9 in rung 1's generic-gate netlist (milestone 120's band, unchanged; it catches a
           shifter written without a shift operator, which has no amount_depth).
Disclosed: amount_depth was defined after milestone 120's table was read, with the normaliser in view; the seen cells (milestones
110 to 120) are not a test of it. Only this milestone's 12 cells are.

Blind designs (run.py; fixed before any flow run of this milestone, checked by check_designs.py against a Python reference with Yosys
`eval`; features computed before the flow):
  addsh64, addsh128      x >> (a + b): one adder in front of the amount       amount_depth 1   SWD(1) no, SWD(8) yes, SWDG: 128 only
                                                                             (mux_share 0.72, 0.77)
  fpalign64, fpalign128  x >> |ea - eb| (8-bit exponents): subtract, compare,  amount_depth 2   SWD(1) no, SWD(8) yes, SWDG no
                         select                                              (mux_share 0.54, 0.62)
  pcsh64, pcsh128        x << popcount(m), a W-input counter chain            amount_depth 63, 127   flagged by neither SWD
SWS(64) flags all six, so on the blind cells SWS(64) is random routing everywhere and SWD(1) is SWC everywhere.

Predictions, written in this file before the blind table existed (checked in main()):
 (1) on the pcsh cells, SWC has lower mean regret than random (the normaliser's success replicates on a different deep-amount family);
 (2) at least 2 of the 4 pcsh cells are on the ladder branch (routed/r2 > theta = 3);
 (3) on the blind cells, SWD(1) has lower mean regret than SWS(64);
 (4) on the addsh cells, SWC has higher mean regret than random (one small adder does not move the critical path off the shifter);
 (5) on the fpalign cells, SWC has lower mean regret than random (a subtract-compare-select in front of the amount does);
 (6) on the blind cells, SWDG has lower mean regret than random;
 (7) over milestones 119, 120 and 121's blind cells (36 cells, 18 designs), SWDG is better than random in more cells than worse.
Reported, not predicted: SWD(8) and SWS(64) against SWD(1) and random on the blind cells; the family split; the design-bootstrap
interval (2,000 resamples, seed 121) of SWDG - random on the 12 cells and on the 36; seen and blind together.
"""
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 121
BLIND = HERE / "results.jsonl"
KS = [1, 2, 4, 8, 16, 64, 190, 191, 287, 383]


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


sp = _sibling(EXP / "shift_power" / "analyse.py", "verified_dse_m121_sp")
nf, pool, score = sp.nf, sp.pool, sp.score
rule = score.rule
swc, rand, fam, mean = nf.swc, nf.rand, nf.fam, nf.mean
AMT = json.loads((HERE / "features.json").read_text())
FEAT = {d: {**sp.FEAT.get(d, {}), **AMT[d]} for d in AMT}


def flag_s(d):
    return FEAT[d]["shift_width"] >= 64


def flag_d(d, k=1):
    a = FEAT[d]["amount_depth"]
    return FEAT[d]["shift_width"] >= 64 and a is not None and a < k


def flag_dg(d):
    return flag_d(d, 1) or 0.75 <= FEAT[d]["mux_share"] < 0.9


def guard(flag):
    return lambda c: c["rand"] if flag(c["design"]) else swc(c)


sws, swd1, swd8, swdg = guard(flag_s), guard(flag_d), guard(lambda d: flag_d(d, 8)), guard(flag_dg)


def seen_tables():
    return sp.seen_tables() + sp.blind_table()


def blind_table():
    return nf.build(rule.load_table(BLIND, "amount_depth"), lambda k: f"m121blind{k[0]}{k[1]}") if BLIND.exists() else []


def main(dst):
    seen = seen_tables()
    out = ["# Milestone 121: a guard on where a shifter's amount comes from, tested blind on three new shifter families", "",
           f"theta = {score.THETA}, alpha = {nf.ALPHA}; design bootstrap {pool.BOOT} resamples, seed {SEED}.", "",
           f"## Seen cells ({len(seen)} cells, {len({(c['table'], c['design']) for c in seen})} designs; not a test)", "",
           f"SWC {mean(seen, swc):.2f}%, SWS(64) {mean(seen, sws):.2f}%, SWDG {mean(seen, swdg):.2f}%, random {mean(seen, rand):.2f}%",
           "SWD(k) seen mean regret by k (k = 383 flags every wide shifter, so it equals SWS(64)): "
           + ", ".join(f"k={k} {mean(seen, guard(lambda d, k=k: flag_d(d, k))):.2f}%" for k in KS),
           "seen designs with shift_width >= 64 and amount_depth > 0: "
           + ", ".join(f"{d} ({FEAT[d]['amount_depth']})" for d in sorted({c['design'] for c in seen})
                       if FEAT[d]["shift_width"] >= 64 and (FEAT[d]["amount_depth"] or 0) > 0),
           "", "## Blind designs' features (computed before the flow run)", "",
           "design | shift_width | amount_depth | amount_cells | mux_share | SWS(64) | SWD(1) | SWD(8) | SWDG"]
    blind_names = [d for d in sorted(AMT) if "mux_share" in AMT[d]]
    for d in blind_names:
        f = FEAT[d]
        out.append(f"{d} | {f['shift_width']} | {f['amount_depth']} | {f['amount_cells']} | {f['mux_share']:.3f} | {flag_s(d)} | "
                   f"{flag_d(d)} | {flag_d(d, 8)} | {flag_dg(d)}")
    blind = blind_table()
    if not blind:
        out += ["", "## Blind test: no table yet"]
        Path(dst).write_text("\n".join(out) + "\n")
        print("\n".join(out))
        return
    out += ["", f"## Blind test (milestone 121 flow run): {len(blind)} cells", "",
            "clock | design | routed/r2 | routed delay/period | skip-r1 % | clipped skip-r1 % | random % | SWC = SWD(1) % | SWD(8) % | "
            "SWDG %"]
    for c in blind:
        out.append(f"{c['clock']} | {c['design']} | {c['ratio']:.2f} | {c['share']:.3f} | {c['skip']:.2f} | {c['clip'][nf.ALPHA]:.2f} | "
                   f"{c['rand']:.2f} | {swd1(c):.2f} | {swd8(c):.2f} | {swdg(c):.2f}")
    out += ["", f"blind mean regret %: SWC {mean(blind, swc):.2f}, SWD(1) {mean(blind, swd1):.2f}, SWD(8) {mean(blind, swd8):.2f}, "
            f"SWDG {mean(blind, swdg):.2f}, SWS(64) {mean(blind, sws):.2f}, random {mean(blind, rand):.2f}", ""]
    out += ["blind " + s for s in sp.compare_lines(blind, ((swd1, rand, "SWD(1)", "random"), (swd8, rand, "SWD(8)", "random"),
                                                           (swdg, rand, "SWDG", "random"), (swd1, sws, "SWD(1)", "SWS(64)")), SEED)]
    out += ["", "## Blind cells by family (descriptive)", "", "family | cells | ladder branch | SWC % | SWD(8) % | SWDG % | random %"]
    for fm in sorted({fam(c) for c in blind}):
        rs = [c for c in blind if fam(c) == fm]
        out.append(f"{fm} | {len(rs)} | {sum(c['ratio'] > score.THETA for c in rs)} | {mean(rs, swc):.2f} | {mean(rs, swd8):.2f} | "
                   f"{mean(rs, swdg):.2f} | {mean(rs, rand):.2f}")
    three = sp.m119_blind() + sp.blind_table() + blind
    out += ["", f"## Milestones 119 to 121 blind cells together ({len(three)} cells, {len({c['design'] for c in three})} designs; "
            "only milestone 121's 12 were blind to amount_depth)", "",
            f"mean regret %: SWC {mean(three, swc):.2f}, SWS(64) {mean(three, sws):.2f}, SWD(1) {mean(three, swd1):.2f}, "
            f"SWDG {mean(three, swdg):.2f}, random {mean(three, rand):.2f}", ""]
    out += sp.compare_lines(three, ((swdg, rand, "SWDG", "random"), (swd1, rand, "SWD(1)", "random"), (swdg, sws, "SWDG", "SWS(64)")),
                            SEED)
    by = {fm: [c for c in blind if fam(c) == fm] for fm in ("pcsh", "addsh", "fpalign")}
    bt, w, _ = pool.compare(three, swdg, rand)
    out += ["", f"(1) pcsh cells, SWC below random: {mean(by['pcsh'], swc) < mean(by['pcsh'], rand)} "
            f"({mean(by['pcsh'], swc):.2f}% against {mean(by['pcsh'], rand):.2f}%)",
            f"(2) at least 2 of 4 pcsh cells on the ladder branch: {sum(c['ratio'] > score.THETA for c in by['pcsh']) >= 2} "
            f"({sum(c['ratio'] > score.THETA for c in by['pcsh'])})",
            f"(3) blind SWD(1) below SWS(64): {mean(blind, swd1) < mean(blind, sws)} ({mean(blind, swd1):.2f}% against "
            f"{mean(blind, sws):.2f}%)",
            f"(4) addsh cells, SWC above random: {mean(by['addsh'], swc) > mean(by['addsh'], rand)} "
            f"({mean(by['addsh'], swc):.2f}% against {mean(by['addsh'], rand):.2f}%)",
            f"(5) fpalign cells, SWC below random: {mean(by['fpalign'], swc) < mean(by['fpalign'], rand)} "
            f"({mean(by['fpalign'], swc):.2f}% against {mean(by['fpalign'], rand):.2f}%)",
            f"(6) blind SWDG below random: {mean(blind, swdg) < mean(blind, rand)} ({mean(blind, swdg):.2f}% against "
            f"{mean(blind, rand):.2f}%)",
            f"(7) 36 blind cells, SWDG better than random in more cells than worse: {bt > w} ({bt} better, {w} worse)",
            "", f"Also (not a test; seen and blind together, {len(seen) + len(blind)} cells): SWDG {mean(seen + blind, swdg):.2f}%, "
            f"SWD(1) {mean(seen + blind, swd1):.2f}%, SWS(64) {mean(seen + blind, sws):.2f}%, SWC {mean(seen + blind, swc):.2f}%, "
            f"random {mean(seen + blind, rand):.2f}%"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
