"""Milestone 146: add-chain structure or short mapped delay? The two missing cells of milestone 145's 2 x 2 at SKY130 ff_n40C_1v95:
slow add chains (ADDS) and fast control chains (CTRLF), selected by the fixed rule in run.py.

Usage: python3 analyse.py [out.txt]

Rules, unchanged from milestones 141 to 145: SWC (milestone 115's clipped ladder on the ladder branch, routed/r2 > theta = 3;
equal-cost random below it) and equal-cost random routing, built by milestone 141's code. Random's tie-break seed: "m146ff" + clock +
design. d = SWC regret - random regret (points); d > 0 is a loss for SWC. The 2 x 2 pool adds milestone 145's 20 designs as ADDF
(its ADD group, all fast) and CTRLS (its CTRL group, all slow), with their own cells and seed, unchanged.

The two readings: STRUCTURE says add-chain amounts cost the ladder its edge whatever their delay, so mean d(ADDS) > mean d(CTRLF);
DELAY says a short mapped critical path does, whatever the structure, so mean d(CTRLF) > mean d(ADDS).

Predictions, written here and committed before any baseline or point runs (over the analysed designs, one cell each):
 (1) every cell is on the ladder branch (routed/r2 > 3). Prior 75%.
 (2) PRIMARY: mean d(ADDS) > mean d(CTRLF), two-sided label-permutation p (10,000 permutations, seed 146) < 0.05: structure.
     Prior 25%. (3) is its mirror; both can fail, which would say neither factor alone carries milestone 145's gap at this size.
 (3) mean d(CTRLF) > mean d(ADDS) with the same test p < 0.05: delay. Prior 20%.
 (4) 2 x 2 pool, structure main effect, (mean d ADDF + mean d ADDS)/2 - (mean d CTRLF + mean d CTRLS)/2 > 0 with a 95%
     design-bootstrap interval (10,000 resamples within each cell, seed 146) that excludes 0. Prior 35%.
 (5) 2 x 2 pool, delay main effect, (mean d ADDF + mean d CTRLF)/2 - (mean d ADDS + mean d CTRLS)/2 > 0 with an interval that
     excludes 0. Prior 35%.
 (6) mechanism: the median Kendall tau-b between the mapped-rung score r2 and the routed score is lower on ADDS than on CTRLF.
     Prior 45% (milestone 145: 0.27 on ADD, 0.47 on CTRL).
 (7) over the analysed designs here SWC is better than random on more designs than it is worse. Prior 75%.
 (8) over the 2 x 2 pool, Spearman correlation between log base period and d is negative (slower designs, larger SWC edge).
     Prior 55%.
Reported, not predicted: the candidate baselines and which were eligible, the per-design table, failed points, cell means and
interaction ((ADDF - ADDS) - (CTRLF - CTRLS)).
"""
import importlib.util
import json
import math
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 146
PERMS = 10000
BOOTS = 10000
TABLE = HERE / "results.jsonl"


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


m145 = _sibling(EXP / "addchain_ff" / "analyse.py", "verified_dse_m146_m145")
m141 = m145.m141
lb, score, swc, rand, lad, sign = m141.lb, m141.score, m141.swc, m141.rand, m141.lad, m141.sign
run = _sibling(HERE / "run.py", "verified_dse_m146_run")


def rows():
    return [json.loads(l) for l in TABLE.read_text().splitlines()] if TABLE.exists() else []


def perm_p(a, b, seed=SEED, n=PERMS):
    return m145.perm_p(a, b, seed=seed, n=n)


def ranks(v):
    o = sorted(range(len(v)), key=lambda i: v[i])
    r = [0.0] * len(v)
    i = 0
    while i < len(o):
        j = i
        while j + 1 < len(o) and v[o[j + 1]] == v[o[i]]:
            j += 1
        for k in range(i, j + 1):
            r[o[k]] = (i + j) / 2
        i = j + 1
    return r


def spearman(x, y):
    rx, ry = ranks(x), ranks(y)
    mx, my = statistics.mean(rx), statistics.mean(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    den = math.sqrt(sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry))
    return num / den if den else float("nan")


def effects(cell):
    m = {g: statistics.mean(v) for g, v in cell.items()}
    return {"structure": (m["ADDF"] + m["ADDS"]) / 2 - (m["CTRLF"] + m["CTRLS"]) / 2,
            "delay": (m["ADDF"] + m["CTRLF"]) / 2 - (m["ADDS"] + m["CTRLS"]) / 2,
            "interaction": (m["ADDF"] - m["ADDS"]) - (m["CTRLF"] - m["CTRLS"])}


