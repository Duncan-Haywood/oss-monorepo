"""Milestone 6k: check the sail-drone model against a published fielded distance.
Saildrone SD 1020 (7 m Explorer) circumnavigated Antarctica 2019-01-19 to 2019-08-03: 11,879 nmi (22,000 km) in 196 days
(saildrone.com press release, 'Saildrone Completes First Autonomous Circumnavigation of Antarctica'). Mission mean km/day
includes the survey route, station time and the Southern Ocean winter. The model drone (sail.py default, 5 m) is run at
steady true wind speeds on a beam reach and on its best angle, to see what wind the fielded mean implies.
Run: PYTHONPATH=src python3 experiments/run_fielded_check.py > experiments/results_fielded_check.txt"""
import datetime
from marine_hull.sail import Drone
days = (datetime.date(2019, 8, 3) - datetime.date(2019, 1, 19)).days
km = 11879 * 1.852
fielded = km / days
print(f"days {days}  km {km:.0f}  fielded mean {fielded:.1f} km/day = {fielded/86.4:.2f} m/s along-track")
d = Drone()
print("tws_m/s  beam_reach_km/day  best_angle_km/day (60-150 deg)")
for tws in (2, 3, 4, 5, 6, 8, 10):
    b = d.speed(tws, 90)
    best = max(d.speed(tws, a) for a in range(60, 151, 10))
    print(f"{tws:6.1f}  {b*86.4:10.0f}  {best*86.4:10.0f}")
print("model drone reaches the fielded mean at a steady wind of about:")
for tws in [x / 4 for x in range(4, 41)]:
    if d.speed(tws, 90) * 86.4 >= fielded:
        print(f"  beam reach: {tws} m/s"); break
for lab, free, cor in (("January", 272, 237), ("July", 219, 179)):
    print(f"{lab}: model buoy median free {free}, corridor {cor} km/day; fielded/free {fielded/free:.2f}, fielded/corridor {fielded/cor:.2f}")
print("solar ceiling 86 km/day: fielded/solar", round(fielded / 86, 2))
