"""Milestone 119: does a structural guard that needs no routed point (route randomly when the RTL contains a wide data shifter) fix the
clipped switch's shifter failure, and does it hold on design families no table has run?

Usage: python3 analyse.py [out.txt]

Why: milestone 118 found the clipped switch SWC (milestone 115) worse than equal-cost random routing once shifter families are in the
test set (36 cells: 3.85% against 2.77%), and better without them (26 cells: 0.79% against 2.59%, sign p = 0.003), a split chosen
post hoc. Its "Next" asked for a structural guard chosen on the seen tables and tested blind on new families.

Features (features.py, one Yosys elaboration per design, seconds, no flow run; features.json):
  shift_width  the widest word-level shift cell ($shl, $shr, $sshl, $sshr, $shift, $shiftx) whose data and amount both carry signals;
               0 if none. A decoder (1 << s) and an indexed part-select (crossbar ports, 2 to 8 bits wide) are not wide shifters.
  mux_share    MUX cells / all cells in rung 1's generic-gate netlist (empty pass sequence).
Guards (each replaces SWC by equal-cost random routing on the designs it flags; the timing pilot and its cost are unchanged):
  SWS(w)  flag when shift_width >= w, w in {8, 16, 32, 64, 128, 256, off}
  SWM(m)  flag when mux_share >= m, m in {0.1, 0.25, 0.5, 0.75, 0.9, off}
Selection, on the 136 seen cells (milestones 110 to 118: held, dear, fresh, 115, 116, 118 tables): each guard's parameter by lowest
mean regret (ties to the larger parameter, i.e. the narrower guard); the primary guard is whichever of SWS and SWM has the lower
seen mean (ties to SWS). Leave-one-family-out (families leave together; the parameter re-chosen on the rest) gives the in-sample
estimate. Every per-cell regret is new_families/analyse.py's (so pilot_clip/guard.py's and clip_score/score.py's), imported unchanged.

Blind test: experiments/struct_guard/results.jsonl, six designs from three families no earlier table ran: rotmask64, rotmask128
(rotate then mask, designs/rotmask_w.v), lzcnorm32, lzcnorm64 (leading-zero count and normalising shift, designs/lzcnorm_w.v),
maxtree16x16, maxtree32x16 (compare-and-select maximum tree, designs/maxtree_w.v). Milestone 108's 120 sequences, both clocks,
Yosys 0.70 and OpenROAD 26Q3. Their features were computed before the flow ran (features.json): shift_width 128, 256, 32, 64, 0, 0;
mux_share 0.36, 0.39, 0.31, 0.33, 0.14, 0.15. The selection below was run before the flow and picks SWS(64) (seen mean 1.08%,
tied with w = 16 and 32, ties to the narrower guard; leave-one-family-out 1.15%, against 1.95% for the best mux guard). It flags
rotmask64, rotmask128 and lzcnorm64 and not lzcnorm32 (a 32-bit shifter, below the threshold) or the max trees. No mux guard at
m >= 0.5 would flag any blind design.

Predictions, written in this file before the blind table existed (see PREDICTIONS; checked in main()):
 (1) the selection picks SWS(64) as the primary guard (known from the selection run above; stated so a change would be visible);
 (2) on the blind cells, the primary guard has lower mean regret than SWC;
 (3) on the blind cells, the primary guard has lower mean regret than equal-cost random routing;
 (4) on the blind cells, the primary guard is better than random in more cells than it is worse;
 (5) on the blind flagged cells (rotmask64, rotmask128, lzcnorm64), SWC has higher mean regret than random (the failure replicates
     on shifters no table has run, so the guard is doing work rather than flagging harmless designs);
 (6) on the blind maxtree cells, SWC (= the primary guard there) has mean regret no higher than random (a mux-heavy non-shifter
     is not a shifter for the ladder);
 (7) on the blind cells, the design-bootstrap 95% interval of the mean of (guard - random) lies below 0 (2,000 resamples, seed 119;
     the 136 seen cells chose the guard, so only the 12 blind cells count).
Reported, not predicted: lzcnorm32 (an unflagged 32-bit shifter: does SWC fail on it?), the family split, seen + blind together.
"""
import importlib.util
import json
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 119
WS = [8, 16, 32, 64, 128, 256, None]
MS = [0.1, 0.25, 0.5, 0.75, 0.9, None]
BLIND = HERE / "results.jsonl"
FEAT = json.loads((HERE / "features.json").read_text())


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