def boot(cell, seed=SEED, n=BOOTS):
    rng = random.Random(seed)
    acc = {k: [] for k in ("structure", "delay", "interaction")}
    for _ in range(n):
        e = effects({g: [rng.choice(v) for _ in v] for g, v in cell.items()})
        for k in acc:
            acc[k].append(e[k])
    return {k: (sorted(v)[int(0.025 * n)], sorted(v)[int(0.975 * n) - 1]) for k, v in acc.items()}


def main(dst):
    out = ["# Milestone 146: add-chain structure or short mapped delay, slow add chains and fast control chains at SKY130 "
           "ff_n40C_1v95 (flow run)", "", f"theta = {score.THETA}", ""]
    if not run.META.exists():
        out.append("no baselines yet")
        Path(dst).write_text("\n".join(out) + "\n")
        print("\n".join(out))
        return
    meta = json.loads(run.META.read_text())
    order, group = meta["order"], meta["group"]
    out += [f"tools: {meta.get('tools')}", "", "## Candidates (seed-146 order; eligible: ADDS base >= "
            f"{run.SLOW_MIN} ns, CTRLF base <= {run.FAST_MAX} ns)", "", "group | candidate | ff base period ns | selected"]
    cb = meta["candidate_base_period_ns"]
    for g in ("ADDS", "CTRLF"):
        for x in run.CANDIDATES[g]:
            p = cb.get(x)
            out.append(f"{g} | {x} | {'fail' if p is None else f'{p:.2f}'} | {'yes' if x in group else 'no'}")
    rs = rows()
    done = run.complete(rs, order)
    out += ["", f"complete designs (order prefix): {len(done)} of {len(order)}"]
    if not done:
        Path(dst).write_text("\n".join(out) + "\n")
        print("\n".join(out))
        return
    cc = m141.cells([r for r in rs if r["design"] in set(done)], "delay_split_ff", "m146ff")
    d = {x: swc(cc[x]) - rand(cc[x]) for x in done}
    t = {x: m145.r2r4_tau([r for r in rs if r["design"] == x]) for x in done}
    ads = [x for x in done if group[x] == "ADDS"]
    ctf = [x for x in done if group[x] == "CTRLF"]
    out += ["", "design | group | clock | base period ns | routed/r2 | tau-b r2 vs routed | random % | SWC % | d"]
    for x in sorted(done, key=lambda x: (group[x], d[x], x)):
        c = cc[x]
        out.append(f"{x} | {group[x]} | {c['clock']} | {meta['base_period_ns'][x]:.3f} | {c['ratio']:.2f} | {t[x]:.3f} | "
                   f"{rand(c):.2f} | {swc(c):.2f} | {d[x]:+.2f}")
    allc = [cc[x] for x in done]
    ladder = [c for c in allc if lad(c)]
    ball, wall, tall, pall = sign(d)
    out.append("")
    for nm, ds in (("ADDS", ads), ("CTRLF", ctf)):
        if ds:
            b, w, ti, p = sign({x: d[x] for x in ds})
            out.append(f"{nm}: {len(ds)} designs; mean regret SWC {lb.mean([cc[x] for x in ds], swc):.2f}%, random "
                       f"{lb.mean([cc[x] for x in ds], rand):.2f}%; mean d {statistics.mean(d[x] for x in ds):+.2f}; SWC better on {b}, "
                       f"worse on {w}, tied on {ti}; sign p = {p:.4f}; median tau-b r2 vs routed {statistics.median(t[x] for x in ds):.3f}")
    two = len(ads) > 1 and len(ctf) > 1
    diff = statistics.mean(d[x] for x in ads) - statistics.mean(d[x] for x in ctf) if ads and ctf else float("nan")
    pp = perm_p([d[x] for x in ads], [d[x] for x in ctf]) if two else float("nan")
    out += [f"all: SWC better on {ball}, worse on {wall}, tied on {tall}; sign p = {pall:.4f}; mean regret SWC "
            f"{lb.mean(allc, swc):.2f}%, random {lb.mean(allc, rand):.2f}%",
            f"difference of mean d, ADDS - CTRLF: {diff:+.2f} points; permutation p = {pp:.4f}",
            f"ladder branch: {len(ladder)} of {len(allc)} (lowest routed/r2 {min(c['ratio'] for c in allc):.2f})"]
    # 2 x 2 pool with milestone 145
    r45 = m145.rows()
    done45 = m145.run.complete(r45)
    c45 = m141.cells([r for r in r45 if r["design"] in set(done45)], "addchain_ff", "m145ff")
    d45 = {x: swc(c45[x]) - rand(c45[x]) for x in done45}
    t45 = {x: m145.r2r4_tau([r for r in r45 if r["design"] == x]) for x in done45}
    b45 = json.loads(m145.run.META.read_text())["base_period_ns"]
    g45 = {x: ("ADDF" if m145.run.GROUP[x] == "ADD" else "CTRLS") for x in done45}
    cellg = g45 | {x: group[x] for x in done}
    dd, tt = d45 | d, t45 | t
    bp = {x: b45[x] for x in done45} | {x: meta["base_period_ns"][x] for x in done}
    cell = {g: [dd[x] for x in cellg if cellg[x] == g] for g in ("ADDF", "ADDS", "CTRLF", "CTRLS")}
    out += ["", "## 2 x 2 pool with milestone 145 (ADDF = its ADD, CTRLS = its CTRL)", "",
            "cell | designs | base period ns | mean d | SWC losses | median tau-b r2 vs routed"]
    for g in ("ADDF", "ADDS", "CTRLF", "CTRLS"):
        xs = [x for x in cellg if cellg[x] == g]
        if xs:
            out.append(f"{g} | {len(xs)} | {min(bp[x] for x in xs):.2f} to {max(bp[x] for x in xs):.2f} | "
                       f"{statistics.mean(dd[x] for x in xs):+.2f} | {sum(dd[x] > 1e-9 for x in xs)} | "
                       f"{statistics.median(tt[x] for x in xs):.3f}")
    full = all(len(v) > 1 for v in cell.values())
    eff = effects(cell) if full else {}
    ci = boot(cell) if full else {}
    rho = spearman([math.log(bp[x]) for x in cellg], [dd[x] for x in cellg])
    rho_t = spearman([math.log(bp[x]) for x in cellg], [tt[x] for x in cellg])
    if full:
        out += [""] + [f"{k} effect: {eff[k]:+.2f} points, 95% design-bootstrap interval {ci[k][0]:+.2f} to {ci[k][1]:+.2f}"
                       for k in ("structure", "delay", "interaction")]
    out += [f"Spearman(log base period, d) over {len(cellg)} designs: {rho:+.3f}",
            f"Spearman(log base period, tau-b r2 vs routed): {rho_t:+.3f}"]
    fails = {}
    for r in rs:
        if r["design"] in set(done) and r["status"] != "ok":
            fails[r["design"]] = fails.get(r["design"], 0) + 1
    out += ["", "## Failed points", "", "design | usable points | failed"]
    out += [f"{x} | {120 - fails.get(x, 0)} | {fails.get(x, 0)}" for x in done]
    ta = statistics.median(t[x] for x in ads) if ads else float("nan")
    tc = statistics.median(t[x] for x in ctf) if ctf else float("nan")
    ex = lambda k: full and eff[k] > 0 and ci[k][0] > 0  # noqa: E731
    out += ["", "## Predictions", "",
            f"(1) every cell on the ladder branch: {len(ladder) == len(allc)} ({len(ladder)} of {len(allc)})",
            f"(2) PRIMARY, structure: mean d ADDS > CTRLF with permutation p < 0.05: {bool(two and diff > 0 and pp < 0.05)} "
            f"({diff:+.2f}, p = {pp:.4f})",
            f"(3) delay: mean d CTRLF > ADDS with permutation p < 0.05: {bool(two and diff < 0 and pp < 0.05)}",
            f"(4) structure main effect > 0, interval excludes 0: {ex('structure')}",
            f"(5) delay main effect > 0, interval excludes 0: {ex('delay')}",
            f"(6) median tau-b r2 vs routed lower on ADDS than CTRLF: {ta < tc} ({ta:.3f} against {tc:.3f})",
            f"(7) SWC better on more designs than worse here: {ball > wall} ({ball} to {wall})",
            f"(8) Spearman(log base period, d) < 0 over the pool: {rho < 0} ({rho:+.3f})"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
