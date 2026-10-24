"""Experiments for house-liftnails. Deterministic, seconds.  python experiments/run.py > experiments/results.txt"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent / "src")] + [str(HERE.parent.parent / p / "src") for p in ("house-panellift", "house-offsite", "house-framing")]

from house_framing.model import ADVANCED_2X6, House, walls_of  # noqa: E402
from house_liftnails import Nail, check_nails, nail_capacity, stud_end_nail_demand, withdrawal_side_grain, yield_modes  # noqa: E402
from house_offsite.model import panelise  # noqa: E402
from house_panellift import Lift  # noqa: E402

H, S = House(), ADVANCED_2X6
WALLS = walls_of(H, S)
NAMES = ["front", "rear", "gable L", "gable R"]
print("house-liftnails: nail load path of the hung wall panels of house-panellift (impact factor 1.5)")
print("Nail strength is the NDS yield-limit set written out here; 8d common nails, OSB G 0.50, SPF G 0.42, Fyb 100 ksi: all assumptions.\n")

print("A. Lateral strength of one 8d common nail through 7/16 OSB into SPF (lb, before the 1.25 duration factor)")
m = yield_modes()
print("  " + "  ".join(f"{k} {v:.0f}" for k, v in m.items()))
z, mode = nail_capacity()
print(f"  governs: mode {mode}; Z' with duration factor 1.25 = {z:.0f} lb\n")

panels = []
for wi, w in enumerate(WALLS):
    for a, b in panelise(w, 24 * 12):
        panels.append((f"{NAMES[wi]} {int(a)}", w, a, b))

print("B. Sheathing-to-top-plate nails at 6 in, all sharing the load equally")
print(f"{'panel':<12}{'closed':>7}{'below lb':>9}{'nails':>6}{'lb/nail':>8}{'ratio':>7}")
worst = {False: 0, True: 0}
for name, w, a, b in panels:
    for c in (False, True):
        r = check_nails(w, a, b, H, S, Lift(closed=c))
        worst[c] = max(worst[c], r["ratio_top"])
        print(f"{name:<12}{('yes' if c else 'no'):>7}{r['below_lb']:>9.0f}{r['n_top']:>6}{r['demand_top_lb']:>8.1f}{r['ratio_top']:>7.2f}")
print(f"worst ratio {worst[False]:.2f} open, {worst[True]:.2f} closed\n")

print("C. Fraction of the top-row nails that must share the load (the rest slipping or missing), heaviest closed and open panel")
heavy = {}
for c in (False, True):
    heavy[c] = max(((check_nails(w, a, b, H, S, Lift(closed=c)), n) for n, w, a, b in panels), key=lambda t: t[0]["demand_top_lb"])
print("== C. share of nails effective vs demand/capacity")
print(f"{'effective':>10}{'open':>8}{'closed':>8}")
for f in (1.0, 0.75, 0.5, 0.4, 0.3, 0.25, 0.2, 0.15, 0.1):
    print(f"{f:>10.2f}{heavy[False][0]['ratio_top'] / f:>8.2f}{heavy[True][0]['ratio_top'] / f:>8.2f}")
print(f"(heaviest per nail: open {heavy[False][1]}, closed {heavy[True][1]})\n")

print("D. Stud to sheathing field nails at 12 in, one stud and its bottom-plate share, 16 in vs 24 in studs")
for lbl, sc in (("2x6 @24", S), ("2x6 @16", S.__class__(**{**S.__dict__, "spacing": 16.0}))):
    w, a, b = WALLS[0], *panelise(WALLS[0], 24 * 12)[0]
    r = check_nails(w, a, b, H, sc, Lift())
    print(f"  {lbl}: {r['stud_lb']:.1f} lb per stud, {r['n_field']} nails, {r['demand_field_lb']:.1f} lb/nail, ratio {r['ratio_field']:.2f}")
print()

print("E. Bare frame hung by the top plate (no sheathing): stud end nails are in end-grain withdrawal")
d, credit = stud_end_nail_demand(H, S, Lift())
print(f"  demand {d:.1f} lb per stud (with impact); NDS design value for end-grain withdrawal: none, credited {credit:.0f} lb")
print(f"  for scale only, side-grain withdrawal of a 16d common (0.162 x 3.5 in) with 1.5 in in the plate and 2.0 in in the stud: "
      f"{withdrawal_side_grain(Nail(d=0.162, length=3.5), pen=2.0):.0f} lb")
