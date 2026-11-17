"""Milestone 142: milestone 141's 32 unrun designs at 65% placement utilisation, run to completion (experiments/util65_rest/run.py),
a descriptive addition: milestone 141's analysed set stays its 20 designs, and its seven predictions are not re-scored.

Usage: python3 analyse.py [out.txt]

Why: milestone 141's "Next". At 65% on 20 blind designs the clipped ladder SWC beat equal-cost random routing 16 to 4 (p = 0.012) and
its edge was no smaller than at 40% on the same designs (d65 - d40 = -0.47 points, interval -1.82 to +1.06). Those 20 are a prefix of a
seeded order; isqrt, argmin and eqcnt had no design in it and the other families few. The 32 left finish the set milestone 141 fixed.

Rules, seeds and code as milestone 141 (SWC, theta = 3; random tie-break seed "m141u65" + clock + design at 65%; the 40% cells keep
their milestones' seeds), nothing tuned. If the flow stops again, the analysed new set is the longest prefix of milestone 141's ORDER
past its 20 whose designs are all complete (the same rule). rng12r's 68 rows from milestone 141's partial run are joined.

Predictions, written here and committed before the resumed flow ran. "New" = the analysed designs past milestone 141's 20;
"all" = milestone 141's 20 plus the new ones:
 (1) median routed/r2 over the new designs is higher at 65% than at 40%. Prior 70% (milestone 141: 7.56 against 5.29).
 (2) every new 65% cell is on the ladder branch (routed/r2 > 3). Prior 70% (the 40% ratios of the new designs go down to 3.39).
 (3) PRIMARY: on the new designs SWC is better than random at 65% on more designs than it is worse, two-sided sign p < 0.05.
     Prior 60% (32 untied designs need 23 to 9 or better; milestone 140's 40% rate, 55 to 15, would give about 25 to 7).
 (4) new designs: SWC's mean regret at 65% is below random's. Prior 80%.
 (5) all: the design-bootstrap 95% interval (2,000 resamples, seed 142) of d65 - d40, d = SWC - random, contains zero. Prior 65%.
 (6) all: the sign of d agrees between 40% and 65% on at least two thirds of the designs untied at both. Prior 65%.
 (7) all: the division family (div*) has the highest mean d65 (worst for SWC) of the nine families. Prior 35% (it had the most loss
     at 40%, milestone 138, and at 65%, milestone 141, but now 1 family of 9 and the square roots lost at 40% too).
 (8) pin-placement failures (PPL-0024) at 65% occur only on 256-bit designs (milestone 138's left shifters, slug ending in "l").
     Prior 85%.
Reported, not predicted: the per-design table, the 52-design (or all-analysed) summary at both points, SWC failures (> 1 point),
ratio bands at 65%, the per-family table, failed points and the sensitivity check without designs that keep fewer than 90 points.
"""
import importlib.util
import json
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 142
TABLE = HERE / "results.jsonl"


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


m141 = _sibling(EXP / "util65_blind" / "analyse.py", "verified_dse_m142_m141")
lb, score, swc, rand, lad, sign = m141.lb, m141.score, m141.swc, m141.rand, m141.lad, m141.sign
run = m141.run
BANDS = m141.BANDS
FAMILIES = ["isq", "amin", "csum", "eqc", "div", "clamp", "rng", "dot", "gtc"]


def family(d):
    return next(f for f in FAMILIES if d.startswith(f))


def rows65():
    old = m141.rows65()
    new = [json.loads(l) for l in TABLE.read_text().splitlines()] if TABLE.exists() else []
    return old, new


def analysed(old, new):
    """milestone 141's 20, and the longest complete prefix of ORDER past them (rows from both tables)."""
    first = run.complete(old)
    cnt = {}
    for r in old + new:
        cnt[r["design"]] = cnt.get(r["design"], 0) + 1
    rest = []
    for d in run.ORDER:
        if d in set(first):
            continue
        if cnt.get(d, 0) < 120:
            break
        rest.append(d)
    return first, rest


