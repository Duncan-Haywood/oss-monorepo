"""Rank correlation between fidelity rungs, then successive halving vs random search at equal tool seconds.
Run: PYTHONPATH=src python experiments/run.py   (writes results.txt, rank_vs_budget.png)"""
import os
import numpy as np
from eda_fidelity import ladder as L

D = os.path.dirname(os.path.abspath(__file__))
rows = L.load(os.path.join(D, "eval_log.jsonl"))
n = len(rows)
true = [L.truth(r) for r in rows]
best_true = min(true)
out = [f"# {n} designs (p 1..8 x wb 4..8) from the committed eda-harness log; Yosys 0.33, Icarus 12.0; no place and route",
       f"# objective = cells x cycles; true optimum {best_true} at p={rows[int(np.argmin(true))]['p']}, wb={rows[int(np.argmin(true))]['wb']}",
       f"# total tool seconds: rung 1 {sum(r['t1'] for r in rows):.1f}, rung 2 {sum(r['t2'] for r in rows):.1f}", ""]
out.append("rank agreement of each rung with the rung-2 objective (cells x cycles)")
out.append("rung  what                               spearman  kendall  top-5 overlap  seconds for all 40")
top5 = set(np.argsort(true)[:5])
corr = {}
for k, what in enumerate(["analytic cells and cycles (free)", "analytic cells x simulated cycles", "synthesis (reference)"]):
    v = [L.rung_value(r, k) for r in rows]
    ov = len(top5 & set(np.argsort(v, kind="stable")[:5]))
    c = sum(L.rung_cost(r, k) for r in rows)
    corr[k] = (L.spearman(v, true), L.kendall(v, true))
    out.append(f"  {k}   {what:34s} {corr[k][0]:8.3f} {corr[k][1]:8.3f}  {ov}/5          {c:8.1f}")
out += ["", "components: rank agreement of analytic p*wb^2 with synthesised cells, and of ceil(110/p) with simulated cycles"]
out.append("  cells  spearman %.3f  kendall %.3f" % (L.spearman([r["p"] * r["wb"] ** 2 for r in rows], [r["cells"] for r in rows]),
                                                   L.kendall([r["p"] * r["wb"] ** 2 for r in rows], [r["cells"] for r in rows])))
import math
out.append("  cycles spearman %.3f  kendall %.3f" % (L.spearman([math.ceil(L.W / r["p"]) for r in rows], [r["cycles"] for r in rows]),
                                                    L.kendall([math.ceil(L.W / r["p"]) for r in rows], [r["cycles"] for r in rows])))
out.append("  cells x cycles at p = 1..8 only (wb = 6): analytic cells ratio to synthesised cells = " +
           " ".join(f"{r['p'] * r['wb'] ** 2 / r['cells']:.3f}" for r in rows if r["wb"] == 6))
SEEDS = 2000
BUDGETS = [5, 10, 20, 40, 80, 160]
out += ["", f"search at equal tool seconds, {SEEDS} random orders: best true cells x cycles found, as a ratio to the optimum",
        "budget_s   random: mean [95% interval]  P(optimum)    halving: mean [95% interval]  P(optimum)  halving designs screened"]
rng = np.random.default_rng(0)
res = {b: ([], [], []) for b in BUDGETS}
for _ in range(SEEDS):
    perm = list(rng.permutation(n))
    for b in BUDGETS:
        rb, _ = L.random_search(rows, perm, b)
        hb, hc = L.halving_at_budget(rows, perm, b)
        res[b][0].append(rb); res[b][1].append(hb)
        res[b][2].append(next((m for m in range(n, 0, -1) if L.halving(rows, perm, m)[1] <= b), 0))
def ci(x):
    r = np.array(x) / best_true
    r = np.where(np.isfinite(r), r, np.nan)
    bs = np.random.default_rng(1).choice(r[np.isfinite(r)], (1000, len(r[np.isfinite(r)]))).mean(1)
    return np.nanmean(r), np.percentile(bs, 2.5), np.percentile(bs, 97.5)
for b in BUDGETS:
    rr, hh, nn = res[b]
    rm, rl, rh = ci(rr); hm, hl, hh_ = ci(hh)
    pr = np.mean(np.array(rr) == best_true); ph = np.mean(np.array(hh) == best_true)
    nr = sum(not np.isfinite(x) for x in rr); nh = sum(not np.isfinite(x) for x in hh)
    out.append(f"{b:6d}     {rm:6.3f} [{rl:.3f},{rh:.3f}]   {pr:5.2f}     {hm:6.3f} [{hl:.3f},{hh_:.3f}]   {ph:5.2f}      {np.mean(nn):5.1f}"
               + (f"   (runs with nothing finished: random {nr}, halving {nh})" if nr or nh else ""))
open(os.path.join(D, "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
try:
    import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
    fig, ax = plt.subplots(1, 2, figsize=(9, 3.4))
    xs = [L.rung_value(r, 0) for r in rows]
    ax[0].scatter(xs, true, s=14, c="#4c78a8"); ax[0].set_xscale("log"); ax[0].set_yscale("log")
    ax[0].set_xlabel("rung 0: analytic cells x cycles"); ax[0].set_ylabel("rung 2: synthesised cells x simulated cycles")
    ax[0].set_title(f"Rank agreement (Spearman {corr[0][0]:.2f})")
    for j, (name, c) in enumerate([("random search", "#e45756"), ("successive halving", "#4c78a8")]):
        m = [np.nanmean(np.where(np.isfinite(np.array(res[b][j]) / best_true), np.array(res[b][j]) / best_true, np.nan)) for b in BUDGETS]
        ax[1].plot(BUDGETS, m, "o-", c=c, label=name)
    ax[1].set_xscale("log"); ax[1].set_xlabel("tool seconds"); ax[1].set_ylabel("best found / optimum"); ax[1].legend(); ax[1].set_title("Equal tool seconds")
    fig.tight_layout(); fig.savefig(os.path.join(D, "fidelity.png"), dpi=110)
except ImportError:
    print("matplotlib missing: no figure")
