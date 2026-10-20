"""Experiments for house-structure. Deterministic, under a second.

    PYTHONPATH=src:../house-framing/src python experiments/run.py   (from research/house-structure)
"""
from pathlib import Path

from house_framing.model import ADVANCED_2X6, CONVENTIONAL_2X4, CONVENTIONAL_2X6, House, Opening, Wall, walls_of
from house_structure import Site, demands, design, max_sds, max_wind_speed, required_solid_ft, wind_pressure
from house_structure.model import NAILING
from house_structure import line_capacity, segments

out = []
P = out.append
h = House()
P("house: 28 x 40 ft, one storey, 8 ft walls, 4:12 roof; segmented shear walls, 15/32 OSB, 8d nails, ASD")
d = demands(h)
P(f"weight for seismic {d['weight']:,.0f} lb; wind pressure at 115 mph, Exposure-B-like Kz 0.70: {wind_pressure(115):.1f} psf strength level")

P("\nA. 115 mph wind and SDS 0.50, conventional 2x6: demand per wall line against capacity at 6 in nailing")
P(f"{'direction / load':22s} {'need lb':>8} {'cap@6in lb':>11} {'D/C':>5} {'solid ft':>9} {'of wall ft':>10} {'loosest ok':>10} {'uplift lb':>9}")
for (dr, k), r in design(h, CONVENTIONAL_2X6, 115, 0.5).items():
    P(f"{dr + ' / ' + k:22s} {r['need_lb']:8,.0f} {r['cap6_lb']:11,.0f} {r['need_lb'] / r['cap6_lb']:5.2f} {r['solid_ft']:9.1f} {r['wall_ft']:10.1f} {str(r['edge_in']) + ' in':>10} {r['uplift_lb']:9,.0f}")
P("(the wall line is the pair of walls parallel to the load; each carries half; uplift = demand unit shear x 8 ft, no dead-load relief; sizing at the nailing's capacity would give more)")

P("\nB. Wind speed sweep (ultimate mph): loosest nailing that works, worst direction, by exposure")
P(f"{'mph':>4} {'Kz':>5} {'psf':>6}  {'across-ridge need lb':>20}  {'edge nailing':>12}  {'solid ft needed @6 in / available':>34}  {'uplift lb':>9}")
for kz, name in ((0.70, "B-like"), (0.98, "C-like")):
    site = Site(kz=kz)
    for v in (90, 115, 130, 150, 170, 200):
        r = design(h, CONVENTIONAL_2X6, v, 0.0, site)[("across ridge", "wind")]
        e = f"{r['edge_in']} in" if r["edge_in"] else "none"
        need6 = required_solid_ft(r["need_lb"], 6, "wind")
        up = f"{r['uplift_lb']:9,.0f}" if r["uplift_lb"] else "        -"
        P(f"{v:4d} {kz:5.2f} {wind_pressure(v, site):6.1f}  {r['need_lb']:20,.0f}  {e:>12}  {need6:12.1f} / {r['solid_ft']:4.1f}  ({name})  {up}")

P("\nC. Seismic design SDS sweep: loosest nailing that works (worst direction)")
for sds in (0.25, 0.5, 1.0, 1.5, 2.0, 3.0):
    rs = design(h, CONVENTIONAL_2X6, 0, sds)
    r = min((rs[(dr, "seismic")] for dr in ("across ridge", "along ridge")), key=lambda x: x["cap6_lb"] / x["need_lb"])
    P(f"SDS {sds:4.2f}: need {r['need_lb']:6,.0f} lb per line, D/C at 6 in {r['need_lb'] / r['cap6_lb']:.2f}, loosest ok {r['edge_in']} in, uplift {r['uplift_lb']:,.0f} lb")

P("\nD. Where does it stop working? (conventional 2x6)")
for e in (6, 4, 3, 2):
    P(f"nailing {e} in edge: wind to {max_wind_speed(h, CONVENTIONAL_2X6, e):4.0f} mph (B-like) / {max_wind_speed(h, CONVENTIONAL_2X6, e, Site(kz=0.98)):4.0f} mph (C-like); seismic to SDS {max_sds(h, CONVENTIONAL_2X6, e):5.2f}")

P("\nE. Framing scheme (sheathing and openings are the same, only wall length changes by the stud depth)")
for s in (CONVENTIONAL_2X4, CONVENTIONAL_2X6, ADVANCED_2X6):
    r = design(h, s, 115, 0.5)[("across ridge", "wind")]
    P(f"{s.name:24s} gable-wall solid {r['solid_ft']:.2f} ft of {r['wall_ft']:.2f} ft; capacity at 6 in {r['cap6_lb']:,.0f} lb")

P("\nF. Glazing: more windows in each gable wall (all 36 x 48 in), 115 mph")
for n in (1, 2, 3, 4, 5, 6):
    hh = House(windows_gable=n)
    r = design(hh, CONVENTIONAL_2X6, 115, 0.5)[("across ridge", "wind")]
    P(f"{n} windows: solid {r['solid_ft']:5.1f} ft of {r['wall_ft']:.1f}, capacity at 6 in {r['cap6_lb']:7,.0f} lb for need {r['need_lb']:,.0f}, loosest ok {r['edge_in']}")

P("\nG. Garage-door front: the gable wall with a garage door in it, 115 mph / SDS 0.50 (demand per line as in A: 2,328 lb wind, 600 lb seismic)")
W = walls_of(h, CONVENTIONAL_2X6)[2].length_in
need_w, need_s = d["across ridge"][0], d["across ridge"][1]
P(f"wall {W / 12:.1f} ft long; a door at one corner leaves one pier, a centred door leaves two; capacities at 6 in and 2 in nailing")
P(f"{'door':>6} {'placement':>9} {'solid ft':>8} {'wind cap@6 lb':>13} {'D/C@6':>6} {'wind cap@2 lb':>13} {'D/C@2':>6} {'max mph @2 in':>13} {'seismic D/C@2':>13}")
for door_ft in (9, 12, 16, 18, 20, 22):
    for place, pos in (("corner", 0.0), ("centred", (W - door_ft * 12) / 2)):
        wall = Wall(W, False, (Opening(pos, door_ft * 12, 0.0),))
        solid = sum(segments(wall, 96.0)) / 12
        c6, c2 = line_capacity(wall, 6, "wind"), line_capacity(wall, 2, "wind")
        s2 = line_capacity(wall, 2, "seismic")
        vmax = 115 * (c2 / need_w) ** 0.5 if c2 else 0.0
        dc6 = f"{need_w / c6:6.2f}" if c6 else "   inf"
        dc2 = f"{need_w / c2:6.2f}" if c2 else "   inf"
        sdc = f"{need_s / s2:13.2f}" if s2 else "          inf"
        P(f"{door_ft:4d}ft {place:>9} {solid:8.1f} {c6:13,.0f} {dc6} {c2:13,.0f} {dc2} {vmax:13.0f} {sdc}")
P("(max mph scales the line demand with V squared at fixed exposure; the two gable lines share the load half and half as in A, so a weak garage line is not relieved by its stiff partner, and a rigid-diaphragm split would load the stiffer line more)")

Path(__file__).with_name("results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
