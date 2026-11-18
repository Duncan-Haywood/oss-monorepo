"""Milestone 144: does the clipped ladder's blind advantage survive a fast library corner? The one-clock blind designs of milestones
137, 138 and 140, rerun at SKY130 HD ff_n40C_1v95 with 40% placement utilisation (experiments/corner_ff_blind/run.py), compared with
their own tt_025C_1v80 cells at 40%, and, on the designs milestone 143 analysed, with their ss_100C_1v60 cells.

Usage: python3 analyse.py [out.txt]

Why: milestone 143's "Next" and "Limits": one slow corner, no fast one. At ss the ladder beat random 24 to 3 on 27 blind designs
although the routed ranking barely carried over from tt (median tau-b 0.34). A fast corner is the other side of tt: cells get faster
while the wires (whose parasitics are unchanged) do not, so wire delay is a larger share of each path. The rule's parts (theta = 3, the
clip alpha = 1.25) were chosen at tt, 40%. Nothing is retuned here.

Rules, unchanged: SWC (milestone 115's clipped ladder on the ladder branch, routed/r2 > theta = 3; equal-cost random below it) and
equal-cost random routing, from experiments/new_families/analyse.py's build via milestone 141's code. Random's tie-break seed:
"m144ff" + clock + design at ff; the tt cells keep their own milestones' seeds (m137confirm, m138confirm), the ss cells milestone
143's (m143ss). The analysed set is the longest complete prefix of milestone 141's seed-141 ORDER (run.complete).

Predictions, written here and committed before the flow runs (over the analysed designs, one cell each; d = SWC - random regret):
 (1) every ff cell is on the ladder branch (table routed/r2 > 3). Prior 70% (lowest tt 40% ratio on these designs 3.33, lowest ss
     3.36; the ratio is a runtime ratio and need not follow the delay share).
 (2) PRIMARY: at ff SWC is better than random on more designs than it is worse, and the two-sided exact sign test over the untied
     designs has p < 0.05. Prior 65% (20 untied designs need 15 to 5 or better).
 (3) at ff SWC's mean regret is below random's. Prior 75%.
 (4) the corner matters: the median over designs of Kendall tau-b between a point's routed score (area x delay) at tt and at ff, over
     the sequences usable at both, is below 0.74 (tt 40% against tt 65%, milestones 141 and 142). Prior 60%.
 (5) the fast corner moves the ranking less than the slow one: on the designs analysed at ss too, the median tau-b tt vs ff exceeds
     the median tau-b tt vs ss of the same designs. Prior 55% (ff's baseline period should be nearer tt's, in ratio, than ss's 2.19).
 (6) the sign of d agrees between ff and tt on at least two thirds of the designs untied at both. Prior 55%.
 (7) the change in the advantage, d_ff - d_tt, has a design-bootstrap 95% interval (2,000 resamples, seed 144) that contains zero.
     Prior 60%.
Reported, not predicted: the per-design table, the ff/tt ratio of each design's baseline clock period, the share of designs whose
routed-best sequence is the same at both corners, SWC failures (> 1 point), the family table (milestone 143 refuted "division is the
weak family" at ss, so no family is predicted here), ratio bands at ff, failed points, the tt-65% three-point summary, and a four-point
summary (tt 40%, tt 65%, ss 40%, ff 40%) on the designs analysed at all four, with the ss-vs-ff tau-b.
"""
import importlib.util
import json
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 144
CAP = 27
TABLE = HERE / "results.jsonl"
FAMILIES = ["isq", "amin", "csum", "eqc", "div", "clamp", "rng", "dot", "gtc"]


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


m141 = _sibling(EXP / "util65_blind" / "analyse.py", "verified_dse_m144_m141")
m142 = _sibling(EXP / "util65_rest" / "analyse.py", "verified_dse_m144_m142")
m143 = _sibling(EXP / "corner_ss_blind" / "analyse.py", "verified_dse_m144_m143")
lb, score, swc, rand, lad, sign, boot = m141.lb, m141.score, m141.swc, m141.rand, m141.lad, m141.sign, m141.boot
run = _sibling(HERE / "run.py", "verified_dse_m144_run")
BANDS = m141.BANDS


def family(d):
    return next(f for f in FAMILIES if d.startswith(f))


def rows_ff():
    return [json.loads(l) for l in TABLE.read_text().splitlines()] if TABLE.exists() else []


def cells65(ds):
    """65% cells for the designs that milestones 141 and 142 analysed (others are left out)."""
    old, new = m142.rows65()
    first, rest = m142.analysed(old, new)
    keep = [d for d in ds if d in set(first + rest)]
    rs = [r for r in old + new if r["design"] in set(keep)]
    return m141.cells(rs, "util65_blind", "m141u65") if keep else {}


