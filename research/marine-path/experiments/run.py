"""Milestone 1: LOS vs integral LOS across current, sea state, look-ahead and gain. Stdlib, seeded."""
import itertools
import statistics as st
import sys
sys.path.insert(0, "src")
from marine_path.sim import run
from marine_path.guidance import steady_los_offset

CY = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5]
HS = [0.0, 0.25, 0.5, 1.0]
DELTA = [6.0, 12.0, 24.0]
KAPPA = [0.5, 1.0, 2.0]
SEEDS = [1, 2, 3]
T = 600.0

rows = []
for cy, hs, d in itertools.product(CY, HS, DELTA):
    seeds = [0] if hs == 0 else SEEDS
    los = [run("los", delta=d, cur=(0, cy), hs=hs, seed=s, T=T) for s in seeds]
    l_rms = st.mean(r["rms_xte"] for r in los)
    l_e = st.mean(r["energy_wh"] / (r["x"] / 1000) for r in los)
    for k in KAPPA:
        il = [run("ilos", delta=d, kappa=k, cur=(0, cy), hs=hs, seed=s, T=T) for s in seeds]
        rows.append((cy, hs, d, k, l_rms, st.mean(r["rms_xte"] for r in il), l_e,
                     st.mean(r["energy_wh"] / (r["x"] / 1000) for r in il)))

print("# cy hs delta kappa  los_rms ilos_rms  los_Wh/km ilos_Wh/km")
for r in rows:
    print("%.1f %.2f %4.0f %.1f  %7.3f %7.3f  %6.2f %6.2f" % r)
print()
for d in DELTA:
    print("analytic LOS offset delta=%g, cy=0.3: %.3f m" % (d, steady_los_offset(d, 1.0, 0.3)))
sel = [r for r in rows if r[0] >= 0.2]
better = [r[5] < r[4] for r in sel]
print("H2: ILOS rms < LOS rms in %d of %d cases with cy >= 0.2" % (sum(better), len(sel)))
for hs in HS:
    s = [r for r in sel if r[1] == hs]
    print("   hs %.2f: %d of %d" % (hs, sum(r[5] < r[4] for r in s), len(s)))
dev = [abs(r[7] - r[6]) / r[6] for r in rows]
print("H3: |ILOS - LOS| energy per ground km: median %.2f%%, max %.2f%%" % (100 * st.median(dev), 100 * max(dev)))
print("worst ILOS case (largest ilos_rms/los_rms, cy>=0.2):", max(sel, key=lambda r: r[5] / r[4]))
ratio = [r[5] / r[4] for r in sel]
print("ilos/los rms ratio, cy>=0.2: median %.3f, max %.3f" % (st.median(ratio), max(ratio)))
