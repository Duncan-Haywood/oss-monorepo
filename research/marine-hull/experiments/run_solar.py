"""Milestone 5c: deck solar and energy neutrality of the 4 m monohull class.

    PYTHONPATH=src python3 experiments/run_solar.py > experiments/results_solar.txt

Fixed: 200 kg, battery 25% of mass at 200 Wh/kg. Swept (grid, deterministic): see AXES.
"""
import itertools
import math
from marine_hull.hull import power_total, resistance, RHO_SEA
from marine_hull.solar import deck_area, harvest_power, range_km_solar

M, FB, E_BATT = 200.0, 0.25, 200.0
AXES = dict(
    length=[3.0, 4.0, 5.0],
    c_s=[2.6, 3.0, 3.4],
    k_form=[0.10, 0.25, 0.40],
    wave=[0.0, 0.5, 1.0],
    hotel=[20.0, 30.0, 40.0],
    eta_pv=[0.15, 0.20, 0.23],
    derate=[0.70, 0.85],
    insol=[120.0, 180.0, 240.0],
)
VOL = M / RHO_SEA
WH = M * FB * E_BATT
SPEEDS = [i / 20.0 for i in range(10, 61)]   # 0.5 .. 3.0 m/s


def load(v, length, c_s, k, wave, hotel):
    r = resistance(v, length, VOL, c_s, k, wave_scale=wave)
    return power_total(v, r, p_hotel=hotel)


def best_range(length, c_s, k, wave, hotel, p_sol):
    return max((range_km_solar(WH, v, load(v, length, c_s, k, wave, hotel), p_sol), v) for v in SPEEDS)


rows = []
for length, c_s, k, wave, hotel, eta, der, ins in itertools.product(*AXES.values()):
    p_sol = harvest_power(deck_area(length), eta, der, ins)
    p1 = load(1.0, length, c_s, k, wave, hotel)
    neutral_v = [v for v in SPEEDS if load(v, length, c_s, k, wave, hotel) <= p_sol]
    vmax = max(neutral_v) if neutral_v else 0.0
    area_need = p1 / (eta * der * ins)
    base = max((range_km_solar(WH, v, load(v, length, c_s, k, wave, hotel), 0.0), v) for v in SPEEDS)[0]
    sol = best_range(length, c_s, k, wave, hotel, p_sol)[0]
    rows.append((length, p_sol, p1, vmax, area_need, base, sol, deck_area(length)))

n = len(rows)
n1 = sum(1 for r in rows if r[3] >= 1.0)
print(f"cases {n}")
print(f"energy-neutral at 1 m/s: {n1} ({100*n1/n:.1f}%)")
print(f"highest neutral speed >= 1.5 m/s: {sum(1 for r in rows if r[3] >= 1.5)} ({100*sum(1 for r in rows if r[3] >= 1.5)/n:.1f}%)")
print(f"highest neutral speed >= 2.0 m/s: {sum(1 for r in rows if r[3] >= 2.0)}")
vs = sorted(r[3] for r in rows)
print(f"highest neutral speed m/s: min {vs[0]:.2f} median {vs[n//2]:.2f} max {vs[-1]:.2f}")
need = sorted(r[4] for r in rows)
print(f"panel area for neutral 1 m/s, m2: 10th {need[n//10]:.2f} median {need[n//2]:.2f} 90th {need[9*n//10]:.2f}")
print(f"cases where the needed area exceeds the deck: {sum(1 for r in rows if r[4] > r[7])} ({100*sum(1 for r in rows if r[4] > r[7])/n:.1f}%)")
fin = [r for r in rows if not math.isinf(r[6])]
ratio = sorted(r[6] / r[5] for r in fin)
print(f"non-neutral-at-best-speed cases {len(fin)}; solar range / no-solar range: "
      f"10th {ratio[len(fin)//10]:.2f} median {ratio[len(fin)//2]:.2f} 90th {ratio[9*len(fin)//10]:.2f}")
print(f"unbounded range at best speed (neutral somewhere): {n-len(fin)} ({100*(n-len(fin))/n:.1f}%)")
for i, name in enumerate(AXES):
    out = []
    for val in list(AXES.values())[i]:
        sub = [r for r in rows if True]
        idx = [j for j, key in enumerate(itertools.product(*AXES.values())) if key[i] == val]
        out.append(f"{val}: {100*sum(1 for j in idx if rows[j][3] >= 1.0)/len(idx):.0f}%")
    print(f"neutral-at-1-m/s share by {name}: " + ", ".join(out))
