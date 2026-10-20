"""Experiments for garment-wearpair. Deterministic (no randomness); writes experiments/results.txt."""
import os
import sys
import warnings
from collections import Counter

here = os.path.dirname(__file__)
sys.path[:0] = [os.path.join(here, "..", "src")] + [os.path.join(here, "..", "..", d, "src")
                                                     for d in ("garment-thermal", "garment-teardown", "garment-comfortcost", "garment-wearmix")]
from garment_teardown.model import TRENCH, SCENARIOS, replica  # noqa: E402
from garment_comfortcost.cost import CostModel  # noqa: E402
from garment_wearmix.mix import SCENS, best_for_mix, simplex  # noqa: E402
from garment_wearpair.pair import FIXED, best_wardrobe  # noqa: E402

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
GRID = simplex(10)

P("== A. Best single garment vs best pair, same total added-retail budget, replica, by wearing mix ==")
for budget in (20, 50):
    for mname, w in MIXES.items():
        s = best_for_mix(REPL, w, budget, levers=FIXED)
        g, b, c = best_wardrobe(REPL, w, budget)
        P(f"budget <= {budget}, {mname}: one {name(s[0])} {s[1]:+.2f} C (${s[2]:.0f}); "
          f"pair {name(g[0])} | {name(g[1])} {b:+.2f} C (${c:.0f})")

P("")
P("== B. Gain from owning two garments over one, same total budget, across 66 wearing mixes (steps of 0.1) ==")
for budget in (20, 50, 100):
    gains = []
    for w in GRID:
        gains.append(best_wardrobe(REPL, w, budget)[1] - best_for_mix(REPL, w, budget, levers=FIXED)[1])
    n_gain = sum(1 for x in gains if x > 1e-6)
    P(f"budget <= {budget}: pair beats the single garment in {n_gain} of 66 mixes; mean gain {sum(gains)/len(gains):+.3f} C, max gain {max(gains):+.3f} C")

P("")
P("== C. Which pair wins across the 66 mixes, replica ==")
for budget in (20, 50, 100):
    tally = Counter(" | ".join(sorted(name(x) for x in best_wardrobe(REPL, w, budget)[0])) for w in GRID)
    P(f"budget <= {budget}: " + "; ".join(f"{k} x{v}" for k, v in tally.most_common(5)))

P("")
P("== D. Pair at budget B vs one garment at budget 2B (is a second coat better than a dearer coat?), 66 mixes ==")
for budget in (10, 25, 50):
    pair_each = [best_wardrobe(REPL, w, 2 * budget)[1] - best_for_mix(REPL, w, budget, levers=FIXED)[1] for w in GRID]
    P(f"pair at ${2*budget} total vs single at ${budget} (the price of adding the second garment): mean {sum(pair_each)/len(pair_each):+.3f} C, max {max(pair_each):+.3f} C")

P("")
P("== F. Control: thin cloth removed (it has a negative added cost by garment-comfortcost's linear price assumption, which funds the other garment) ==")
NOTHIN = tuple(l for l in FIXED if l != "thin")
for budget in (20, 50, 100):
    gains = [best_wardrobe(REPL, w, budget, levers=NOTHIN)[1] - best_for_mix(REPL, w, budget, levers=NOTHIN)[1] for w in GRID]
    n_gain = sum(1 for x in gains if x > 1e-6)
    tally = Counter(" | ".join(sorted(name(x) for x in best_wardrobe(REPL, w, budget, levers=NOTHIN)[0])) for w in GRID)
    P(f"budget <= {budget}: pair beats the single garment in {n_gain} of 66 mixes; mean gain {sum(gains)/len(gains):+.3f} C, max gain {max(gains):+.3f} C; top pairs: " + "; ".join(f"{k} x{v}" for k, v in tally.most_common(3)))

P("")
P("== E. Pair uses its two garments in different scenarios? share of mixes where each owned garment is worn somewhere, budget <= 50 ==")
from garment_wearpair.pair import scen_vec  # noqa: E402
both = 0
for w in GRID:
    g, b, c = best_wardrobe(REPL, w, 50)
    worn = set()
    for i in range(3):
        vals = [(scen_vec(x)[i], k) for k, x in enumerate(g)]
        top = max(vals)
        if top[0] > 1e-9:
            worn.add(top[1])
    both += len(worn) == 2
P(f"both garments are the winner in at least one scenario in {both} of 66 mixes")
P("scenarios: " + ", ".join(SCENS))

open(os.path.join(here, "results.txt"), "w").write("\n".join(out) + "\n")
