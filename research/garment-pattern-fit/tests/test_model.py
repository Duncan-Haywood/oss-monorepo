import numpy as np
from garment_pattern_fit.model import Body, Pattern, body_perimeter, ellipse_perimeter, evaluate, cost

SMALL = dict(n_theta=24, n_z=10, steps=60)
CYL = Body(z=(0.0, -0.6), a=(0.15, 0.15), b=(0.15, 0.15))


def test_ellipse_perimeter_circle():
    assert abs(ellipse_perimeter(0.2, 0.2) - 2 * np.pi * 0.2) < 1e-12


def test_pattern_width_linear():
    p = Pattern(0.8, 1.0, 0.5)
    assert p.width(0) == 0.8 and abs(p.width(0.5) - 1.0) < 1e-12


def test_matched_cylinder_has_no_strain():
    per = 2 * np.pi * 0.15
    m = evaluate(Pattern(per * 1.01, per * 1.01, 0.5), CYL, **SMALL)
    assert m["strain_p95"] < 0.02 and abs(m["waist_ease"]) < 0.03


def test_tight_pattern_strains_more():
    per = 2 * np.pi * 0.15
    tight = evaluate(Pattern(per * 0.9, per * 0.9, 0.5), CYL, **SMALL)
    ok = evaluate(Pattern(per * 1.01, per * 1.01, 0.5), CYL, **SMALL)
    assert tight["strain_p95"] > ok["strain_p95"] + 0.03


def test_loose_waist_shows_ease():
    per = 2 * np.pi * 0.15
    loose = evaluate(Pattern(per * 1.2, per * 1.2, 0.5), CYL, **SMALL)
    assert loose["waist_ease"] > 0.1


def test_cost_penalises_both_directions():
    base = dict(strain_p95=0.0, waist_ease=0.02)
    assert cost(base) == 0.0
    assert cost(dict(strain_p95=0.1, waist_ease=0.02)) > 1.0
    assert cost(dict(strain_p95=0.0, waist_ease=0.2)) > 1.0
    assert cost(dict(strain_p95=0.0, waist_ease=-0.05)) > 1.0


def test_deterministic():
    b = Body()
    p = Pattern(0.9, 1.1)
    assert evaluate(p, b, **SMALL) == evaluate(p, b, **SMALL)


def test_body_perimeter_grows_to_hip():
    b = Body()
    assert body_perimeter(b, -0.2) > body_perimeter(b, 0.0)
