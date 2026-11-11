"""Milestone 114: can a guard read from the mapped (r2) rung alone, with no routed pilot, catch the relaxed-clock multipliers where
"skip r1, keep 8" is misled? (no flow run; cached tables)

Usage: python3 guard.py [out.txt]

Milestones 110 to 113: the cost-ratio switch SW(3) (skip-r1 if a routed point costs more than 3x an r2 score, else route the same
wall-clock's worth of uniformly drawn points) cuts mean regret to about a third of random routing's. Its one known failure is the
relaxed-clock multiplier: mult24 to 40 relaxed in the held-out tables, mult24 relaxed in milestone 112, mult18 relaxed in 113. A cost
ratio cannot see it, and milestone 111 found a routed pilot's tau-b too noisy to. Skip-r1 scores every point at r2 anyway, so any
statistic of the r2 table is free: this asks whether one of them flags the misleading cells.

Statistics (per cell, over all n points, r2 = mapped netlist with wire-load-free STA):
  slack = median over points of (r2 WNS / clock period); positive when most mapped netlists meet the clock with room to spare;
  dcv   = coefficient of variation over points of the r2 delay term (period - r2 WNS), how much the sequences differ in speed.
Guard families (flag => route randomly at skip-r1's wall-clock instead of running the ladder; applies only where SW picks skip-r1):
  A(s):    slack >= s,               s in {0.15, 0.2, 0.25, 0.3, 0.35}
  B(d):    dcv >= d,                 d in {0.2, 0.25, 0.3, 0.35}
  AB(s,d): slack >= s and dcv >= d,  the product grid.
SWX(guard) = SW(3) with the guard: theta stays at milestone 111's 3, skip-r1 / random regret per cell are switch_guard/rule.py's
cell(), imported unchanged, with each table's earlier seeds, so SW's numbers equal milestones 111 to 113's.

Selection: the guard (one of the 34) with the lowest mean SWX regret on the 52 held-out cells (milestone 110's tables); ties go to
the earlier entry in the order above (A before B before AB, smaller thresholds first). Honest in-sample estimate: leave-one-family-out
(families = design name without its trailing size, so mult16 to mult40 leave together; the guard is chosen on the other families).
The exploration that suggested slack and dcv looked at the held-out cells only.

Test: 48 cells that chose nothing here and whose slack and dcv were not computed before this file was committed: milestone 112's
fresh dear pool (12 cells), milestone 113's fresh designs (16) and milestone 108's fresh pool (20). Their skip-r1 and random regrets
were already published (112, 113, 109), so which cells SW misses was known; the guard's statistics on them were not. The milestone 1
table (20 cells) is reported as a further line.

Predictions, written in this file before it was first run:
 (1) leave-one-family-out on the held-out cells, SWX has lower mean regret than SW (1.66%);
 (2) on the 28 dear-pool test cells (112 and 113), SWX has lower mean regret than SW (pooled SW: 0.97%);
 (3) the chosen guard flags mult24 relaxed (112) and mult18 relaxed (113);
 (4) the chosen guard flags at most 4 of the dear-pool test cells in which SW runs the ladder and skip-r1 has at most random's
     regret (false alarms);
 (5) on the fresh pool (108) SWX is within 0.1 points of SW (the guard only acts above the cost threshold, which those cells rarely
     pass);
 (6) on all 48 test cells SWX is better than SW in more cells than it is worse.
A design-level bootstrap (both clocks resampled together, 2,000 resamples, seed 114) gives a 95% interval for SWX - SW on the 28
dear-pool cells; it is reported, not a prediction.
"""
import importlib.util
import itertools
import random
import re
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


rule = _sibling(EXP / "switch_guard" / "rule.py", "verified_dse_switch_rule")
THETA = 3
SLACKS = (0.15, 0.2, 0.25, 0.3, 0.35)
DCVS = (0.2, 0.25, 0.3, 0.35)
GUARDS = ([("A", s, None) for s in SLACKS] + [("B", None, d) for d in DCVS] +
          [("AB", s, d) for s, d in itertools.product(SLACKS, DCVS)])
BOOT = 2000


def family(design):
    return re.sub(r"\d+(x\d+)?$", "", design)


