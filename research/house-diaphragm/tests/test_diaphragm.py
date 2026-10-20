from house_framing.model import CONVENTIONAL_2X6, House, Opening, Wall, walls_of
from house_diaphragm import flexible_split, pier_stiffness, rigid_split, wall_stiffness


def test_symmetric_walls_split_evenly():
    fa, fb, th = rigid_split(1000, 5.0, 5.0, 8.0, 40, 28)
    assert abs(fa - 500) < 1e-9 and abs(fb - 500) < 1e-9 and abs(th) < 1e-12


def test_load_is_conserved():
    fa, fb, _ = rigid_split(2328, 2.0, 7.0, 6.0, 40, 28)
    assert abs(fa + fb - 2328) < 1e-6


def test_stiffer_line_attracts_more_and_twist_helps_the_weak_line():
    fa, fb, _ = rigid_split(1000, 1.0, 9.0, 6.0, 40, 28)
    assert fb > 500 > fa
    assert fa > 1000 * 1.0 / 10.0  # long walls resisting the twist put more on the weak line than a pure stiffness share


def test_stiff_long_walls_restrain_twist_so_split_follows_stiffness():
    soft = rigid_split(1000, 1.0, 9.0, 0.1, 40, 28)[0]
    stiff = rigid_split(1000, 1.0, 9.0, 1000.0, 40, 28)[0]
    assert abs(soft - 500) < 10 and abs(stiff - 100) < 10 and stiff < soft


def test_flexible_is_half_and_half():
    assert flexible_split(900, 1, 50) == (450, 450)


def test_stiffness_grows_with_width_and_falls_with_bending():
    assert pier_stiffness(96) > pier_stiffness(48)
    assert pier_stiffness(48, r=3) < pier_stiffness(48, r=0)


def test_door_lowers_wall_stiffness():
    h = House()
    gable = walls_of(h, CONVENTIONAL_2X6)[2]
    door = Wall(gable.length_in, False, (Opening(0.0, 16 * 12, 0.0),))
    assert wall_stiffness(door) < wall_stiffness(gable)
