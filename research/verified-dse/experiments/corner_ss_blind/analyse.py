"""Milestone 143: does the clipped ladder's blind advantage survive a second library corner? The one-clock blind designs of milestones
137, 138 and 140, rerun at SKY130 HD ss_100C_1v60 with 40% placement utilisation (experiments/corner_ss_blind/run.py), compared with
their own tt_025C_1v80 cells at 40% (and, descriptively, with their 65% cells of milestones 141 and 142).

Usage: python3 analyse.py [out.txt]

Why: milestone 142's "Next" and every blind milestone's "Limits": one library corner. Over 46 blind designs at 65% SWC beat equal-cost
random routing 38 to 8, and its edge matched the 40% one; but both operating points share the tt corner, and milestone 24 found that a
corner change moves the routed ranking more than density did (median Spearman 0.69 between tt and ss on the seen designs; the
tt-optimal sequence stayed optimal in 8 of 20 cells). The rule's parts (theta = 3, the clip alpha = 1.25) were chosen at tt, 40%.
Nothing is retuned here.

Rules, unchanged: SWC (milestone 115's clipped ladder on the ladder branch, routed/r2 > theta = 3; equal-cost random below it) and
equal-cost random routing, from experiments/new_families/analyse.py's build via milestone 141's code. Random's tie-break seed:
"m143ss" + clock + design at ss; the tt cells keep their own milestones' seeds (m137confirm, m138confirm). The analysed set is the
longest complete prefix of milestone 141's seed-141 ORDER (run.complete).

Predictions, written here and committed before the flow runs (over the analysed designs, one cell each; d = SWC - random regret):
 (1) every ss cell is on the ladder branch (table routed/r2 > 3). Prior 75% (the lowest tt 40% ratio on these designs is 3.33; the
     ratio is a runtime ratio, and slow cells change timing repair's work, so it can move either way).
 (2) PRIMARY: at ss SWC is better than random on more designs than it is worse, and the two-sided exact sign test over the untied
     designs has p < 0.05. Prior 60% (depends on how many designs finish; 20 untied designs need 15 to 5 or better).
 (3) at ss SWC's mean regret is below random's. Prior 75%.
 (4) the corner matters: the median over designs of Kendall tau-b between a point's routed score (area x delay) at tt and at ss, over
     the sequences usable at both, is below the 0.74 that 65% gave against 40% (milestones 141 and 142). Prior 60% (milestone 24's
     corner change moved rankings more than milestone 25's density change on the seen designs).
 (5) the sign of d agrees between ss and tt on at least two thirds of the designs untied at both. Prior 55%.
 (6) the change in the advantage, d_ss - d_tt, has a design-bootstrap 95% interval (2,000 resamples, seed 143) that contains zero.
     Prior 60%.
 (7) the division family (div*) has the highest mean d_ss of the families present with at least two designs. Prior 35%.
Reported, not predicted: the per-design table, the ss/tt ratio of each design's baseline clock period, the share of designs whose
routed-best sequence is the same at both corners, SWC failures (> 1 point), ratio bands at ss, failed points (ABC, pin placement), and
for the designs also analysed at 65% a three-point summary (tt 40%, tt 65%, ss 40%).
"""
import importlib.util
import json
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 143
TABLE = HERE / "results.jsonl"
FAMILIES = ["isq", "amin", "csum", "eqc", "div", "clamp", "rng", "dot", "gtc"]


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


m141 = _sibling(EXP / "util65_blind" / "analyse.py", "verified_dse_m143_m141")
m142 = _sibling(EXP / "util65_rest" / "analyse.py", "verified_dse_m143_m142")
lb, score, swc, rand, lad, sign, boot = m141.lb, m141.score, m141.swc, m141.rand, m141.lad, m141.sign, m141.boot
run = _sibling(HERE / "run.py", "verified_dse_m143_run")
BANDS = m141.BANDS


def family(d):
    return next(f for f in FAMILIES if d.startswith(f))


def rows_ss():
    return [json.loads(l) for l in TABLE.read_text().splitlines()] if TABLE.exists() else []


def cells65(ds):
    """65% cells for the designs that milestones 141 and 142 analysed (others are left out)."""
    old, new = m142.rows65()
    first, rest = m142.analysed(old, new)
    keep = [d for d in ds if d in set(first + rest)]
    rs = [r for r in old + new if r["design"] in set(keep)]
    return m141.cells(rs, "util65_blind", "m141u65") if keep else {}


