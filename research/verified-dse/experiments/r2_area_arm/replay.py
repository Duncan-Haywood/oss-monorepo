"""Milestone 32: does ranking the R2 rung on mapped AREA alone (instead of area x period) fix the R2-hostile designs? Replays the held-out tables (unseen, hostile, fanout_rich: 12 designs).
Comparisons were fixed before the first run (LOG.md). Same cost model, pools, seeds and regret as milestone 16. Runs no flow. Writes results.txt and summary.json. Usage: python3 replay.py"""
import json
import random
import statistics
import sys
import zlib
import itertools
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow, stats  # noqa: E402

M = statistics.mean
SEEDS = 400
PILOT = 5
BUDGETS = (10, 15, 25, 40)  # in mean full-flow costs of the table
THETAS = (0.3, 0.5, 0.7)
TABLES = {"unseen": HERE.parent / "unseen" / "results.jsonl", "hostile": HERE.parent / "hostile" / "results.jsonl", "fanout_rich": HERE.parent / "fanout_rich" / "results.jsonl"}
LARGE = None  # all designs in each file are used


def costs(tight):
    return {
        "r2": M(r["t2_yosys"] + r["t_pnr_to_synth_netlist"] for r in tight),
        "r3": M(r["t_pnr_to_detail_place"] - r["t_pnr_to_synth_netlist"] for r in tight),
        "r4": M(r["t_pnr_total"] - r["t_pnr_to_detail_place"] for r in tight),
        "full": M(r["t2_yosys"] + r["t_pnr_total"] for r in tight),
    }


def shrink(n, eta):
    return max(1, int(n / eta + 1e-9))


def cuts(eta):
    return (1, int(eta[1:])) if isinstance(eta, str) else (eta, eta)


def sh_cost(C, n0, eta):
    n, total = n0, 0.0
    for k, rg in enumerate(("r2", "r3", "r4")):
        total += n * C[rg]
        n = shrink(n, cuts(eta)[min(k, 1)])
    return total


def plan(C, B, eta, size):
    n0 = 0
    for n in range(1, size + 1):
        if sh_cost(C, n, eta) <= B:
            n0 = n
        else:
            break
    return n0


def run_sh(C, sc, ref, ids, B, eta, rng):
    """Successive halving over a random subset of ids that the budget pays for; returns best routed ref or None."""
    n0 = plan(C, B, eta, len(ids))
    if n0 == 0:
        return None
    cur = rng.sample(ids, n0)
    keep = n0
    for k, rg in enumerate(("r2", "r3", "r4")):
        cur = sorted(cur, key=lambda i: (sc[i][rg], rng.random()))
        keep = shrink(keep, cuts(eta)[min(k, 1)])
        if k < 2:
            cur = cur[:keep]
    return min(ref[i] for i in cur)