nf = _sibling(EXP / "new_families" / "analyse.py", "verified_dse_m119_nf")
pool = nf.pool
score = nf.score
rule = score.rule
swc, rand, fam, mean = nf.swc, nf.rand, nf.fam, nf.mean


def flags(kind, p, design):
    if p is None:
        return False
    f = FEAT[design]
    return f["shift_width"] >= p if kind == "S" else f["mux_share"] >= p


def guarded(kind, p):
    return lambda c: c["rand"] if flags(kind, p, c["design"]) else swc(c)


def choose(rows, kind):
    grid = WS if kind == "S" else MS
    # lowest mean; ties to the larger parameter (None = off counts as largest)
    return min(reversed(grid), key=lambda p: round(mean(rows, guarded(kind, p)), 9))


def lofo(rows, kind):
    out = []
    for fm in sorted({fam(c) for c in rows}):
        p = choose([c for c in rows if fam(c) != fm], kind)
        out += [guarded(kind, p)(c) for c in rows if fam(c) == fm]
    return statistics.mean(out)


def seen_tables():
    held, dear, fresh, m115, m116, m118 = nf.tables()
    return held + dear + fresh + m115 + m116 + m118


def name(kind, p):
    return f"SW{kind}({'off' if p is None else p})"


def main(dst):
    seen = seen_tables()
    out = ["# Milestone 119: a structural shifter guard for the clipped switch, chosen on 136 seen cells, tested blind on three new "
           "families (rotate-and-mask, leading-zero normaliser, maximum tree)", "",
           f"theta = {score.THETA}, alpha = {nf.ALPHA}; design bootstrap {pool.BOOT} resamples, seed {SEED}.", "",
           f"## Selection on the seen cells ({len(seen)} cells, {len({(c['table'], c['design']) for c in seen})} designs)", "",
           f"SWC {mean(seen, swc):.2f}%, random {mean(seen, rand):.2f}%", ""]
    for kind, grid in (("S", WS), ("M", MS)):
        out.append(" | ".join(f"{name(kind, p)} {mean(seen, guarded(kind, p)):.2f}%"
                              f" ({len({c['design'] for c in seen if flags(kind, p, c['design'])})} designs flagged)" for p in grid))
    ps, pm = choose(seen, "S"), choose(seen, "M")
    ms, mm = mean(seen, guarded("S", ps)), mean(seen, guarded("M", pm))
    kind, p = ("S", ps) if ms <= mm + 1e-9 else ("M", pm)
    G = guarded(kind, p)
    out += ["", f"chosen: {name('S', ps)} {ms:.2f}% (leave-one-family-out {lofo(seen, 'S'):.2f}%), "
            f"{name('M', pm)} {mm:.2f}% (leave-one-family-out {lofo(seen, 'M'):.2f}%); primary guard {name(kind, p)}",
            "seen designs it flags: " + ", ".join(sorted({c['design'] for c in seen if flags(kind, p, c['design'])})),
            "blind designs it flags: " + ", ".join(sorted(d for d in FEAT if flags(kind, p, d) and
                                                          not any(c['design'] == d for c in seen)))]
    blind = nf.build(rule.load_table(BLIND, "struct_guard"), lambda k: f"m119blind{k[0]}{k[1]}") if BLIND.exists() else []
    if not blind:
        out += ["", "## Blind test: no table yet"]
        Path(dst).write_text("\n".join(out) + "\n")
        print("\n".join(out))
        return
    out += ["", f"## Blind test: six designs, three new families (milestone 119 flow run): {len(blind)} cells", "",
            "clock | design | routed/r2 | routed delay/period | skip-r1 % | clipped skip-r1 % | random % | SWC % | guard % | flagged"]
    for c in blind:
        out.append(f"{c['clock']} | {c['design']} | {c['ratio']:.2f} | {c['share']:.3f} | {c['skip']:.2f} | {c['clip'][nf.ALPHA]:.2f} | "
                   f"{c['rand']:.2f} | {swc(c):.2f} | {G(c):.2f} | {flags(kind, p, c['design'])}")
    out += ["", f"blind mean regret %: SW {mean(blind, nf.sw):.2f}, SWC {mean(blind, swc):.2f}, {name(kind, p)} {mean(blind, G):.2f}, "
            f"SWM-off-grid best {name('M', pm)} {mean(blind, guarded('M', pm)):.2f}, random {mean(blind, rand):.2f}", ""]
    for f, g, a, b in ((G, rand, name(kind, p), "random"), (G, swc, name(kind, p), "SWC"), (swc, rand, "SWC", "random")):
        bt, w, t = pool.compare(blind, f, g)
        lo, hi = pool.boot_ci(blind, lambda c: f(c) - g(c), seed=SEED)
        out.append(f"blind {a} vs {b}: better {bt}, worse {w}, tied {t}; sign p = {pool.sign_p(bt, w):.3f}; design bootstrap 95% "
                   f"interval of mean ({a} - {b}) {lo:+.2f} to {hi:+.2f} points")
    out += ["", "## Blind cells by family (descriptive)", "", "family | cells | ladder branch | SWC % | guard % | random %"]
    for fm in sorted({fam(c) for c in blind}):
        rs = [c for c in blind if fam(c) == fm]
        out.append(f"{fm} | {len(rs)} | {sum(c['ratio'] > score.THETA for c in rs)} | {mean(rs, swc):.2f} | {mean(rs, G):.2f} | "
                   f"{mean(rs, rand):.2f}")
    sh = [c for c in blind if flags(kind, p, c["design"])]
    mx = [c for c in blind if fam(c) == "maxtree"]
    bt, w, _ = pool.compare(blind, G, rand)
    lo, hi = pool.boot_ci(blind, lambda c: G(c) - rand(c), seed=SEED)
    allc = seen + blind
    out += ["", f"(1) primary guard is SWS(64): {(kind, p) == ('S', 64)} ({name(kind, p)})",
            f"(2) blind guard below SWC: {mean(blind, G) < mean(blind, swc)}",
            f"(3) blind guard below random: {mean(blind, G) < mean(blind, rand)}",
            f"(4) blind guard better than random in more cells than worse: {bt > w} ({bt} better, {w} worse)",
            f"(5) blind flagged cells, SWC above random: {mean(sh, swc) > mean(sh, rand)} ({mean(sh, swc):.2f}% against {mean(sh, rand):.2f}%)",
            f"(6) blind maxtree cells, SWC no higher than random: {mean(mx, swc) <= mean(mx, rand)} ({mean(mx, swc):.2f}% against "
            f"{mean(mx, rand):.2f}%)",
            f"(7) blind guard - random interval below 0: {hi < 0} ({lo:+.2f} to {hi:+.2f})",
            "", "lzcnorm32 (unflagged shifter): " + "; ".join(f"{c['clock']} SWC {swc(c):.2f}%, random {rand(c):.2f}%, routed/r2 "
                                                            f"{c['ratio']:.2f}" for c in blind if c["design"] == "lzcnorm32"),
            "", f"Also (not a test; seen and blind together, {len(allc)} cells): guard {mean(allc, G):.2f}%, SWC {mean(allc, swc):.2f}%, "
            f"random {mean(allc, rand):.2f}%"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
