"""Experiments for garment-wearmix. Deterministic (no randomness); writes experiments/results.txt."""
import os
import sys
import warnings
from collections import Counter

here = os.path.dirname(__file__)
sys.path[:0] = [os.path.join(here, "..", "src")] + [os.path.join(here, "..", "..", d, "src")
                                                     for d in ("garment-thermal", "garment-teardown", "garment-comfortcost")]
from garment_teardown.model import TRENCH, SCENARIOS, replica  # noqa: E402
from garment_comfortcost.cost import CostModel  # noqa: E402
from garment_wearmix.mix import (GATE, SCENS, added_retail, best_for_mix, breakeven_share, expected_benefit,  # noqa: E402
                                 scen_benefit, simplex)

warnings.filterwarnings("ignore")
out = []


def P(*a):
    s = " ".join(str(x) for x in a)
    print(s)
    out.append(s)


PREMIUM = {"ir_transparent": 12.0, "low_emissivity": 6.0, "white": 0.5}  # ASSUMED USD/m2, none quoted
REPL = CostModel(replica(TRENCH), SCENARIOS["mid-wage"], PREMIUM)
name = lambda sub: "+".join(sub) if sub else "none"
MIXES = {"office (80% warm room)": (0.8, 0.1, 0.1), "outdoor (70% sun)": (0.1, 0.7, 0.2),
         "cold-climate (70% cool room)": (0.1, 0.1, 0.8), "even": (1 / 3, 1 / 3, 1 / 3)}

P("== A. Benefit (C) per scenario [warm room 28 C, sunny outdoors 32 C, cool room 16 C]; replica trench added retail ==")
for sub in [("ir_transparent",), (GATE,), ("white",), ("low_emissivity",), ("thick",), ("thin",), ("white", "thick"), (GATE, "white")]:
    bs = [scen_benefit(sub, s) for s in SCENS]
    P(f"{name(sub)}: " + ", ".join(f"{b:+.2f}" for b in bs) + f"; added retail ${added_retail(REPL, sub):.0f}")

P("")
P("== B. Break-even wearing share: fixed infrared-transparent shell helps only if enough time is spent in the warm room ==")
for other in (SCENS[2], SCENS[1]):
    p = breakeven_share(("ir_transparent",), SCENS[0], other)
    P(f"ir_transparent: warm room share must exceed {p:.3f} (rest in {other})" if p else f"ir_transparent vs {other}: no crossing")
P(f"white: warm room vs sunny outdoors crossing = {breakeven_share(('white',), SCENS[1], SCENS[0])} (it never harms)")

P("")
P("== C. Expected benefit (C-weighted) of the best lever set under an added-retail budget, replica, by wearing mix ==")
for budget in (20, 50):
    for mname, w in MIXES.items():
        sub, b, c = best_for_mix(REPL, w, budget)
        P(f"budget <= {budget}, {mname}: {name(sub)}, expected {b:+.2f} C for ${c:.0f}")

P("")
P("== D. Which set wins across the whole wearing-mix simplex (66 mixes in steps of 0.1), replica ==")
for budget in (20, 50, 100):
    for gm in (2.0,):
        tally = Counter(name(best_for_mix(REPL, w, budget, gm)[0]) for w in simplex(10))
        P(f"budget <= {budget}, gate x{gm:g}: " + "; ".join(f"{k} {v}" for k, v in tally.most_common()))
tally = Counter(name(best_for_mix(REPL, w, 50, levers=("ir_transparent", "low_emissivity", "white", "thin", "thick"))[0]) for w in simplex(10))
P("budget <= 50, no gated lever offered: " + "; ".join(f"{k} {v}" for k, v in tally.most_common()))

P("")
P("== E. Value of the gate: expected benefit of the best set with the gate offered minus without, budget <= 100, by gate premium multiple ==")
for gm in (1.0, 2.0, 4.0, 8.0):
    gains = []
    for w in simplex(10):
        with_g = best_for_mix(REPL, w, 100, gm)[1]
        without = best_for_mix(REPL, w, 100, gm, levers=("ir_transparent", "low_emissivity", "white", "thin", "thick"))[1]
        gains.append(with_g - without)
    n_use = sum(1 for w in simplex(10) if GATE in best_for_mix(REPL, w, 100, gm)[0])
    P(f"gate x{gm:g} the fixed premium: chosen in {n_use} of 66 mixes; mean gain {sum(gains)/len(gains):+.3f} C, max gain {max(gains):+.3f} C")

P("")
P("== F. Expected benefit per added dollar (C per USD, replica) for single garments, by wearing mix ==")
for sub in [("ir_transparent",), (GATE,), ("white",), ("low_emissivity",), ("thick",)]:
    c = added_retail(REPL, sub)
    P(f"{name(sub)} (${c:.0f}): " + ", ".join(f"{mn.split(' (')[0]} {expected_benefit(sub, w) / c:+.3f}" for mn, w in MIXES.items()))

open(os.path.join(here, "results.txt"), "w").write("\n".join(out) + "\n")
