"""Milestone 136: the paper's blind-evaluation table. Every rule the programme has proposed for the expensive-routing branch, scored
on the 42 blind cells of milestones 125, 132 and 133 (21 designs), with each rule scored ONLY on the cells that were out of sample
for it, plus the room any guard has (a perfect per-cell guard), a design-level sign test, leave-one-design-out, a Holm correction
and the number of blind designs a confirmatory test would need. Replay of existing flow tables; no flow run.

Usage: python3 analyse.py [out.txt]

Why: milestones 133 and 135 closed the guard search ("the evidence now says the unguarded clipped switch SWC is the rule to report")
and asked for the blind-evaluation section written on the 42 pooled cells, with SWC against random and against every guard. The
pooled numbers so far were scattered over four results files, each pooled over a different subset, and some (SWP(32) on 26 cells,
SWX on 42) mix blind and seen cells for the rule being scored. A paper table has to say, per rule, which cells test it.

Blind registry (which cells were out of sample for each rule, from the commit that fixed the rule; LOG.md):
  SWC        clipped ladder, fixed at milestone 115            blind on m125, m132, m133 (42 cells)
  SWG(32)    32-gate guard, registered before m125's flow run   blind on m125, m132, m133 (42)
  SWP(32)    pilot-probe guard, fixed at milestone 131 after replay on milestones 119 to 125 (m125 is seen for it)
                                                                blind on m132, m133 (26)
  SWGP(32)   SWG(32)'s flag in front of SWP(32), defined in m132's file before its table (reported there, never primary)
                                                                blind on m132, m133 (26)
  SWPF(32)   SWP with a fresh-only fall-back, registered at m133  blind on m133 (14)
  SWX(3,0.02), SWXR(3,0.02)  delay check, milestone 135, built from milestone 134's diagnosis of these 42 cells
                                                                blind on none (descriptive only)
  random     equal-cost random routing (the baseline)
SWP(32) and SWPF(32) on m132 and m133 reuse those files' seeds, so their numbers are the registered ones; on m125, where neither
had a draw, this file draws with seed "m136" + cell (descriptive, never blind). SWX values come from experiments/delay_check.

Perfect guard (the headroom): per cell min(SWC, random), i.e. a guard that knows which cells the ladder fails on and routes those
randomly at no cost. No real guard can beat it; the gap between it and SWC is all any guard could ever win on these cells.

Predictions, written in this file before its table existed (checked in main()):
 (1) on all 42 cells SWC has the lowest mean regret of every rule in the registry (scored on all 42, blind or not);
 (2) on each guard's own blind subset, SWC's mean regret is no higher than the guard's (no guard beats SWC out of sample);
 (3) after a Holm correction over the five guard-against-SWC sign tests on their blind subsets, none is significant at 0.05;
 (4) SWC against random at the design level (mean over a design's cells, 21 designs): SWC better on at least 14 designs, exact
     sign p < 0.05;
 (5) leaving out any one of the 21 designs, SWC's mean regret stays below random's;
 (6) the perfect guard is less than 2 points below SWC on the 42 cells.
Reported, not predicted: the per-design table, the perfect guard's share of the failing cells, and the number of blind designs at
which the design-level mean difference SWC - random would have a 95% interval below zero, if the per-design spread stays as it is
(n = (1.96 sd / mean)^2, a normal approximation).
"""
import importlib.util
import math
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 136
S = 32


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


dc = _sibling(EXP / "delay_check" / "analyse.py", "verified_dse_m136_dc")
ld, pp, pool, sp, rule = dc.ld, dc.pp, dc.pool, dc.sp, dc.rule
lb = ld.lb
lad, mean = lb.lad, lb.mean
flag_g = lb.flag_g


def swc(c):
    return c["SWC"]


def rand(c):
    return c["RAND"]


def swg(c):
    return rand(c) if flag_g(c["design"]) else swc(c)


def swp(c):
    return c["p"] if lad(c) else rand(c)


def swpf(c):
    return c["pf"] if lad(c) else rand(c)


def swgp(c):
    return rand(c) if flag_g(c["design"]) else swp(c)


swx, swxr = dc.swx, dc.swxr


def perfect(c):
    return min(swc(c), rand(c))


