"""Fixed body vs co-designed body at equal cost budget. Search on train targets, report on held-out."""
import os, sys, statistics as st
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_bodysearch import model as M

SEEDS = range(10)
BUDGET_EVALS = 300
print(f"cost budget = {M.BUDGET:.0f} (the fixed body: 3 equal links of 0.2 m); {BUDGET_EVALS} evaluations per search, {len(SEEDS)} seeds")
print("train: 16 targets (seed 100+s); test: 60 held-out targets (seed 900). success = held-out fraction reached within 3 mm,")
print("(shelf task: and tool within 15 deg of down), joint limits and static torque limits respected.")
for task in ("shelf", "far"):
    test = M.targets(task, 60, 900)
    print(f"\n=== task: {task} ===")
    d0 = (M.FIXED_LINKS, M.FIXED_BASE, M.DEFAULT_CTRL)
    r0 = M.evaluate(d0, task, test)
    print(f"fixed body, default controller: success {r0['success']:.3f}  iters {r0['iters']:.1f}  cost {r0['cost']:.0f}")
    for method in ("ctrl_only", "ctrl_base", "random", "evo"):
        res = []; ns = []
        for s in SEEDS:
            train = M.targets(task, 16, 100 + s)
            d, _ = M.search(task, train, BUDGET_EVALS, s, method)
            r = M.evaluate(d, task, test)
            res.append(r); ns.append(len(d[0]))
        su = [r["success"] for r in res]; it = [r["iters"] for r in res]; co = [r["cost"] for r in res]
        print(f"{method:>9}: success mean {st.mean(su):.3f} (min {min(su):.3f}, max {max(su):.3f})  iters {st.mean(it):.1f}  cost {st.mean(co):.0f}  joints {sorted(ns)}")
