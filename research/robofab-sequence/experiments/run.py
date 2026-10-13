"""All numbers in the README come from this script. Output: experiments/results.txt."""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from robofab_sequence.checker import Checker
from robofab_sequence.planner import (explore, summarise, order_cost, random_permutation_validity,
                                      random_feasible, greedy_disassembly, optimal_order)
from math import factorial

here = os.path.dirname(__file__)
out = []


def p(*a):
    s = " ".join(str(x) for x in a)
    print(s); out.append(s)


N = 11  # orderings of the non-base parts
TOTAL = factorial(N)
levels = {
    "L0 collision only": dict(stability=False, tol=0.0),
    "L1 + quasi-static support": dict(stability=True, tol=0.0),
    "L2 + 0.2 mm print tolerance": dict(stability=True, tol=0.2),
}
cks = {k: Checker(**v) for k, v in levels.items()}
p("parts:", cks["L0 collision only"].n, "(base fixtured; %d! = %d orderings of the rest)" % (N, TOTAL))
p("overlaps in finished product:", cks["L0 collision only"].final_overlaps())

p("\n== Fidelity ladder: exact counts of valid orders ==")
res = {}
for k, ck in cks.items():
    res[k] = summarise(ck)
    p(f"{k}: valid orders {res[k]['valid_orders']} ({res[k]['valid_orders']/TOTAL:.3%} of {TOTAL}), "
      f"min direction changes {res[k]['min_changes']}, states reached {res[k]['states_reached']}")
l0, l1 = res["L0 collision only"]["valid_orders"], res["L1 + quasi-static support"]["valid_orders"]
p(f"share of L0-valid orders that L1 rejects: {1 - l1/l0:.1%}")

p("\n== Random permutations at L1 (100000 draws) vs exact ==")
pv = random_permutation_validity(cks["L1 + quasi-static support"], 100000, 0)
p(f"sampled valid fraction {pv:.5f}; exact {l1/TOTAL:.5f}")

p("\n== Tolerance sweep (L1 + inflate the moving part by tol across the motion) ==")
for tol in [0.0, 0.2, 0.4, 0.49, 0.5, 0.6, 0.9, 1.0]:
    r = summarise(Checker(tol=tol))
    p(f"tol {tol}: valid orders {r['valid_orders']}, min changes {r['min_changes']}")

p("\n== Support-gap sweep (how far below a part may support sit and still count) ==")
for g in [0.0, 0.25, 0.5, 1.0, 2.0]:
    r = summarise(Checker(settle_gap=g))
    p(f"settle_gap {g}: valid orders {r['valid_orders']}, min changes {r['min_changes']}")

p("\n== Planners at L1 ==")
ck1 = cks["L1 + quasi-static support"]
opt, cost, dirs = optimal_order(ck1)
p("optimal (fewest direction changes):", opt, "changes", cost)
rf = random_feasible(ck1, 2000, 1)
p(f"random feasible walk (2000): mean changes {sum(rf)/len(rf):.2f}, min {min(rf)}, max {max(rf)}")
g = greedy_disassembly(ck1)
p("greedy disassembly order:", g, "->", order_cost(ck1, g) if g else None)
g0 = greedy_disassembly(cks["L0 collision only"])
p("greedy disassembly at L0 (no stability) :", g0)
if g0:
    for k, ck in cks.items():
        p(f"  that L0 order checked at {k}:", order_cost(ck, g0))

p("\n== Transfer of the L0-optimal order ==")
o0, c0, _ = optimal_order(cks["L0 collision only"])
p("L0-optimal order:", o0, "changes", c0)
for k, ck in cks.items():
    p(f"  checked at {k}:", order_cost(ck, o0))

p("\n== Session-agent proposal (1 attempt, written before running the planner) ==")
with open(os.path.join(here, "..", "proposals", "session_agent_1.json")) as f:
    prop = json.load(f)["order"]
for k, ck in cks.items():
    p(f"  {k}:", order_cost(ck, prop))

open(os.path.join(here, "results.txt"), "w").write("\n".join(out) + "\n")
