import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from neural_sign_test import sign_p, boot_mean_ci


def test_sign_p_known():
    assert abs(sign_p(0, 10) - 2 / 1024) < 1e-12
    assert sign_p(5, 10) == 1.0


def test_boot_constant():
    assert boot_mean_ci([1.0] * 5, b=50) == (1.0, 1.0)
