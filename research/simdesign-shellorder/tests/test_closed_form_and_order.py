"""Fast checks added in quality round 106
(portfolio/quality/audits/2026-11-23-simdesign-shellorder.json): before this, all four
seeded bugs (closed-form coefficient, Richardson sign, load and stress scaling) survived."""
import math, os, subprocess, sys
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from simdesign_shellorder import eigbuckle as eb


def test_shear_closed_form_by_hand():
    # Timoshenko & Gere cantilever, tip load at the centroid: P = 4.013 sqrt(E Iy G J) / l^2
    l, w, b, E, nu = 24.0, 8.0, 2.0, 200000.0, 0.30
    G = E / (2 * (1 + nu))
    Iy = w * b ** 3 / 12
    J = w * b ** 3 / 3 * (1 - 0.63 * b / w)
    hand = 4.013 * math.sqrt(E * Iy * G * J) / l ** 2
    assert abs(hand - 8460.649) < 0.01
    assert abs(eb.closed_forms(l, w, b, "shear") - hand) < 1e-9


def test_richardson_limit_from_recorded_scan():
    # p = log2(335.009 / 56.581) = 2.5658; limit = 9629.962 - 56.581 / (2^p - 1) = 9618.46
    out = subprocess.run([sys.executable, os.path.join(HERE, "..", "experiments", "analyze.py")],
                         capture_output=True, text=True, check=True).stdout
    assert "observed order p = log2(d1/d2) = 2.57" in out
    assert "Richardson limit = 9618.46 N; ratio to closed form 1.1368" in out
