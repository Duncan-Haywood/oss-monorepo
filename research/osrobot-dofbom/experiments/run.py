"""Write results.txt: full bill of materials of a 2 to 6 joint feeding arm. Stdlib only, instant."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_dofbom.bom import *

out = ["# Sweep 1: full BOM (servos, board, cable, PSU, clamps, screwdrivers; printed parts excluded) by joint count and servo channel",
       f"{'servo_channel':<28} {'servo_usd':>9} " + " ".join(f"{n}j_usd".rjust(7) for n in range(2, 7)) + f" {'ratio_6j/2j':>11} {'fixed_share_2j':>14} {'fixed_share_6j':>14}"]
for name, su in SERVO_CHANNELS.items():
    out.append(f"{name:<28} {su:9.2f} " + " ".join(f"{total(n, servo_usd=su):7.2f}" for n in range(2, 7))
               + f" {ratio(6, 2, servo_usd=su):11.2f} {fixed_share(2, servo_usd=su):14.2f} {fixed_share(6, servo_usd=su):14.2f}")
out.append("")
out += ["# Sweep 2: the same, servo-only cost ratio is 3.00 by construction (osrobot-dof reported servo cost alone)",
        f"{'servo_channel':<28} {'servo_only_6j/2j':>16} {'full_bom_6j/2j':>14} {'extra_usd_2j_to_6j':>18}"]
for name, su in SERVO_CHANNELS.items():
    out.append(f"{name:<28} {6*su/(2*su):16.2f} {ratio(6, 2, servo_usd=su):14.2f} {total(6, servo_usd=su) - total(2, servo_usd=su):18.2f}")
out.append("")
out += ["# Sweep 3: printed links added (swept filament price per kg, not sourced; 0.100 kg of links at osrobot-dof's line density), Alibaba servo",
        f"{'filament_usd_kg':>15} {'2j_usd':>7} {'6j_usd':>7} {'ratio':>6}"]
for fp in (0.0, *FILAMENT_USD_PER_KG):
    out.append(f"{fp:15.0f} {total(2, filament_usd_per_kg=fp):7.2f} {total(6, filament_usd_per_kg=fp):7.2f} {ratio(6, 2, filament_usd_per_kg=fp):6.3f}")
out.append("")
out += ["# Sweep 4: servo price at which the full-BOM ratio 6j/2j reaches a target (limit 3.0 as servo price grows)",
        f"{'target_ratio':>12} {'servo_usd':>9}"]
for t in (1.8, 2.0, 2.5, 2.9):
    out.append(f"{t:12.1f} {servo_price_for_ratio(t):9.2f}")
out.append("")
out += ["# Sweep 5: full BOM by joint count (the figure's data)",
        f"{'joints':>6} " + " ".join(f"{c.split()[0]}_usd".rjust(12) for c in SERVO_CHANNELS)]
for n in range(2, 7):
    out.append(f"{n:>6} " + " ".join(f"{total(n, servo_usd=su):12.2f}" for su in SERVO_CHANNELS.values()))
out.append("")
out += ["# Check against the published tables: one follower arm (six servos incl. gripper) and two arms",
        f"follower_total_model {total(5, gripper=True):.2f}  published 121.94",
        f"two_arm_total_model  {12*13.89 + 2*10.6 + 7 + 2*10 + 9 + 6:.2f}  published 229.88"]
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
