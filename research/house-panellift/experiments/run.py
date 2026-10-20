"""Experiments for house-panellift. Deterministic.  python experiments/run.py > experiments/results.txt  (about 2 min)"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent / "src"), str(HERE.parent.parent / "house-offsite" / "src"),
                str(HERE.parent.parent / "house-framing" / "src")]

from house_panellift import (ADVANCED_2X6, House, Lift, check_panel, hands_needed, max_panel_length_ft,  # noqa: E402
                             panel_weight, weight_profile, wind_speed_for_swing)
from house_framing.model import walls_of  # noqa: E402
from house_offsite.model import panelise  # noqa: E402

H, S = House(), ADVANCED_2X6
WALLS = walls_of(H, S)
NAMES = ["front", "rear", "gable L", "gable R"]
print("house-panellift: handling the wall panels of house-offsite (28 x 40 ft house, advanced 2x6 @24, 24 ft limit)")
print("Densities, glazing weight, impact factor and drag coefficient are assumptions of this project.\n")

print("A. Panel weights and two-pick lifts (picks placed to minimise the plate moment; impact factor 1.5)")
print(f"{'panel':<12}{'len ft':>7}{'open lb':>9}{'closed lb':>10}{'picks (in)':>14}{'plate fb/allow':>16}{'pick lb':>9}  door cut at max moment")
tot = {False: 0, True: 0}
heaviest = {False: 0, True: 0}
for wi, w in enumerate(WALLS):
    for a, b in panelise(w, 24 * 12):
        r = {c: check_panel(w, a, b, H, S, Lift(closed=c), 2) for c in (False, True)}
        for c in r:
            tot[c] += r[c]["weight_lb"]
            heaviest[c] = max(heaviest[c], r[c]["weight_lb"])
        print(f"{NAMES[wi]+' '+str(int(a)):<12}{(b-a)/12:>7.1f}{r[False]['weight_lb']:>9.0f}{r[True]['weight_lb']:>10.0f}"
              f"{str(r[False]['picks']):>14}{r[False]['ratio_bending']:>16.2f}{r[False]['pick_load_lb']:>9.0f}  "
              f"{r[False]['door_cuts_bottom_chord_at_max_moment']}")
print(f"\nShell total {tot[False]:.0f} lb open, {tot[True]:.0f} lb closed; heaviest panel {heaviest[False]:.0f} / {heaviest[True]:.0f} lb\n")

print("B. Longest solid panel whose top-plate bending stays within the allowable (lower bound: sheathing ignored)")
print(f"{'picks':>6}{'open ft':>9}{'closed ft':>11}")
for n in (1, 2, 3):
    print(f"{n:>6}{max_panel_length_ft(n, Lift(closed=False), H, S):>9}{max_panel_length_ft(n, Lift(closed=True), H, S):>11}")
print("(search stops at 60 ft; searched in 4 ft steps)\n")

print("C. People needed to hand-carry each panel at the NIOSH 51 lb recommended limit per person (best case, ideal grip and posture)")
for c in (False, True):
    light = panel_weight(weight_profile(WALLS[2], 0, 139, H, S, Lift(closed=c)))
    print(f"  {'closed' if c else 'open':<7}: heaviest panel {heaviest[c]:.0f} lb -> {hands_needed(heaviest[c])} people;"
          f" lightest ({light:.0f} lb) -> {hands_needed(light)}")

print("\nD. Wind speed (mph) at which a 20 ft front-wall panel hangs off the vertical by the swing angle, broad face to the wind")
w0 = WALLS[0]
face = 240 * H.plate_height_in / 144
print(f"{'swing':>6}{'Cd':>5}{'open':>8}{'closed':>8}")
Wo = panel_weight(weight_profile(w0, 0, 240, H, S, Lift(closed=False)))
Wc = panel_weight(weight_profile(w0, 0, 240, H, S, Lift(closed=True)))
for sw in (5, 10, 15):
    for cd in (1.2, 1.5, 2.0):
        print(f"{sw:>5}d{cd:>5}{wind_speed_for_swing(Wo, face, sw, cd):>8.1f}{wind_speed_for_swing(Wc, face, sw, cd):>8.1f}")
print(f"(front-wall panel 0-240 in: {face:.0f} ft2 of face, {Wo:.0f} lb open, {Wc:.0f} lb closed)")
