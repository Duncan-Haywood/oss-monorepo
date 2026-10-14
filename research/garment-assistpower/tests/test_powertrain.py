from garment_assistpower.powertrain import PowerTrain, suit_mass, net_change, best_gain


def test_mass_grows_with_hours_and_gain():
    assert suit_mass(0.3, 8)[0] > suit_mass(0.3, 1)[0]
    assert suit_mass(0.5, 4)[0] > suit_mass(0.2, 4)[0]


def test_zero_hours_has_no_battery():
    assert suit_mass(0.3, 0)[2] == 0.0


def test_denser_motor_is_never_worse():
    a = net_change(0.3, 4, PowerTrain(motor_nm_per_kg=8))["dwhole_pct"]
    b = net_change(0.3, 4, PowerTrain(motor_nm_per_kg=80))["dwhole_pct"]
    assert b < a


def test_zero_mass_sensitivity_matches_ankle_saving():
    r = net_change(0.3, 4, PowerTrain(mass_sens=0.0))
    assert r["dwhole_pct"] < -5


def test_best_gain_not_worse_than_grid_point():
    v, g = best_gain(4)
    assert v <= net_change(0.3, 4)["dwhole_pct"] + 1e-9
