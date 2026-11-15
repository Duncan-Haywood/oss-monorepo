"""Milestone 133: the unguarded clipped ladder SWC, the gate-depth guard SWG(32) and the pilot-probe guard SWP(32), tested blind
on seven 128-bit LEFT shifters from four families no table has run, chosen by a cost probe so that every cell reaches the ladder
branch (experiments/ladder_blind/run.py, probe.py).

Usage: python3 analyse.py [out.txt]

Why: milestone 132's blind set lost half its cells to right shifters under the cost threshold (routed/r2 about 2.2 < theta = 3),
leaving 3 informative designs on which every rule sat within a few points of random. Its "Next": probe routed/r2 as well as gate
depth before fixing a blind set, and test whether a distrusting SWP draw should drop the ladder entirely. Pooled over the two blind
sets SWG(32) has faced (milestones 125 and 132) the UNGUARDED ladder was best (SWC 3.60%, random 4.19%, SWG(32) 4.85%), so the
question this set asks first is whether any guard is worth its cost out of sample.

Rules (unchanged from the files that define them; nothing here is tuned on this table):
  SWC      the clipped ladder (milestone 115) on the ladder branch (routed/r2 > theta = 3), equal-cost random below it.
  SWG(32)  SWC, but equal-cost random on designs with shift_width >= 64 and amount_gate_depth < 32 (milestone 124/125). On this
           blind set it flags crc7s16 (18 gates), bcd2 (20), cmp16 (28) and bcd3 (30).
  SWP(32)  experiments/pilot_probe/analyse.py's pilot_regret, unchanged (200 draws per cell, seed "m133" + clock + design).
  SWPF(32) new, milestone 132's "Next": SWP(32) except that a distrusting draw routes only fresh uniform points (outside the
           subset, R each) with all of its remaining budget n - s + 7 (R - 1), instead of the subset's mapped points first. Same
           seeds and the same draws as SWP(32) (paired), so the two differ only on distrusting draws.
  random   equal-cost random routing.
  Reported, not predicted: SWGP(32), SWG(32)'s flag in front of SWP(32).

Designs (run.py; checked by check_designs.py; features.json and probe.txt computed before the flow run):
  crc7s16 CRC-7 of a 16-bit field                    gates 18, probe routed/r2 3.78
  bcd2    two BCD digits to binary                    gates 20, 5.41
  cmp16   (p < q) ? a : b, 16-bit compare             gates 28, 6.42
  bcd3    three BCD digits to binary (mod 128)        gates 30, 5.26
  cmp48   (p < q) ? a : b, 48-bit compare             gates 40, 5.87
  fib12   Fibonacci hash of a 12-bit key              gates 51, 3.58
  fib14   Fibonacci hash of a 14-bit key              gates 58, 4.23
  (crc7s32, 3.05, and fib10, 3.21, were probed and dropped by probe.py's rule, routed/r2 > 3.3.)

Predictions, written in this file before the blind table existed (checked in main()):
 (1) every one of the 14 cells is on the ladder branch (the probe works);
 (2) on the blind cells, SWC has lower mean regret than random;
 (3) on the blind cells, SWC has lower mean regret than SWG(32) (the pooled blind reading: the 32-gate flag costs more than it saves);
 (4) on the blind cells, SWC has lower mean regret than SWP(32);
 (5) on the blind cells, SWP(32) has lower mean regret than random;
 (6) on the four flagged designs (8 cells), SWC has higher mean regret than random (SWG(32)'s premise, tested again);
 (7) on cmp48, fib12 and fib14 (6 cells), SWC has lower mean regret than random;
 (8) SWP(32)'s distrust share is higher, averaged over the cells where SWC loses to random by more than 1 point, than over those
     where SWC is at most 0.5% (untestable, and reported as such, if either group is empty);
 (9) SWPF(32) has lower mean regret than SWP(32) over the cells where SWC loses to random by more than 1 point, and higher over
     the cells where SWC is at most 0.5% (untestable if either group is empty).
Reported, not predicted: per-cell table, sign counts with design-bootstrap intervals (2,000 resamples, seed 133), SWGP(32), and the
pooled table of every blind set: SWC, SWG(32) and random over milestones 125, 132 and 133; SWP(32) over 132 and 133.
"""
import importlib.util
import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 133
S = 32
BLIND = HERE / "results.jsonl"


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


bp = _sibling(EXP / "blind_probe" / "analyse.py", "verified_dse_m133_bp")
al, pp, nf, pool, score, sp = bp.al, bp.pp, bp.nf, bp.pool, bp.score, bp.sp
rule = score.rule
swc, rand, mean, swg, flag_g, lad = nf.swc, nf.rand, nf.mean, bp.swg, bp.flag_g, bp.lad
NEWF = json.loads((HERE / "features.json").read_text())
PROBE = json.loads((HERE / "probe.json").read_text())
bp.FEAT.update(NEWF)
FEAT = bp.FEAT


def swp(c):
    return c["p"] if lad(c) else c["rand"]


def swpf(c):
    return c["pf"] if lad(c) else c["rand"]


def swgp(c):
    return c["rand"] if flag_g(c["design"]) else swp(c)


