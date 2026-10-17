import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_gaugelayers import layers as ly


def test_one_layer_factor_reproduces_revgauge_root():
    assert abs(ly.factor(22.5, 1.5, 1) - 3.012) < 0.01


def test_root_on_known_function(monkeypatch):
    monkeypatch.setattr(ly, "factor", lambda w, b, nz, base=(2, 18, 14): w / 4.0)
    w, m, _ = ly.root(2.0, 2, 5, 20, tol=1e-3)
    assert abs(w - 12.0) < 2e-3 and abs(m - ly.mass_g(w, 2.0)) < 1e-12


def test_extra_layer_changes_factor_little_at_1p5mm():
    assert abs(ly.factor(22.5, 1.5, 2) / ly.factor(22.5, 1.5, 1) - 1) < 0.02
