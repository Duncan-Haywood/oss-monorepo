"""Milestone 147: at SKY130 ff_n40C_1v95, is the clipped ladder's (SWC's) smaller edge over equal-cost random routing on add-chain
shift amounts (milestone 145) a property of the add-chain structure or of a short mapped critical path? A blind 2 x 2 test,
structure (ADD, CTRL) by mapped-delay band (FAST <= 15.0 ns, SLOW >= 16.5 ns), designs and cells fixed by run.py's rule.

Usage: python3 analyse.py [out.txt]

Rules, unchanged from milestones 141 to 145: SWC (milestone 115's clipped ladder on the ladder branch, routed/r2 > theta = 3;
equal-cost random below it) and equal-cost random routing, built by milestone 141's code. Random's tie-break seed: "m146ffd" + clock
+ design. d = SWC regret - random regret (points); SWC "loses" on a design when d > 0. The analysed set is the longest complete prefix
of meta.json's run order (run.complete).

Effects (each a mean of within-stratum differences of mean d, so neither factor's imbalance leaks into the other):
  structure effect S = mean over bands b of [mean d(ADD, b) - mean d(CTRL, b)]
  delay effect     D = mean over structures s of [mean d(s, FAST) - mean d(s, SLOW)]
  p values: two-sided permutation (10,000, seed 146) that shuffles the tested label within each stratum of the other factor.

Predictions, written here and committed before any point (baselines included) runs:
 (1) every cell is on the ladder branch (routed/r2 > 3). Prior 75%.
 (2) PRIMARY: S > 0 with stratified permutation p < 0.05 (add-chain structure costs the ladder its edge at matched delay band).
     Prior 35%: milestone 145's effect was 7.3 points at p = 0.026 with the factors confounded; 5 designs a cell is little power.
 (3) D > 0 with stratified permutation p < 0.05 (a short mapped path costs the ladder its edge at matched structure). Prior 40%.
 (4) within SLOW, mean d(ADD) > mean d(CTRL) (direction only). Prior 55%.
 (5) within FAST, mean d(ADD) > mean d(CTRL) (direction only). Prior 55%.
 (6) mechanism: the median Kendall tau-b between the mapped-rung score r2 and the routed score is lower over FAST designs than over
     SLOW designs. Prior 55%. (Reported by cell as well.)
 (7) over all analysed designs SWC is better than random on more designs than it is worse. Prior 75%.
 (8) mean d over tight-clock designs exceeds mean d over relaxed-clock designs (milestone 145's three ADD losses were all tight; a
     post-hoc split there, a prediction here). Prior 55%.
Batch 2 (added to run.py after the baselines and before any sequence result was read, because the rule left ADD-SLOW with 2
designs and CTRL-FAST with 4): its designs top up the short cells and are analysed only in a labelled secondary section, which
repeats S and D on batch 1 + batch 2 with one more prediction:
 (2b) on batch 1 + batch 2, S > 0 with stratified permutation p < 0.05. Prior 40%.
Reported, not predicted: the per-design table, cell sizes, failed points, the mean regrets per cell, and a descriptive pool with
milestone 145's 20 designs (its bands assigned by the same thresholds) that repeats S and D.
"""
import importlib.util
import json
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 146
PERMS = 10000
TABLE = HERE / "results.jsonl"


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


m145 = _sibling(EXP / "addchain_ff" / "analyse.py", "verified_dse_m147_m145")
m141 = m145.m141
lb, score, swc, rand, lad, sign = m141.lb, m141.score, m141.swc, m141.rand, m141.lad, m141.sign
r2r4_tau = m145.r2r4_tau
run = _sibling(HERE / "run.py", "verified_dse_m147_run")
complete = run.complete


def rows():
    return [json.loads(l) for l in TABLE.read_text().splitlines()] if TABLE.exists() else []


def mean(v):
    return statistics.mean(v) if v else float("nan")


def effect(d, lab, strat):
    """Mean over strata of (mean d at lab == first level) - (mean d at second level); strata with one level missing are skipped."""
    levels = sorted(set(lab.values()))
    first = "ADD" if "ADD" in levels else "FAST"
    diffs = []
    for s in sorted(set(strat.values())):
        a = [d[x] for x in d if strat[x] == s and lab[x] == first]
        b = [d[x] for x in d if strat[x] == s and lab[x] != first]
        if a and b:
            diffs.append(mean(a) - mean(b))
    return mean(diffs)


