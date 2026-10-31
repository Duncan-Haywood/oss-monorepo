from marine_hull.hull import RHO_SEA, power_total, range_km, resistance


def test_propulsion_share_at_best_range_speed_is_near_one_third():
    # drag power ~ v^3: range v / (P_h + a v^3) peaks where a v^3 = P_h / 2, a share of 1/3
    # (Cf falls slowly with Re, so the share sits a little above 1/3)
    vol = 200.0 / RHO_SEA
    best = max((range_km(10000.0, v, resistance(v, 4.0, vol, 3.0, 0.25, wave_scale=0.0)), v)
               for v in [i / 100.0 for i in range(50, 300)])
    v = best[1]
    p = power_total(v, resistance(v, 4.0, vol, 3.0, 0.25, wave_scale=0.0))
    assert 0.32 < 1.0 - 30.0 / p < 0.38
