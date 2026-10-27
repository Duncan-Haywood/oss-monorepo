"""Milestone 28: the milestone-16 pilot gate replayed on five designs built to make R2 fail (experiments/hostile/results.jsonl). Same cost model, pools, seeds and regret as milestone 16.
Runs no flow. Writes results.txt and summary.json. Usage: python3 gate.py"""
import json
import random
import statistics
import sys
import zlib
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
TABLES = {"hostile": HERE / "results.jsonl"}
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


RULES = {"rand": None, "fixed1.5": ("fixed", 1.5), "fixed_f3": ("fixed", "f3")}
for st in ("r4", "r3"):
    for th in THETAS:
        RULES[f"gate_{st}_{th}"] = ("gate", st, th)

reg, cell_info, out = {}, {}, []
for name, path in TABLES.items():
    rows = [json.loads(l) for l in path.read_text().splitlines()]
    ok = [r for r in rows if r["status"] == "ok"]
    C = costs([r for r in ok if r["tag"] == "tight"])
    by = defaultdict(list)
    for r in ok:
        by[(r["tag"], r["design"])].append(r)
    for (tag, d), pool in sorted(by.items()):
        sc = [flow.scores(r) for r in pool]
        ref = [s["r4"] for s in sc]
        lo = min(ref)
        cell = (name, tag, d)
        cell_info[cell] = {"r2_regret": stats.pick_regret([s["r2"] for s in sc], ref) * 100}
        for B in BUDGETS:
            for rn, rule in RULES.items():
                vals, taus = [], []
                for seed in range(SEEDS):
                    rng = random.Random(seed * 7919 + zlib.crc32(d.encode()) % 1000)
                    v, tau = gated(C, sc, ref, B * C["full"], rule, rng)
                    vals.append(None if v is None else (v / lo - 1) * 100)
                    if tau is not None:
                        taus.append(tau)
                reg[(cell, B, rn)] = M(vals) if None not in vals else None
                if rn in ("gate_r4_0.5", "gate_r3_0.5") and B == BUDGETS[0]:
                    cell_info[cell][f"tau_{rn[5:7]}"] = (M(taus), statistics.pstdev(taus), len(taus))

cells = sorted(cell_info)
out.append(f"# milestone 28: pilot gate on R2-hostile designs, {len(cells)} design-clock cells (5 designs x 2 clocks), pilot m={PILOT}, {SEEDS} paired seeds\n")
out.append("## mean regret % over all cells (budget in routed-point equivalents); arms with no feasible plan counted n/a")
out.append("budget | " + " | ".join(RULES) + " | oracle_gate")
summary = {}
for B in BUDGETS:
    row, s = [], {}
    for rn in RULES:
        v = [reg[(c, B, rn)] for c in cells]
        s[rn] = None if None in v else M(v)
        row.append("n/a" if s[rn] is None else f"{s[rn]:.2f}")
    orc = M(min(reg[(c, B, "fixed1.5")], reg[(c, B, "fixed_f3")]) for c in cells)
    s["oracle_gate"] = orc
    out.append(f"{B} | " + " | ".join(row) + f" | {orc:.2f}")
    summary[str(B)] = s
out.append("\n## per clock, budget 25: mean regret % (rand / fixed1.5 / f3 / gate_r4_0.5 / oracle)")
for tag in ("tight", "relaxed"):
    cs = [c for c in cells if c[1] == tag]
    f = lambda rn: M(reg[(c, 25, rn)] for c in cs)
    orc = M(min(reg[(c, 25, "fixed1.5")], reg[(c, 25, "fixed_f3")]) for c in cs)
    out.append(f"{tag} ({len(cs)} cells): " + " / ".join(f"{f(rn):.2f}" for rn in ("rand", "fixed1.5", "fixed_f3", "gate_r4_0.5")) + f" / {orc:.2f}")
out.append("\n## pilot statistic as a detector of 'R2 pick regret > 10% on the full pool'")
bad = [c for c in cells if cell_info[c]["r2_regret"] > 10]
good = [c for c in cells if cell_info[c]["r2_regret"] <= 10]
out.append(f"bad cells {len(bad)}, other cells {len(good)}")
for st in ("r4", "r3"):
    mt = lambda c: cell_info[c][f"tau_{st}"][0]
    a = auc([-mt(c) for c in bad], [-mt(c) for c in good])
    sd = M(cell_info[c][f"tau_{st}"][1] for c in cells)
    out.append(f"pilot tau(R2,{st.upper()}): AUC {'n/a (no bad cells)' if a is None else f'{a:.2f}'}; mean within-cell sd of pilot tau {sd:.2f}; "
               f"mean cell tau bad {M(mt(c) for c in bad) if bad else float('nan'):.2f}, other {M(mt(c) for c in good):.2f}")
    summary[f"auc_{st}"] = a
    summary[f"tau_sd_{st}"] = sd
out.append("\n## full-pool R2 pick regret % per cell")
for c in cells:
    out.append(f"{c[2]} {c[1]}: {cell_info[c]['r2_regret']:.1f}")
out.append("\n## cells where the oracle gate picks f3 over eta = 1.5 by more than 1 point at budget 25")
for c in cells:
    d = reg[(c, 25, "fixed1.5")] - reg[(c, 25, "fixed_f3")]
    if abs(d) > 1:
        out.append(f"{c[2]} {c[1]} ({c[0]}): eta1.5 {reg[(c, 25, 'fixed1.5')]:.2f} f3 {reg[(c, 25, 'fixed_f3')]:.2f} "
                   f"gate_r4_0.5 {reg[(c, 25, 'gate_r4_0.5')]:.2f} full-pool R2 regret {cell_info[c]['r2_regret']:.1f}")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
(HERE / "summary.json").write_text(json.dumps(summary, indent=1))
print("\n".join(out))