def r2_stats(rs):
    p = rs[0]["period_ns"]
    slack = statistics.median(r["synth_netlist_wns"] / r["period_ns"] for r in rs)
    d = [r["period_ns"] - r["synth_netlist_wns"] for r in rs]
    assert all(r["period_ns"] == p for r in rs)
    return slack, statistics.pstdev(d) / statistics.mean(d)


def build(raw, tagfn):
    rows = []
    for key in sorted(raw, key=lambda k: (k[2], k[1], k[0])):
        c = rule.cell(raw[key], tagfn(key))
        c.update(clock=key[0], design=key[1], table=key[2])
        c["slack"], c["dcv"] = r2_stats(raw[key])
        rows.append(c)
    return rows


def flags(c, g):
    kind, s, d = g
    return (s is None or c["slack"] >= s) and (d is None or c["dcv"] >= d)


def sw(c):
    return rule.sw(c, THETA)


def swx(c, g):
    if c["ratio"] > THETA and flags(c, g):
        return c["rand"]
    return sw(c)


def mean(rows, f):
    return statistics.mean(f(c) for c in rows)


def choose(rows):
    return min(GUARDS, key=lambda g: (round(mean(rows, lambda c: swx(c, g)), 9), GUARDS.index(g)))


def lofo(rows):
    out = []
    for fam in sorted({family(c["design"]) for c in rows}):
        g = choose([c for c in rows if family(c["design"]) != fam])
        out += [swx(c, g) for c in rows if family(c["design"]) == fam]
    return statistics.mean(out)


def boot_ci(rows, f, seed=114):
    designs = sorted({(c["table"], c["design"]) for c in rows})
    by = {d: [c for c in rows if (c["table"], c["design"]) == d] for d in designs}
    rng = random.Random(seed)
    ms = sorted(statistics.mean(f(c) for d in rng.choices(designs, k=len(designs)) for c in by[d]) for _ in range(BOOT))
    return ms[int(0.025 * BOOT)], ms[int(0.975 * BOOT) - 1]


def gname(g):
    kind, s, d = g
    return kind + "(" + ", ".join(f"{v:g}" for v in (s, d) if v is not None) + ")"


def tables():
    held = build(rule.replay.load(), lambda k: f"m111held{k[0]}{k[1]}{k[2]}")
    dear = (build(rule.load_table(EXP / "fresh_dear" / "results.jsonl", "fresh_dear"), lambda k: f"m112{k[0]}{k[1]}") +
            build(rule.load_table(EXP / "fresh_designs" / "results.jsonl", "fresh_designs"), lambda k: f"m113{k[0]}{k[1]}"))
    pool = build(rule.load_table(EXP / "fresh_pool" / "results.jsonl", "fresh_pool"), lambda k: f"m111fresh{k[0]}{k[1]}")
    old = build(rule.load_table(EXP / "rung_bias" / "results.jsonl", "rung_bias"), lambda k: f"m111old{k[0]}{k[1]}")
    return held, dear, pool, old


