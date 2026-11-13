"""Milestone 120: does milestone 119's structural shifter guard SWS(64) hold on a second, larger blind test, and does its disclosed
blind spot (a shifter written without a shift operator) bite?

Usage: python3 analyse.py [out.txt]

Why: milestone 119 chose SWS(64) (SWC, but route randomly when the RTL has a live word-level shift of >= 64 bits) on 136 seen cells
and tested it blind on 12 cells of three new families. It beat random in 3 cells, lost in none and tied in 9, because the guard acted
on only 3 cells (one family). Its "Next" asked for shifters where routing is dear (wider lzcnorm) and a hand-built mux-tree shifter
that the feature cannot see.

Guards (each replaces SWC by equal-cost random routing on the designs it flags; the timing pilot and its cost are unchanged):
  SWS(64)  milestone 119's guard, fixed, not re-chosen: flag when shift_width >= 64.
  SWG      SWS(64), or 0.75 <= mux_share < 0.9 in rung 1's generic-gate netlist (features.py). Fixed by mechanism, not selected:
           the seen barrels synthesise to 0.76 to 0.87 MUX cells, the crossbars to 0.94 to 0.98 and every seen non-shifter except
           sbox (0.82) to under 0.40. On the 148 seen cells (milestone 119's 136 plus its 12 blind ones) SWG equals SWS(64) to the
           cent (1.32%): the designs it adds (barrel16, barrel32, sbox) sit below the cost threshold, where both route randomly. So
           the seen data cannot choose between them, and no band or size cut was tuned. Disclosed: the blind designs' features
           (features.json) were computed before SWG was written, as in milestone 119; muxshl64 has 775 cells, so a size cut at
           barrel64's 852 would have missed it, and none was used.

Blind designs (run.py; fixed before any flow run, checked by check_designs.py: muxshl_w is proved equal to barrel_w by a SAT miter at
W = 64 and 128; alignsh_w and lzcnorm_w match a Python reference on 40 random vectors per width):
  lzcnorm96, lzcnorm128   shift_width 96, 128; mux_share 0.46, 0.35   flagged by both guards
  alignsh64, alignsh128   shift_width 64, 128; mux_share 0.34, 0.37   flagged by both guards (a family no table has run)
  muxshl64, muxshl128     shift_width 0, 0;    mux_share 0.83, 0.85   flagged by SWG only (a family no table has run; barrel's
                                                                      function, no shift operator)

Predictions, written in this file before the blind table existed (checked in main()):
 (1) on the blind cells, SWS(64) has lower mean regret than SWC;
 (2) on the blind cells, SWG has lower mean regret than equal-cost random routing and no higher than SWS(64);
 (3) on the muxshl cells, SWC has higher mean regret than random (the blind spot is real: the barrel's failure follows the function,
     not the operator);
 (4) at least 2 of the 4 muxshl cells are on the ladder branch (routed/r2 > theta = 3);
 (5) at least 2 of the 8 cells SWS(64) flags (lzcnorm, alignsh) are on the ladder branch, and on those SWC has higher mean regret
     than random;
 (6) over milestone 119's and 120's blind cells together (24 cells, 12 designs), SWG is better than random in more cells than worse;
 (7) over the same 24 cells, the design-bootstrap 95% interval of the mean of (SWG - random) lies below 0 (2,000 resamples, seed 120).
Reported, not predicted: whether SWC fails on the flagged-but-cheap cells, the family split, seen + blind together.
"""
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 120
BLIND = HERE / "results.jsonl"


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


sg = _sibling(EXP / "struct_guard" / "analyse.py", "verified_dse_m120_sg")
nf, pool, score = sg.nf, sg.pool, sg.score
rule = score.rule
swc, rand, fam, mean = nf.swc, nf.rand, nf.fam, nf.mean
FEAT = {**sg.FEAT, **json.loads((HERE / "features.json").read_text())}


def flag_s(d):
    return FEAT[d]["shift_width"] >= 64


def flag_g(d):
    return flag_s(d) or 0.75 <= FEAT[d]["mux_share"] < 0.9


def sws(c):
    return c["rand"] if flag_s(c["design"]) else swc(c)


def swg(c):
    return c["rand"] if flag_g(c["design"]) else swc(c)


def m119_blind():
    return nf.build(rule.load_table(sg.BLIND, "struct_guard"), lambda k: f"m119blind{k[0]}{k[1]}")


def seen_tables():
    return sg.seen_tables() + m119_blind()


def blind_table():
    return nf.build(rule.load_table(BLIND, "shift_power"), lambda k: f"m120blind{k[0]}{k[1]}") if BLIND.exists() else []


def compare_lines(rows, pairs, seed=SEED):
    out = []
    for f, g, a, b in pairs:
        bt, w, t = pool.compare(rows, f, g)
        lo, hi = pool.boot_ci(rows, lambda c: f(c) - g(c), seed=seed)
        out.append(f"{a} vs {b}: better {bt}, worse {w}, tied {t}; sign p = {pool.sign_p(bt, w):.3f}; design bootstrap 95% "
                   f"interval of mean ({a} - {b}) {lo:+.2f} to {hi:+.2f} points")
    return out


