"""Experiments for house-nailedwall. Deterministic, under a second.

    PYTHONPATH=src:../house-diaphragm/src:../house-structure/src:../house-framing/src python experiments/run.py
"""
from pathlib import Path

from house_diaphragm.model import flexible_split, rigid_split
from house_framing.model import CONVENTIONAL_2X6, House, Opening, Wall, walls_of
from house_nailedwall.model import Params, wall_stiffness
from house_structure.model import demands, line_capacity

out = []
P = out.append
h = House()
walls = walls_of(h, CONVENTIONAL_2X6)
gable, long_f, long_r = walls[2], walls[0], walls[1]
W = gable.length_in
need = 2 * demands(h)["across ridge"][0]
P(f"house 28 x 40 ft; wind across the ridge at 115 mph, total ASD base shear {need:,.0f} lb on the two gable lines")
P("line A = garage-door gable wall (centred door); line B = other gable wall; four-term pier stiffness, secant at v")
for hd in (True, False):
    for v in (100.0, 250.0, 500.0):
        P(f"\nhold-down slip {'on' if hd else 'off'}, reference unit shear v = {v:.0f} plf")
        P(f"{'door':>5} {'kA':>8} {'kB':>8} {'kA/kB':>6} {'rigid A lb':>10} {'D/C flex':>8} {'D/C rigid':>9} {'B D/C rigid':>11}")
        kb = wall_stiffness(gable, v, 96.0, Params(), hd)
        kl = wall_stiffness(long_f, v, 96.0, Params(), hd) + wall_stiffness(long_r, v, 96.0, Params(), hd)
        capb = line_capacity(gable, 6, "wind")
        for door_ft in (9, 12, 16, 20, 22):
            wa = Wall(W, False, (Opening((W - door_ft * 12) / 2, door_ft * 12, 0.0),))
            ka, capa = wall_stiffness(wa, v, 96.0, Params(), hd), line_capacity(wa, 6, "wind")
            fl = flexible_split(need, ka, kb)[0]
            ra, rb, _ = rigid_split(need, ka, kb, kl, h.length_ft, h.width_ft)
            P(f"{door_ft:3d}ft {ka:8.0f} {kb:8.0f} {ka / kb:6.2f} {ra:10,.0f} {fl / capa:8.2f} {ra / capa:9.2f} {rb / capb:11.2f}")
Path(__file__).with_name("results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
