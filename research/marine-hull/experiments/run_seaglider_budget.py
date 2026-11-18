"""Milestone 4d: glider against AUV with the glider's non-propulsion load and dive energy from a measured Seaglider budget.

Source: Table 1 of the Ocean Science preprint os-2019-36 author response (Seaglider sg564, dive 227,
Iceland Sea, 5 Nov 2015, 1000 m, 11 h, +-21 cc): total 5410 J (136 mW mean); buoyancy engine 1633 J
(inflection/apogee 1172, stratification 282, surface 179); everything else 3777 J
(attitude 414, controller 2028, sensors 321, GPS+Iridium 1014).
Hotel (non-buoyancy) = 3777 J / 39600 s = 0.0954 W. The model's pump term covers pumping work, so the
per-cycle energy not in it is the inflection+surface electronics, bracketed 0 and 1351 J (1172+179).
The AUV's hotel load is unsourced and now swept in absolute watts (the old "x glider hotel" is meaningless at 0.095 W).
Run: PYTHONPATH=src:experiments python3 experiments/run_seaglider_budget.py > experiments/results_seaglider_budget.txt
"""
import itertools, statistics
import run_slocum as r

HOTEL = (5410 - 1633) / (11 * 3600.0)
E_CYC = (0.0, 1172.0 + 179.0)
AUV_H = (0.5, 1.0, 2.0, 5.0, 20.0)
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
