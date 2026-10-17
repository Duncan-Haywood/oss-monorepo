"""Experiments for house-offsite. Deterministic.  python experiments/run.py > experiments/results.txt"""
import sys
from dataclasses import replace
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent / "src"), str(HERE.parent.parent / "house-framing" / "src")]

from house_offsite import Process, compare, pack_sheets, plan_trips, shell_quantities  # noqa: E402
from house_offsite.model import labour_hours  # noqa: E402

DRAWS = 4000
print("house-offsite: factory against site, exterior-wall shell of the house-framing house (advanced 2x6 @24)")
print("All rates are assumptions of this project (see Process); counts and sheets are computed.\n")

q = shell_quantities(max_panel_ft=24)
print(f"Framing members {q['takeoff']['pieces']}, sheathed area {q['sheathing_area_ft2']:.0f} ft2, "
      f"4x9 sheet lower bound {q['lower_bound_sheets']} sheets\n")

print("A. Panel layout and sheathing sheets by handling limit (site = as-you-go first fit, keep offcuts >= 12 in;"
      " factory = largest-first best fit, keep >= 4 in)")
print(f"{'max panel':>10} {'panels':>7} {'joints':>7} {'trips':>6} {'site sheets':>12} {'factory sheets':>15} {'bound':>6}")
for ft in (12, 16, 24, 32, 44):
    try:
        qq = shell_quantities(max_panel_ft=ft)
    except ValueError as e:
        print(f"{ft:>7} ft  n/a ({e})")
        continue
    s = len(pack_sheets(qq["site_pieces"], order="given", fit="first", min_keep=12))
    f = len(pack_sheets(qq["fac_pieces"], order="area", fit="best", min_keep=4))
    print(f"{ft:>7} ft {len(qq['panels']):>7} {qq['joints']:>7} {len(plan_trips(qq['panels'])):>6} {s:>12} {f:>15} {qq['lower_bound_sheets']:>6}")

print("\nB. Layout against algorithm at 24 ft panels (sheets)")
print(f"{'pieces from':>14} {'as-you-go':>10} {'largest-first':>14} {'largest+best':>13} {'with rotation':>14}")
for name, key in (("site layout", "site_pieces"), ("panel layout", "fac_pieces")):
    r = [len(pack_sheets(q[key], order=o, fit=f, min_keep=k, rotate=rot)) for o, f, k, rot in
         (("given", "first", 12, False), ("area", "first", 4, False), ("area", "best", 4, False), ("area", "best", 4, True))]
    print(f"{name:>14} {r[0]:>10} {r[1]:>14} {r[2]:>13} {r[3]:>14}")

print("\nC. Baseline (default Process, 24 ft panels, %d draws)" % DRAWS)
p = Process()
r = compare(p, draws=DRAWS)
sh, fh = labour_hours(r["q"], p, r["site_sheets"], r["fac_sheets"])
print(f"labour hours: site {sh:.0f}, factory {fh:.0f} plus {r['q']['joints']} joints and {len(r['q']['panels'])} panel sets on site")
print(f"calendar days on the critical path after the foundation starts: site-built {r['site_days']:.2f}, "
      f"panelised {r['off_days']:.2f}")
print(f"assumed cost: site-built ${r['site_cost']:,.0f}, panelised ${r['off_cost']:,.0f} "
      f"({(r['off_cost'] / r['site_cost'] - 1) * 100:+.1f}%), trips {len(r['trips'])}")

print("\nD. Panelised minus site-built, by factory labour ratio and weather loss (days; assumed cost %)")
ratios = (0.3, 0.45, 0.6, 0.8, 1.0)
print(f"{'weather':>8} " + " ".join(f"{'ratio ' + str(x):>16}" for x in ratios))
for w in (0.0, 0.15, 0.30):
    cells = []
    for x in ratios:
        rr = compare(replace(p, weather_loss=w, factory_ratio=x), draws=DRAWS)
        cells.append(f"{rr['off_days'] - rr['site_days']:+6.2f}d {100 * (rr['off_cost'] / rr['site_cost'] - 1):+5.1f}%")
    print(f"{w:>8.2f} " + " ".join(f"{c:>16}" for c in cells))


from house_framing.model import House  # noqa: E402


def at(length, **kw):
    return compare(replace(p, **kw), house=House(length_ft=length), draws=DRAWS)


print("\nE. Same house, longer: fixed costs (a crane day, a trip, panel sets) against labour that grows with size")
print(f"{'length ft':>10} {'members':>8} {'panels':>7} {'site d':>7} {'panel d':>8} {'site $':>8} {'panel $':>8} {'diff %':>7}")
for L in (24, 32, 40, 56, 80, 120):
    rr = at(L)
    print(f"{L:>10} {rr['q']['takeoff']['pieces']:>8} {len(rr['q']['panels']):>7} {rr['site_days']:>7.2f} "
          f"{rr['off_days']:>8.2f} {rr['site_cost']:>8,.0f} {rr['off_cost']:>8,.0f} "
          f"{100 * (rr['off_cost'] / rr['site_cost'] - 1):>+7.1f}")

print("\nF0. Shortest house length (ft, step 2) at which panelising is cheaper, by factory labour ratio and crane-day cost")
print(f"{'ratio':>6} " + " ".join(f"{'crane $' + str(c):>14}" for c in (0, 750, 1500)))
for x in (0.3, 0.45, 0.6, 0.8):
    cells = []
    for c in (0, 750, 1500):
        win = next((L for L in range(24, 201, 2) if (lambda r: r['off_cost'] < r['site_cost'])(
            compare(replace(p, factory_ratio=x, crane_day_cost=c), house=House(length_ft=L), draws=50))), None)
        cells.append("none to 200" if win is None else str(win))
    print(f"{x:>6} " + " ".join(f"{c:>14}" for c in cells))

print("\nF1. Shortest house length (ft, step 2) at which panelised finishes the shell in fewer days, by weather loss")
for w in (0.0, 0.15, 0.30):
    win = next((L for L in range(24, 201, 2) if (lambda r: r['off_days'] < r['site_days'])(
        compare(replace(p, weather_loss=w), house=House(length_ft=L), draws=1500))), None)
    print(f"weather {w:.2f}: {'none to 200' if win is None else win}")

print("\nG. What the fixed overheads cost (panelised cost minus site-built, $, at ratio 0.6, weather 0.15)")
for label, kw in (("baseline", {}), ("no plant overhead", {"plant_overhead": 0.0}),
                  ("double plant overhead", {"plant_overhead": 0.5}), ("no crane day cost", {"crane_day_cost": 0.0}),
                  ("factory wage = site wage", {"factory_rate": 55.0}), ("trip cost x3", {"trip_cost": 2700.0})):
    rr = compare(replace(p, **kw), draws=500)
    print(f"{label:>26}: {rr['off_cost'] - rr['site_cost']:+9,.0f}")
