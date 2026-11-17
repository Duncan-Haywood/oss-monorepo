"""Milestone 139: are the clipped ladder's losses a tight-clock, near-theta pattern? A pre-registered replay test of milestone 138's
post-hoc reading on every earlier ladder-branch cell that did not suggest it, and the price of the guard it implies. No flow run.

Usage: python3 analyse.py [out.txt]

Why: milestone 138 noticed, after its table was read, that all four of SWC's losses on its 25 blind designs were at the tight clock and
three of them were the three cells with the lowest table routed/r2 (3.33, 3.35, 3.79), just above the switch threshold theta = 3. Its
"Next": test that reading on the blind pool by replay before the paper says anything about it. If it holds, the switch has a cheap
fix (route randomly at the tight clock when the ratio is small), since the ratio is measured on one point before the switch decides
(milestone 111) and the clock is known; if not, the paper reports the losses as unexplained.

Test pool T (fixed here, before any number below was computed): every ladder-branch cell (routed/r2 > theta) of
  the 90 seen cells of milestones 119 to 125 (experiments/pilot_probe's cells(), SWC and random as registered there),
  the 42 blind cells of milestones 125, 132 and 133 (experiments/blind_pooled's cells()),
  the 12 blind cells of milestone 137 (experiments/ladder_confirm's confirm_table()),
de-duplicated by (table, clock, design) (milestone 125's cells sit in both of the first two; the blind_pooled copy is kept). SWC was
fixed at milestone 115, before every one of these tables, so none of them tuned it; the seen cells tuned only the guards. Milestone
138's 25 cells produced the reading, so they are reported separately and never counted in a test. The author had read, in LOG.md, that
milestone 137's three tight-clock losses (isq10, isq14, csum4) and milestone 136's failing designs exist, but not their ratios, and had
not tabulated failures by clock or ratio on T.

Definitions (as in milestones 133 to 138): failing = SWC loses to random by more than 1 point; d(c) = SWC(c) - random(c), regret points.
Guard SWCT(theta'): at the tight clock, a cell with routed/r2 <= theta' routes equal-cost random; otherwise SWC. Same cost as SWC
(both branches spend the same budget). Primary theta' = 4 (the round number above milestone 138's three low-ratio losses; fixed here).

Predictions, written in this file before its table existed (checked in main()):
 (1) PRIMARY, paired by design: among designs of T with both clocks on the ladder branch, d(tight) > d(relaxed) on more designs than
     d(tight) < d(relaxed), two-sided exact sign test p < 0.05. Prior 40%.
 (2) the failure rate on T's ladder cells is higher at the tight clock than at the relaxed one, one-sided Fisher exact p < 0.05.
     Prior 40%.
 (3) failing cells of T have lower routed/r2 than the other ladder cells: AUC = P(ratio_failing < ratio_other) > 0.6 and one-sided
     permutation p < 0.05 (10,000 permutations, seed 139). Prior 30%.
 (4) as (3) on T's tight-clock ladder cells only. Prior 35%.
 (5) SWCT(4) has lower mean regret than SWC over T's ladder cells. Prior 35%.
 (6) at the design level on T (mean d over a design's ladder cells), SWCT(4) is better than SWC on more designs than it is worse.
     Prior 35%.
Reported, not predicted: failure counts by clock and ratio band; the theta' sweep {3.5, 4, 5, 6, 8} at the tight clock only and at
both clocks on T; the same on milestone 138's 25 cells (descriptive, the cells the reading came from); the cell-level design-bootstrap
interval of SWCT(4) - SWC (2,000 resamples, seed 139).
"""
import importlib.util
import math
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 139
PERMS = 10000
THETA2 = 4.0
SWEEP = (3.5, 4.0, 5.0, 6.0, 8.0)


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


m138 = _sibling(EXP / "ladder_confirm2" / "analyse.py", "verified_dse_m139_m138")
m137, bpool, lb = m138.m137, m138.bpool, m138.lb
pool, score = lb.pool, lb.score
pp = bpool.pp


def row(src, c, s, r):
    return {"src": src, "table": c["table"], "clock": c["clock"], "design": c["design"], "ratio": c["ratio"], "SWC": s, "RAND": r}


def test_pool():
    """T: ladder-branch cells of the seen 90, the blind 42 and milestone 137's 12, de-duplicated (blind copy kept)."""
    rows = {}
    for c in pp.cells():
        rows[(c["table"], c["clock"], c["design"])] = row("seen m119-125", c, pp.swc(c), pp.rand(c))
    for c in bpool.cells():
        rows[(c["table"], c["clock"], c["design"])] = row("blind " + c["set"], c, bpool.swc(c), bpool.rand(c))
    for c in m137.confirm_table():
        rows[(c["table"], c["clock"], c["design"])] = row("blind m137", c, m137.swc(c), m137.rand(c))
    return [c for c in rows.values() if c["ratio"] > score.THETA]


