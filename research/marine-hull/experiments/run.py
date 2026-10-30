"""Survey-boat range, monohull against catamaran, over a swept parameter box.

    PYTHONPATH=src python3 experiments/run.py > experiments/results.txt

Fixed: total mass 200 kg, battery 25% of mass, hotel load 30 W. Swept (grid, deterministic):
see AXES. Question: how often does a catamaran of two slender demi-hulls out-range a monohull
at its best speed, and does the answer survive the unsourced inputs?
"""
import itertools
import math
from marine_hull.hull import G, power_total, range_km, resistance, RHO_SEA, wetted_area

M, FB, HOTEL = 200.0, 0.25, 30.0
AXES = dict(
    c_s=[2.6, 3.0, 3.4],                 # S / sqrt(V L), hull-form constant (unsourced)
    k_form=[0.10, 0.25, 0.40],           # form factor, monohull
    k_cat=[0.10, 0.25, 0.40],            # form factor, slender demi-hull
    interf=[0.0, 0.15, 0.30],            # catamaran viscous interference added to k
    l_mono=[3.0, 4.0, 5.0],              # monohull length, m
    l_cat=[3.0, 4.0, 5.0],               # demi-hull length, m
    wave=[0.0, 0.5, 1.0],                # wave_scale on the placeholder wave term
    e_batt=[150.0, 200.0, 250.0],        # Wh/kg pack level
)


def best_range(volume, length, c_s, k, n, interf, wave, e_batt):
    wh = M * FB * e_batt
    best = (0.0, 0.0)
    for i in range(10, 61):
        v = i / 20.0   # 0.5 .. 3.0 m/s
        r = resistance(v, length, volume, c_s, k, n_hulls=n, interference=interf, wave_scale=wave)
        km = range_km(wh, v, r, p_hotel=HOTEL)
        best = max(best, (km, v))
    return best


vol = M / RHO_SEA
rows = []
for c_s, km_, kc, itf, lm, lc, w, e in itertools.product(*AXES.values()):
    mono = best_range(vol, lm, c_s, km_, 1, 0.0, w, e)
    cat = best_range(vol / 2, lc, c_s, kc, 2, itf, w, e)
    rows.append((c_s, km_, kc, itf, lm, lc, w, e, mono, cat))

n = len(rows)
wins = sum(1 for r in rows if r[9][0] > r[8][0])
ratios = sorted(r[9][0] / r[8][0] for r in rows)
print(f"cases {n}; catamaran out-ranges monohull in {wins} ({100*wins/n:.1f}%)")
print(f"range ratio cat/mono: min {ratios[0]:.2f}  median {ratios[n//2]:.2f}  max {ratios[-1]:.2f}")
mono_r = sorted(r[8][0] for r in rows)
print(f"monohull best range km: min {mono_r[0]:.0f} median {mono_r[n//2]:.0f} max {mono_r[-1]:.0f}")
print(f"monohull speed at best range m/s: median {sorted(r[8][1] for r in rows)[n//2]:.2f}")
# same-length slice: which hull wins when lengths are equal?
eq = [r for r in rows if r[4] == r[5]]
print(f"equal length cases {len(eq)}: cat wins {sum(1 for r in eq if r[9][0] > r[8][0])}")
# one-at-a-time effect on win share
for i, name in enumerate(AXES):
    out = []
    for val in list(AXES.values())[i]:
        sub = [r for r in rows if r[i] == val]
        out.append(f"{val}: {100*sum(1 for r in sub if r[9][0] > r[8][0])/len(sub):.0f}%")
    print(f"cat win share by {name}: " + ", ".join(out))
