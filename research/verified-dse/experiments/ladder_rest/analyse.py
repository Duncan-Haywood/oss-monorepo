"""Milestone 140: the 15 designs milestone 138 planned but did not run (its flow stopped at the session's time limit), run now with
experiments/ladder_confirm2/run.py --resume, unchanged. A descriptive addition: milestone 138's analysed set stays its 25 designs.

Usage: python3 analyse.py [out.txt]

Why: milestone 138 fixed 40 kept designs and a seed-138 run order before any ABC sequence ran, and analysed the longest complete
prefix (25 designs). Milestone 139 found SWC's edge over random grows with the routing-cost ratio routed/r2 and is a tie on the mean
in the (3, 4] band; only 2 of its 99 replay cells were above 6. 13 of the 15 unrun designs probed above 6, so they add the high-ratio
cells milestone 139 lacked, and they finish the set milestone 138 committed to.

Rows: the new rows are kept in this directory's results.jsonl (moved out of ladder_confirm2/results.jsonl after the run, so milestone
138's table and its tests are unchanged); rng12l's 26 rows from milestone 138's partial run are read from there and joined. If the
flow stops again, the analysed set is the longest prefix of run.py's ORDER past the 25 whose designs are all complete (the same rule).
Rules and seeds as milestone 138 (SWC, theta = 3; random tie-break seed "m138confirm" + clock + design), nothing tuned.

Predictions, written here and committed before the resumed flow ran:
 (1) every new cell is on the ladder branch (table routed/r2 > 3). Prior 85% (gtc12r probed 3.61, dot4r 4.23).
 (2) SWC's mean regret over the new cells is below random's. Prior 75%.
 (3) PRIMARY: SWC is better than random on more of the new designs than it is worse. Prior 75%. Its two-sided sign p is reported;
     p < 0.05 is (3b), prior 40% (15 designs need 12 to 3 or better).
 (4) all of milestone 138's analysed designs (25 + the new ones), design-level sign p < 0.05, SWC better on more. Prior 90%.
 (5) pooled with milestone 137's 33 blind designs, the normal 95% interval of the design-level mean (SWC - random) lies below zero.
     Prior 85%.
 (6) milestone 139's ratio reading: over the new cells, mean (SWC - random) is lower on cells with table routed/r2 > 4 than on cells
     in (3, 4]. Prior 60%; untestable (reported as such) if either band is empty.
 (7) SWC fails (loses to random by more than 1 point) on at most a quarter of the new cells. Prior 60%.
Reported, not predicted: the per-design table, the ratio bands (3, 4], (4, 6], > 6 over the new cells and over all 25 + new cells.
"""
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 140
TABLE = HERE / "results.jsonl"
OLD = EXP / "ladder_confirm2" / "results.jsonl"


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


m138 = _sibling(EXP / "ladder_confirm2" / "analyse.py", "verified_dse_m140_m138")
m137, lb, nf, rule, pool, score = m138.m137, m138.lb, m138.nf, m138.rule, m138.pool, m138.score
swc, rand, lad, sign, interval = m138.swc, m138.rand, m138.lad, m138.sign, m138.interval
run = m138.run
SHIFTER = m138.SHIFTER
BANDS = [("(3, 4]", 3, 4), ("(4, 6]", 4, 6), ("> 6", 6, float("inf"))]


def rows():
    out = [json.loads(l) for l in OLD.read_text().splitlines()]
    if TABLE.exists():
        out += [json.loads(l) for l in TABLE.read_text().splitlines()]
    return out


def new_designs(rs):
    """Designs of run.ORDER past milestone 138's 25, longest prefix all complete."""
    done = set(run.complete([json.loads(l) for l in OLD.read_text().splitlines()]))
    cnt = {}
    for r in rs:
        cnt[r["design"]] = cnt.get(r["design"], 0) + 1
    out = []
    for d in run.ORDER:
        if d in done:
            continue
        if cnt.get(d, 0) < 120:
            break
        out.append(d)
    return out, sorted(done)


def table(designs, tmp):
    rs = [r for r in rows() if r["design"] in set(designs)]
    tmp.write_text("".join(json.dumps(r) + "\n" for r in rs))
    raw = rule.load_table(tmp, "ladder_rest")
    return nf.build(raw, lambda k: f"m138confirm{k[0]}{k[1]}")


def bands(cells):
    out = []
    for name, lo, hi in BANDS:
        cs = [c for c in cells if lo < c["ratio"] <= hi]
        if not cs:
            out.append((name, 0, None, None, 0, 0))
            continue
        b, w, _, _ = sign({c["design"]: swc(c) - rand(c) for c in cs})
        out.append((name, len(cs), lb.mean(cs, swc), lb.mean(cs, rand), b, w))
    return out