SETS = ("m125", "m132", "m133")
REGISTRY = (("SWC", swc, SETS), ("SWG(32)", swg, SETS), ("SWP(32)", swp, ("m132", "m133")),
            ("SWGP(32)", swgp, ("m132", "m133")), ("SWPF(32)", swpf, ("m133",)), ("SWX(3,0.02)", swx, ()),
            ("SWXR(3,0.02)", swxr, ()), ("random", rand, SETS))
GUARDS = [r for r in REGISTRY if r[0] not in ("SWC", "random")]


def cells():
    rows = dc.blind_cells()
    raw = {}
    for name, _mod, path, src in ld.SOURCES:
        for k, v in rule.load_table(path, src).items():
            raw[(name,) + k] = v
    for c in rows:
        c["set"] = {"amount_lanes": "m125", "blind_probe": "m132", "ladder_blind": "m133"}[c["table"]]
        if not lad(c):
            continue
        rs = raw[(c["set"], c["clock"], c["design"], c["table"])]
        if c["set"] == "m125":
            sd = f"m136{c['clock']}{c['design']}"
            c["p"] = pp.pilot_regret(rs, S, sd)[0]
            c["pf"] = lb.fresh_regret(rs, S, sd)[0]
        elif c["set"] == "m132":
            c["pf"], fell = lb.fresh_regret(rs, S, f"m132{c['clock']}{c['design']}")
            assert abs(fell - pp.pilot_regret(rs, S, f"m132{c['clock']}{c['design']}")[2]) < 1e-12
    return rows


def holm(ps):
    """Holm step-down adjusted p-values, in the input order."""
    order = sorted(range(len(ps)), key=lambda i: ps[i])
    adj, run = [0.0] * len(ps), 0.0
    for r, i in enumerate(order):
        run = max(run, min(1.0, (len(ps) - r) * ps[i]))
        adj[i] = run
    return adj


def by_design(rows, f):
    ds = sorted({c["design"] for c in rows})
    return {d: statistics.mean(f(c) for c in rows if c["design"] == d) for d in ds}


