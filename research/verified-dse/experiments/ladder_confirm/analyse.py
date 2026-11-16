"""Milestone 137: a confirmatory blind test of the clipped ladder SWC against equal-cost random routing, at one clock per design, on
four 128-bit left-shifter families no table has run (experiments/ladder_confirm/run.py, probe.py, check_designs.py).

Usage: python3 analyse.py [out.txt]

Why: milestone 136's paper table found SWC better than random on 28 of 42 blind cells and worse on 8 (cell-level sign p = 0.001) but
only 13 against 5 at the design level (p = 0.096): two clocks of one design are not independent evidence. Its "Next" was power, not
another guard: more designs, one clock each, picked by milestone 133's cost probe so that every design reaches the ladder branch.

Rules (unchanged; nothing here is tuned on this table):
  SWC     the clipped ladder (milestone 115) on the ladder branch (routed/r2 > theta = 3), equal-cost random below it.
  random  equal-cost random routing.
Both are computed by experiments/new_families/analyse.py's build (the code every blind set since milestone 121 has used), with
random's tie-break seed "m137confirm" + clock + design.

Predictions, written in this file before the flow run (KEEP and the clock of each design were fixed by probe.py's rule and run.py's
alternation before any ABC sequence was run; checked in main()):
 (1) every kept design's cell is on the ladder branch (table routed/r2 > 3). Prior 80%.
 (2) mean regret over the new cells: SWC below random. Prior 75%.
 (3) PRIMARY, confirmatory: over the new designs (one cell each), SWC is better than random on more designs than it is worse, and
     the two-sided exact sign test over the untied designs has p < 0.05. Prior 40%.
 (4) SWC at most 0.5% regret on at least half of the new cells. Prior 65%.
 (5) pooled with milestone 136's 21 blind designs (each the mean over its cells), the design-level two-sided sign test has p < 0.05,
     SWC better on more designs. Prior 55%.
 (6) pooled as in (5), the normal 95% interval of the design-level mean (SWC - random), mean +- 1.96 sd / sqrt(n), lies below zero.
     Prior 30%.
 (7) SWC fails (loses to random by more than 1 point) on at most a quarter of the new cells (milestone 136: 8 of 42). Prior 60%.
Reported, not predicted: the per-design table, cell-level design-bootstrap interval (2,000 resamples, seed 137), and the updated
estimate of how many designs a 95% interval below zero needs at the pooled spread.
"""
import importlib.util
import json
import math
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 137
TABLE = HERE / "results.jsonl"


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


bpool = _sibling(EXP / "blind_pooled" / "analyse.py", "verified_dse_m137_bpool")
lb = bpool.lb
nf, rule, pool, score = lb.nf, lb.rule, lb.pool, lb.score
run = _sibling(HERE / "run.py", "verified_dse_m137_run")
PROBE = json.loads((HERE / "probe.json").read_text()) if (HERE / "probe.json").exists() else {}
FEAT = json.loads((HERE / "features.json").read_text()) if (HERE / "features.json").exists() else {}


def swc(c):
    return nf.swc(c)


def rand(c):
    return c["rand"]


def lad(c):
    return c["ratio"] > score.THETA


def confirm_table():
    if not TABLE.exists():
        return []
    raw = rule.load_table(TABLE, "ladder_confirm")
    return nf.build(raw, lambda k: f"m137confirm{k[0]}{k[1]}")


def sign(diff):
    b, w = sum(v < -1e-9 for v in diff.values()), sum(v > 1e-9 for v in diff.values())
    return b, w, len(diff) - b - w, pool.sign_p(b, w)


def interval(diff):
    v = list(diff.values())
    m, sd = statistics.mean(v), statistics.stdev(v)
    h = 1.96 * sd / math.sqrt(len(v))
    return m, sd, m - h, m + h


def main(dst):
    out = ["# Milestone 137: SWC against random on a confirmatory blind set, one clock per design (flow run)", "",
           f"theta = {score.THETA}; design bootstrap {pool.BOOT} resamples, seed {SEED}.", "",
           "## Candidates: features and cost probe (computed before the flow run; keep if probe routed/r2 > 3.3)", "",
           "design | amount_depth | amount_gate_depth | amount_gates | probe routed/r2 | base period ns | kept | clock"]
    for d in run.CAND:
        f, p = FEAT.get(d, {}), PROBE.get(d, {})
        out.append(f"{d} | {f.get('amount_depth', '-')} | {f.get('amount_gate_depth', '-')} | {f.get('amount_gates', '-')} | "
                   + (f"{p['ratio']:.2f} | {p['synth_netlist_period_ns']:.2f}" if p else "- | -")
                   + f" | {d in run.KEEP} | {run.CLOCK.get(d, '-')}")
    new = confirm_table()
    if not new:
        out += ["", "## Confirmatory test: no table yet"]
        Path(dst).write_text("\n".join(out) + "\n")
        print("\n".join(out))
        return
    out += ["", f"## Confirmatory test: {len(new)} cells, one per design", "",
            "design | clock | routed/r2 | routed delay/period | random % | SWC % | SWC - random"]
    for c in sorted(new, key=lambda c: (swc(c) - rand(c), c["design"])):
        out.append(f"{c['design']} | {c['clock']} | {c['ratio']:.2f} | {c['share']:.3f} | {rand(c):.2f} | {swc(c):.2f} | "
                   f"{swc(c) - rand(c):+.2f}")
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
            f"design-bootstrap 95% interval of mean (SWC - random): {lo:+.2f} to {hi:+.2f} points"]
    old = bpool.cells()
    od = {d: v for d, v in bpool.by_design(old, bpool.swc).items()}
    orr = bpool.by_design(old, bpool.rand)
    pooled = {d: od[d] - orr[d] for d in od}
    assert not set(pooled) & set(dn)
    pooled.update(dn)
    pb, pw, pt, pp_ = sign(pooled)
    m, sd, ilo, ihi = interval(pooled)
    need = math.ceil((1.96 * sd / m) ** 2) if m < 0 else None
    out += ["", f"## Pooled with milestone 136's blind designs ({len(od)} + {len(dn)} = {len(pooled)} designs)", "",
            f"design level: SWC better on {pb}, worse on {pw}, tied on {pt}; two-sided sign p = {pp_:.4f}",
            f"design-level mean (SWC - random) {m:+.2f} points, sd {sd:.2f}; normal 95% interval {ilo:+.2f} to {ihi:+.2f}; "
            f"a 95% interval below zero needs about {need} designs at this spread"]
    out += ["", "## Predictions", "",
            f"(1) every kept design on the ladder branch: {len(ladder) == len(new)} ({len(ladder)} of {len(new)}; lowest routed/r2 "
            f"{min(c['ratio'] for c in new):.2f})",
            f"(2) SWC below random on mean regret: {m_s < m_r} ({m_s:.2f}% against {m_r:.2f}%)",
            f"(3) PRIMARY: SWC better on more designs and sign p < 0.05: {b > w and p < 0.05} ({b} better, {w} worse, p = {p:.4f})",
            f"(4) SWC <= 0.5% on at least half the cells: {2 * len(good) >= len(new)} ({len(good)} of {len(new)})",
            f"(5) pooled design-level sign p < 0.05, SWC better on more: {pb > pw and pp_ < 0.05} ({pb} better, {pw} worse, "
            f"p = {pp_:.4f})",
            f"(6) pooled normal 95% interval below zero: {ihi < 0} ({ilo:+.2f} to {ihi:+.2f})",
            f"(7) SWC fails on at most a quarter of the new cells: {4 * len(bad) <= len(new)} ({len(bad)} of {len(new)})"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
