"""Experiments for house-diaphragm. Deterministic, under a second.

    PYTHONPATH=src:../house-structure/src:../house-framing/src python experiments/run.py   (from research/house-diaphragm)
"""
from pathlib import Path

from house_diaphragm import flexible_split, rigid_split, wall_stiffness
from house_framing.model import CONVENTIONAL_2X6, House, Opening, Wall, walls_of
from house_structure.model import demands, line_capacity

out = []
P = out.append
h = House()
walls = walls_of(h, CONVENTIONAL_2X6)
gable, long_f, long_r = walls[2], walls[0], walls[1]
W = gable.length_in
need_total = 2 * demands(h)["across ridge"][0]  # 115 mph, both gable lines together
P(f"house 28 x 40 ft; wind across the ridge at 115 mph, total ASD base shear {need_total:,.0f} lb on the two gable lines")
P("line A = garage-door gable wall (door at its corner or centred); line B = the other gable wall (one window)")
P("flexible diaphragm: half each; rigid diaphragm: stiffness-based with the long walls resisting twist; capacity at 6 in nailing, ASD")

for r in (0.0, 1.0, 3.0):
    P(f"\nbending-softness r = {r} (0 = pure shear stiffness)")
    P(f"{'door':>5} {'place':>8} {'kA':>6} {'kB':>6} {'flex A lb':>9} {'rigid A lb':>10} {'cap A lb':>9} {'D/C flex':>8} {'D/C rigid':>9} {'B D/C rigid':>11}")
    kb = wall_stiffness(gable, 96.0, r)
    kl = wall_stiffness(long_f, 96.0, r) + wall_stiffness(long_r, 96.0, r)
    capb = line_capacity(gable, 6, "wind")
    for door_ft in (9, 12, 16, 20, 22):
        for place, pos in (("corner", 0.0), ("centred", (W - door_ft * 12) / 2)):
            wa = Wall(W, False, (Opening(pos, door_ft * 12, 0.0),))
            ka, capa = wall_stiffness(wa, 96.0, r), line_capacity(wa, 6, "wind")
            fl = flexible_split(need_total, ka, kb)[0]
            ra, rb, _ = rigid_split(need_total, ka, kb, kl, h.length_ft, h.width_ft)
            dca = lambda f: f"{f / capa:8.2f}" if capa else "     inf"
            P(f"{door_ft:3d}ft {place:>8} {ka:6.2f} {kb:6.2f} {fl:9,.0f} {ra:10,.0f} {capa:9,.0f} {dca(fl)} {dca(ra):>9} {rb / capb:11.2f}")

Path(__file__).with_name("results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
