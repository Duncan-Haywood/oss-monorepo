"""Milestone 134: why does the clipped ladder fail where it fails? A diagnosis of the 36 blind ladder-branch cells of milestones
125, 132 and 133 (replay of committed flow tables, no flow run).

Usage: python3 analyse.py [out.txt]

Why: pooled over every blind set (42 cells, 21 designs) the unguarded clipped ladder SWC beats equal-cost random routing (3.30%
against 4.65%), and every guard found on seen cells (shift operator, word-level depth, gate depth, pilot probes) has lost to no
guard out of sample. The ladder still fails on 8 of its 36 blind ladder-branch cells, and gate depth does not predict which.
Milestone 133's "Next": turn the failure cases into a diagnosis of what about the mapped netlist ranks a wrongly-clipped point
first.

Mechanism under test. The routed reference is y = A4 x D4 (area without taps x achieved delay, period - final WNS). The clipped key
is A2 x max(P, alpha D2) with alpha = 1.25 (mapped area, mapped delay, period P). When alpha D2 <= P the clip binds and the key is
A2 x P: the ladder then ranks by mapped area alone and is blind to delay. So a failure can come from (a) the area half (mapped
area mis-ranks routed area), (b) the delay half (the area-best points route slow), or (c) the clip hiding a delay signal that
mapped delay did carry. Each pick's log regret splits exactly into log(A4/A4*) + log(D4/D4*) against the routed-best point *.

Groups (milestone 133's definitions, fixed before this file): failing = ladder-branch cells where SWC loses to random by more than
1 point; winning = ladder-branch cells where SWC <= 0.5%.

Predictions, written here before this file's table existed (checked in main()):
 (1) there are 8 failing cells (milestone 133's count) and at least 20 winning cells;
 (2) on failing cells, the delay half carries more than half of SWC's log regret on average (delay share > 0.5): the ladder picks
     small points that route slow, not large ones;
 (3) Kendall tau-b of mapped area against routed area is above 0.5 on average in BOTH groups (the area half is faithful);
 (4) the clip binds on a larger share of points, averaged over failing cells, than over winning cells (the ladder is blinder to
     delay where it fails);
 (5) Kendall tau-b of mapped delay against routed delay is lower, averaged over failing cells, than over winning cells;
 (6) Kendall tau-b of mapped area against routed delay is lower (more negative: an area-delay trade-off) on failing cells than on
     winning cells.
Reported, not predicted: per-cell table; the routed-best point's percentile rank on the key; the unclipped key's regret (alpha =
None) on the same cells; tau(A2, D2) (mapped area against mapped delay, the one trade-off statistic a run can see before
routing; added after the table was first computed, so post hoc); and, as a post-hoc reading, which per-cell statistic separates the two groups best (an AUC, not a rule).
"""
import importlib.util
import math
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 134
DRAWS = 200
ALPHA = 1.25


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


lb = _sibling(EXP / "ladder_blind" / "analyse.py", "verified_dse_m134_lb")
bp, al, nf, score, rule = lb.bp, lb.al, lb.nf, lb.score, lb.rule
swc, rand, lad = lb.swc, lb.rand, lb.lad
SOURCES = (("m125", al, EXP / "amount_lanes" / "results.jsonl", "amount_lanes"),
           ("m132", bp, EXP / "blind_probe" / "results.jsonl", "blind_probe"),
           ("m133", lb, EXP / "ladder_blind" / "results.jsonl", "ladder_blind"))


def tau_b(x, y):
    """Kendall tau-b (ties in either variable handled), O(n^2); n is about 100 here."""
    n = len(x)
    c = d = tx = ty = 0
    for i in range(n):
        for j in range(i + 1, n):
            a, b = x[i] - x[j], y[i] - y[j]
            if a == 0 and b == 0:
                continue
            if a == 0:
                tx += 1
            elif b == 0:
                ty += 1
            elif (a > 0) == (b > 0):
                c += 1
            else:
                d += 1
    den = math.sqrt((c + d + tx) * (c + d + ty))
    return (c - d) / den if den else 0.0


def parts(r):
    p = r["period_ns"]
    return {"A2": r["synth_netlist_area"], "D2": p - r["synth_netlist_wns"], "A4": r["final_area_notap"],
            "D4": p - r["final_wns"], "P": p}