RULES = (("SWC", swc), ("SWG(32)", swg), ("SWP(32)", swp), ("SWPF(32)", swpf), ("SWGP(32)", swgp), ("random", rand))


def fresh_regret(rs, s, seed):
    """SWPF(s) on one cell, with SWP(s)'s draws (the same rng calls in the same order up to the distrust branch). Returns mean regret
    (%) and distrust share; the trusting branch is SWP's exactly."""
    y = [rule.flow.scores(r)["r4"] for r in rs]
    key = [score.r2c(r, pp.ALPHA) for r in rs]
    best, n = min(y), len(y)
    t_ = rule.stage_times(rs)
    R = (t_["r2"] + t_["r3"] + t_["r4"]) / t_["r2"]
    s = min(s, n)
    rng = random.Random(seed)
    tot = fell = 0.0
    for _ in range(pp.DRAWS):
        tb = [rng.random() for _ in range(n)]
        u = rng.randrange(n)
        sub = rng.sample(range(n), s)
        t = min(sub, key=lambda i: (key[i], tb[i]))
        chosen = [t]
        if y[t] <= y[u]:
            order = sorted(range(n), key=lambda i: (key[i], tb[i]))
            for i in order:
                if len(chosen) >= 8:
                    break
                if i != t:
                    chosen.append(i)
        else:
            fell += 1
            left = n - s + 7 * (R - 1)
            rng.shuffle([i for i in sub if i != t])  # SWP's shuffle of the mapped points, kept so both rules see the same stream
            sset = set(sub)
            fresh = [i for i in range(n) if i not in sset]
            rng.shuffle(fresh)
            for i in fresh:
                if left + pp.EPS < R:
                    break
                chosen.append(i)
                left -= R
        tot += rule.draw_regret(y, best, chosen)
    return 100 * tot / pp.DRAWS, fell / pp.DRAWS


def blind_table():
    if not BLIND.exists():
        return []
    raw = rule.load_table(BLIND, "ladder_blind")
    rows = nf.build(raw, lambda k: f"m133blind{k[0]}{k[1]}")
    for c in rows:
        rs = raw[(c["clock"], c["design"], c["table"])]
        sd = f"m133{c['clock']}{c['design']}"
        c["p"], c["pp"], c["pfell"], c["prouted"], c["psame"] = pp.pilot_regret(rs, S, sd)
        c["pf"], fell = fresh_regret(rs, S, sd)
        assert abs(fell - c["pfell"]) < 1e-12, "SWPF must share SWP's draws"
    return rows


def means(rows, rules=RULES):
    return ", ".join(f"{n} {mean(rows, f):.2f}" for n, f in rules)


