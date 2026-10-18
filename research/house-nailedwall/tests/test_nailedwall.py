import math

from house_framing.model import CONVENTIONAL_2X6, House, Opening, Wall, walls_of
from house_nailedwall.model import Params, nail_slip, pier_deflection, pier_stiffness, wall_stiffness
from house_diaphragm.model import pier_stiffness as toy


def test_shear_only_matches_hand_value():
    p = Params(e_psi=1e30, nail_k=1e30, da_in=0.0)  # kill bending, slip, hold-down
    d = pier_deflection(96.0, 300.0, 96.0, p)
    assert math.isclose(d, 300 / 12 * 96 / p.gt, rel_tol=1e-9)


def test_bending_only_matches_cantilever():
    p = Params(gt=1e30, nail_k=1e30, da_in=0.0)
    v, b, h = 240.0, 48.0, 96.0
    P = v * b / 12
    # cantilever with chords: 8 P h^3 / (E A b^2) with P the lateral load
    assert math.isclose(pier_deflection(b, v, h, p), 8 * P * h ** 3 / (p.e_psi * p.a_in2 * b * b), rel_tol=1e-9)


def test_nail_slip_at_reference_load():
    p = Params(edge_in=6.0)
    v = 616.0 * 2  # nail load 616 lb at 6 in
    assert math.isclose(nail_slip(v, p), 1.0, rel_tol=1e-9)


def test_wider_pier_is_stiffer_and_per_width_stiffer():
    k48, k96 = pier_stiffness(48, 200), pier_stiffness(96, 200)
    assert k96 > k48 and k96 / 96 > k48 / 48


def test_stiffness_softens_with_load():
    assert pier_stiffness(96, 600) < pier_stiffness(96, 100)


def test_no_piers_zero_stiffness():
    wall = Wall(300.0, False, (Opening(0.0, 300.0, 0.0),))
    assert wall_stiffness(wall, 200) == 0.0


def test_wall_is_sum_of_piers():
    h = House()
    g = walls_of(h, CONVENTIONAL_2X6)[2]
    from house_structure.model import segments
    assert math.isclose(wall_stiffness(g, 200), sum(pier_stiffness(b, 200) for b in segments(g, 96.0)))


def test_toy_and_physical_agree_in_ordering():
    assert (toy(96) > toy(48)) == (pier_stiffness(96, 200) > pier_stiffness(48, 200))
