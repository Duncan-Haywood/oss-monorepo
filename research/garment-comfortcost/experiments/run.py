"""Experiments for garment-comfortcost. Seeded; writes experiments/results.txt."""
import os
import sys
import warnings

here = os.path.dirname(__file__)
sys.path[:0] = [os.path.join(here, "..", "src"), os.path.join(here, "..", "..", "garment-thermal", "src"),
                os.path.join(here, "..", "..", "garment-teardown", "src")]
from garment_teardown.model import TRENCH, SCENARIOS, replica  # noqa: E402
from garment_comfortcost.cost import LEVERS, SCEN, CostModel, benefit, cost_per_degree, best_under_budget  # noqa: E402

warnings.filterwarnings("ignore")
out = []


def P(*a):
    s = " ".join(str(x) for x in a)
    print(s)
    out.append(s)


# ASSUMED premiums, USD per m2 of treated shell cloth. Round numbers; none is a quoted price.
PREMIUM = {"ir_transparent": 12.0, "low_emissivity": 6.0, "white": 0.5}
S = SCENARIOS["mid-wage"]
DESIGNER = CostModel(TRENCH, S, PREMIUM)
REPL = CostModel(replica(TRENCH), S, PREMIUM)
TREAT = ["ir_transparent", "low_emissivity", "white"]

P("== A. Comfort benefit (C) of each lever alone, and of pairs (solved jointly, not summed) ==")
P("positive = benefit in the scenario's direction (cooler for the two warm scenarios, warmer for the cool room)")
for sc in SCEN:
    P(f"{sc}: " + ", ".join(f"{n} {benefit((n,), sc):+.2f}" for n in LEVERS))
for sc in ["warm room 28 C", "sunny outdoors 32 C"]:
    a, b = ("ir_transparent", "thin") if "room" in sc else ("white", "thick")
    P(f"non-additivity, {sc}: {a} {benefit((a,), sc):+.2f} + {b} {benefit((b,), sc):+.2f} = "
      f"{benefit((a,), sc) + benefit((b,), sc):+.2f} summed, {benefit((a, b), sc):+.2f} jointly")

P("\n== B. Added cost and cost per degree at the assumed premiums ==")
P("premiums (USD/m2, assumed): " + ", ".join(f"{k} {v}" for k, v in PREMIUM.items()) +
  "; shell cloth price scales linearly with clo (thickness exponent 1)")
for nm, m in [("designer trench (retail chain x%.1f x %.1f)" % (TRENCH.brand_multiplier, TRENCH.retail_multiplier), DESIGNER),
              ("replica trench (no brand or retail multiplier)", REPL)]:
    P(f"-- {nm}; shell cloth on the marker {m.garment.fabric_used_m2():.2f} m2")
    for sc in SCEN:
        rows = []
        for n in LEVERS:
            ar = m.added_retail((n,))
            c = cost_per_degree(m, (n,), sc)
            rows.append(f"{n}: {'%+.0f' % ar} USD, " + ("no benefit" if c is None else f"{c:.0f} USD/C"))
        P(f"  {sc}: " + "; ".join(rows))

P("\n== C. Largest premium (USD/m2) a treatment can carry and still cost <= 10 USD per C, added retail ==")
for nm, m in [("designer", DESIGNER), ("replica", REPL)]:
    for sc in ["warm room 28 C", "sunny outdoors 32 C", "cool room 16 C"]:
        res = []
        for n in TREAT:
            b = benefit((n,), sc)
            if b <= 1e-9:
                res.append(f"{n}: n/a"); continue
            mult = m.garment.brand_multiplier * m.garment.retail_multiplier
            per_m2_retail = m.garment.fabric_used_m2() * (1 + m.garment.overhead_rate) * mult
            res.append(f"{n}: {10.0 * b / per_m2_retail:.1f}")
        P(f"{nm}, {sc}: " + "; ".join(res))

P("\n== D. Best lever set under an added-retail budget (exhaustive over 2^5 subsets, thin+thick excluded) ==")
for sc in SCEN:
    for nm, m in [("designer", DESIGNER), ("replica", REPL)]:
        cells = []
        for bud in [5, 10, 20, 40, 80]:
            sub, b, c = best_under_budget(m, sc, bud)
            cells.append(f"<= {bud}: {'+'.join(sub) or 'none'} {b:+.2f} C for {c:.0f} USD")
        P(f"{sc}, {nm}: " + " | ".join(cells))

P("\n== E. Cost per degree (USD/C, added retail) against the premium multiplier (x assumed premium) ==")
USEFUL = {"warm room 28 C": "ir_transparent", "sunny outdoors 32 C": "white", "cool room 16 C": "low_emissivity"}
for nm, g in [("designer", TRENCH), ("replica", replica(TRENCH))]:
    for sc, n in USEFUL.items():
        cells = []
        for k in [0.1, 0.3, 1, 3, 10]:
            m = CostModel(g, S, {x: v * k for x, v in PREMIUM.items()})
            cells.append(f"x{k}: {cost_per_degree(m, (n,), sc):.1f}")
        P(f"{nm}, {sc}, {n}: " + ", ".join(cells))

P("\n== F. Thickness pricing: what 'thin' (0.5 -> 0.3 clo) does to cost, designer trench ==")
for g in [0.0, 0.5, 1.0]:
    m = CostModel(TRENCH, S, PREMIUM, thickness_exponent=g)
    P(f"cloth price ~ (clo/0.5)^{g}: added retail {m.added_retail(('thin',)):+.0f} USD for "
      f"{benefit(('thin',), 'warm room 28 C'):+.2f} C of cooling at 28 C")

open(os.path.join(here, "results.txt"), "w").write("\n".join(out) + "\n")