def gated(C, sc, ref, B, rule, rng):
    """Route PILOT random points, read the pilot statistic, then run the chosen arm on the rest; pilot points stay candidates.
    rule is None (random R4), ("fixed", eta), ("gate", stat, theta). Returns (value or None, statistic or None)."""
    n = len(ref)
    ids = list(range(n))
    if rule is None:
        rng.shuffle(ids)
        return min(ref[i] for i in ids[:max(int(B // C["full"]), 1)]), None
    if rule[0] == "fixed":
        return run_sh(C, sc, ref, ids, B, rule[1], rng), None
    pilot = rng.sample(ids, PILOT)
    rest = [i for i in ids if i not in pilot]
    x = [sc[i]["r2"] for i in pilot]
    y = [sc[i][rule[1]] for i in pilot]
    tau = stats.kendall_tau_b(x, y)
    arm = 1.5 if (tau is not None and tau >= rule[2]) else "f3"
    left = B - PILOT * C["full"]
    base = min(ref[i] for i in pilot)
    if left <= 0:
        return base, tau
    v = run_sh(C, sc, ref, rest, left, arm, rng)
    return (base if v is None else min(base, v)), tau


def auc(pos, neg):
    """P(score of a random positive > score of a random negative), ties half; pos/neg are scores where higher = 'bad'."""
    if not pos or not neg:
        return None
    return M((p > q) + 0.5 * (p == q) for p in pos for q in neg)



def wilcoxon_exact(d):
    """Exact two-sided Wilcoxon signed-rank p (zeros dropped, ties by average rank, enumerated over sign flips)."""
    d = [x for x in d if abs(x) > 1e-12]
    n = len(d)
    if n == 0:
        return 1.0
    order = sorted(range(n), key=lambda i: abs(d[i]))
    ranks = [0.0] * n
    i = 0
    while i < n:
        j = i
        while j + 1 < n and abs(abs(d[order[j + 1]]) - abs(d[order[i]])) < 1e-9:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k]] = (i + j) / 2 + 1
        i = j + 1
    obs = abs(sum(r for r, x in zip(ranks, d) if x > 0) - sum(r for r, x in zip(ranks, d) if x < 0))
    hit = 0
    for signs in itertools.product((1, -1), repeat=n):
        if abs(sum(s * r for s, r in zip(signs, ranks))) >= obs - 1e-9:
            hit += 1
    return hit / 2 ** n



ARMS = ("rand", "adp15", "area15")
COMPARE = (("area15", "adp15"), ("area15", "rand"), ("adp15", "rand"))


def with_area_r2(pool, sc):
    """Copy of the scores whose R2 entry is the mapped area alone."""
    return [dict(s, r2=r["synth_netlist_area"]) for r, s in zip(pool, sc)]


reg, cell_info = {}, {}
for name, path in TABLES.items():
    rows = [json.loads(l) for l in path.read_text().splitlines()]
    ok = [r for r in rows if r["status"] == "ok"]
    C = costs([r for r in ok if r["tag"] == "tight"])
    by = defaultdict(list)
    for r in ok:
        by[(r["tag"], r["design"])].append(r)
    for (tag, d), pool in sorted(by.items()):
        sc = [flow.scores(r) for r in pool]
        sa = with_area_r2(pool, sc)
        ref = [s["r4"] for s in sc]
        lo = min(ref)
        cell = (name, tag, d)
        cell_info[cell] = {
            "tau_adp": stats.kendall_tau_b([s["r2"] for s in sc], ref), "tau_area": stats.kendall_tau_b([s["r2"] for s in sa], ref),
            "regret_adp": stats.pick_regret([s["r2"] for s in sc], ref) * 100, "regret_area": stats.pick_regret([s["r2"] for s in sa], ref) * 100}
        for B in BUDGETS:
            for an, (tab, rule) in {"rand": (sc, None), "adp15": (sc, ("fixed", 1.5)), "area15": (sa, ("fixed", 1.5))}.items():
                vals = []
                for seed in range(SEEDS):
                    rng = random.Random(seed * 7919 + zlib.crc32(d.encode()) % 1000)
                    v, _ = gated(C, tab, ref, B * C["full"], rule, rng)
                    vals.append(None if v is None else (v / lo - 1) * 100)
                reg[(cell, B, an)] = M(vals) if None not in vals else None

designs = sorted({(c[0], c[2]) for c, _, _ in reg})
out = [f"# milestone 32: R2 rung ranked on mapped area alone, {len(designs)} held-out designs (unseen 5, hostile 5, fanout_rich 2), regret averaged over the two clocks, {SEEDS} paired seeds",
       "adp15 = successive halving eta 1.5 with the R2 rung scored area x period (as milestones 27 to 30); area15 = same with the R2 rung scored by mapped area alone (R3 and R4 unchanged); rand = random R4",
       "diff = first arm minus second in regret percentage points (negative favours the first); exact two-sided Wilcoxon over designs; Holm over 12 tests; bootstrap CI is 5000 resamples of designs\n",
       "comparison | budget | mean diff | 95% CI | designs better/worse | p raw | p Holm"]
tests = []
for a, b in COMPARE:
    for B in BUDGETS:
        diffs = [M(reg[((n, t, dn), B, a)] - reg[((n, t, dn), B, b)] for t in ("tight", "relaxed")) for (n, dn) in designs]
        brng = random.Random(1)
        bs = sorted(M(brng.choices(diffs, k=len(diffs))) for _ in range(5000))
        tests.append((a, b, B, M(diffs), bs[125], bs[4874], sum(x < -0.05 for x in diffs), sum(x > 0.05 for x in diffs), wilcoxon_exact(diffs)))
order = sorted(range(len(tests)), key=lambda i: tests[i][8])
holm, run = {}, 0.0
for rank, i in enumerate(order):
    run = max(run, min(1.0, tests[i][8] * (len(tests) - rank)))
    holm[i] = run
summary = {}
for i, (a, b, B, m, lo_, hi_, bt, wr, p) in enumerate(tests):
    out.append(f"{a} vs {b} | {B} | {m:+.2f} | [{lo_:+.2f}, {hi_:+.2f}] | {bt}/{wr} | {p:.4f} | {holm[i]:.4f}")
    summary[f"{a}_vs_{b}_{B}"] = {"mean_diff": m, "ci": [lo_, hi_], "better": bt, "worse": wr, "p": p, "p_holm": holm[i]}
cells = sorted(cell_info)
out.append("\n## mean regret % over all 24 cells: " + " / ".join(ARMS) + " at budgets " + ", ".join(map(str, BUDGETS)))
for B in BUDGETS:
    out.append(f"{B}: " + " / ".join(f"{M(reg[(c, B, a)] for c in cells):.2f}" for a in ARMS))
out.append("\n## full-pool R2 score against R4: tau and pick regret % (ADP / area alone), per cell")
for c in cells:
    i = cell_info[c]
    out.append(f"{c[2]} {c[1]}: tau {i['tau_adp']:.2f} / {i['tau_area']:.2f}; regret {i['regret_adp']:.1f} / {i['regret_area']:.1f}")
summary["mean_tau_adp"] = M(cell_info[c]["tau_adp"] for c in cells)
summary["mean_tau_area"] = M(cell_info[c]["tau_area"] for c in cells)
summary["mean_regret_adp"] = M(cell_info[c]["regret_adp"] for c in cells)
summary["mean_regret_area"] = M(cell_info[c]["regret_area"] for c in cells)
out.append(f"\nmean over cells: tau {summary['mean_tau_adp']:.2f} / {summary['mean_tau_area']:.2f}; R2 pick regret {summary['mean_regret_adp']:.2f} / {summary['mean_regret_area']:.2f}")
out.append("\n## per-design regret % at budget 25 (clock-averaged): rand / adp15 / area15")
for (n, dn) in designs:
    out.append(f"{dn} ({n}): " + " / ".join(f"{M(reg[((n, t, dn), 25, a)] for t in ('tight', 'relaxed')):.2f}" for a in ARMS))
(HERE / "results.txt").write_text("\n".join(out) + "\n")
(HERE / "summary.json").write_text(json.dumps(summary, indent=1))
print("\n".join(out))
