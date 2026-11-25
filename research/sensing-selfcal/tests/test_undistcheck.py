"""src/undistcheck.py: the stdlib undistortion check and Newton inverse (milestone 3zi)."""
import importlib.util
import json
import math
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
_s = importlib.util.spec_from_file_location("undistcheck", os.path.join(HERE, "..", "src", "undistcheck.py"))
uc = importlib.util.module_from_spec(_s)
_s.loader.exec_module(uc)

TEO = [-0.2724349698280765, 0.05536654180379657, -8.22915071199787e-05, 0.0009679364518962706, 0.0]
TEO_K = (330.97157748657446, 331.70695515573993, 316.6827507684257, 231.69152905893193)


def test_jacobian_matches_finite_differences():
    rnd = random.Random(1)
    for _ in range(50):
        D = [rnd.uniform(-0.4, 0.1), rnd.uniform(-0.1, 0.2), rnd.uniform(-0.01, 0.01), rnd.uniform(-0.01, 0.01),
             rnd.uniform(-0.05, 0.05)]
        x, y, h = rnd.uniform(-1, 1), rnd.uniform(-0.8, 0.8), 1e-6
        (a, b, c, d), _ = uc.jacobian(x, y, D)
        px, py = uc.distort(x + h, y, D); mx, my = uc.distort(x - h, y, D)
        qx, qy = uc.distort(x, y + h, D); nx, ny = uc.distort(x, y - h, D)
        for an, fd in ((a, (px - mx) / 2 / h), (c, (py - my) / 2 / h), (b, (qx - nx) / 2 / h), (d, (qy - ny) / 2 / h)):
            assert abs(an - fd) < 1e-7


def test_newton_inverts_the_forward_model():
    rnd = random.Random(2)
    for _ in range(200):
        x, y = rnd.uniform(-1.2, 1.2), rnd.uniform(-0.9, 0.9)
        xd, yd = uc.distort(x, y, TEO)
        t = uc.undistort(xd, yd, TEO)
        assert t is not None and abs(t[0] - x) < 1e-12 and abs(t[1] - y) < 1e-12


def test_loop_radius_is_the_radial_slope_on_a_pure_radial_model():
    # no tangential terms: eigenvalues -r c'(r)/c (along the ray) and 0 (across it)
    k1, k2 = -0.3, 0.06
    x, y = 0.9, 0.4
    r = math.hypot(x, y)
    c = 1 + k1 * r * r + k2 * r ** 4
    lam = -r * (2 * k1 * r + 4 * k2 * r ** 3) / c
    assert abs(uc.loop_radius(x, y, [k1, k2, 0, 0, 0]) - abs(lam)) < 1e-12


def test_additive_radius_is_one_minus_slopes():
    # VINS's loop: eigenvalues 1 - rho'(r) along the ray and 1 - c(r) across it
    k1, k2 = -0.3, 0.06
    x, y = 0.9, 0.4
    u = x * x + y * y
    c = 1 + k1 * u + k2 * u * u
    rhop = 1 + 3 * k1 * u + 5 * k2 * u * u
    assert abs(uc.additive_radius(x, y, [k1, k2, 0, 0, 0]) - max(abs(1 - rhop), abs(1 - c))) < 1e-12


def test_fixed_point_converges_where_radius_below_one_and_stalls_above():
    # a point near the centre: radius well below 1, 200 steps reach Newton's answer
    xd, yd = 0.3, 0.2
    t = uc.undistort(xd, yd, TEO)
    assert uc.loop_radius(*t, TEO) < 0.5
    x, y, _ = uc.fixed_point(xd, yd, TEO, 200)
    assert abs(x - t[0]) < 1e-12 and abs(y - t[1]) < 1e-12
    # Teo's bottom-right corner: the CLI reports the 5-step loop off by more than 1 px there
    r = uc.check(TEO_K, TEO, 640, 480)
    assert max(c["loop5_err_px"] for c in r["corners"]) > 1
    assert all(not c["folds"] for c in r["corners"])


def test_refuses_past_a_fold():
    # k1 = -0.3, no other term: rho folds at x = sqrt(1/0.9), rho_max = 0.703; a point beyond has no preimage
    D = [-0.3, 0, 0, 0, 0]
    assert uc.undistort(0.8, 0.0, D) is None
    assert uc.undistort(0.5, 0.0, D) is not None


def test_cli_reads_a_ros_camera_info_yaml(tmp_path):
    p = tmp_path / "teo.yaml"
    p.write_text(
        "image_width: 640\nimage_height: 480\ncamera_name: teo\ncamera_matrix:\n  rows: 3\n  cols: 3\n"
        f"  data: [{TEO_K[0]}, 0.0, {TEO_K[2]}, 0.0, {TEO_K[1]}, {TEO_K[3]}, 0.0, 0.0, 1.0]\n"
        "distortion_model: plumb_bob\ndistortion_coefficients:\n  rows: 1\n  cols: 5\n"
        f"  data: [{', '.join(map(str, TEO))}]\n")
    K, D, w, h = uc.load(str(p))
    assert K == TEO_K and D == TEO and (w, h) == (640, 480)
    assert uc.main([str(p)]) == 1
    j = tmp_path / "c.json"
    j.write_text(json.dumps({"K": [[500, 0, 320], [0, 500, 240], [0, 0, 1]], "D": [0.01, 0, 0, 0, 0], "size": [640, 480]}))
    assert uc.main(["--json", str(j)]) == 0
    bad = tmp_path / "f.yaml"
    bad.write_text("distortion_model: equidistant\n")
    assert uc.main([str(bad)]) == 2
