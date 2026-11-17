import importlib.util
import math
import pathlib

_d = pathlib.Path(__file__).resolve().parents[1] / "experiments" / "hub_airspace"
_s = importlib.util.spec_from_file_location("hub_airspace_paper_weights", _d / "paper_weights.py")
pw = importlib.util.module_from_spec(_s)
_s.loader.exec_module(pw)

PTS = [(x * 100.0, y * 100.0) for x in range(-40, 41) for y in range(-40, 41)]


def test_uniform_density_integrates_to_mean_leg_length():
    # one leg's expected length for uniform destinations in a disc of radius r is 2r/3
    r = 3000.0
    lm = pw.density_uniform((0.0, 0.0), r, (-4000.0, -4000.0))
    total = sum(lm.values()) * pw.H * pw.H
    assert abs(total - 2 * r / 3) / (2 * r / 3) < 0.03


def test_dest_density_integrates_to_mean_leg_length():
    hubs, radii, shares = [(0.0, 0.0)], [2000.0], [1.0]
    mix = pw.rl.mix_radii(PTS, hubs, radii, shares)
    lm = pw.density_dest(mix, 0, 1.0, (-4000.0, -4000.0))
    mean_d = sum(w * math.hypot(x - hx, y - hy) for w, _, hx, hy, x, y in mix)
    assert math.isclose(sum(lm.values()) * pw.H * pw.H, mean_d, rel_tol=1e-9)


def test_gas_matches_closed_form_on_two_hubs():
    hubs, radii, shares, speeds = [(0.0, 0.0), (1500.0, 500.0)], [2500.0, 2000.0], [0.6, 0.4], [15.0, 25.0]
    mix = pw.rl.mix_radii(PTS, hubs, radii, shares)
    origin = pw.grid_bounds(hubs, radii)
    lm = [pw.density_dest(mix, k, shares[k], origin) for k in range(2)]
    g = pw.gas_pair(lm[0], lm[1], hubs[0], hubs[1], speeds[0], speeds[1], shares[0], shares[1], origin)
    cf = pw.gp.closed_form_pairs(mix, speeds, pw.LAM, "semi", pairs=200000, seed=1)[(0, 1, "enr")]
    assert 0.9 < g / cf < 1.1, (g, cf)


def test_distv_reduces_to_dist_times_speed_factor():
    w = pw.distv_weights([(0.0, 0.0), (300.0, 400.0)], [20.0, 20.0], [0.5, 0.5])
    assert math.isclose(w[(0, 1, "enr")], 0.25 * math.sqrt(2) / 20.0 / 500.0)
