import os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
pytest = __import__("pytest")
pytest.importorskip("torch")
import paired_neural_boosted as pn  # noqa: E402


def test_all_positive_gives_floor():
    w = np.repeat(np.arange(20).astype(str), 5)
    p = pn.boot_pvalue(np.ones(100), w, n_boot=999)
    assert p == pytest.approx(2 / 1000)      # no draw <= 0: (0+1)/(999+1), doubled


def test_symmetric_noise_is_large():
    rng = np.random.default_rng(1)
    w = np.repeat(np.arange(52).astype(str), 20)
    d = rng.normal(0, 1, 1040)
    assert pn.boot_pvalue(d, w) > 0.05
