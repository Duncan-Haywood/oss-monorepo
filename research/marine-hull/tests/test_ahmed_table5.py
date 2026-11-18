"""Internal consistency of Table 5 of Ahmed et al. (2015) as typed into milestone 3n."""
import math

import numpy as np

from marine_hull.michell import G

FN = np.array([0.250, 0.267, 0.289, 0.316, 0.354, 0.408])
V = np.array([0.7830, 0.8363, 0.9052, 0.9897, 1.1088, 1.2779])
FORCE = np.array([0.1422, 0.1591, 0.1845, 0.2277, 0.2828, 0.4088])
CT_CFX = np.array([6.0275, 5.9109, 5.8522, 6.0410, 5.9786, 6.5061]) * 1e-3


def test_velocity_is_fn_sqrt_g_times_one_metre():
    assert np.allclose(V, FN * math.sqrt(G * 1.0), atol=5e-4)


def test_cfx_reference_area_is_constant_at_about_0p154():
    s = FORCE / (0.5 * 1000.0 * V ** 2 * CT_CFX)
    assert np.ptp(s) / s.mean() < 0.005
    assert abs(2 * s.mean() - 0.154) < 0.001
