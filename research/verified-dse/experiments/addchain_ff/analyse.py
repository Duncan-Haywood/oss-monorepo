"""Milestone 145: does the clipped ladder (SWC) lose to equal-cost random routing at the fast corner on add-chain shift amounts, and
win on the rest? A blind test of milestone 144's post-hoc reading on 20 designs no table has run at ff_n40C_1v95
(experiments/addchain_ff/run.py: 10 ADD designs, 10 CTRL designs, grouping fixed in run.py before any point ran).

Usage: python3 analyse.py [out.txt]

Rules, unchanged from milestones 141 to 144: SWC (milestone 115's clipped ladder on the ladder branch, routed/r2 > theta = 3;
equal-cost random below it) and equal-cost random routing, built by milestone 141's code. Random's tie-break seed: "m145ff" + clock +
design. d = SWC regret - random regret (points); SWC "loses" on a design when d > 0 (a tie, d = 0, is not a loss). The analysed set
is the longest complete prefix of run.ORDER (run.complete).

Predictions, written here and committed before the flow runs (over the analysed designs, one cell each):
 (1) every cell is on the ladder branch (routed/r2 > 3). Prior 75% (lowest ff ratio in milestone 144 was 3.54).
 (2) PRIMARY: SWC loses on a larger share of ADD designs than of CTRL designs, one-sided Fisher exact p < 0.05. Prior 35%: the
     reading comes from 6 of 6 add-chain losses against 1 of 21 others in the table that suggested it, and such patterns usually
     shrink on fresh data; 10 against 10 needs about 6 to 1 or 5 to 0 to reach p < 0.05.
 (3) SWC loses on at least half of the ADD designs. Prior 40%.
 (4) SWC is better than random on at least 8 of 10 CTRL designs (milestone 144: 20 of 21 non-add designs). Prior 65%.
 (5) mean d over ADD exceeds mean d over CTRL, two-sided label-permutation p (10,000 permutations, seed 145) < 0.05. Prior 40%.
 (6) mechanism: the median over designs of Kendall tau-b between the mapped-rung score r2 (synth area x no-wire delay) and the
     routed score (area x routed delay) is lower for ADD than for CTRL, i.e. the mapped rung the ladder screens with mis-ranks
     add chains more at ff. Prior 55%.
 (7) over all analysed designs SWC is better than random on more designs than it is worse. Prior 70%.
Reported, not predicted: the per-design table, failed points, the mean regrets per group, and a descriptive pool that adds milestone
144's ff cells (its six csum/dot designs as ADD, its 21 others as CTRL, a grouping read off that table, so the pool is not a test)
and the four designs milestone 144 ran but did not analyse (dot8l and dot12r as ADD, clamp3r as CTRL; eqc16 left out as ambiguous),
which were run under Yosys 0.70.
"""
import importlib.util
import json
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 145
PERMS = 10000
TABLE = HERE / "results.jsonl"


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


m141 = _sibling(EXP / "util65_blind" / "analyse.py", "verified_dse_m145_m141")
m144 = _sibling(EXP / "corner_ff_blind" / "analyse.py", "verified_dse_m145_m144")
fisher_greater = _sibling(EXP / "tight_theta" / "analyse.py", "verified_dse_m145_m139").fisher_greater
lb, score, swc, rand, lad, sign = m141.lb, m141.score, m141.swc, m141.rand, m141.lad, m141.sign
tau_b = m141.tau_b
run = _sibling(HERE / "run.py", "verified_dse_m145_run")
EXTRA = {"dot8l": "ADD", "dot12r": "ADD", "clamp3r": "CTRL"}  # milestone 144's run-but-unanalysed designs (eqc16 left out)


def rows():
    return [json.loads(l) for l in TABLE.read_text().splitlines()] if TABLE.exists() else []