def main(dst):
    import tempfile
    rs = rows()
    newd, oldd = new_designs(rs)
    out = ["# Milestone 140: the 15 unrun designs of milestone 138's blind set (flow run, descriptive addition)", "",
           f"theta = {score.THETA}; milestone 138 analysed {len(oldd)} designs; new complete designs (ORDER prefix past them): "
           f"{len(newd)} of {len(run.ORDER) - len(oldd)}", ""]
    with tempfile.TemporaryDirectory() as td:
        new = table(newd, Path(td) / "new.jsonl") if newd else []
        old = table(oldd, Path(td) / "old.jsonl")
    if not new:
        out.append("no new complete design yet")
        Path(dst).write_text("\n".join(out) + "\n")
        print("\n".join(out))
        return
    out += ["design | shifter | clock | routed/r2 | random % | SWC % | SWC - random"]
    for c in sorted(new, key=lambda c: (swc(c) - rand(c), c["design"])):
        out.append(f"{c['design']} | {SHIFTER[c['design'][-1]]} | {c['clock']} | {c['ratio']:.2f} | {rand(c):.2f} | {swc(c):.2f} | "
                   f"{swc(c) - rand(c):+.2f}")
    ladder = [c for c in new if lad(c)]
    bad = [c for c in new if swc(c) > rand(c) + 1]
    m_s, m_r = lb.mean(new, swc), lb.mean(new, rand)
    dn = {c["design"]: swc(c) - rand(c) for c in new}
    b, w, t, p = sign(dn)
    lo, hi = pool.boot_ci(new, lambda c: swc(c) - rand(c), seed=SEED)
    out += ["", f"new cells: mean regret SWC {m_s:.2f}%, random {m_r:.2f}%; ladder branch {len(ladder)} of {len(new)}; "
            f"SWC <= 0.5% on {sum(swc(c) <= 0.5 for c in new)}; SWC loses by > 1 point on {len(bad)}",
            f"design level: SWC better on {b}, worse on {w}, tied on {t}; two-sided sign p = {p:.4f}",
            f"design-bootstrap 95% interval of mean (SWC - random): {lo:+.2f} to {hi:+.2f} points"]
    full = {c["design"]: swc(c) - rand(c) for c in old}
    assert not set(full) & set(dn)
    full.update(dn)
    fb, fw, ft, fp = sign(full)
    allc = old + new
    out += ["", f"## Milestone 138's set, {len(oldd)} + {len(newd)} = {len(full)} designs", "",
            f"mean regret SWC {lb.mean(allc, swc):.2f}%, random {lb.mean(allc, rand):.2f}%; design level: SWC better on {fb}, "
            f"worse on {fw}, tied on {ft}; two-sided sign p = {fp:.6f}"]
    pooled = m138.prior_designs()
    n_old = len(pooled)
    assert not set(pooled) & set(full)
    pooled.update(full)
    pb, pw, pt, pp_ = sign(pooled)
    m, sd, ilo, ihi = interval(pooled)
    out += ["", f"## Pooled blind designs (milestones 136 and 137: {n_old}; milestone 138 and this: {len(full)}; {len(pooled)} in all)",
            "", f"design level: SWC better on {pb}, worse on {pw}, tied on {pt}; two-sided sign p = {pp_:.6f}",
            f"design-level mean (SWC - random) {m:+.2f} points, sd {sd:.2f}; normal 95% interval {ilo:+.2f} to {ihi:+.2f}"]
    out += ["", "## Ratio bands (table routed/r2; milestone 139's bands)", "",
            "set | band | cells | SWC % | random % | SWC better | SWC worse"]
    bn = bands(new)
    for setname, cs in (("new", new), ("milestone 138 + new", allc)):
        for name, n, s_, r_, bb, ww in bands(cs):
            out.append(f"{setname} | {name} | {n} | " + (f"{s_:.2f} | {r_:.2f}" if n else "- | -") + f" | {bb} | {ww}")
    d34 = [c for c in new if 3 < c["ratio"] <= 4]
    d4 = [c for c in new if c["ratio"] > 4]
    if d34 and d4:
        g34 = lb.mean(d34, swc) - lb.mean(d34, rand)
        g4 = lb.mean(d4, swc) - lb.mean(d4, rand)
        p6 = f"{g4 < g34} (> 4: {g4:+.2f} points on {len(d4)} cells; (3, 4]: {g34:+.2f} on {len(d34)})"
    else:
        p6 = f"untestable ((3, 4] has {len(d34)} cells, > 4 has {len(d4)})"
    out += ["", "## Predictions", "",
            f"(1) every new cell on the ladder branch: {len(ladder) == len(new)} ({len(ladder)} of {len(new)}; lowest routed/r2 "
            f"{min(c['ratio'] for c in new):.2f})",
            f"(2) SWC below random on mean regret: {m_s < m_r} ({m_s:.2f}% against {m_r:.2f}%)",
            f"(3) PRIMARY: SWC better on more new designs: {b > w} ({b} better, {w} worse); (3b) sign p < 0.05: {b > w and p < 0.05} "
            f"(p = {p:.4f})",
            f"(4) milestone 138's full set, sign p < 0.05, SWC better on more: {fb > fw and fp < 0.05} ({fb} to {fw}, p = {fp:.6f})",
            f"(5) pooled normal 95% interval below zero: {ihi < 0} ({ilo:+.2f} to {ihi:+.2f})",
            f"(6) lower SWC - random above ratio 4 than in (3, 4]: {p6}",
            f"(7) SWC fails on at most a quarter of the new cells: {4 * len(bad) <= len(new)} ({len(bad)} of {len(new)})"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
