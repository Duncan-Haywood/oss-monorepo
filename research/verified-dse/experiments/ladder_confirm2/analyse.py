"""Milestone 138: a second confirmatory blind test of the clipped ladder SWC against equal-cost random routing, at one clock per design,
on five amount-cone families no table has run, each at a 128-bit RIGHT shifter and a 256-bit LEFT shifter
(experiments/ladder_confirm2/run.py, probe.py, check_designs.py).

Usage: python3 analyse.py [out.txt]

Why: milestone 137 pooled 33 blind designs, SWC better than random on 21 and worse on 9 (design-level sign p = 0.043), but the
design-level mean's normal 95% interval (-3.26 to +0.63 points) still crossed zero, and all 33 designs were wide left shifters, 30 of
them 128-bit. Its "Next": about 40 more designs, one clock each, with the shifter varied.

Rules (unchanged; nothing here is tuned on this table):
  SWC     the clipped ladder (milestone 115) on the ladder branch (routed/r2 > theta = 3), equal-cost random below it.
  random  equal-cost random routing.
Both are computed by experiments/new_families/analyse.py's build (the code every blind set since milestone 121 has used), with
random's tie-break seed "m138confirm" + clock + design.

Predictions, written in this file before the probe and the flow run (KEEP and each design's clock are then fixed by probe.py's rule
and run.py's alternation before any ABC sequence runs; checked in main()):
 (1) every kept design's cell is on the ladder branch (table routed/r2 > 3). Prior 70% (right shifters have routed cheaply before).
 (2) mean regret over the new cells: SWC below random. Prior 70%.
 (3) PRIMARY, confirmatory: over the new designs (one cell each), SWC is better than random on more designs than it is worse, and
     the two-sided exact sign test over the untied designs has p < 0.05. Prior 45%.
 (4) SWC at most 0.5% regret on at least half of the new cells. Prior 65%.
 (5) pooled with milestone 137's 33 blind designs (milestone 136's 21, each the mean over its cells, and milestone 137's 12), the
     design-level two-sided sign test has p < 0.05, SWC better on more designs. Prior 70%.
 (6) pooled as in (5), the normal 95% interval of the design-level mean (SWC - random), mean +- 1.96 sd / sqrt(n), lies below zero.
     Prior 40%.
 (7) SWC fails (loses to random by more than 1 point) on at most a quarter of the new cells. Prior 60%.
 (8) SWC's mean regret is below random's on each shifter separately (the 128-bit right cells and the 256-bit left cells). Prior 45%.
Reported, not predicted: the per-design table, per-family and per-shifter means, the cell-level design-bootstrap interval (2,000
resamples, seed 138), and the updated estimate of how many designs a 95% interval below zero needs at the pooled spread.
"""
import importlib.util
import json
import math
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 138
TABLE = HERE / "results.jsonl"


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


m137 = _sibling(EXP / "ladder_confirm" / "analyse.py", "verified_dse_m138_m137")
bpool, lb = m137.bpool, m137.lb
nf, rule, pool, score = lb.nf, lb.rule, lb.pool, lb.score
swc, rand, lad, sign, interval = m137.swc, m137.rand, m137.lad, m137.sign, m137.interval
run = _sibling(HERE / "run.py", "verified_dse_m138_run")
PROBE = json.loads((HERE / "probe.json").read_text()) if (HERE / "probe.json").exists() else {}
SHIFTER = {"r": "128-bit right", "l": "256-bit left"}


def confirm_table():
    if not TABLE.exists():
        return []
    raw = rule.load_table(TABLE, "ladder_confirm2")
    return nf.build(raw, lambda k: f"m138confirm{k[0]}{k[1]}")


def family(d):
    return run.CAND[d][0]


def prior_designs():
    """Milestone 137's pooled 33: design -> SWC - random (mean over a design's cells)."""
    old = bpool.cells()
    od, orr = bpool.by_design(old, bpool.swc), bpool.by_design(old, bpool.rand)
    out = {d: od[d] - orr[d] for d in od}
    new = {c["design"]: swc(c) - rand(c) for c in m137.confirm_table()}
    assert not set(out) & set(new)
    out.update(new)
    return out


