import math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from marine_hull.sail import Drone, cl_cd, vmg_up

def test_lift_slope_and_symmetry():
    cl1, _ = cl_cd(2.0, 3.0); cl2, _ = cl_cd(-2.0, 3.0)
    assert cl1 == -cl2
    assert abs(cl1 - 2 * math.pi * 3 / 5 * math.radians(2.0)) < 1e-12

def test_stall_caps_lift_and_flat_plate_limit():
    assert cl_cd(10.0, 3.0, cl_max=1.0)[0] <= 1.0 + 1e-9
    cl, cd = cl_cd(90.0, 3.0)
    assert abs(cl) < 1e-9 and abs(cd - 2.0) < 1e-9

def test_zero_hull_drag_apparent_angle_is_atan_d_over_l():
    z = Drone(hull_scale=1e-6, keel_span=1000.0)
    ld = max(cl_cd(a / 10, z.sail_ar, z.cl_max, z.cd0)[0] / cl_cd(a / 10, z.sail_ar, z.cl_max, z.cd0)[1] for a in range(1, 150))
    v = z._speed_free(0.3, 90.0, vmax=100.0)
    assert abs(math.degrees(math.atan2(0.3, v)) - math.degrees(math.atan(1 / ld))) < 0.4

def test_cannot_sail_into_the_no_go_zone_and_speed_rises_with_wind():
    d = Drone()
    assert d.speed(5, 5) < d.speed(5, 40)
    assert d.speed(3, 90) < d.speed(6, 90)

def test_fr_cap_and_best_angle_moves_up_when_capped():
    d = Drone()
    assert d.speed(16, 90) <= d.fr_cap * math.sqrt(9.80665 * d.length) + 1e-9
    assert d.capped(16, 90)
    assert vmg_up(d, 16)[1] < vmg_up(d, 5)[1] + 40


def test_tack_controllers_bounded_and_ordered():
    import numpy as np
    from marine_hull.tack import rates, bound, sim_corridor, sim_header, dp_clairvoyant
    vf = lambda s: np.full_like(np.asarray(s, float), 2.5)
    bf = lambda s: np.full_like(np.asarray(s, float), 40.0)
    rng = np.random.default_rng(1)
    eps = np.cumsum(rng.normal(0, 3, 300)); eps -= eps.mean()
    p, c = rates(np.full(300, 6.0), eps, vf, bf)
    assert (p >= 0).all()
    bd = bound(p, 60.0)
    a = sim_corridor(p, c, 60.0, 1500.0, 30.0)[0]
    b = sim_header(p, c, 60.0, 1500.0, 30.0, 0.1, 10)[0]
    d = dp_clairvoyant(p, c, 60.0, 1500.0, 30.0)
    assert d <= bd * (1 + 1e-9) and a <= d + 1e-6 and b <= d + 1e-6   # DP is an upper bound on any causal controller (up to y interpolation)

def test_steady_wind_costless_tack_reaches_bound():
    import numpy as np
    from marine_hull.tack import rates, bound, dp_clairvoyant
    vf = lambda s: np.full_like(np.asarray(s, float), 2.0)
    bf = lambda s: np.full_like(np.asarray(s, float), 45.0)
    p, c = rates(np.full(200, 6.0), np.zeros(200), vf, bf)
    assert abs(dp_clairvoyant(p, c, 60.0, 1500.0, 0.0) - bound(p, 60.0)) < 1e-6 * bound(p, 60.0)
