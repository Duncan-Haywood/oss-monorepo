"""Prints every table in results.txt. Deterministic, no simulation: osrobot-pairprice's fitted lines, osrobot-deadlineloss's model,
purchase prices swept from the assumed set to list prices (see README 'Parameters')."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_sourcedprices import fleet as F

N = 16
# (name, inline, scout, treater, endurance min). Sourced: Holybro X500 V2 kit with Pixhawk 6C, 609 USD, no battery, 18 min hover;
# AgileX Scout Mini, 4500 USD (RobotLAB). Inline robot and treater are priced as the same ground platform; add-ons are not sourced.
SETS = [
    ("assumed (deadlineloss)", 5000, 2500, 3500, 20),
    ("sourced platforms", 4500, 609, 4500, 18),
    ("sourced + 400 USD scout add-ons", 4500, 1009, 4500, 18),
    ("sourced + 1500 USD inline tool", 6000, 609, 4500, 18),
    ("sourced, 12 min loaded flight", 4500, 609, 4500, 12),
]
print("# osrobot-sourcedprices results: 16 equal fields, 2% yield loss per leaf stage late (Knezevic et al. 2003), 8 h day, 4-day stage")
print("# Prices: list prices of a Holybro X500 V2 kit and an AgileX Scout Mini (README). Add-ons, tools and loaded endurance are NOT sourced: swept.\n")

for rev in (1000.0, 2000.0):
    for ha in (0.18, 0.72, 1.62):
        print(f"\n# Sweep 1: {N} fields of {ha} ha, revenue {rev:.0f} USD/ha. Total USD/ha = fleet + late loss, window 8 h and 24 h")
        print("  window_h  priceset                              pipe: s,k  total   inline: n  total   pipe/inl")
        for d in (8, 24):
            for name, ci, cs, ct, en in SETS:
                F.configure(ci, cs, ct, en)
                a = (d * 60.0, rev, 4, 8.0)
                p = F.best_pipeline(N, ha, 4, 16, *a)
                i = F.best_inline(N, ha, 32, *a)
                t = N * ha
                print(f"{d:8d}  {name:36s}{p[4]:>4},{p[5]:<3}{p[0]/t:7.2f}   {i[4]:>8d}{i[0]/t:7.2f}{p[0]/i[0]:11.2f}")
F.configure(5000, 2500, 3500, 20)

print("\n# Sweep 2: break-even ground price. Sourced scout (609 USD, 18 min), inline robot = ground platform price; 1.62 ha, window 12 h, revenue 2000, stage 4 d")
print("  ground_usd  pipe_total  inline_total  pipe/inl")
for g in (1500, 2500, 3500, 4500, 6000, 9000):
    F.configure(g, 609, g, 18)
    a = (12 * 60.0, 2000.0, 4, 8.0)
    p = F.best_pipeline(N, 1.62, 4, 16, *a)
    i = F.best_inline(N, 1.62, 32, *a)
    t = N * 1.62
    print(f"{g:11d}{p[0]/t:12.2f}{i[0]/t:14.2f}{p[0]/i[0]:10.2f}")
F.configure(5000, 2500, 3500, 20)
