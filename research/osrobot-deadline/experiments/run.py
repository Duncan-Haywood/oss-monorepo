"""Prints every table in results.txt. Deterministic, no simulation: uses osrobot-pairprice's fitted lines."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_deadline import fleet as F

N = 16
SIZES = (0.18, 0.72, 1.62)
print("# osrobot-deadline results: cheapest fleet that finishes 16 equal fields by a deadline (no new simulation)")
print("# Held fleets, all prices ASSUMED (see osrobot-pairprice/econ.py). Pipeline = s scouts + k treaters; inline = n robots.\n")

print("# Sweep 1: fastest possible finish (hours) for 16 fields. Pipeline floor = scout-serial time, unlimited treaters")
print("      ha  pipe_1scout_h  pipe_2scouts_h  pipe_4scouts_h  inline_h(32 robots)")
for ha in SIZES:
    print(f"{ha:8.2f}{F.floor_minutes(N, ha, 1) / 60:15.1f}{F.floor_minutes(N, ha, 2) / 60:16.1f}"
          f"{F.floor_minutes(N, ha, 4) / 60:16.1f}{F.inline_makespan(N, ha, 32) / 60:21.1f}")

for ha in SIZES:
    print(f"\n# Sweep 2: cheapest fleet by deadline, {N} fields of {ha} ha (USD per hectare; '-' = cannot finish)")
    print("  deadline_h  pipe(1 scout)  s,k   pipe(<=4 scouts)  s,k   inline   n   pipe1/inl  pipe4/inl")
    ha_total = N * ha
    for d in (4, 6, 8, 12, 16, 24, 48):
        p1 = F.cheapest_pipeline(N, ha, d * 60, 1)
        p4 = F.cheapest_pipeline(N, ha, d * 60, 4)
        i = F.cheapest_inline(N, ha, d * 60)
        f = lambda r: f"{r[0] / ha_total:13.2f}" if r else f"{'-':>13}"
        sk = lambda r: f"{r[2]},{r[3]}".rjust(5) if r else f"{'-':>5}"
        ratio = lambda r: f"{r[0] / i[0]:10.2f}" if r and i else f"{'-':>10}"
        print(f"{d:12d}{f(p1)}{sk(p1)}{f(p4):>18}{sk(p4)}{(f'{i[0] / ha_total:9.2f}' if i else '        -')}{(f'{i[2]:4d}' if i else '   -')}{ratio(p1)}{ratio(p4)}")