def main(dst):
    seen = seen_tables()
    out = ["# Milestone 120: the structural shifter guard on a second blind test (wider normalisers, an alignment shifter, and a "
           "barrel written without a shift operator)", "",
           f"theta = {score.THETA}, alpha = {nf.ALPHA}; design bootstrap {pool.BOOT} resamples, seed {SEED}.", "",
           f"## Seen cells ({len(seen)} cells, {len({(c['table'], c['design']) for c in seen})} designs; not a test)", "",
           f"SWC {mean(seen, swc):.2f}%, SWS(64) {mean(seen, sws):.2f}%, SWG {mean(seen, swg):.2f}%, random {mean(seen, rand):.2f}%",
           "seen designs SWG adds to SWS(64): " + ", ".join(sorted({c['design'] for c in seen if flag_g(c['design']) and
                                                                   not flag_s(c['design'])})),
           "", "## Blind designs' features (computed before the flow run)", "",
           "design | cells | mux_share | shift_width | SWS(64) flags | SWG flags"]
    for d in sorted(json.loads((HERE / "features.json").read_text())):
        f = FEAT[d]
        out.append(f"{d} | {f['cells']} | {f['mux_share']:.3f} | {f['shift_width']} | {flag_s(d)} | {flag_g(d)}")
    blind = blind_table()
    if not blind:
        out += ["", "## Blind test: no table yet"]
        Path(dst).write_text("\n".join(out) + "\n")
        print("\n".join(out))
        return
    out += ["", f"## Blind test (milestone 120 flow run): {len(blind)} cells", "",
            "clock | design | routed/r2 | routed delay/period | skip-r1 % | clipped skip-r1 % | random % | SWC % | SWS(64) % | SWG %"]
    for c in blind:
        out.append(f"{c['clock']} | {c['design']} | {c['ratio']:.2f} | {c['share']:.3f} | {c['skip']:.2f} | {c['clip'][nf.ALPHA]:.2f} | "
                   f"{c['rand']:.2f} | {swc(c):.2f} | {sws(c):.2f} | {swg(c):.2f}")
    out += ["", f"blind mean regret %: SW {mean(blind, nf.sw):.2f}, SWC {mean(blind, swc):.2f}, SWS(64) {mean(blind, sws):.2f}, "
            f"SWG {mean(blind, swg):.2f}, random {mean(blind, rand):.2f}", ""]
    out += ["blind " + s for s in compare_lines(blind, ((sws, rand, "SWS(64)", "random"), (swg, rand, "SWG", "random"),
                                                         (sws, swc, "SWS(64)", "SWC"), (swc, rand, "SWC", "random")))]
    out += ["", "## Blind cells by family (descriptive)", "", "family | cells | ladder branch | SWC % | SWS(64) % | SWG % | random %"]
    for fm in sorted({fam(c) for c in blind}):
        rs = [c for c in blind if fam(c) == fm]
        out.append(f"{fm} | {len(rs)} | {sum(c['ratio'] > score.THETA for c in rs)} | {mean(rs, swc):.2f} | {mean(rs, sws):.2f} | "
                   f"{mean(rs, swg):.2f} | {mean(rs, rand):.2f}")
    both = m119_blind() + blind
    out += ["", f"## Milestones 119 and 120 blind cells together ({len(both)} cells, {len({c['design'] for c in both})} designs)", "",
            f"mean regret %: SWC {mean(both, swc):.2f}, SWS(64) {mean(both, sws):.2f}, SWG {mean(both, swg):.2f}, "
            f"random {mean(both, rand):.2f}", ""]
    out += compare_lines(both, ((swg, rand, "SWG", "random"), (sws, rand, "SWS(64)", "random"), (swg, swc, "SWG", "SWC")))
    mux = [c for c in blind if fam(c) == "muxshl"]
    fs = [c for c in blind if flag_s(c["design"])]
    fsl = [c for c in fs if c["ratio"] > score.THETA]
    bt, w, _ = pool.compare(both, swg, rand)
    lo, hi = pool.boot_ci(both, lambda c: swg(c) - rand(c), seed=SEED)
    p5 = len(fsl) >= 2 and mean(fsl, swc) > mean(fsl, rand)
    out += ["", f"(1) blind SWS(64) below SWC: {mean(blind, sws) < mean(blind, swc)}",
            f"(2) blind SWG below random and no higher than SWS(64): "
            f"{mean(blind, swg) < mean(blind, rand) and mean(blind, swg) <= mean(blind, sws) + 1e-9}",
            f"(3) muxshl cells, SWC above random: {mean(mux, swc) > mean(mux, rand)} ({mean(mux, swc):.2f}% against "
            f"{mean(mux, rand):.2f}%)",
            f"(4) at least 2 of 4 muxshl cells on the ladder branch: {sum(c['ratio'] > score.THETA for c in mux) >= 2} "
            f"({sum(c['ratio'] > score.THETA for c in mux)})",
            f"(5) at least 2 SWS-flagged cells on the ladder branch, SWC above random there: {p5} ({len(fsl)} cells"
            + (f"; {mean(fsl, swc):.2f}% against {mean(fsl, rand):.2f}%)" if fsl else ")"),
            f"(6) 24 blind cells, SWG better than random in more cells than worse: {bt > w} ({bt} better, {w} worse)",
            f"(7) 24 blind cells, SWG - random interval below 0: {hi < 0} ({lo:+.2f} to {hi:+.2f})",
            "", "Flagged but below the cost threshold (SWC routes randomly anyway; skip-r1 shows what the ladder would have done): "
            + "; ".join(f"{c['clock']} {c['design']} skip-r1 {c['skip']:.2f}% against random {c['rand']:.2f}%"
                        for c in fs if c["ratio"] <= score.THETA),
            "", f"Also (not a test; seen and blind together, {len(seen) + len(blind)} cells): SWG {mean(seen + blind, swg):.2f}%, "
            f"SWS(64) {mean(seen + blind, sws):.2f}%, SWC {mean(seen + blind, swc):.2f}%, random {mean(seen + blind, rand):.2f}%"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