def main(dst):
    rows = cells()
    ladder = [c for c in rows if lad(c)]
    bad = [c for c in ladder if swc(c) > rand(c) + 1]
    good = [c for c in ladder if swc(c) <= 0.5]
    nd = len({c["design"] for c in rows})
    out = ["# Milestone 136: every rule on the 42 pooled blind cells, each scored on the cells that test it (replay, no flow run)", "",
           f"{len(rows)} cells on {nd} designs (m125 {sum(c['set'] == 'm125' for c in rows)}, m132 "
           f"{sum(c['set'] == 'm132' for c in rows)}, m133 {sum(c['set'] == 'm133' for c in rows)}); {len(ladder)} on the ladder "
           f"branch; {len(bad)} failing (SWC loses to random by > 1 point), {len(good)} winning (SWC <= 0.5%).",
           f"design bootstrap {pool.BOOT} resamples, seed {SEED}.", "",
           "## Table 1: each rule on its own blind cells, and on all 42", "",
           "rule | blind sets | blind cells | blind mean % | SWC on the same cells % | random on the same cells % | all-42 mean % | "
           "all-42 status"]
    for n, f, sets in REGISTRY:
        bl = [c for c in rows if c["set"] in sets]
        st = "blind" if len(bl) == len(rows) else ("partly seen" if bl else "seen (descriptive)")
        out.append(f"{n} | {', '.join(sets) or '-'} | {len(bl)} | " + (f"{mean(bl, f):.2f} | {mean(bl, swc):.2f} | {mean(bl, rand):.2f}"
                   if bl else "- | - | -") + f" | {mean(rows, f):.2f} | {st}")
    out.append(f"perfect guard min(SWC, random) | - | - | - | - | - | {mean(rows, perfect):.2f} | bound, not a rule")
    out += ["", "## Table 2: guard against SWC on the guard's blind cells (Holm over the five guards with blind cells)", "",
            "guard | cells | better | worse | tied | sign p | Holm p | design-bootstrap 95% interval of mean (guard - SWC), points"]
    tests = []
    for n, f, sets in GUARDS:
        bl = [c for c in rows if c["set"] in sets]
        if not bl:
            continue
        b, w, t = pool.compare(bl, f, swc)
        lo, hi = pool.boot_ci(bl, lambda c, f=f: f(c) - swc(c), seed=SEED)
        tests.append((n, len(bl), b, w, t, pool.sign_p(b, w), lo, hi))
    adj = holm([x[5] for x in tests])
    for (n, k, b, w, t, p, lo, hi), a in zip(tests, adj):
        out.append(f"{n} | {k} | {b} | {w} | {t} | {p:.3f} | {a:.3f} | {lo:+.2f} to {hi:+.2f}")
    out += ["", "## SWC against random", ""]
    out += sp.compare_lines(rows, ((swc, rand, "SWC", "random"), (perfect, swc, "perfect guard", "SWC")), SEED)
    dsw, drn = by_design(rows, swc), by_design(rows, rand)
    diff = {d: dsw[d] - drn[d] for d in dsw}
    db, dw = sum(v < -1e-9 for v in diff.values()), sum(v > 1e-9 for v in diff.values())
    dp = pool.sign_p(db, dw)
    out.append(f"design level ({nd} designs, mean over each design's cells): SWC better on {db}, worse on {dw}, tied on "
               f"{nd - db - dw}; sign p = {dp:.4f}")
    md, sd = statistics.mean(diff.values()), statistics.stdev(diff.values())
    need = math.ceil((1.96 * sd / md) ** 2) if md < 0 else None
    out.append(f"design-level mean (SWC - random) {md:+.2f} points, sd {sd:.2f}; a 95% normal interval below zero needs about "
               f"{need} designs at this spread (21 run so far)")
    loo = {}
    for d in sorted(dsw):
        rest = [c for c in rows if c["design"] != d]
        loo[d] = (mean(rest, swc), mean(rest, rand))
    gaps = {d: loo[d][0] - loo[d][1] for d in loo}
    hi_d, lo_d = max(gaps, key=gaps.get), min(gaps, key=gaps.get)
    out.append(f"leave one design out: SWC - random from {gaps[lo_d]:+.2f} points (without {lo_d}) to {gaps[hi_d]:+.2f} "
               f"(without {hi_d})")
    out += ["", "## Table 3: per design (mean over its cells)", "",
            "set | design | cells | ladder cells | SWC % | random % | SWG(32) % | SWP(32) % | SWX(3,0.02) % | perfect % | "
            "SWC - random"]
    for d in sorted(dsw, key=lambda d: (diff[d], d)):
        cs = [c for c in rows if c["design"] == d]
        out.append(f"{cs[0]['set']} | {d} | {len(cs)} | {sum(lad(c) for c in cs)} | {dsw[d]:.2f} | {drn[d]:.2f} | {mean(cs, swg):.2f} | "
                   f"{mean(cs, swp):.2f} | {mean(cs, swx):.2f} | {mean(cs, perfect):.2f} | {diff[d]:+.2f}")
    loss = sum(swc(c) - perfect(c) for c in rows)
    out += ["", f"perfect guard: {mean(rows, swc) - mean(rows, perfect):.2f} points below SWC on the 42 cells; "
            f"{sum(swc(c) - perfect(c) for c in bad) / loss:.2f} of that gap sits on the {len(bad)} failing cells, on "
            f"{len({c['design'] for c in bad})} designs"]
    allm = {n: mean(rows, f) for n, f, _ in REGISTRY}
    own = []
    for n, f, sets in GUARDS:
        bl = [c for c in rows if c["set"] in sets]
        if bl:
            own.append((n, mean(bl, swc) <= mean(bl, f), mean(bl, swc), mean(bl, f)))
    gap = allm["SWC"] - mean(rows, perfect)
    out += ["", "## Predictions", "",
            f"(1) SWC lowest of every rule on all 42 cells: {all(allm['SWC'] <= v for k, v in allm.items() if k != 'SWC')} "
            f"({', '.join(f'{k} {v:.2f}' for k, v in allm.items())})",
            f"(2) SWC no higher than each guard on the guard's blind cells: {all(x[1] for x in own)} ("
            + "; ".join(f"{n} {g:.2f} against SWC {s:.2f}" for n, _, s, g in own) + ")",
            f"(3) no guard-vs-SWC test significant after Holm: {all(a >= 0.05 for a in adj)} (smallest Holm p {min(adj):.3f})",
            f"(4) design level, SWC better on >= 14 of {nd} designs and sign p < 0.05: {db >= 14 and dp < 0.05} ({db} better, "
            f"{dw} worse, p = {dp:.4f})",
            f"(5) SWC below random with any one design left out: {all(a < b for a, b in loo.values())}",
            f"(6) perfect guard less than 2 points below SWC: {gap < 2} ({gap:.2f} points)"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))
    return rows


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
