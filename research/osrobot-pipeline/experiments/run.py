"""Prints every table in results.txt. Deterministic, no simulation: uses osrobot-pairprice's fitted lines."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_pipeline import fleet as F

SIZES = (0.18, 0.72, 1.62)
COUNTS = (1, 2, 4, 8, 16, 32)

print("# osrobot-pipeline results: deterministic scheduling on osrobot-pairprice's fitted per-field minutes (no new simulation)")
print("# Held fleets: every machine charged for the whole makespan. All prices ASSUMED (see osrobot-pairprice/econ.py).")
print("# Scout busy per field = 8 min set-up + flight + battery swaps; treater busy = 3 min set-up + treating minutes.\n")

print("# Sweep 1: treaters one scout can keep busy (treater busy / scout busy, per field)")
print("      ha  scout_min  treater_min  inline_min  saturation_k")
for ha in SIZES:
    print(f"{ha:8.2f}{F.scout_busy(ha):11.1f}{F.treater_busy(ha):13.1f}{F.inline_busy(ha):12.1f}{F.saturation_k(ha):14.2f}")

print("\n# Sweep 2: cheapest fleet for a farm of n equal fields (best k treaters with one scout; best n inline robots)")
print("      ha  fields  best_k  pipe_USD/ha  pipe_h  best_n  inl_USD/ha  inl_h  pipe/inl")
for ha in SIZES:
    for n in COUNTS:
        pu, pm, k = F.best(F.pipeline_cost, n, ha)
        iu, im, m = F.best(F.inline_cost, n, ha)
        print(f"{ha:8.2f}{n:8d}{k:8d}{pu / (n * ha):13.2f}{pm / 60:8.1f}{m:8d}{iu / (n * ha):12.2f}{im / 60:7.1f}{pu / iu:10.2f}")

print("\n# Sweep 3: same job, same finish time. Pipeline vs inline fleet sized to finish no later (0.72 ha fields, 16 fields)")
ha, n = 0.72, 16
print("  k  pipe_h  pipe_USD/ha | inline n to match  inl_USD/ha  pipe/inl")
for k in range(1, 6):
    pu, pm = F.pipeline_cost(n, ha, k)
    cand = [(F.inline_cost(n, ha, m), m) for m in range(1, 17) if F.inline_makespan(n, ha, m) <= pm + 1e-9]
    if cand:
        (iu, im), m = min(cand)
        print(f"{k:3d}{pm / 60:8.1f}{pu / (n * ha):13.2f} |{m:18d}{iu / (n * ha):12.2f}{pu / iu:10.2f}")
    else:
        print(f"{k:3d}{pm / 60:8.1f}{pu / (n * ha):13.2f} |{'none':>18}")