def main(dst):
    out = ["# Milestone 138: SWC against random on a second confirmatory blind set, right and 256-bit shifters (flow run)", "",
           f"theta = {score.THETA}; design bootstrap {pool.BOOT} resamples, seed {SEED}.", "",
           "## Candidates: features and cost probe (computed before the flow run; keep if probe routed/r2 > 3.3)", "",
           "design | shifter | amount_depth | amount_gate_depth | amount_gates | probe routed/r2 | base period ns | kept | clock"]
    for d in run.CAND:
        p = PROBE.get(d, {})
        out.append(f"{d} | {SHIFTER[d[-1]]} | {p.get('amount_depth', '-')} | {p.get('amount_gate_depth', '-')} | "
                   f"{p.get('amount_gates', '-')} | "
                   + (f"{p['ratio']:.2f} | {p['synth_netlist_period_ns']:.2f}" if p else "- | -")
                   + f" | {d in run.KEEP} | {run.CLOCK.get(d, '-')}")
    new = confirm_table()
    if not new:
        out += ["", "## Confirmatory test: no table yet"]
        Path(dst).write_text("\n".join(out) + "\n")
        print("\n".join(out))
        return
    out += ["", f"## Confirmatory test: {len(new)} cells, one per design", "",
            "design | shifter | clock | routed/r2 | routed delay/period | random % | SWC % | SWC - random"]
    for c in sorted(new, key=lambda c: (swc(c) - rand(c), c["design"])):
        out.append(f"{c['design']} | {SHIFTER[c['design'][-1]]} | {c['clock']} | {c['ratio']:.2f} | {c['share']:.3f} | "
                   f"{rand(c):.2f} | {swc(c):.2f} | {swc(c) - rand(c):+.2f}")
    ladder = [c for c in new if lad(c)]
    good = [c for c in new if swc(c) <= 0.5]
    bad = [c for c in new if swc(c) > rand(c) + 1]
    m_s, m_r = lb.mean(new, swc), lb.mean(new, rand)
    dn = {c["design"]: swc(c) - rand(c) for c in new}
    b, w, t, p = sign(dn)
    lo, hi = pool.boot_ci(new, lambda c: swc(c) - rand(c), seed=SEED)
    out += ["", f"mean regret %: SWC {m_s:.2f}, random {m_r:.2f}; ladder branch {len(ladder)} of {len(new)}; SWC <= 0.5% on "
            f"{len(good)}; SWC loses by > 1 point on {len(bad)}",
            f"design level ({len(dn)} designs): SWC better on {b}, worse on {w}, tied on {t}; two-sided sign p = {p:.4f}",
            f"design-bootstrap 95% interval of mean (SWC - random): {lo:+.2f} to {hi:+.2f} points", "",
            "## By shifter and by family (descriptive)", "", "group | cells | random % | SWC % | SWC better | SWC worse"]
    groups = [(SHIFTER[s], [c for c in new if c["design"][-1] == s]) for s in "rl"]
    groups += [(f, [c for c in new if family(c["design"]) == f]) for f in dict.fromkeys(v[0] for v in run.CAND.values())]
    sub = {}
    for g, cs in groups:
        if not cs:
            out.append(f"{g} | 0 | - | - | - | -")
            continue
        gb, gw, _, _ = sign({c["design"]: swc(c) - rand(c) for c in cs})
        sub[g] = (lb.mean(cs, swc), lb.mean(cs, rand))
        out.append(f"{g} | {len(cs)} | {sub[g][1]:.2f} | {sub[g][0]:.2f} | {gb} | {gw}")
    pooled = prior_designs()
    n_old = len(pooled)
    assert not set(pooled) & set(dn)
    pooled.update(dn)
    pb, pw, pt, pp_ = sign(pooled)
    m, sd, ilo, ihi = interval(pooled)
    need = math.ceil((1.96 * sd / m) ** 2) if m < 0 else None
    out += ["", f"## Pooled with milestone 137's blind designs ({n_old} + {len(dn)} = {len(pooled)} designs)", "",
            f"design level: SWC better on {pb}, worse on {pw}, tied on {pt}; two-sided sign p = {pp_:.4f}",
            f"design-level mean (SWC - random) {m:+.2f} points, sd {sd:.2f}; normal 95% interval {ilo:+.2f} to {ihi:+.2f}; "
            f"a 95% interval below zero needs about {need} designs at this spread"]
    sh_ok = all(g in sub and sub[g][0] < sub[g][1] for g in SHIFTER.values())
    out += ["", "## Predictions", "",
            f"(1) every kept design on the ladder branch: {len(ladder) == len(new)} ({len(ladder)} of {len(new)}; lowest routed/r2 "
            f"{min(c['ratio'] for c in new):.2f})",
            f"(2) SWC below random on mean regret: {m_s < m_r} ({m_s:.2f}% against {m_r:.2f}%)",
            f"(3) PRIMARY: SWC better on more designs and sign p < 0.05: {b > w and p < 0.05} ({b} better, {w} worse, p = {p:.4f})",
            f"(4) SWC <= 0.5% on at least half the cells: {2 * len(good) >= len(new)} ({len(good)} of {len(new)})",
            f"(5) pooled design-level sign p < 0.05, SWC better on more: {pb > pw and pp_ < 0.05} ({pb} better, {pw} worse, "
            f"p = {pp_:.4f})",
            f"(6) pooled normal 95% interval below zero: {ihi < 0} ({ilo:+.2f} to {ihi:+.2f})",
            f"(7) SWC fails on at most a quarter of the new cells: {4 * len(bad) <= len(new)} ({len(bad)} of {len(new)})",
            f"(8) SWC below random on each shifter: {sh_ok} ("
            + "; ".join(f"{g} {sub[g][0]:.2f}% against {sub[g][1]:.2f}%" if g in sub else f"{g} no cells" for g in SHIFTER.values())
            + ")"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
