"""Table 5 of Ahmed et al. (2015) is internally consistent in length and reference area (milestone 3n)."""
import numpy as np

G = 9.81
FN = np.array([0.250, 0.267, 0.289, 0.316, 0.354, 0.408])
V = np.array([0.7830, 0.8363, 0.9052, 0.9897, 1.1088, 1.2779])
F = np.array([0.1422, 0.1591, 0.1845, 0.2277, 0.2828, 0.4088])
CT = np.array([6.0275, 5.9109, 5.8522, 6.0410, 5.9786, 6.5061]) * 1e-3


def test_model_length_is_one_metre():
    assert np.allclose(V ** 2 / (G * FN ** 2), 1.0, atol=0.01)


def test_cfx_ct_uses_one_reference_area():
    s = F / (0.5 * 998.0 * V ** 2 * CT)
    assert np.allclose(s, s[0], rtol=0.003)
    assert 0.0765 < s[0] < 0.0777   # not the 0.135 m2 the paper lists
