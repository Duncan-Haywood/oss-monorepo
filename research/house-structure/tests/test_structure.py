from house_framing.model import ADVANCED_2X6, CONVENTIONAL_2X6, House, walls_of
from house_structure import demands, design, line_capacity, max_sds, max_wind_speed, required_solid_ft, segments, wind_pressure


def test_wind_pressure_scales_with_speed_squared():
    assert abs(wind_pressure(200) / wind_pressure(100) - 4) < 1e-9


def test_gable_wall_segments_exclude_openings():
    gable = walls_of(House(), CONVENTIONAL_2X6)[2]
    s = segments(gable, 96.0)
    assert abs(sum(s) + 36 - gable.length_in) < 1e-9 and len(s) == 2


def test_too_narrow_piers_do_not_count():
    assert all(w >= 96 / 3.5 for w in segments(walls_of(House(windows_gable=5), CONVENTIONAL_2X6)[2], 96.0))


def test_tighter_nailing_never_lowers_capacity():
    w = walls_of(House(), CONVENTIONAL_2X6)[0]
    c = [line_capacity(w, e, "wind") for e in (6, 4, 3, 2)]
    assert c == sorted(c) and c[0] < c[-1]


def test_wind_capacity_exceeds_seismic_at_same_nailing():
    w = walls_of(House(), CONVENTIONAL_2X6)[0]
    assert line_capacity(w, 6, "wind") > line_capacity(w, 6, "seismic")


def test_each_direction_splits_over_two_lines():
    d = demands(House(), 115, 0.5)
    assert d["across ridge"][1] == d["along ridge"][1] > 0


def test_zero_load_passes_at_loosest_nailing():
    assert all(r["edge_in"] == 6 for r in design(House(), CONVENTIONAL_2X6, 0, 0).values())


def test_default_house_passes_at_6in_at_115mph_and_sds_half():
    assert all(r["edge_in"] == 6 for r in design().values())


def test_limits_are_monotone_in_nailing():
    a, b = max_wind_speed(edge_in=6), max_wind_speed(edge_in=2)
    assert a < b and max_sds(edge_in=6) < max_sds(edge_in=2)


def test_limit_is_the_edge_of_passing():
    v = max_wind_speed(edge_in=2)
    assert design(House(), CONVENTIONAL_2X6, v * 0.99, 0)[("across ridge", "wind")]["edge_in"] is not None
    assert design(House(), CONVENTIONAL_2X6, v * 1.01, 0)[("across ridge", "wind")]["edge_in"] is None


def test_framing_scheme_does_not_change_capacity():
    a = design(House(), CONVENTIONAL_2X6)[("across ridge", "wind")]["cap6_lb"]
    assert design(House(), ADVANCED_2X6)[("across ridge", "wind")]["cap6_lb"] == a


def test_required_solid_length():
    assert abs(required_solid_ft(510, 6, "wind") - 1.0) < 1e-9
