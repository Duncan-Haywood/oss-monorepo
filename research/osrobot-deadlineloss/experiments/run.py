"""Prints every table in results.txt. Deterministic, no simulation: uses osrobot-pairprice's fitted lines."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_deadlineloss import fleet as F

N = 16
print("# osrobot-deadlineloss results: cheapest fleet (fleet cost + late-yield loss) for 16 equal fields (no new simulation)")
print("# Loss = 2% of field revenue per leaf stage of delay past the window (Knezevic et al. 2003). Stage length, working day and revenue are swept, prices ASSUMED.\\n")

for ha in (0.18, 0.72, 1.62):
    for rev in (1000.0, 2000.0):
        print(f"\\n# Sweep 1: {N} fields of {ha} ha, revenue {rev:.0f} USD/ha, 8 h working day. Total USD/ha = fleet + late loss; window closes at D hours")
        print("  stage_d  window_h   pipe: s,k  fleet  loss  total  mk_h   inline: n  fleet  loss  total  mk_h   pipe/inl")
        for sd in (2, 4, 8):
            for d in (4, 8, 16, 32):
                a = (d * 60.0, rev, sd, 8.0)
                p = F.best_pipeline(N, ha, 4, 16, *a)
                i = F.best_inline(N, ha, 32, *a)
                t = N * ha
                print(f"{sd:8d}{d:10d}   {p[4]:>6},{p[5]:<3}{p[1]/t:6.2f}{p[2]/t:6.2f}{p[0]/t:7.2f}{p[3]/60:6.1f}   {i[4]:>9d}{i[1]/t:7.2f}{i[2]/t:6.2f}{i[0]/t:7.2f}{i[3]/60:6.1f}{p[0]/i[0]:11.2f}")

print("\n# Sweep 2: revenue needed before lateness changes the fleet. 0.72 ha fields, window 8 h, stage 2 days, 8 h day")
print("  revenue_usd_ha  pipe s,k  total  pipe_mk_h   inline n  total  inl_mk_h   pipe/inl")
for rev in (1000, 2000, 5000, 10000, 20000, 50000, 100000):
    a = (8 * 60.0, float(rev), 2, 8.0)
    p = F.best_pipeline(N, 0.72, 4, 16, *a)
    i = F.best_inline(N, 0.72, 32, *a)
    t = N * 0.72
    print(f"{rev:14d}   {p[4]:>5},{p[5]:<3}{p[0]/t:7.2f}{p[3]/60:9.1f}   {i[4]:9d}{i[0]/t:7.2f}{i[3]/60:9.1f}{p[0]/i[0]:11.2f}")

print("\n# Sweep 3: total cost against window, 16 fields of 1.62 ha, revenue 2000 USD/ha, stage 4 days, 8 h day")
print("  window_h  pipe_total  inline_total")
for d in (2, 4, 6, 8, 12, 16, 24, 32):
    a = (d * 60.0, 2000.0, 4, 8.0)
    p = F.best_pipeline(N, 1.62, 4, 16, *a)
    i = F.best_inline(N, 1.62, 32, *a)
    print(f"{d:10d}{p[0] / (N * 1.62):12.2f}{i[0] / (N * 1.62):14.2f}")