def strat_perm_p(d, lab, strat, seed=SEED, n=PERMS):
    obs = abs(effect(d, lab, strat))
    rng = random.Random(seed)
    groups = {}
    for x in d:
        groups.setdefault(strat[x], []).append(x)
    hit = 0
    for _ in range(n):
        new = {}
        for xs in groups.values():
            ls = [lab[x] for x in xs]
            rng.shuffle(ls)
            new.update(zip(xs, ls))
        hit += abs(effect(d, new, strat)) >= obs - 1e-12
    return (hit + 1) / (n + 1)


def main(dst):
    out = ["# Milestone 147: add-chain structure against mapped delay at SKY130 ff_n40C_1v95, a blind 2 x 2 (flow run)", "",
           f"theta = {score.THETA}; bands FAST <= {run.FAST_MAX} ns, SLOW >= {run.SLOW_MIN} ns; up to {run.PER_CELL} designs a cell", ""]
    if not run.META.exists():
        Path(dst).write_text("\n".join(out + ["no baselines yet"]) + "\n")
        return
    meta = json.loads(run.META.read_text())
    out.append(f"tools: {meta.get('tools')}")
    out += ["", "## Candidates and their measured bands (the selection rule in run.py, applied to these)", "",
            "candidate | structure | base period ns | band | selected"]
    sel = set(meta["order"])
    for x in sorted(meta["base_period_ns"], key=lambda x: (run.STRUCT[x], meta["base_period_ns"][x] or 0)):
        p = meta["base_period_ns"][x]
        out.append(f"{x} | {run.STRUCT[x]} | {p if p is None else f'{p:.3f}'} | {meta['band'][x]} | {'yes' if x in sel else 'no'}")
    out += ["", "cells: " + "; ".join(f"{k} {len(v)} ({', '.join(v)})" for k, v in meta["cells"].items())]
    rs = rows()
    done = complete(rs, meta["order"])
    out.append(f"complete designs (order prefix): {len(done)} of {len(meta['order'])}")
    if not done:
        Path(dst).write_text("\n".join(out) + "\n")
        print("\n".join(out))
        return
    st = {x: run.STRUCT[x] for x in done}
    bd = {x: meta["band"][x] for x in done}
    cc = m141.cells([r for r in rs if r["design"] in set(done)], "addchain_delay", "m146ffd")
    d = {x: swc(cc[x]) - rand(cc[x]) for x in done}
    t = {x: r2r4_tau([r for r in rs if r["design"] == x]) for x in done}
    out += ["", "design | structure | band | clock | base period ns | routed/r2 | tau-b r2 vs routed | random % | SWC % | d"]
    for x in sorted(done, key=lambda x: (st[x], bd[x], d[x], x)):
        c = cc[x]
        out.append(f"{x} | {st[x]} | {bd[x]} | {c['clock']} | {meta['base_period_ns'][x]:.3f} | {c['ratio']:.2f} | {t[x]:.3f} | "
                   f"{rand(c):.2f} | {swc(c):.2f} | {d[x]:+.2f}")
    out += ["", "## Cells", "", "cell | designs | mean regret SWC % | random % | mean d | SWC better / worse / tied | median tau-b"]
    for s, b in run.CELLS:
        xs = [x for x in done if st[x] == s and bd[x] == b]
        if xs:
            bb, ww, ti, _ = sign({x: d[x] for x in xs})
            out.append(f"{s}-{b} | {len(xs)} | {lb.mean([cc[x] for x in xs], swc):.2f} | {lb.mean([cc[x] for x in xs], rand):.2f} | "
                       f"{mean([d[x] for x in xs]):+.2f} | {bb} / {ww} / {ti} | {statistics.median(t[x] for x in xs):.3f}")
    S, D = effect(d, st, bd), effect(d, bd, st)
    pS, pD = strat_perm_p(d, st, bd), strat_perm_p(d, bd, st)

    def within(b):
        return (mean([d[x] for x in done if bd[x] == b and st[x] == "ADD"]),
                mean([d[x] for x in done if bd[x] == b and st[x] == "CTRL"]))
    sa, sc = within("SLOW")
    fa, fc = within("FAST")
    tf = statistics.median(t[x] for x in done if bd[x] == "FAST") if any(bd[x] == "FAST" for x in done) else float("nan")
    ts = statistics.median(t[x] for x in done if bd[x] == "SLOW") if any(bd[x] == "SLOW" for x in done) else float("nan")
    ball, wall, tall, pall = sign(d)
    allc = [cc[x] for x in done]
    ladder = [c for c in allc if lad(c)]
    dt = mean([d[x] for x in done if cc[x]["clock"] == "tight"])
    dr = mean([d[x] for x in done if cc[x]["clock"] == "relaxed"])
    out += ["", f"structure effect S (ADD - CTRL within band, averaged): {S:+.2f} points; stratified permutation p = {pS:.4f}",
            f"delay effect D (FAST - SLOW within structure, averaged): {D:+.2f} points; stratified permutation p = {pD:.4f}",
            f"within SLOW: ADD {sa:+.2f}, CTRL {sc:+.2f}; within FAST: ADD {fa:+.2f}, CTRL {fc:+.2f}",
            f"interaction (S in FAST - S in SLOW): {(fa - fc) - (sa - sc):+.2f} points (descriptive)",
            f"all: SWC better on {ball}, worse on {wall}, tied on {tall}; sign p = {pall:.4f}; mean regret SWC "
            f"{lb.mean(allc, swc):.2f}%, random {lb.mean(allc, rand):.2f}%",
            f"mean d by clock: tight {dt:+.2f}, relaxed {dr:+.2f}",
            f"ladder branch: {len(ladder)} of {len(allc)} (lowest routed/r2 {min(c['ratio'] for c in allc):.2f})"]
    # descriptive pool with milestone 145's 20 designs, banded by the same thresholds (5 of them fall between the bands)
    r45 = m145.rows()
    done45 = m145.run.complete(r45)
    c45 = m141.cells([r for r in r45 if r["design"] in set(done45)], "addchain_ff", "m145ff")
    b45 = json.loads(m145.run.META.read_text())["base_period_ns"]
    d45 = {x: swc(c45[x]) - rand(c45[x]) for x in done45 if run.band(b45[x])}
    pd, pst, pbd = d | d45, st | {x: m145.run.GROUP[x] for x in d45}, bd | {x: run.band(b45[x]) for x in d45}
    cnt = {(s, b): sum(pst[x] == s and pbd[x] == b for x in pd) for s, b in run.CELLS}
    out += ["", "## Descriptive pool with milestone 145 (its designs banded by the same thresholds; not a test)", "",
            "cell sizes: " + ", ".join(f"{s}-{b} {cnt[(s, b)]}" for s, b in run.CELLS),
            f"S = {effect(pd, pst, pbd):+.2f} points (p = {strat_perm_p(pd, pst, pbd):.4f}); "
            f"D = {effect(pd, pbd, pst):+.2f} points (p = {strat_perm_p(pd, pbd, pst):.4f})"]
    b2 = meta.get("batch2")
    if b2:
        done2 = complete(rs, b2["order"])
        bb2 = {x: b2["base_period_ns"][x] for x in done2}
        c2 = m141.cells([r for r in rs if r["design"] in set(done2)], "addchain_delay", "m146ffd") if done2 else {}
        d2 = {x: swc(c2[x]) - rand(c2[x]) for x in done2}
        t2 = {x: r2r4_tau([r for r in rs if r["design"] == x]) for x in done2}
        st2 = {x: run.STRUCT[x] for x in done2}
        bd2 = {x: b2["band"][x] for x in done2}
        out += ["", "## Secondary: batch 2 (topped-up cells, fixed before any sequence result was read)", "",
                f"batch-2 designs complete: {len(done2)} of {len(b2['order'])}", "",
                "design | structure | band | clock | base period ns | routed/r2 | tau-b r2 vs routed | random % | SWC % | d"]
        for x in done2:
            c = c2[x]
            out.append(f"{x} | {st2[x]} | {bd2[x]} | {c['clock']} | {bb2[x]:.3f} | {c['ratio']:.2f} | {t2[x]:.3f} | "
                       f"{rand(c):.2f} | {swc(c):.2f} | {d2[x]:+.2f}")
        ad, ast, abd = d | d2, st | st2, bd | bd2
        aS, aD = effect(ad, ast, abd), effect(ad, abd, ast)
        paS, paD = strat_perm_p(ad, ast, abd), strat_perm_p(ad, abd, ast)
        out += ["", "batch 1 + batch 2: cell sizes " + ", ".join(
                    f"{s_}-{b_} {sum(ast[x] == s_ and abd[x] == b_ for x in ad)}" for s_, b_ in run.CELLS),
                "cell means of d: " + ", ".join(
                    f"{s_}-{b_} {mean([ad[x] for x in ad if ast[x] == s_ and abd[x] == b_]):+.2f}" for s_, b_ in run.CELLS),
                f"S = {aS:+.2f} points (p = {paS:.4f}); D = {aD:+.2f} points (p = {paD:.4f})",
                "all 20: SWC better on {}, worse on {}, tied on {}; sign p = {:.4f}; mean regret SWC {:.2f}%, random {:.2f}%".format(
                    *sign(ad), lb.mean(list(cc.values()) + list(c2.values()), swc), lb.mean(list(cc.values()) + list(c2.values()), rand)),
                f"(2b) on batch 1 + batch 2, S > 0 with p < 0.05: {aS > 0 and paS < 0.05}"]
        # Post hoc (added after milestone 146, PR #17222, landed while this flow ran; not a test): that sibling run tested the same
        # question with the two missing cells only (slow add chains, fast controls) and borrowed fast add / slow control from
        # milestone 145. Two checks: (a) the flow is deterministic across the two sessions on the designs both ran at one clock;
        # (b) the pooled 2 x 2, with milestone 146's designs banded by this run's thresholds, and a fresh-only pool (146 + 147) that
        # leaves out milestone 145, whose designs suggested the reading. A design in both runs is counted once, from this run.
        r46 = [json.loads(l) for l in (EXP / "delay_split_ff" / "results.jsonl").read_text().splitlines()]
        m46 = json.loads((EXP / "delay_split_ff" / "meta.json").read_text())
        mine = {(r["design"], tuple(r["seq"]), r["period_ns"]): r for r in rs}
        same = differ = 0
        shared = set()
        for r in r46:
            b = mine.get((r["design"], tuple(r["seq"]), r["period_ns"]))
            if b is None or r["status"] != "ok" or b["status"] != "ok":
                continue
            shared.add(r["design"])
            eq = abs(r["final_area_notap"] - b["final_area_notap"]) < 1e-6 and abs(r["final_wns"] - b["final_wns"]) < 1e-6
            same, differ = same + eq, differ + (not eq)
        d46c = m141.cells([r for r in r46 if r["design"] not in ad], "delay_split_ff", "m146ff")
        d46 = {x: swc(c) - rand(c) for x, c in d46c.items() if run.band(m46["base_period_ns"][x])}
        st46 = {x: ("ADD" if m46["group"][x] == "ADDS" else "CTRL") for x in d46}
        bd46 = {x: run.band(m46["base_period_ns"][x]) for x in d46}
        out += ["", "## Post hoc: milestone 146 (PR #17222, landed during this run; not a test)", "",
                f"same design, sequence and clock in both runs: {same} routed points identical, {differ} different "
                f"({', '.join(sorted(shared))})",
                f"milestone 146 designs not run here, banded by this run's thresholds: " +
                ", ".join(f"{x} {st46[x]}-{bd46[x]} {d46[x]:+.2f}" for x in sorted(d46))]
        for nm, pdd, pst_, pbd_ in (("fresh only, 146 + 147", ad | d46, ast | st46, abd | bd46),
                                    ("all three, 145 + 146 + 147", ad | d46 | d45, ast | st46 | {x: m145.run.GROUP[x] for x in d45},
                                     abd | bd46 | {x: run.band(b45[x]) for x in d45})):
            cm = ", ".join(f"{s_}-{b_} {sum(pst_[x] == s_ and pbd_[x] == b_ for x in pdd)} designs "
                           f"{mean([pdd[x] for x in pdd if pst_[x] == s_ and pbd_[x] == b_]):+.2f}" for s_, b_ in run.CELLS)
            out += [f"{nm}: {cm}",
                    f"  S = {effect(pdd, pst_, pbd_):+.2f} points (p = {strat_perm_p(pdd, pst_, pbd_):.4f}); "
                    f"D = {effect(pdd, pbd_, pst_):+.2f} points (p = {strat_perm_p(pdd, pbd_, pst_):.4f})"]
    fails = {}
    for r in rs:
        if r["design"] in set(done) and r["status"] != "ok":
            fails[r["design"]] = fails.get(r["design"], 0) + 1
    out += ["", "## Failed points", "", "design | usable points | failed"]
    out += [f"{x} | {120 - fails.get(x, 0)} | {fails.get(x, 0)}" for x in done]
    out += ["", "## Predictions", "",
            f"(1) every cell on the ladder branch: {len(ladder) == len(allc)} ({len(ladder)} of {len(allc)})",
            f"(2) PRIMARY: S > 0 with p < 0.05: {S > 0 and pS < 0.05} (S = {S:+.2f}, p = {pS:.4f})",
            f"(3) D > 0 with p < 0.05: {D > 0 and pD < 0.05} (D = {D:+.2f}, p = {pD:.4f})",
            f"(4) within SLOW, ADD > CTRL: {sa > sc} ({sa:+.2f} against {sc:+.2f})",
            f"(5) within FAST, ADD > CTRL: {fa > fc} ({fa:+.2f} against {fc:+.2f})",
            f"(6) median tau-b lower on FAST than SLOW: {tf < ts} ({tf:.3f} against {ts:.3f})",
            f"(7) SWC better on more designs than worse overall: {ball > wall} ({ball} to {wall})",
            f"(8) mean d tight > relaxed: {dt > dr} ({dt:+.2f} against {dr:+.2f})"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