def main(dst):
    held, dear, pool, old = tables()
    g = choose(held)
    X = lambda c: swx(c, g)
    out = ["# Milestone 114: a guard read from the mapped rung alone, chosen on 26 held-out designs, tested on 48 fresh cells "
           "(cached tables, no flow run)", "",
           f"Chosen guard: {gname(g)}; SW theta = {THETA}; 200 draws per cell (rule.cell, earlier seeds).", "",
           "## Held-out cells (selection set)", "",
           f"SW {mean(held, sw):.2f}%, SWX in-sample {mean(held, X):.2f}%, SWX leave-one-family-out {lofo(held):.2f}%", "",
           "Guard grid on the held-out cells (mean SWX regret %, cells flagged where SW runs the ladder):"]
    for h in GUARDS:
        out.append(f"  {gname(h)}: {mean(held, lambda c: swx(c, h)):.2f}, flagged "
                   f"{sum(c['ratio'] > THETA and flags(c, h) for c in held)}")
    head = "table | clock | design | routed/r2 | slack | dcv | skip-r1 % | random % | SW % | flag | SWX %"
    for label, rows in (("Held-out (selection)", held), ("Dear-pool test cells (milestones 112, 113)", dear),
                        ("Fresh pool test cells (milestone 108)", pool), ("Milestone 1 table (further line)", old)):
        out += ["", f"## {label}: {len(rows)} cells", "", head]
        for c in rows:
            fl = c["ratio"] > THETA and flags(c, g)
            out.append(f"{c['table']} | {c['clock']} | {c['design']} | {c['ratio']:.2f} | {c['slack']:+.3f} | {c['dcv']:.3f} | "
                       f"{c['skip']:.2f} | {c['rand']:.2f} | {sw(c):.2f} | {'yes' if fl else '-'} | {X(c):.2f}")
        w, l = sum(X(c) < sw(c) for c in rows), sum(X(c) > sw(c) for c in rows)
        out += ["", f"mean regret: SW {mean(rows, sw):.2f}%, SWX {mean(rows, X):.2f}%, skip-r1 {mean(rows, lambda c: c['skip']):.2f}%, "
                f"random {mean(rows, lambda c: c['rand']):.2f}%, oracle {mean(rows, lambda c: min(c['skip'], c['rand'])):.2f}%; "
                f"SWX vs SW better {w}, worse {l} (sign p = {rule.sign_p(w, l):.3f})"]
    lo, hi = boot_ci(dear, lambda c: X(c) - sw(c))
    test = dear + pool
    w, l = sum(X(c) < sw(c) for c in test), sum(X(c) > sw(c) for c in test)
    ladder_ok = [c for c in dear if c["ratio"] > THETA and c["skip"] <= c["rand"]]
    fa = sum(flags(c, g) for c in ladder_ok)
    hit = lambda tab, d: any(c["table"] == tab and c["design"] == d and c["clock"] == "relaxed" and c["ratio"] > THETA and flags(c, g)
                             for c in dear)
    out += ["", f"design bootstrap 95% interval of mean (SWX - SW) on the dear-pool cells: {lo:+.2f} to {hi:+.2f} points", "",
            f"(1) leave-one-family-out SWX below SW on held-out: {lofo(held) < mean(held, sw)}",
            f"(2) dear-pool SWX below SW: {mean(dear, X) < mean(dear, sw)}",
            f"(3) flags mult24 relaxed (112) and mult18 relaxed (113): {hit('fresh_dear', 'mult24') and hit('fresh_designs', 'mult18')}",
            f"(4) false alarms at most 4 (ladder cells with skip-r1 <= random): {fa <= 4} ({fa} of {len(ladder_ok)})",
            f"(5) fresh pool SWX within 0.1 points of SW: {abs(mean(pool, X) - mean(pool, sw)) <= 0.1}",
            f"(6) all 48 test cells, SWX better than SW in more cells than worse: {w > l} ({w} better, {l} worse)"]
    # Post hoc, added after the first run (not a test, chooses nothing): every guard in the grid on the dear-pool test cells, and
    # how the two statistics moved between the held-out and fresh tables for the designs both contain.
    out += ["", "## Post hoc (added after the first run; descriptive, not a test)", "",
            "Every guard in the grid on the 28 dear-pool test cells (mean SWX regret %, flagged ladder cells, misses caught of "
            "mult24/mult18 relaxed, false alarms):"]
    for h in GUARDS:
        caught = sum(c["clock"] == "relaxed" and c["design"] in ("mult24", "mult18") and c["ratio"] > THETA and flags(c, h)
                     for c in dear)
        out.append(f"  {gname(h)}: {mean(dear, lambda c: swx(c, h)):.2f}, flagged {sum(c['ratio'] > THETA and flags(c, h) for c in dear)}, "
                   f"caught {caught}, false alarms {sum(flags(c, h) for c in ladder_ok)}")
    best = min(GUARDS, key=lambda h: (mean(dear, lambda c: swx(c, h)), GUARDS.index(h)))
    out.append(f"best guard in hindsight on the dear-pool cells: {gname(best)} at {mean(dear, lambda c: swx(c, best)):.2f}% "
               f"against SW {mean(dear, sw):.2f}%")
    out += ["", "Same design and clock in a held-out table and in milestone 112's fresh pool (slack, dcv):"]
    for c in dear:
        for h in held:
            if h["design"] == c["design"] and h["clock"] == c["clock"]:
                out.append(f"  {c['design']} {c['clock']}: held-out {h['slack']:+.3f}, {h['dcv']:.3f}; fresh {c['slack']:+.3f}, "
                           f"{c['dcv']:.3f}; skip-r1 {h['skip']:.2f} -> {c['skip']:.2f}%")
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