def main(dst):
    out = ["# Milestone 133: SWC, SWG(32) and SWP(32) tested blind on seven 128-bit left shifters probed for the ladder branch "
           "(flow run)", "",
           f"theta = {score.THETA}, alpha = {nf.ALPHA}; {pp.DRAWS} draws per cell for SWP and SWPF; design bootstrap {pool.BOOT} "
           f"resamples, seed {SEED}.", "", "## Blind designs' features and cost probe (computed before the flow run)", "",
           "design | shift_width | amount_depth | amount_gate_depth | amount_gates | mux_share | probe routed/r2 | SWG(32) flags"]
    for d in sorted(NEWF, key=lambda d: (NEWF[d]["amount_gate_depth"], d)):
        f = NEWF[d]
        out.append(f"{d} | {f['shift_width']} | {f['amount_depth']} | {f['amount_gate_depth']} | {f['amount_gates']} | "
                   f"{f['mux_share']:.3f} | {PROBE[d]['ratio']:.2f} | {flag_g(d)}")
    blind = blind_table()
    if not blind:
        out += ["", "## Blind test: no table yet"]
        Path(dst).write_text("\n".join(out) + "\n")
        print("\n".join(out))
        return
    out += ["", f"## Blind test (milestone 133 flow run): {len(blind)} cells", "",
            "clock | design | amount_gate_depth | probe routed/r2 | routed/r2 | routed delay/period | random % | SWC % | SWG(32) % | "
            "SWP(32) % | SWPF(32) % | SWP distrust | SWP same | SWP routed"]
    for c in sorted(blind, key=lambda c: (FEAT[c["design"]]["amount_gate_depth"], c["design"], c["clock"])):
        out.append(f"{c['clock']} | {c['design']} | {FEAT[c['design']]['amount_gate_depth']} | {PROBE[c['design']]['ratio']:.2f} | "
                   f"{c['ratio']:.2f} | {c['share']:.3f} | {c['rand']:.2f} | {swc(c):.2f} | {swg(c):.2f} | {swp(c):.2f} | "
                   f"{swpf(c):.2f} | "
                   + (f"{c['pfell']:.2f} | {c['psame']:.2f} | {c['prouted']:.1f}" if lad(c) else "- | - | -"))
    ladder = [c for c in blind if lad(c)]
    bad = [c for c in ladder if swc(c) > c["rand"] + 1]
    good = [c for c in ladder if swc(c) <= 0.5]
    out += ["", f"blind mean regret %: {means(blind)}",
            f"ladder-branch cells only ({len(ladder)}): {means(ladder) if ladder else '-'}",
            f"cells where SWC loses to random by > 1 point ({len(bad)}): {means(bad) if bad else '-'}",
            f"cells where SWC <= 0.5% ({len(good)}): {means(good) if good else '-'}", ""]
    out += ["blind " + s for s in sp.compare_lines(blind, ((swc, rand, "SWC", "random"), (swg, swc, "SWG(32)", "SWC"),
                                                           (swp, swc, "SWP(32)", "SWC"), (swp, rand, "SWP(32)", "random"),
                                                           (swpf, swp, "SWPF(32)", "SWP(32)"), (swp, swg, "SWP(32)", "SWG(32)"),
                                                           (swgp, rand, "SWGP(32)", "random")), SEED)]
    out += ["", "## Per design along gate depth (descriptive)", "",
            "design | amount_gate_depth | cells on ladder branch | SWC % | SWP(32) % | random % | SWC - random (points)"]
    for d in sorted(NEWF, key=lambda d: (NEWF[d]["amount_gate_depth"], d)):
        rs = [c for c in blind if c["design"] == d]
        out.append(f"{d} | {NEWF[d]['amount_gate_depth']} | {sum(lad(c) for c in rs)} | {mean(rs, swc):.2f} | {mean(rs, swp):.2f} | "
                   f"{mean(rs, rand):.2f} | {mean(rs, swc) - mean(rs, rand):+.2f}")
    m125, m132 = al.blind_table(), bp.blind_table()
    allb = m125 + m132 + blind
    three = (("SWC", swc), ("SWG(32)", swg), ("random", rand))
    out += ["", f"## Every blind set: milestones 125, 132 and 133 ({len(allb)} cells, {len({c['design'] for c in allb})} designs)", "",
            "mean regret %: " + means(allb, three),
            f"ladder-branch cells only ({sum(lad(c) for c in allb)}): " + means([c for c in allb if lad(c)], three), ""]
    out += sp.compare_lines(allb, ((swc, rand, "SWC", "random"), (swg, rand, "SWG(32)", "random"), (swg, swc, "SWG(32)", "SWC")), SEED)
    two = m132 + blind
    four = (("SWC", swc), ("SWG(32)", swg), ("SWP(32)", swp), ("random", rand))
    out += ["", f"SWP(32) is blind on milestones 132 and 133 only ({len(two)} cells): " + means(two, four), ""]
    out += sp.compare_lines(two, ((swp, swc, "SWP(32)", "SWC"), (swp, rand, "SWP(32)", "random")), SEED)
    fs = lambda cs: sum(c["pfell"] for c in cs) / len(cs)
    m = lambda f: mean(blind, f)
    fl = [c for c in blind if flag_g(c["design"])]
    un = [c for c in blind if c["design"] in {"cmp48", "fib12", "fib14"}]
    p8 = (f"{fs(bad) > fs(good)} ({len(bad)} cells {fs(bad):.2f} against {len(good)} cells {fs(good):.2f})" if bad and good
          else f"untestable ({len(bad)} cells where SWC loses by > 1 point, {len(good)} where SWC <= 0.5%)")
    p9 = (f"{mean(bad, swpf) < mean(bad, swp) and mean(good, swpf) > mean(good, swp)} (losing cells {mean(bad, swpf):.2f}% against "
          f"{mean(bad, swp):.2f}%; winning cells {mean(good, swpf):.2f}% against {mean(good, swp):.2f}%)" if bad and good
          else f"untestable ({len(bad)} losing, {len(good)} winning cells)")
    out += ["", "## Predictions", "",
            f"(1) all {len(blind)} cells on the ladder branch: {len(ladder) == len(blind) == 14} ({len(ladder)} of {len(blind)}; "
            f"lowest routed/r2 {min(c['ratio'] for c in blind):.2f})",
            f"(2) SWC below random: {m(swc) < m(rand)} ({m(swc):.2f}% against {m(rand):.2f}%)",
            f"(3) SWC below SWG(32): {m(swc) < m(swg)} ({m(swc):.2f}% against {m(swg):.2f}%)",
            f"(4) SWC below SWP(32): {m(swc) < m(swp)} ({m(swc):.2f}% against {m(swp):.2f}%)",
            f"(5) SWP(32) below random: {m(swp) < m(rand)} ({m(swp):.2f}% against {m(rand):.2f}%)",
            f"(6) flagged designs ({len(fl)} cells), SWC above random: {mean(fl, swc) > mean(fl, rand)} "
            f"({mean(fl, swc):.2f}% against {mean(fl, rand):.2f}%)",
            f"(7) cmp48, fib12, fib14 ({len(un)} cells), SWC below random: {mean(un, swc) < mean(un, rand)} "
            f"({mean(un, swc):.2f}% against {mean(un, rand):.2f}%)",
            f"(8) SWP(32) distrust share higher where SWC loses by > 1 point than where SWC <= 0.5%: {p8}",
            f"(9) SWPF(32) below SWP(32) on losing cells and above on winning cells: {p9}"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