def diagnose(rs, seed):
    """Per-cell statistics of the mapped-to-routed relation and of SWC's pick (top 8 by the clipped key, random tie-breaks)."""
    q = [parts(r) for r in rs]
    y = [rule.flow.scores(r)["r4"] for r in rs]
    key = [score.r2c(r, ALPHA) for r in rs]
    raw = [score.r2c(r, None) for r in rs]
    n = len(rs)
    b = min(range(n), key=lambda i: y[i])
    rng = random.Random(seed)
    la = ld = reg = rr = 0.0
    for _ in range(DRAWS):
        tb = [rng.random() for _ in range(n)]
        top = sorted(range(n), key=lambda i: (key[i], tb[i]))[:8]
        i = min(top, key=lambda j: y[j])
        la += math.log(q[i]["A4"] / q[b]["A4"])
        ld += math.log(q[i]["D4"] / q[b]["D4"])
        reg += y[i] / y[b] - 1
        top = sorted(range(n), key=lambda i: (raw[i], tb[i]))[:8]
        rr += min(y[j] for j in top) / y[b] - 1
    la, ld = la / DRAWS, ld / DRAWS
    tot = la + ld
    below = sum(key[i] < key[b] for i in range(n))
    ties = sum(key[i] == key[b] for i in range(n)) - 1
    return {
        "swc_check": 100 * reg / DRAWS, "unclipped": 100 * rr / DRAWS,
        "log_area": la, "log_delay": ld, "delay_share": (ld / tot) if tot > 1e-12 else float("nan"),
        "clip_share": sum(ALPHA * x["D2"] <= x["P"] for x in q) / n,
        "tauA": tau_b([x["A2"] for x in q], [x["A4"] for x in q]),
        "tauD": tau_b([x["D2"] for x in q], [x["D4"] for x in q]),
        "tauAD": tau_b([x["A2"] for x in q], [x["D4"] for x in q]),
        "tauY": tau_b(key, y),
        "tauA2D2": tau_b([x["A2"] for x in q], [x["D2"] for x in q]),
        "best_pct": 100 * (below + ties / 2) / (n - 1),
        "spreadD": statistics.pstdev([x["D4"] for x in q]) / statistics.mean([x["D4"] for x in q]),
        "spreadA": statistics.pstdev([x["A4"] for x in q]) / statistics.mean([x["A4"] for x in q]),
        "n": n,
    }


def cells():
    out = []
    for name, mod, path, src in SOURCES:
        raw = rule.load_table(path, src)
        for c in mod.blind_table():
            if not lad(c):
                continue
            rs = raw[(c["clock"], c["design"], c["table"])]
            c.update(diagnose(rs, f"m134{name}{c['clock']}{c['design']}"))
            c["set"] = name
            out.append(c)
    return out


def auc(pos, neg):
    """P(statistic on a failing cell > on a winning cell), ties counted half."""
    s = sum((a > b) + 0.5 * (a == b) for a in pos for b in neg)
    return s / (len(pos) * len(neg))


STATS = (("delay_share", "delay share of SWC's log regret"), ("clip_share", "clip-binding share"),
         ("tauA", "tau(A2, A4)"), ("tauD", "tau(D2, D4)"), ("tauAD", "tau(A2, D4)"), ("tauY", "tau(key, y)"),
         ("spreadD", "routed-delay CV"), ("spreadA", "routed-area CV"), ("best_pct", "routed best's key percentile"),
         ("tauA2D2", "tau(A2, D2), post hoc"))
PRE_ROUTE = ("clip_share", "tauA2D2")  # computable from mapped points alone; the others need the routed table


def gmean(rows, k):
    v = [c[k] for c in rows if not math.isnan(c[k])]
    return statistics.mean(v) if v else float("nan")


