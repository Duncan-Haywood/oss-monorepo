"""Experiments for house-torsion. Deterministic, under a second.

    PYTHONPATH=src:../house-nailedwall/src:../house-diaphragm/src:../house-structure/src:../house-framing/src python experiments/run.py
"""
from pathlib import Path

from house_framing.model import CONVENTIONAL_2X6, House, Opening, Wall, walls_of
from house_nailedwall.model import Params, wall_stiffness
from house_structure.model import demands, line_capacity
from house_torsion.model import worst_split

out = []
P = out.append
h = House()
walls = walls_of(h, CONVENTIONAL_2X6)
gable, long_f, long_r = walls[2], walls[0], walls[1]
W = gable.length_in
need = 2 * demands(h)["across ridge"][0]
P(f"house 28 x 40 ft; wind across the ridge at 115 mph, total ASD base shear {need:,.0f} lb on the two gable lines")
P("line A = garage-door gable wall (centred door); line B = other gable wall; load offset +-e of the length, worse sign taken")
for v in (100.0, 250.0, 500.0):
    P(f"\nreference unit shear v = {v:.0f} plf (hold-down slip on); worst D/C on line A | line B")
    P(f"{'door':>5} " + " ".join(f"{'e=%d%%' % int(e * 100):>13}" for e in (0.0, 0.05, 0.10, 0.15)))
    kb = wall_stiffness(gable, v, 96.0, Params(), True)
    kl = sum(wall_stiffness(w, v, 96.0, Params(), True) for w in (long_f, long_r))
    capb = line_capacity(gable, 6, "wind")
    for door_ft in (0, 9, 16, 22):
        wa = Wall(W, False, (Opening((W - door_ft * 12) / 2, door_ft * 12, 0.0),)) if door_ft else gable
        ka, capa = wall_stiffness(wa, v, 96.0, Params(), True), line_capacity(wa, 6, "wind")
        cells = []
        for e in (0.0, 0.05, 0.10, 0.15):
            fa, fb = worst_split(need, ka, kb, kl, h.length_ft, h.width_ft, e)
            cells.append(f"{fa / capa:5.2f} |{fb / capb:5.2f}")
        P(f"{door_ft:3d}ft " + " ".join(f"{c:>13}" for c in cells))
Path(__file__).with_name("results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
