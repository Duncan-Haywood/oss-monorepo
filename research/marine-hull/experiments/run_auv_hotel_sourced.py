"""Milestone 4e: 4d rerun with sourced AUV hotel loads (Tethys 8 W design estimate; REMUS 104 to 175 W implied by vendor endurance, 4c).
Glider side (as 4d): Table 1 of the Ocean Science preprint os-2019-36 author response (Seaglider sg564, dive 227,
Iceland Sea, 5 Nov 2015, 1000 m, 11 h, +-21 cc): total 5410 J (136 mW mean); buoyancy engine 1633 J
(inflection/apogee 1172, stratification 282, surface 179); everything else 3777 J
(attitude 414, controller 2028, sensors 321, GPS+Iridium 1014).
Hotel (non-buoyancy) = 3777 J / 39600 s = 0.0954 W. The model's pump term covers pumping work, so the
per-cycle energy not in it is the inflection+surface electronics, bracketed 0 and 1351 J (1172+179).
AUV hotel is swept in absolute watts, now including the sourced points 8 W, 104 W and 175 W.
Sources: Bellingham et al., Efficient Propulsion for the Tethys Long-Range AUV (AUV 2010): hotel load 8 W "achievable" for a CTD+O2+nitrate+velocity payload at a duty cycle (design estimate); propulsion measured ~12 W at 0.96 m/s.
Steinberg et al., Analysis of Propulsion Methods for Long-Range AUVs (MTS J.): REMUS100 total "O(10 W)" for 22 h, inconsistent with 1.5 kWh and 12 h, so not used.
Run: PYTHONPATH=src:experiments python3 experiments/run_auv_hotel_sourced.py > experiments/results_auv_hotel_sourced.txt
"""
import itertools, statistics
import run_slocum as r

HOTEL = (5410 - 1633) / (11 * 3600.0)
E_CYC = (0.0, 1172.0 + 179.0)
AUV_H = (0.5, 2.0, 5.0, 8.0, 12.0, 104.0, 175.0)
print(f"glider hotel {HOTEL:.4f} W (sourced); total 5410 J / 39600 s = {5410/39600*1e3:.0f} mW")
for e in E_CYC:
    print(f"\n### e_cycle = {e:.0f} J")
    res = {h: [0, 0] for h in AUV_H}; bes = []; eg_all = []
    for cd0, b, eta, auv in itertools.product(r.GRID['cd0'], r.GRID['b_max'], r.GRID['eta_pump'], r.GRID['auv']):
        eg, uh, _ = r.glider_best(cd0, b, eta, e, HOTEL)
        eg_all.append(eg)
        for h in AUV_H:
            res[h][0] += 1; res[h][1] += eg < r.auv_best(auv, h)
        bes.append(r.breakeven(auv, eg))
    n = len(eg_all); q = lambda xs, p: sorted(xs)[int(p*(len(xs)-1))]
    print(f"cases {n}; glider J/m median {statistics.median(eg_all):.2f}")
    for h in AUV_H: print(f"AUV hotel {h:g} W: glider farther in {res[h][1]}/{n} ({100*res[h][1]/n:.1f}%)")
    pos = [x for x in bes if x > 0]
    print(f"break-even AUV hotel (W): defined {len(pos)}/{n}; median {statistics.median(pos):.2f} (10th {q(pos,.1):.2f}, 90th {q(pos,.9):.2f}); AUV wins at zero hotel: {n-len(pos)}")