def summary(name, ds, c40, c65, d40, d65, seed):
    l40, l65 = [c40[d] for d in ds], [c65[d] for d in ds]
    b65, w65, t65, p65 = sign({d: d65[d] for d in ds})
    b40, w40, t40, p40 = sign({d: d40[d] for d in ds})
    lo, hi = m141.boot([d65[d] for d in ds], seed=seed + 1)
    return [f"{name}, 65%: mean regret SWC {lb.mean(l65, swc):.2f}%, random {lb.mean(l65, rand):.2f}%; SWC better on {b65}, "
            f"worse on {w65}, tied on {t65}; two-sided sign p = {p65:.4f}; design-bootstrap 95% interval of mean d65 {lo:+.2f} to "
            f"{hi:+.2f}",
            f"{name}, 40%: mean regret SWC {lb.mean(l40, swc):.2f}%, random {lb.mean(l40, rand):.2f}%; SWC better on {b40}, worse on "
            f"{w40}, tied on {t40}; two-sided sign p = {p40:.4f}"], (b65, w65, p65)


def main(dst):
    out = ["# Milestone 142: milestone 141's unrun designs at 65% placement utilisation, resumed (flow run, descriptive addition)",
           "", f"theta = {score.THETA}; milestone 141's seed-141 order over {len(run.ORDER)} designs", ""]
    old, new = rows65()
    first, rest = analysed(old, new)
    out.append(f"milestone 141's analysed designs: {len(first)}; new complete designs (ORDER prefix past them): {len(rest)} of "
               f"{len(run.ORDER) - len(first)}")
    if not rest:
        Path(dst).write_text("\n".join(out) + "\n")
        print("\n".join(out))
        return
    every = first + rest
    r65 = old + new
    r65 = [r for r in r65 if r["design"] in set(every)]
    c65 = m141.cells(r65, "util65_blind", "m141u65")
    c40, tau, same = {}, {}, {}
    for d in every:
        a = m141.rows40(d)
        s = "m137confirm" if run.SRC[d] == "ladder_confirm" else "m138confirm"
        c40[d] = m141.cells(a, run.SRC[d], s)[d]
        tau[d], same[d], _ = m141.compare(d, a, [r for r in r65 if r["design"] == d])
    d40 = {d: swc(c40[d]) - rand(c40[d]) for d in every}
    d65 = {d: swc(c65[d]) - rand(c65[d]) for d in every}
    out += ["", "## New designs", "", "design | clock | routed/r2 40% | routed/r2 65% | tau-b routed 40 vs 65 | same best | "
            "random 40 | SWC 40 | random 65 | SWC 65 | d40 | d65"]
    for d in sorted(rest, key=lambda d: (d65[d], d)):
        a, b = c40[d], c65[d]
        out.append(f"{d} | {b['clock']} | {a['ratio']:.2f} | {b['ratio']:.2f} | {tau[d]:.3f} | {same[d]} | {rand(a):.2f} | "
                   f"{swc(a):.2f} | {rand(b):.2f} | {swc(b):.2f} | {d40[d]:+.2f} | {d65[d]:+.2f}")
    s_new, (bn, wn, pn) = summary("new", rest, c40, c65, d40, d65, SEED)
    s_all, _ = summary(f"all {len(every)}", every, c40, c65, d40, d65, SEED + 10)
    med40 = statistics.median(c40[d]["ratio"] for d in rest)
    med65 = statistics.median(c65[d]["ratio"] for d in rest)
    ladder = [d for d in rest if lad(c65[d])]
    ch = [d65[d] - d40[d] for d in every]
    clo, chi = m141.boot(ch, seed=SEED)
    agree = [d for d in every if abs(d40[d]) > 1e-9 and abs(d65[d]) > 1e-9]
    nagree = sum((d40[d] < 0) == (d65[d] < 0) for d in agree)
    taus = [tau[d] for d in every]
    fail40, fail65 = sum(d40[d] > 1 for d in every), sum(d65[d] > 1 for d in every)
    out += [""] + s_new + s_all + [
        f"SWC fails (loses by > 1 point), all: {fail40} designs at 40%, {fail65} at 65%",
        f"median routed/r2, new: {med40:.2f} at 40%, {med65:.2f} at 65%; new on the ladder branch at 65%: {len(ladder)} of {len(rest)}",
        f"median tau-b of routed score 40% vs 65%, all: {statistics.median(taus):.3f} (range {min(taus):.3f} to {max(taus):.3f}); "
        f"same routed-best sequence on {sum(same[d] for d in every)} of {len(every)}",
        f"change d65 - d40, all: mean {statistics.mean(ch):+.2f} points, design-bootstrap 95% interval {clo:+.2f} to {chi:+.2f}",
        f"sign of d agrees on {nagree} of {len(agree)} designs untied at both points", "",
        "## Families, all analysed designs", "", "family | designs | mean d40 | mean d65 | SWC worse at 65%"]
    fam = {}
    for f in FAMILIES:
        ds = [d for d in every if family(d) == f]
        if ds:
            fam[f] = statistics.mean(d65[d] for d in ds)
            out.append(f"{f} | {len(ds)} | {statistics.mean(d40[d] for d in ds):+.2f} | {fam[f]:+.2f} | "
                       f"{sum(d65[d] > 1e-9 for d in ds)}")
    worst = max(fam, key=fam.get)
    out += ["", "## Ratio bands at 65%, all analysed designs", "", "band | cells | SWC % | random % | SWC better | SWC worse"]
    l65 = [c65[d] for d in every]
    for name, lo, hi in BANDS:
        cs = [c for c in l65 if lo < c["ratio"] <= hi]
        if not cs:
            out.append(f"{name} | 0 | - | - | - | -")
            continue
        bb, ww, _, _ = sign({c["design"]: swc(c) - rand(c) for c in cs})
        out.append(f"{name} | {len(cs)} | {lb.mean(cs, swc):.2f} | {lb.mean(cs, rand):.2f} | {bb} | {ww}")
    fails = {}
    for r in r65:
        if r["status"] != "ok":
            k = "ppl" if "PPL-0024" in r.get("error", "") else "abc"
            fails.setdefault(r["design"], {}).setdefault(k, 0)
            fails[r["design"]][k] += 1
    ppl = sorted(d for d in every if fails.get(d, {}).get("ppl", 0))
    usable = {d: 120 - sum(fails.get(d, {}).values()) for d in every}
    thin = sorted(d for d in every if usable[d] < 90)
    out += ["", "## Failed points, new designs", "", "design | usable points | ABC failures | pin-placement failures"]
    for d in rest:
        f = fails.get(d, {})
        out.append(f"{d} | {usable[d]} | {f.get('abc', 0)} | {f.get('ppl', 0)}")
    keep = [d for d in every if d not in thin]
    sb, sw_, st, sp = sign({d: d65[d] for d in keep})
    slo, shi = m141.boot([d65[d] - d40[d] for d in keep], seed=SEED)
    out += ["", f"designs with any pin-placement failure: {', '.join(ppl) or 'none'}",
            f"without designs with fewer than 90 usable points at 65% ({', '.join(thin) or 'none'}): {len(keep)} designs; SWC better "
            f"on {sb}, worse on {sw_}, tied on {st}; two-sided sign p = {sp:.6f}; d65 - d40 interval {slo:+.2f} to {shi:+.2f}",
            f"designs where SWC loses at 65% (all): {', '.join(sorted(d for d in every if d65[d] > 1e-9))}", "",
            "## Predictions", "",
            f"(1) median routed/r2 of the new designs higher at 65%: {med65 > med40} ({med65:.2f} against {med40:.2f})",
            f"(2) every new 65% cell on the ladder branch: {len(ladder) == len(rest)} ({len(ladder)} of {len(rest)}; lowest "
            f"{min(c65[d]['ratio'] for d in rest):.2f})",
            f"(3) PRIMARY: new designs, SWC better on more at 65% and sign p < 0.05: {bn > wn and pn < 0.05} ({bn} better, {wn} worse, "
            f"p = {pn:.6f})",
            f"(4) new designs, SWC mean regret below random at 65%: "
            f"{lb.mean([c65[d] for d in rest], swc) < lb.mean([c65[d] for d in rest], rand)}",
            f"(5) all, interval of d65 - d40 contains zero: {clo <= 0 <= chi} ({clo:+.2f} to {chi:+.2f})",
            f"(6) all, sign agrees on at least two thirds of untied designs: {3 * nagree >= 2 * len(agree)} ({nagree} of {len(agree)})",
            f"(7) all, division has the highest family mean d65: {worst == 'div'} (highest: {worst}, {fam[worst]:+.2f})",
            f"(8) pin-placement failures only on 256-bit designs: {all(d.endswith('l') and run.SRC[d] == 'ladder_confirm2' for d in ppl)}"
            f" ({len(ppl)} designs)"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