def main(dst):
    out = ["# Milestone 143: the one-clock blind designs at SKY130 ss_100C_1v60 (40% utilisation) against their tt cells (flow run)", "",
           f"theta = {score.THETA}; milestone 141's seed-141 order over {len(run.ORDER)} designs", ""]
    rss = rows_ss()
    done = run.complete(rss)
    out.append(f"complete designs (ORDER prefix): {len(done)} of {len(run.ORDER)}")
    if not done:
        Path(dst).write_text("\n".join(out) + "\n")
        print("\n".join(out))
        return
    meta = json.loads(run.META.read_text())
    css = m141.cells([r for r in rss if r["design"] in set(done)], "corner_ss_blind", "m143ss")
    ctt, tau, same = {}, {}, {}
    for d in done:
        a = m141.rows40(d)
        s = "m137confirm" if run.SRC[d] == "ladder_confirm" else "m138confirm"
        ctt[d] = m141.cells(a, run.SRC[d], s)[d]
        tau[d], same[d], _ = m141.compare(d, a, [r for r in rss if r["design"] == d])
    dtt = {d: swc(ctt[d]) - rand(ctt[d]) for d in done}
    dss = {d: swc(css[d]) - rand(css[d]) for d in done}
    pr = {d: meta["base_period_ns"][d] / meta["tt_base_period_ns"][d] for d in done}
    out += ["", "design | clock | base period ss/tt | routed/r2 tt | routed/r2 ss | tau-b routed tt vs ss | same best | random tt | "
            "SWC tt | random ss | SWC ss | d_tt | d_ss"]
    for d in sorted(done, key=lambda d: (dss[d], d)):
        a, b = ctt[d], css[d]
        out.append(f"{d} | {b['clock']} | {pr[d]:.2f} | {a['ratio']:.2f} | {b['ratio']:.2f} | {tau[d]:.3f} | {same[d]} | "
                   f"{rand(a):.2f} | {swc(a):.2f} | {rand(b):.2f} | {swc(b):.2f} | {dtt[d]:+.2f} | {dss[d]:+.2f}")
    lss, ltt = [css[d] for d in done], [ctt[d] for d in done]
    ladder = [c for c in lss if lad(c)]
    bs, ws, ts, ps = sign(dss)
    bt, wt, tt_, pt = sign(dtt)
    agree = [d for d in done if abs(dtt[d]) > 1e-9 and abs(dss[d]) > 1e-9]
    nagree = sum((dtt[d] < 0) == (dss[d] < 0) for d in agree)
    mtau = statistics.median(tau.values())
    ch = [dss[d] - dtt[d] for d in done]
    clo, chi = boot(ch, seed=SEED)
    lo, hi = boot(dss.values(), seed=SEED + 1)
    fail_t, fail_s = sum(v > 1 for v in dtt.values()), sum(v > 1 for v in dss.values())
    out += ["", f"ss: mean regret SWC {lb.mean(lss, swc):.2f}%, random {lb.mean(lss, rand):.2f}%; SWC better on {bs}, worse on {ws}, "
            f"tied on {ts}; two-sided sign p = {ps:.6f}; design-bootstrap 95% interval of mean d_ss {lo:+.2f} to {hi:+.2f}",
            f"tt (40%, same designs): mean regret SWC {lb.mean(ltt, swc):.2f}%, random {lb.mean(ltt, rand):.2f}%; SWC better on {bt}, "
            f"worse on {wt}, tied on {tt_}; two-sided sign p = {pt:.4f}",
            f"SWC fails (loses by > 1 point): {fail_t} designs at tt, {fail_s} at ss",
            f"median base period ss/tt: {statistics.median(pr.values()):.2f} (range {min(pr.values()):.2f} to {max(pr.values()):.2f})",
            f"median routed/r2: {statistics.median(c['ratio'] for c in ltt):.2f} at tt, {statistics.median(c['ratio'] for c in lss):.2f} "
            f"at ss; ladder branch at ss: {len(ladder)} of {len(lss)} (lowest {min(c['ratio'] for c in lss):.2f})",
            f"median tau-b of routed score, tt vs ss: {mtau:.3f} (range {min(tau.values()):.3f} to {max(tau.values()):.3f}); same "
            f"routed-best sequence on {sum(same.values())} of {len(done)}",
            f"change d_ss - d_tt: mean {statistics.mean(ch):+.2f} points, design-bootstrap 95% interval {clo:+.2f} to {chi:+.2f}",
            f"sign of d agrees on {nagree} of {len(agree)} designs untied at both corners", "",
            "## Families", "", "family | designs | mean d_tt | mean d_ss | SWC worse at ss"]
    fam = {}
    for f in FAMILIES:
        ds = [d for d in done if family(d) == f]
        if ds:
            if len(ds) >= 2:
                fam[f] = statistics.mean(dss[d] for d in ds)
            out.append(f"{f} | {len(ds)} | {statistics.mean(dtt[d] for d in ds):+.2f} | {statistics.mean(dss[d] for d in ds):+.2f} | "
                       f"{sum(dss[d] > 1e-9 for d in ds)}")
    worst = max(fam, key=fam.get) if fam else None
    out += ["", "## Ratio bands at ss (milestone 139's)", "", "band | cells | SWC % | random % | SWC better | SWC worse"]
    for name, blo, bhi in BANDS:
        cs = [c for c in lss if blo < c["ratio"] <= bhi]
        if not cs:
            out.append(f"{name} | 0 | - | - | - | -")
            continue
        bb, ww, _, _ = sign({c["design"]: swc(c) - rand(c) for c in cs})
        out.append(f"{name} | {len(cs)} | {lb.mean(cs, swc):.2f} | {lb.mean(cs, rand):.2f} | {bb} | {ww}")
    c65 = cells65(done)
    if c65:
        three = sorted(c65)
        d65 = {d: swc(c65[d]) - rand(c65[d]) for d in three}
        b65, w65, _, p65 = sign(d65)
        bs3, ws3, _, ps3 = sign({d: dss[d] for d in three})
        bt3, wt3, _, pt3 = sign({d: dtt[d] for d in three})
        allwin = sum(dtt[d] < -1e-9 and d65[d] < -1e-9 and dss[d] < -1e-9 for d in three)
        allloss = sum(dtt[d] > 1e-9 and d65[d] > 1e-9 and dss[d] > 1e-9 for d in three)
        out += ["", f"## Three operating points, the {len(three)} designs analysed at tt 40%, tt 65% and ss 40%", "",
                "point | mean regret SWC % | random % | SWC better | worse | sign p"]
        for nm, cc, b, w, p in (("tt 40%", ctt, bt3, wt3, pt3), ("tt 65%", c65, b65, w65, p65), ("ss 40%", css, bs3, ws3, ps3)):
            out.append(f"{nm} | {lb.mean([cc[d] for d in three], swc):.2f} | {lb.mean([cc[d] for d in three], rand):.2f} | {b} | {w} | "
                       f"{p:.4f}")
        out.append(f"SWC ahead at all three points on {allwin} designs, behind at all three on {allloss}")
    fails = {}
    for r in rss:
        if r["design"] in set(done) and r["status"] != "ok":
            k = "pin placement (PPL-0024)" if "PPL-0024" in r.get("error", "") else (
                "ABC" if "abc" in r.get("error", "").lower() or "openroad" not in r.get("error", "") else "openroad other")
            fails.setdefault(r["design"], {}).setdefault(k, 0)
            fails[r["design"]][k] += 1
    out += ["", "## Failed points", "", "design | usable points | ABC | pin placement | other OpenROAD"]
    for d in done:
        f = fails.get(d, {})
        out.append(f"{d} | {120 - sum(f.values())} | {f.get('ABC', 0)} | {f.get('pin placement (PPL-0024)', 0)} | "
                   f"{f.get('openroad other', 0)}")
    loss = sorted(d for d in done if dss[d] > 1e-9)
    out += ["", f"designs where SWC loses at ss: {', '.join(loss) or 'none'}", "", "## Predictions", "",
            f"(1) every ss cell on the ladder branch: {len(ladder) == len(lss)} ({len(ladder)} of {len(lss)})",
            f"(2) PRIMARY: SWC better on more designs at ss and sign p < 0.05: {bs > ws and ps < 0.05} ({bs} better, {ws} worse, "
            f"p = {ps:.6f})",
            f"(3) SWC mean regret below random at ss: {lb.mean(lss, swc) < lb.mean(lss, rand)}",
            f"(4) median tau-b tt vs ss below 0.74: {mtau < 0.74} ({mtau:.3f})",
            f"(5) sign agrees on at least two thirds of untied designs: {3 * nagree >= 2 * len(agree)} ({nagree} of {len(agree)})",
            f"(6) interval of d_ss - d_tt contains zero: {clo <= 0 <= chi} ({clo:+.2f} to {chi:+.2f})",
            f"(7) division has the highest family mean d_ss: {worst == 'div'} (highest: {worst})"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
