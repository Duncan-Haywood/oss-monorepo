"""Experiments for garment-wearwrong. Deterministic (no randomness); writes experiments/results.txt."""
import os
import sys
import warnings
from collections import Counter

here = os.path.dirname(__file__)
sys.path[:0] = [os.path.join(here, "..", "src")] + [os.path.join(here, "..", "..", d, "src")
                                                     for d in ("garment-thermal", "garment-teardown", "garment-comfortcost", "garment-wearmix", "garment-wearpair")]
from garment_teardown.model import TRENCH, SCENARIOS, replica  # noqa: E402
from garment_comfortcost.cost import CostModel  # noqa: E402
from garment_wearmix.mix import simplex  # noqa: E402
from garment_wearpair.pair import FIXED  # noqa: E402
from garment_wearwrong.wrong import best_noisy, breakeven_error  # noqa: E402

warnings.filterwarnings("ignore")
out = []


def P(*a):
    s = " ".join(str(x) for x in a)
    print(s)
    out.append(s)


PREMIUM = {"ir_transparent": 12.0, "low_emissivity": 6.0, "white": 0.5}  # ASSUMED USD/m2, none quoted
REPL = CostModel(replica(TRENCH), SCENARIOS["mid-wage"], PREMIUM)
NOTHIN = tuple(l for l in FIXED if l != "thin")
GRID = simplex(10)
ERRS = (0.0, 0.1, 0.2, 0.3, 0.5)

P("== A. Mean gain (C) of the best pair over the best single garment as the wearer's error rate e rises; 66 mixes, thin cloth removed ==")
for budget in (50, 100):
    for e in ERRS:
        gains = [best_noisy(REPL, w, budget, e, 2, NOTHIN)[1] - best_noisy(REPL, w, budget, e, 1, NOTHIN)[1] for w in GRID]
        n = sum(1 for x in gains if x > 1e-6)
        P(f"budget <= {budget}, e = {e:.1f}: pair beats single in {n} of 66 mixes; mean gain {sum(gains)/len(gains):+.3f} C, min {min(gains):+.3f} C")

P("")
P("== B. Break-even error rate (smallest e, grid 0.02, at which the best single garment ties or beats the best pair), 66 mixes, thin cloth removed ==")
for budget in (50, 100):
    be = [breakeven_error(REPL, w, budget, NOTHIN) for w in GRID]
    never = sum(1 for x in be if x is None)
    zero = sum(1 for x in be if x == 0.0)
    vals = sorted(x for x in be if x not in (None, 0.0))
    med = vals[len(vals) // 2] if vals else None
    P(f"budget <= {budget}: pair never loses by e = 1 in {never} of 66; pair already no better at e = 0 in {zero}; "
      f"among the other {len(vals)} the break-even e has median {med}, min {vals[0] if vals else None}, max {vals[-1] if vals else None}")

P("")
P("== C. Break-even error rate for named mixes, budget <= 100, thin cloth removed ==")
MIXES = {"office (80% warm room)": (0.8, 0.1, 0.1), "outdoor (70% sun)": (0.1, 0.7, 0.2),
         "cold-climate (70% cool room)": (0.1, 0.1, 0.8), "even": (1 / 3, 1 / 3, 1 / 3)}
for name, w in MIXES.items():
    P(f"{name}: break-even e = {breakeven_error(REPL, w, 100, NOTHIN)}")

P("")
P("== D. With thin cloth allowed (negative added cost by linear pricing), budget <= 20, same sweep ==")
for e in (0.0, 0.2, 0.5):
    gains = [best_noisy(REPL, w, 20, e, 2)[1] - best_noisy(REPL, w, 20, e, 1)[1] for w in GRID]
    P(f"e = {e:.1f}: mean gain {sum(gains)/len(gains):+.3f} C, min {min(gains):+.3f} C")

P("")
P("== E. Which pair is bought at budget <= 100 when the wearer errs (does the optimiser change its choice?), thin cloth removed ==")
for e in (0.0, 0.3):
    tally = Counter(" | ".join(sorted("+".join(x) or "none" for x in best_noisy(REPL, w, 100, e, 2, NOTHIN)[0])) for w in GRID)
    P(f"e = {e:.1f}: " + "; ".join(f"{k} x{v}" for k, v in tally.most_common(4)))

P("")
P("== F. Harsher error: every mistake is the single worst owned option (wrong coat for the weather); 66 mixes, thin cloth removed ==")
for budget in (50, 100):
    for e in (0.0, 0.1, 0.2, 0.3, 0.5):
        gains = [best_noisy(REPL, w, budget, e, 2, NOTHIN, "worst")[1] - best_noisy(REPL, w, budget, e, 1, NOTHIN, "worst")[1] for w in GRID]
        n = sum(1 for x in gains if x > 1e-6)
        P(f"budget <= {budget}, e = {e:.1f}: pair beats single in {n} of 66 mixes; mean gain {sum(gains)/len(gains):+.3f} C, min {min(gains):+.3f} C")
    be = [breakeven_error(REPL, w, budget, NOTHIN, mode="worst") for w in GRID]
    vals = sorted(x for x in be if x not in (None, 0.0))
    P(f"budget <= {budget}: break-even e under worst-option errors: never in {sum(1 for x in be if x is None)} of 66, already at e = 0 in {sum(1 for x in be if x == 0.0)}; "
      f"the other {len(vals)}: median {vals[len(vals)//2] if vals else None}, min {vals[0] if vals else None}, max {vals[-1] if vals else None}")

open(os.path.join(here, "results.txt"), "w").write("\n".join(out) + "\n")
