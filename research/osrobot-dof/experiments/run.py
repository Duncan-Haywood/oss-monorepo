"""Write results.txt: tip mass, servo cost and lip force for planar feeding arms with 2 to 6 joints. Stdlib only."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_dof.model import *

SEEDS = range(200)
SERVO_USD = (26.00, 49.22)   # per 12 V 30 kg.cm servo: AIFit Lab (backordered) and RobotShop US, both read 2026-10-19
out = []
out += ["# Sweep 1: arm joints, operational-space tip mass along the approach and servo cost (servos only; no other part priced)",
        f"{'joints':>6} {'tip_mass_kg':>11} {'servo_usd_low':>13} {'servo_usd_high':>14}"]
for n in range(2, 7):
    out.append(f"{n:>6} {tip_mass(n):11.3f} {n*SERVO_USD[0]:13.2f} {n*SERVO_USD[1]:14.2f}")
out.append("")
hdr = f"{'design':<24} {'speed':>5} {'fed':>5} {'safe':>5} {'touch':>5} {'peak_mean':>9} {'peak_max':>8} {'time_s':>7}"
def row(label, m, v):
    r = summarise(Design("camera", v), 0.03, SEEDS, m)
    out.append(f"{label:<24} {v:5.2f} {r['success']:5.2f} {r['safe']:5.2f} {r['touch']:5.2f} {r['peak_mean']:9.2f} {r['peak_max']:8.2f} {r['time_mean']:7.2f}")
out += [f"# Sweep 2: lip contact with the arm's own tip mass (camera design, 30 mm sway, {len(SEEDS)} trials; safe = fed with peak <= {F_SAFE} N)", hdr]
for v in (0.1, 0.2):
    row("osrobot-assist, 0.30 kg", M_TIP, v)
    for n in range(2, 7):
        row(f"{n} joints, {tip_mass(n):.2f} kg", tip_mass(n), v)
    out.append("")
out += ["# Sweep 3: tip mass against the servo rotor inertia (the geared-up rotor dominates), 2 and 6 joints",
        f"{'rotor_kg_m2':>11} {'mass_2j_kg':>10} {'mass_6j_kg':>10}"]
for ir in (0.0, 1e-8, 1e-7, 3e-7):
    out.append(f"{ir:11.0e} {tip_mass(2, i_rotor=ir):10.3f} {tip_mass(6, i_rotor=ir):10.3f}")
out.append("")
out += ["# Sweep 4: tip mass against the servo mass carried at each joint (rotor inertia 1e-07), 2 and 6 joints",
        f"{'servo_kg':>11} {'mass_2j_kg':>10} {'mass_6j_kg':>10}"]
for ms in (0.03, 0.06, 0.12):
    out.append(f"{ms:11.2f} {tip_mass(2, m_servo=ms):10.3f} {tip_mass(6, m_servo=ms):10.3f}")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
