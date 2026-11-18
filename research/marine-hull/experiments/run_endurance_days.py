"""Milestone 4f: mission days and range on one battery, glider (measured Seaglider load) against AUV at sourced hotel loads.

Glider side as run_auv_hotel_sourced.py (hotel 0.0954 W, e_cycle 0 or 1351 J). AUV hotel 8 W (Tethys design estimate),
104 and 175 W (REMUS implied by vendor endurance). Same battery for both: 1.5 kWh (REMUS 100 vendor figure, as 4c).
Range = E_batt / (J per m); days = range / speed. AUV at its best-range speed.
Run: PYTHONPATH=src:experiments python3 experiments/run_endurance_days.py > experiments/results_endurance_days.txt
"""
import itertools, statistics
import run_slocum as r
from marine_hull.glider import auv_energy_per_m

HOTEL = (5410 - 1633) / (11 * 3600.0)
E_CYC = (0.0, 1351.0)
AUV_H = (8.0, 104.0, 175.0)
EB = 1.5e3 * 3600.0   # J


def auv_opt(auv, h):
    L, cs, kf = auv
    return min((auv_energy_per_m(v, L, r.VOL, cs, kf, h), v) for v in r.SPEEDS)


q = lambda xs, p: sorted(xs)[int(p * (len(xs) - 1))]
for e in E_CYC:
    print(f"\n### e_cycle = {e:.0f} J")
    g = []
    for cd0, b, eta in itertools.product(r.GRID['cd0'], r.GRID['b_max'], r.GRID['eta_pump']):
        eg, uh, _ = r.glider_best(cd0, b, eta, e, HOTEL)
        g.append((EB / eg / 1e3, EB / eg / uh / 86400, uh))
    print(f"glider ({len(g)} cases): range km median {statistics.median(x[0] for x in g):.0f} (10th {q([x[0] for x in g],.1):.0f}, 90th {q([x[0] for x in g],.9):.0f}); "
          f"days median {statistics.median(x[1] for x in g):.0f} (10th {q([x[1] for x in g],.1):.0f}, 90th {q([x[1] for x in g],.9):.0f}); speed median {statistics.median(x[2] for x in g):.2f} m/s")
    for h in AUV_H:
        a = []
        for auv in r.GRID['auv']:
            ea, va = auv_opt(auv, h)
            a.append((EB / ea / 1e3, EB / ea / va / 86400, va))
        print(f"AUV hotel {h:g} W ({len(a)} hulls): range km {min(x[0] for x in a):.0f} to {max(x[0] for x in a):.0f}; days {min(x[1] for x in a):.1f} to {max(x[1] for x in a):.1f}; speed {min(x[2] for x in a):.2f} to {max(x[2] for x in a):.2f} m/s")
        wins = sum(x[0] > max(y[0] for y in a) for x in g)
        print(f"   glider range exceeds the best AUV range in {wins}/{len(g)}; the glider needs more than the AUV's days in {sum(x[1] > min(y[1] for y in a) for x in g)}/{len(g)}")