def main(dst):
    rows = cells()
    bad = [c for c in rows if swc(c) > rand(c) + 1]
    good = [c for c in rows if swc(c) <= 0.5]
    out = ["# Milestone 134: why the clipped ladder fails on blind cells (replay of milestones 125, 132 and 133; no flow run)", "",
           f"alpha = {ALPHA}; {DRAWS} tie-break draws per cell, seed m134 + set + clock + design. Groups: failing = SWC loses to "
           "random by > 1 point; winning = SWC <= 0.5%.", "",
           f"## Per cell ({len(rows)} ladder-branch cells)", "",
           "set | clock | design | group | SWC % | random % | unclipped % | log area | log delay | delay share | clip share | "
           "tau(A2,A4) | tau(D2,D4) | tau(A2,D4) | tau(key,y) | delay CV | area CV | best's key pct"]
    for c in sorted(rows, key=lambda c: (-(swc(c) - rand(c)), c["set"], c["design"], c["clock"])):
        g = "failing" if c in bad else ("winning" if c in good else "-")
        out.append(f"{c['set']} | {c['clock']} | {c['design']} | {g} | {swc(c):.2f} | {rand(c):.2f} | {c['unclipped']:.2f} | "
                   f"{c['log_area']:+.4f} | {c['log_delay']:+.4f} | "
                   + ("-" if math.isnan(c["delay_share"]) else f"{c['delay_share']:.2f}")
                   + f" | {c['clip_share']:.2f} | {c['tauA']:.2f} | {c['tauD']:.2f} | {c['tauAD']:+.2f} | {c['tauY']:.2f} | "
                   f"{c['spreadD']:.3f} | {c['spreadA']:.3f} | {c['best_pct']:.0f}")
    out += ["", "## Group means", "", "statistic | failing (" + str(len(bad)) + ") | winning (" + str(len(good)) + ") | "
            "AUC (failing > winning) | needs routing"]
    for k, lab in STATS:
        if k == "delay_share":
            continue
        out.append(f"{lab} | {gmean(bad, k):.3f} | {gmean(good, k):.3f} | {auc([c[k] for c in bad], [c[k] for c in good]):.2f} | "
                   f"{'no' if k in PRE_ROUTE else 'yes'}")
    out.append(f"delay share of SWC's log regret | {gmean(bad, 'delay_share'):.3f} | (winning cells have ~0 regret) | - | yes")
    out.append(f"SWC % | {statistics.mean(swc(c) for c in bad):.2f} | {statistics.mean(swc(c) for c in good):.2f} | - | -")
    out.append(f"unclipped key % (alpha = None) | {gmean(bad, 'unclipped'):.2f} | {gmean(good, 'unclipped'):.2f} | - | -")
    out.append(f"random % | {statistics.mean(rand(c) for c in bad):.2f} | {statistics.mean(rand(c) for c in good):.2f} | - | -")
    out.append(f"SWC check (this file's tie-breaks) % | {gmean(bad, 'swc_check'):.2f} | {gmean(good, 'swc_check'):.2f} | - | -")
    m = lambda rs, k: gmean(rs, k)
    out += ["", "## Predictions", "",
            f"(1) 8 failing cells and >= 20 winning: {len(bad) == 8 and len(good) >= 20} ({len(bad)} failing, {len(good)} winning, "
            f"{len(rows) - len(bad) - len(good)} neither)",
            f"(2) failing cells, delay share of log regret > 0.5: {m(bad, 'delay_share') > 0.5} ({m(bad, 'delay_share'):.3f})",
            f"(3) tau(A2, A4) > 0.5 in both groups: {m(bad, 'tauA') > 0.5 and m(good, 'tauA') > 0.5} "
            f"(failing {m(bad, 'tauA'):.3f}, winning {m(good, 'tauA'):.3f})",
            f"(4) clip share higher on failing cells: {m(bad, 'clip_share') > m(good, 'clip_share')} "
            f"({m(bad, 'clip_share'):.3f} against {m(good, 'clip_share'):.3f})",
            f"(5) tau(D2, D4) lower on failing cells: {m(bad, 'tauD') < m(good, 'tauD')} "
            f"({m(bad, 'tauD'):.3f} against {m(good, 'tauD'):.3f})",
            f"(6) tau(A2, D4) lower on failing cells: {m(bad, 'tauAD') < m(good, 'tauAD')} "
            f"({m(bad, 'tauAD'):+.3f} against {m(good, 'tauAD'):+.3f})"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))
    return rows, bad, good


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
