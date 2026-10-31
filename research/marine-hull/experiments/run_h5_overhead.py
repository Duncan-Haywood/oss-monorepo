"""H5 with a term that breaks the proportionality: a fixed per-mission energy that differs by hull.

    PYTHONPATH=src python3 experiments/run_h5_overhead.py > experiments/results_h5_overhead.txt

7c found no mono/cat swap because range is linear in pack energy for every hull. A swap needs
range = (E - E0) / e_km with E0 differing between hulls (launch, recovery, deployment: the
catamaran's wider beam may need more or less). e_km is the best-range energy per km (Wh/km);
the best speed does not depend on E0. Same 2,187-case box as run_h1_h5.py, mass 200 kg, pack 25%
of mass, pack specific energy 150 to 250 Wh/kg (E = 7.5 to 12.5 kWh). The catamaran carries an
extra overhead dE0 (Wh, positive = worse). For each dE0, count cases where the order at 150 and at
250 Wh/kg differs; also the closed-form break-even energy E* = (E0c/ec - E0m/em)/(1/ec - 1/em)
is checked against brute force.
"""
import itertools
from marine_hull.hull import range_km, resistance, RHO_SEA

HOTEL = 30.0
SPEEDS = [i / 20.0 for i in range(10, 61)]


def km_per_wh(mass, length, c_s, k, n, itf, wave):
    vol = mass / RHO_SEA / n
    return max(range_km(1.0, v, resistance(v, length, vol, c_s, k, n_hulls=n, interference=itf,
                                           wave_scale=wave), p_hotel=HOTEL) for v in SPEEDS)


AX = dict(c_s=[2.6, 3.0, 3.4], k_m=[0.10, 0.25, 0.40], k_c=[0.10, 0.25, 0.40], itf=[0.0, 0.15, 0.30],
          l_m=[3.0, 4.0, 5.0], l_c=[3.0, 4.0, 5.0], wave=[0.0, 0.5, 1.0])
cases = []
for c, km_, kc, itf, lm, lc, w in itertools.product(*AX.values()):
    cases.append((km_per_wh(200.0, lm, c, km_, 1, 0.0, w), km_per_wh(200.0, lc, c, kc, 2, itf, w)))
E_LO, E_HI = 0.25 * 200 * 150.0, 0.25 * 200 * 250.0
print(f"{len(cases)} cases; pack energy {E_LO:.0f} to {E_HI:.0f} Wh (150 to 250 Wh/kg of 50 kg)")
cat_ahead = sum(c > m for m, c in cases)
print(f"catamaran out-ranges mono with equal overhead in {cat_ahead} cases ({100*cat_ahead/len(cases):.1f}%)")
for d in (0, 100, 250, 500, 1000, 2000):
    swaps = mismatch = 0
    for m, c in cases:
        lo = (c * (E_LO - d)) > (m * E_LO)
        hi = (c * (E_HI - d)) > (m * E_HI)
        swaps += lo != hi
        # closed form: cat ahead iff c (E - d) > m E  <=>  E (c - m) > c d
        est = (c * d / (c - m)) if c != m else float("inf")
        pred = (c > m and E_LO < est < E_HI) or (c < m and E_LO > est > E_HI) if d else False
        mismatch += bool(pred) != (lo != hi)
    print(f"  catamaran extra overhead {d:5d} Wh: rank swaps {swaps:4d} ({100*swaps/len(cases):5.1f}%); closed form disagrees in {mismatch}")
