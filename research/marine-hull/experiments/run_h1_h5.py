"""H1 (hotel load) and H5 (flip map) tested as the proposal states them.

    PYTHONPATH=src python3 experiments/run_h1_h5.py > experiments/results_h1_h5.txt

H1: monohull, 200 kg, 4 m, hotel 30 W, battery 25% at 200 Wh/kg. Swept: c_s, k_form, wave_scale
(27 hull-form combinations, the box of run.py). Reports the spread of best range and best speed
and the hotel share of power at the best speed.
H5: mono vs catamaran over run.py's whole box, battery specific energy 150 to 250 Wh/kg.
  (a) battery fixed at 25% of mass (run.py's setting): does any case swap rank?
  (b) battery energy fixed at 5 kWh, so a better pack is lighter and the hull displaces less.
"""
import itertools
from marine_hull.hull import power_total, range_km, resistance, RHO_SEA

HOTEL = 30.0
SPEEDS = [i / 20.0 for i in range(10, 61)]


def best(mass, wh, length, c_s, k, n, itf, wave):
    vol = mass / RHO_SEA / n
    out = (0.0, 0.0, 0.0)
    for v in SPEEDS:
        r = resistance(v, length, vol, c_s, k, n_hulls=n, interference=itf, wave_scale=wave)
        km = range_km(wh, v, r, p_hotel=HOTEL)
        if km > out[0]:
            out = (km, v, 1.0 - HOTEL / power_total(v, r, p_hotel=HOTEL))
    return out


# ---- H1
rows = [best(200.0, 50.0 * 200.0, 4.0, c, k, 1, 0.0, w)
        for c, k, w in itertools.product([2.6, 3.0, 3.4], [0.10, 0.25, 0.40], [0.0, 0.5, 1.0])]
km = [r[0] for r in rows]; v = [r[1] for r in rows]; sh = [r[2] for r in rows]
print(f"H1: {len(rows)} hull-form combinations at 4 m, 200 Wh/kg")
print(f"  best range km: min {min(km):.0f} max {max(km):.0f}  spread (max/min - 1) {100*(max(km)/min(km)-1):.1f}%")
print(f"  best-range speed m/s: min {min(v):.2f} max {max(v):.2f}  spread {100*(max(v)/min(v)-1):.1f}%")
print(f"  propulsion share of power at best speed: min {min(sh):.2f} max {max(sh):.2f}")
for name, idx, vals in (("c_s", 0, [2.6, 3.0, 3.4]), ("k_form", 1, [0.1, 0.25, 0.4]), ("wave", 2, [0.0, 0.5, 1.0])):
    pts = []
    for x in (vals[0], vals[-1]):
        a = [3.0, 0.25, 0.5]; a[idx] = x
        pts.append(best(200.0, 10000.0, 4.0, a[0], a[1], 1, 0.0, a[2])[0])
    print(f"  one at a time, {name} {vals[0]} -> {vals[-1]}: range {pts[0]:.0f} -> {pts[1]:.0f} km ({100*(pts[1]/pts[0]-1):+.1f}%)")

# ---- H5
AX = dict(c_s=[2.6, 3.0, 3.4], k_m=[0.10, 0.25, 0.40], k_c=[0.10, 0.25, 0.40], itf=[0.0, 0.15, 0.30],
          l_m=[3.0, 4.0, 5.0], l_c=[3.0, 4.0, 5.0], wave=[0.0, 0.5, 1.0])
for label, fixed_wh in (("(a) battery 25% of 200 kg", False), ("(b) battery energy fixed at 5 kWh, rest 150 kg", True)):
    swaps = n = 0
    drift = 0.0
    for c, km_, kc, itf, lm, lc, w in itertools.product(*AX.values()):
        order = []
        ratios = []
        for e in (150.0, 200.0, 250.0):
            if fixed_wh:
                mass, wh = 150.0 + 5000.0 / e, 5000.0
            else:
                mass, wh = 200.0, 50.0 * e
            m = best(mass, wh, lm, c, km_, 1, 0.0, w)[0]
            ct = best(mass, wh, lc, c, kc, 2, itf, w)[0]
            order.append(ct > m); ratios.append(ct / m)
        n += 1
        swaps += len(set(order)) > 1
        drift = max(drift, max(ratios) / min(ratios) - 1)
    print(f"H5 {label}: {n} cases, mono/cat rank swaps over 150 to 250 Wh/kg: {swaps}; max change in cat/mono ratio {100*drift:.4f}%")