def m138_cells():
    return [row("m138 (source)", c, m137.swc(c), m137.rand(c)) for c in m138.confirm_table() if c["ratio"] > score.THETA]


def d(c):
    return c["SWC"] - c["RAND"]


def fail(c):
    return c["SWC"] > c["RAND"] + 1


def swct(c, th=THETA2, clocks=("tight",)):
    return c["RAND"] if c["clock"] in clocks and c["ratio"] <= th else c["SWC"]


def mean(rows, f):
    return statistics.mean(f(c) for c in rows) if rows else float("nan")


def fisher_greater(a, b, c_, d_):
    """One-sided Fisher exact p that row 1's success rate exceeds row 2's: table [[a, b], [c_, d_]] (successes, failures)."""
    n1, n2, k = a + b, c_ + d_, a + c_
    tot = math.comb(n1 + n2, k)
    return sum(math.comb(n1, x) * math.comb(n2, k - x) for x in range(a, min(n1, k) + 1)) / tot


def auc(pos, neg):
    """P(pos < neg), ties a half."""
    if not pos or not neg:
        return float("nan")
    s = sum((p < q) + 0.5 * (p == q) for p in pos for q in neg)
    return s / (len(pos) * len(neg))


def perm_p(pos, neg, seed=SEED):
    obs = auc(pos, neg)
    allv, k = pos + neg, len(pos)
    rng = random.Random(seed)
    hit = 0
    for _ in range(PERMS):
        rng.shuffle(allv)
        hit += auc(allv[:k], allv[k:]) >= obs - 1e-12
    return (hit + 1) / (PERMS + 1)


def by_design(rows, f):
    out = {}
    for c in rows:
        out.setdefault((c["src"].split()[-1] if c["src"].startswith("blind") else c["table"], c["design"]), []).append(f(c))
    return {k: statistics.mean(v) for k, v in out.items()}


def counts(rows, label):
    out = []
    for ck in ("tight", "relaxed"):
        cs = [c for c in rows if c["clock"] == ck]
        out.append(f"{label} | {ck} | {len(cs)} | {sum(map(fail, cs))} | {mean(cs, lambda c: c['SWC']):.2f} | "
                   f"{mean(cs, lambda c: c['RAND']):.2f}")
    return out


def sweep(rows, label):
    out = []
    for clocks, cn in ((("tight",), "tight only"), (("tight", "relaxed"), "both clocks")):
        for th in SWEEP:
            f = lambda c, th=th, clocks=clocks: swct(c, th, clocks)
            b, w, t = pool.compare(rows, f, lambda c: c["SWC"])
            moved = sum(c["clock"] in clocks and c["ratio"] <= th for c in rows)
            out.append(f"{label} | {cn} | {th:g} | {moved} | {mean(rows, f):.2f} | {mean(rows, lambda c: c['SWC']):.2f} | {b} | {w}")
    return out