def r2r4_tau(rs):
    ok = [r for r in rs if r["status"] == "ok"]
    x = [r["synth_netlist_area"] * (r["period_ns"] - r["synth_netlist_wns"]) for r in ok]
    y = [m141.r4(r) for r in ok]
    return tau_b(x, y)


def perm_p(a, b, seed=SEED, n=PERMS):
    obs = abs(statistics.mean(a) - statistics.mean(b))
    allv, k = list(a) + list(b), len(a)
    rng = random.Random(seed)
    hit = 0
    for _ in range(n):
        rng.shuffle(allv)
        hit += abs(statistics.mean(allv[:k]) - statistics.mean(allv[k:])) >= obs - 1e-12
    return (hit + 1) / (n + 1)


def losses(ds, d):
    return sum(d[x] > 1e-9 for x in ds)


def main(dst):
    out = ["# Milestone 145: add-chain against other shift amounts at SKY130 ff_n40C_1v95, 20 fresh designs (flow run)", "",
           f"theta = {score.THETA}; seed-145 interleaved order over {len(run.ORDER)} designs", ""]
    rs = rows()
    done = run.complete(rs)
    out.append(f"complete designs (ORDER prefix): {len(done)} of {len(run.ORDER)}")
    if not done:
        Path(dst).write_text("\n".join(out) + "\n")
        print("\n".join(out))
        return
    meta = json.loads(run.META.read_text())
    out.append(f"tools: {meta.get('tools')}")
    cc = m141.cells([r for r in rs if r["design"] in set(done)], "addchain_ff", "m145ff")
    d = {x: swc(cc[x]) - rand(cc[x]) for x in done}
    t = {x: r2r4_tau([r for r in rs if r["design"] == x]) for x in done}
    add = [x for x in done if run.GROUP[x] == "ADD"]
    ctl = [x for x in done if run.GROUP[x] == "CTRL"]
    out += ["", "design | group | clock | base period ns | routed/r2 | tau-b r2 vs routed | random % | SWC % | d"]
    for x in sorted(done, key=lambda x: (run.GROUP[x], d[x], x)):
        c = cc[x]
        out.append(f"{x} | {run.GROUP[x]} | {c['clock']} | {meta['base_period_ns'][x]:.3f} | {c['ratio']:.2f} | {t[x]:.3f} | "
                   f"{rand(c):.2f} | {swc(c):.2f} | {d[x]:+.2f}")
    la, lc = losses(add, d), losses(ctl, d)
    pf = fisher_greater(la, len(add) - la, lc, len(ctl) - lc) if add and ctl else float("nan")
    pp = perm_p([d[x] for x in add], [d[x] for x in ctl]) if len(add) > 1 and len(ctl) > 1 else float("nan")
    ta = statistics.median(t[x] for x in add) if add else float("nan")
    tc = statistics.median(t[x] for x in ctl) if ctl else float("nan")
    ball, wall, tall, pall = sign(d)
    bc, wc, _, _ = sign({x: d[x] for x in ctl})
    allc = [cc[x] for x in done]
    ladder = [c for c in allc if lad(c)]
    out += [""]
    for nm, ds in (("ADD", add), ("CTRL", ctl)):
        if ds:
            b, w, ti, p = sign({x: d[x] for x in ds})
            out.append(f"{nm}: {len(ds)} designs; mean regret SWC {lb.mean([cc[x] for x in ds], swc):.2f}%, random "
                       f"{lb.mean([cc[x] for x in ds], rand):.2f}%; mean d {statistics.mean(d[x] for x in ds):+.2f}; SWC better on {b}, "
                       f"worse on {w}, tied on {ti}; sign p = {p:.4f}; median tau-b r2 vs routed {statistics.median(t[x] for x in ds):.3f}")
    out += [f"all: SWC better on {ball}, worse on {wall}, tied on {tall}; sign p = {pall:.4f}; mean regret SWC "
            f"{lb.mean(allc, swc):.2f}%, random {lb.mean(allc, rand):.2f}%",
            f"losses: ADD {la} of {len(add)}, CTRL {lc} of {len(ctl)}; one-sided Fisher p = {pf:.4f}",
            f"difference of mean d, ADD - CTRL: {statistics.mean(d[x] for x in add) - statistics.mean(d[x] for x in ctl):+.2f} points; "
            f"permutation p = {pp:.4f}" if add and ctl else "difference of mean d: n/a",
            f"ladder branch: {len(ladder)} of {len(allc)} (lowest routed/r2 {min(c['ratio'] for c in allc):.2f})"]
    # descriptive pool with milestone 144's ff cells
    rff = m144.rows_ff()
    m144_done = m144.run.complete(rff)[:m144.CAP]
    c44 = m141.cells([r for r in rff if r["design"] in set(m144_done) | set(EXTRA)], "corner_ff_blind", "m144ff")
    g44 = {x: ("ADD" if m144.family(x) in ("csum", "dot") else "CTRL") for x in m144_done} | EXTRA
    d44 = {x: swc(c44[x]) - rand(c44[x]) for x in g44 if x in c44}
    ex = [x for x in EXTRA if x in d44]
    out += ["", "## Milestone 144's four run-but-unanalysed designs (Yosys 0.70; eqc16 left out)", "",
            "design | group | routed/r2 | random % | SWC % | d"]
    for x in ex:
        out.append(f"{x} | {EXTRA[x]} | {c44[x]['ratio']:.2f} | {rand(c44[x]):.2f} | {swc(c44[x]):.2f} | {d44[x]:+.2f}")
    pa = add + [x for x in d44 if g44[x] == "ADD"]
    pc = ctl + [x for x in d44 if g44[x] == "CTRL"]
    dd = d | d44
    lpa, lpc = losses(pa, dd), losses(pc, dd)
    out += ["", "## Descriptive pool (not a test: half its grouping was read off milestone 144's table)", "",
            f"ADD: {len(pa)} designs, SWC loses on {lpa}, mean d {statistics.mean(dd[x] for x in pa):+.2f}",
            f"CTRL: {len(pc)} designs, SWC loses on {lpc}, mean d {statistics.mean(dd[x] for x in pc):+.2f}",
            f"one-sided Fisher p = {fisher_greater(lpa, len(pa) - lpa, lpc, len(pc) - lpc):.5f}"]
    fails = {}
    for r in rs:
        if r["design"] in set(done) and r["status"] != "ok":
            fails[r["design"]] = fails.get(r["design"], 0) + 1
    out += ["", "## Failed points", "", "design | usable points | failed"]
    out += [f"{x} | {120 - fails.get(x, 0)} | {fails.get(x, 0)}" for x in done]
    out += ["", "## Predictions", "",
            f"(1) every cell on the ladder branch: {len(ladder) == len(allc)} ({len(ladder)} of {len(allc)})",
            f"(2) PRIMARY: SWC loses on a larger share of ADD than CTRL, Fisher p < 0.05: "
            f"{bool(add and ctl and la / len(add) > lc / len(ctl) and pf < 0.05)} ({la} of {len(add)} against {lc} of {len(ctl)}, p = {pf:.4f})",
            f"(3) SWC loses on at least half of ADD: {bool(add) and 2 * la >= len(add)} ({la} of {len(add)})",
            f"(4) SWC better on at least 8 of 10 CTRL designs: {bc >= 8} ({bc} of {len(ctl)})",
            f"(5) mean d ADD > CTRL with permutation p < 0.05: "
            f"{bool(add and ctl) and statistics.mean(d[x] for x in add) > statistics.mean(d[x] for x in ctl) and pp < 0.05} (p = {pp:.4f})",
            f"(6) median tau-b r2 vs routed lower for ADD than CTRL: {ta < tc} ({ta:.3f} against {tc:.3f})",
            f"(7) SWC better on more designs than worse overall: {ball > wall} ({ball} to {wall})"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