def main(dst):
    out = ["# Milestone 144: the one-clock blind designs at SKY130 ff_n40C_1v95 (40% utilisation) against their tt cells (flow run)", "",
           f"theta = {score.THETA}; milestone 141's seed-141 order over {len(run.ORDER)} designs", ""]
    rff = rows_ff()
    done = run.complete(rff)[:CAP]  # STOP_RULE.md: at most the first 27 designs, milestone 143's ss set
    out.append(f"complete designs (ORDER prefix): {len(done)} of {len(run.ORDER)}")
    if not done:
        Path(dst).write_text("\n".join(out) + "\n")
        print("\n".join(out))
        return
    meta = json.loads(run.META.read_text())
    cff = m141.cells([r for r in rff if r["design"] in set(done)], "corner_ff_blind", "m144ff")
    ctt, tau, same = {}, {}, {}
    for d in done:
        a = m141.rows40(d)
        s = "m137confirm" if run.SRC[d] == "ladder_confirm" else "m138confirm"
        ctt[d] = m141.cells(a, run.SRC[d], s)[d]
        tau[d], same[d], _ = m141.compare(d, a, [r for r in rff if r["design"] == d])
    dtt = {d: swc(ctt[d]) - rand(ctt[d]) for d in done}
    dff = {d: swc(cff[d]) - rand(cff[d]) for d in done}
    pr = {d: meta["base_period_ns"][d] / meta["tt_base_period_ns"][d] for d in done}
    out += ["", "design | clock | base period ff/tt | routed/r2 tt | routed/r2 ff | tau-b routed tt vs ff | same best | random tt | "
            "SWC tt | random ff | SWC ff | d_tt | d_ff"]
    for d in sorted(done, key=lambda d: (dff[d], d)):
        a, b = ctt[d], cff[d]
        out.append(f"{d} | {b['clock']} | {pr[d]:.2f} | {a['ratio']:.2f} | {b['ratio']:.2f} | {tau[d]:.3f} | {same[d]} | "
                   f"{rand(a):.2f} | {swc(a):.2f} | {rand(b):.2f} | {swc(b):.2f} | {dtt[d]:+.2f} | {dff[d]:+.2f}")
    lff, ltt = [cff[d] for d in done], [ctt[d] for d in done]
    ladder = [c for c in lff if lad(c)]
    bf, wf, tf, pf = sign(dff)
    bt, wt, tt_, pt = sign(dtt)
    agree = [d for d in done if abs(dtt[d]) > 1e-9 and abs(dff[d]) > 1e-9]
    nagree = sum((dtt[d] < 0) == (dff[d] < 0) for d in agree)
    mtau = statistics.median(tau.values())
    ch = [dff[d] - dtt[d] for d in done]
    clo, chi = boot(ch, seed=SEED)
    lo, hi = boot(dff.values(), seed=SEED + 1)
    fail_t, fail_f = sum(v > 1 for v in dtt.values()), sum(v > 1 for v in dff.values())
    out += ["", f"ff: mean regret SWC {lb.mean(lff, swc):.2f}%, random {lb.mean(lff, rand):.2f}%; SWC better on {bf}, worse on {wf}, "
            f"tied on {tf}; two-sided sign p = {pf:.6f}; design-bootstrap 95% interval of mean d_ff {lo:+.2f} to {hi:+.2f}",
            f"tt (40%, same designs): mean regret SWC {lb.mean(ltt, swc):.2f}%, random {lb.mean(ltt, rand):.2f}%; SWC better on {bt}, "
            f"worse on {wt}, tied on {tt_}; two-sided sign p = {pt:.4f}",
            f"SWC fails (loses by > 1 point): {fail_t} designs at tt, {fail_f} at ff",
            f"median base period ff/tt: {statistics.median(pr.values()):.2f} (range {min(pr.values()):.2f} to {max(pr.values()):.2f})",
            f"median routed/r2: {statistics.median(c['ratio'] for c in ltt):.2f} at tt, {statistics.median(c['ratio'] for c in lff):.2f} "
            f"at ff; ladder branch at ff: {len(ladder)} of {len(lff)} (lowest {min(c['ratio'] for c in lff):.2f})",
            f"median tau-b of routed score, tt vs ff: {mtau:.3f} (range {min(tau.values()):.3f} to {max(tau.values()):.3f}); same "
            f"routed-best sequence on {sum(same.values())} of {len(done)}",
            f"change d_ff - d_tt: mean {statistics.mean(ch):+.2f} points, design-bootstrap 95% interval {clo:+.2f} to {chi:+.2f}",
            f"sign of d agrees on {nagree} of {len(agree)} designs untied at both corners", "",
            "## Families", "", "family | designs | mean d_tt | mean d_ff | SWC worse at ff"]
    fam = {}
    for f in FAMILIES:
        ds = [d for d in done if family(d) == f]
        if ds:
            if len(ds) >= 2:
                fam[f] = statistics.mean(dff[d] for d in ds)
            out.append(f"{f} | {len(ds)} | {statistics.mean(dtt[d] for d in ds):+.2f} | {statistics.mean(dff[d] for d in ds):+.2f} | "
                       f"{sum(dff[d] > 1e-9 for d in ds)}")
    worst = max(fam, key=fam.get) if fam else None
    out += ["", "## Ratio bands at ff (milestone 139's)", "", "band | cells | SWC % | random % | SWC better | SWC worse"]
    for name, blo, bhi in BANDS:
        cs = [c for c in lff if blo < c["ratio"] <= bhi]
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
        bf3, wf3, _, pf3 = sign({d: dff[d] for d in three})
        bt3, wt3, _, pt3 = sign({d: dtt[d] for d in three})
        allwin = sum(dtt[d] < -1e-9 and d65[d] < -1e-9 and dff[d] < -1e-9 for d in three)
        allloss = sum(dtt[d] > 1e-9 and d65[d] > 1e-9 and dff[d] > 1e-9 for d in three)
        out += ["", f"## Three operating points, the {len(three)} designs analysed at tt 40%, tt 65% and ff 40%", "",
                "point | mean regret SWC % | random % | SWC better | worse | sign p"]
        for nm, cc, b, w, p in (("tt 40%", ctt, bt3, wt3, pt3), ("tt 65%", c65, b65, w65, p65), ("ff 40%", cff, bf3, wf3, pf3)):
            out.append(f"{nm} | {lb.mean([cc[d] for d in three], swc):.2f} | {lb.mean([cc[d] for d in three], rand):.2f} | {b} | {w} | "
                       f"{p:.4f}")
        out.append(f"SWC ahead at all three points on {allwin} designs, behind at all three on {allloss}")
    # milestone 143's ss cells, on the designs analysed there too
    rss = m143.rows_ss()
    dss_done = [d for d in done if d in set(m143.run.complete(rss))]
    pred5, ffss_txt = None, "no design analysed at ss"
    if dss_done:
        css = m141.cells([r for r in rss if r["design"] in set(dss_done)], "corner_ss_blind", "m143ss")
        dss = {d: swc(css[d]) - rand(css[d]) for d in dss_done}
        tss, tfs = {}, {}
        for d in dss_done:
            a = m141.rows40(d)
            ss_r = [r for r in rss if r["design"] == d]
            tss[d] = m141.compare(d, a, ss_r)[0]
            tfs[d] = m141.compare(d, ss_r, [r for r in rff if r["design"] == d])[0]
        mf, ms = statistics.median(tau[d] for d in dss_done), statistics.median(tss.values())
        pred5, ffss_txt = mf > ms, f"{mf:.3f} against {ms:.3f} on {len(dss_done)} designs"
        four = [d for d in dss_done if d in c65]
        out += ["", f"## Slow and fast corners, the {len(dss_done)} designs analysed at ss 40% and ff 40%", "",
                f"median tau-b of routed score: tt vs ff {mf:.3f}, tt vs ss {ms:.3f}, ss vs ff {statistics.median(tfs.values()):.3f}",
                f"sign of d agrees between ss and ff on {sum((dss[d] < 0) == (dff[d] < 0) for d in dss_done if abs(dss[d]) > 1e-9 and abs(dff[d]) > 1e-9)} "
                f"of {sum(abs(dss[d]) > 1e-9 and abs(dff[d]) > 1e-9 for d in dss_done)} designs untied at both"]
        if four:
            d65 = {d: swc(c65[d]) - rand(c65[d]) for d in four}
            out += ["", f"four points on the {len(four)} designs analysed at all four:", "",
                    "point | mean regret SWC % | random % | SWC better | worse | sign p"]
            for nm, cc in (("tt 40%", ctt), ("tt 65%", c65), ("ss 40%", css), ("ff 40%", cff)):
                b, w, _, p = sign({d: swc(cc[d]) - rand(cc[d]) for d in four})
                out.append(f"{nm} | {lb.mean([cc[d] for d in four], swc):.2f} | {lb.mean([cc[d] for d in four], rand):.2f} | {b} | {w} | {p:.4f}")
            ds4 = [{d: swc(cc[d]) - rand(cc[d]) for d in four} for cc in (ctt, c65, css, cff)]
            out.append(f"SWC ahead at all four points on {sum(all(x[d] < -1e-9 for x in ds4) for d in four)} designs, behind at all four "
                       f"on {sum(all(x[d] > 1e-9 for x in ds4) for d in four)}")
    fails = {}
    for r in rff:
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
    loss = sorted(d for d in done if dff[d] > 1e-9)
    out += ["", f"designs where SWC loses at ff: {', '.join(loss) or 'none'}", "", "## Predictions", "",
            f"(1) every ff cell on the ladder branch: {len(ladder) == len(lff)} ({len(ladder)} of {len(lff)})",
            f"(2) PRIMARY: SWC better on more designs at ff and sign p < 0.05: {bf > wf and pf < 0.05} ({bf} better, {wf} worse, "
            f"p = {pf:.6f})",
            f"(3) SWC mean regret below random at ff: {lb.mean(lff, swc) < lb.mean(lff, rand)}",
            f"(4) median tau-b tt vs ff below 0.74: {mtau < 0.74} ({mtau:.3f})",
            f"(5) median tau-b tt vs ff above tt vs ss on the designs analysed at both: {pred5} ({ffss_txt})",
            f"(6) sign agrees on at least two thirds of untied designs: {3 * nagree >= 2 * len(agree)} ({nagree} of {len(agree)})",
            f"(7) interval of d_ff - d_tt contains zero: {clo <= 0 <= chi} ({clo:+.2f} to {chi:+.2f})"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