def main(dst):
    T = test_pool()
    S = m138_cells()
    out = ["# Milestone 139: are SWC's losses a tight-clock, near-theta pattern? (replay, no flow run)", "",
           f"theta = {score.THETA}; guard SWCT(theta') routes random at the tight clock when routed/r2 <= theta' (primary {THETA2:g}); "
           f"{PERMS} permutations and {pool.BOOT} bootstrap resamples, seed {SEED}.", "",
           f"Test pool T: {len(T)} ladder-branch cells on {len(by_design(T, d))} designs "
           + "(" + ", ".join(f"{s} {sum(c['src'] == s for c in T)}" for s in dict.fromkeys(c["src"] for c in T)) + "); "
           f"milestone 138 (the source of the reading, descriptive): {len(S)} cells.", "",
           "## Failures by clock", "", "pool | clock | ladder cells | failing | SWC % | random %"]
    out += counts(T, "T") + counts(S, "m138")
    tf, tn = [c for c in T if c["clock"] == "tight"], [c for c in T if c["clock"] == "relaxed"]
    a, b_ = sum(map(fail, tf)), len(tf) - sum(map(fail, tf))
    c_, d_ = sum(map(fail, tn)), len(tn) - sum(map(fail, tn))
    pf = fisher_greater(a, b_, c_, d_)
    out += ["", f"T: failure rate tight {a}/{len(tf)}, relaxed {c_}/{len(tn)}; one-sided Fisher p = {pf:.4f}"]
    # paired by design
    pairs = {}
    for c in T:
        pairs.setdefault((c["table"], c["design"]), {})[c["clock"]] = d(c)
    pr = {k: v["tight"] - v["relaxed"] for k, v in pairs.items() if len(v) == 2}
    pw = sum(v > 1e-9 for v in pr.values())
    pb = sum(v < -1e-9 for v in pr.values())
    psp = pool.sign_p(pw, pb)
    out += [f"T paired by design ({len(pr)} designs with both clocks on the ladder branch): d(tight) > d(relaxed) on {pw}, "
            f"< on {pb}, tied on {len(pr) - pw - pb}; two-sided sign p = {psp:.4f}; mean d(tight) - d(relaxed) "
            f"{statistics.mean(pr.values()) if pr else float('nan'):+.2f} points"]
    # ratio
    out += ["", "## Routing-cost ratio of failing cells", "",
            "pool | cells | failing | median ratio failing | median ratio other | AUC P(failing lower) | one-sided permutation p"]
    res = {}
    for lab, rows in (("T", T), ("T tight", tf), ("T relaxed", tn), ("m138", S),
                      ("m138 tight", [c for c in S if c["clock"] == "tight"])):
        pos = [c["ratio"] for c in rows if fail(c)]
        neg = [c["ratio"] for c in rows if not fail(c)]
        a_ = auc(pos, neg)
        p_ = perm_p(pos, neg) if pos and neg else float("nan")
        res[lab] = (a_, p_)
        out.append(f"{lab} | {len(rows)} | {len(pos)} | " + (f"{statistics.median(pos):.2f}" if pos else "-") + " | "
                   + (f"{statistics.median(neg):.2f}" if neg else "-") + f" | {a_:.3f} | {p_:.4f}")
    out += ["", "## Ratio bands (T)", "", "band | clock | cells | failing | SWC % | random %"]
    for lo, hi in ((3, 4), (4, 6), (6, 10), (10, 1e9)):
        for ck in ("tight", "relaxed"):
            cs = [c for c in T if c["clock"] == ck and lo < c["ratio"] <= hi]
            band = f"({lo}, {hi:g}]" if hi < 1e9 else f"> {lo}"
            out.append(f"{band} | {ck} | {len(cs)} | {sum(map(fail, cs))} | " +
                       (f"{mean(cs, lambda c: c['SWC']):.2f} | {mean(cs, lambda c: c['RAND']):.2f}" if cs else "- | -"))
    out += ["", "## The guard SWCT(theta')", "",
            "pool | clocks | theta' | cells moved to random | SWCT % | SWC % | SWCT better | SWCT worse"]
    out += sweep(T, "T") + sweep(S, "m138")
    g = lambda c: swct(c)
    gb, gw, gt = pool.compare(T, g, lambda c: c["SWC"])
    lo, hi = pool.boot_ci(T, lambda c: g(c) - c["SWC"], seed=SEED)
    dg, ds = by_design(T, g), by_design(T, lambda c: c["SWC"])
    db = sum(dg[k] < ds[k] - 1e-9 for k in dg)
    dw = sum(dg[k] > ds[k] + 1e-9 for k in dg)
    out += ["", f"T, SWCT(4) against SWC: cells better {gb}, worse {gw}, tied {gt}; design-bootstrap 95% interval of the mean "
            f"{lo:+.2f} to {hi:+.2f} points; designs better {db}, worse {dw}, tied {len(dg) - db - dw} (sign p = "
            f"{pool.sign_p(db, dw):.4f})"]
    moved = sorted((c for c in T if c["clock"] == "tight" and c["ratio"] <= THETA2), key=lambda c: c["ratio"])
    out += ["", "## Cells SWCT(4) moves to random (T)", "", "source | design | ratio | SWC % | random % | d"]
    out += [f"{c['src']} | {c['design']} | {c['ratio']:.2f} | {c['SWC']:.2f} | {c['RAND']:.2f} | {d(c):+.2f}" for c in moved]
    out += ["", "## Failing cells (T)", "", "source | design | clock | ratio | SWC % | random % | d"]
    out += [f"{c['src']} | {c['design']} | {c['clock']} | {c['ratio']:.2f} | {c['SWC']:.2f} | {c['RAND']:.2f} | {d(c):+.2f}"
            for c in sorted((c for c in T if fail(c)), key=lambda c: (c["clock"], c["ratio"]))]
    m_g, m_s = mean(T, g), mean(T, lambda c: c["SWC"])
    out += ["", "## Predictions", "",
            f"(1) PRIMARY, paired: d(tight) > d(relaxed) on more designs, sign p < 0.05: {pw > pb and psp < 0.05} "
            f"({pw} against {pb}, p = {psp:.4f})",
            f"(2) failure rate tight > relaxed, Fisher p < 0.05: {pf < 0.05} ({a}/{len(tf)} against {c_}/{len(tn)}, p = {pf:.4f})",
            f"(3) failing cells lower ratio, AUC > 0.6 and p < 0.05: {res['T'][0] > 0.6 and res['T'][1] < 0.05} "
            f"(AUC {res['T'][0]:.3f}, p = {res['T'][1]:.4f})",
            f"(4) as (3) at the tight clock: {res['T tight'][0] > 0.6 and res['T tight'][1] < 0.05} "
            f"(AUC {res['T tight'][0]:.3f}, p = {res['T tight'][1]:.4f})",
            f"(5) SWCT(4) below SWC on mean regret over T: {m_g < m_s} ({m_g:.2f}% against {m_s:.2f}%)",
            f"(6) SWCT(4) better than SWC on more designs than worse: {db > dw} ({db} against {dw})"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))
    return T, S


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
