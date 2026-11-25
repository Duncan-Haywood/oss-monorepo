"""src/fisheyecheck.py and milestone 3zj's ports: the fisheye (equidistant) path past 90 degrees."""
import importlib.util
import math
import os
import random

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, rel):
    s = importlib.util.spec_from_file_location(name, os.path.join(HERE, "..", rel))
    m = importlib.util.module_from_spec(s)
    s.loader.exec_module(m)
    return m


fc = _load("fisheyecheck", "src/fisheyecheck.py")

# TUM-VI cam0 as shipped with OpenVINS (rpng/open_vins config/tum_vi/kalibr_imucam_chain.yaml)
TUM_K = (190.97847715128717, 190.9733070521226, 254.93170605935475, 256.8974428996504)
TUM_D = [0.0034823894022493434, 0.0007150348452162257, -0.0020532361418706202, 0.00020293673591811182]


def test_inverse_round_trips_on_random_monotone_models():
    rnd = random.Random(3)
    for _ in range(200):
        k = [rnd.uniform(-0.02, 0.02), rnd.uniform(-0.01, 0.01), rnd.uniform(-0.005, 0.005), rnd.uniform(0, 0.002)]
        t = rnd.uniform(0, 1.5)
        if fc.fold_theta(k, 1.6) is not None:
            continue
        assert abs(fc.inverse_theta(fc.theta_d(t, k), k) - t) < 1e-14


def test_fold_matches_the_closed_form():
    k = [-0.1, 0.0, 0.0, 0.0]                      # d theta_d / d theta = 1 + 3 k1 theta^2 = 0
    assert abs(fc.fold_theta(k) - math.sqrt(1 / 0.3)) < 1e-12
    assert fc.inverse_theta(fc.theta_d(fc.fold_theta(k), k) + 0.01, k) is None   # beyond the peak: no ray


def test_bearing_is_right_past_90_degrees():
    for t in (0.3, 1.5, 1.6, 1.9):
        td = fc.theta_d(t, TUM_D)
        x, y, z = fc.bearing(td * 0.6, td * 0.8, TUM_D)
        assert abs(math.atan2(math.hypot(x, y), z) - t) < 1e-13
        assert abs(math.atan2(y, x) - math.atan2(0.8, 0.6)) < 1e-13


def test_opencv_loop_is_exact_inside_and_mirrors_past_90():
    inside = fc.theta_d(1.2, TUM_D)
    p = fc.opencv_loop(inside, 0.0, TUM_D)
    assert abs(p[0] - math.tan(1.2)) < 1e-9 and p[1] == 0.0
    past = fc.theta_d(1.62, TUM_D)                  # a ray at 92.8 degrees: no point on the plane exists
    q = fc.opencv_loop(past, 0.0, TUM_D)
    assert q is not None and q[0] < 0               # returned, unflagged, on the other side of the centre


def test_check_on_tum_vi_and_the_cli(tmp_path):
    r = fc.check(TUM_K, TUM_D, 512, 512, grid=8)
    assert 0.05 < r["share_C"] < 0.09 and r["share_B"] == 0 and abs(r["share_mirrored"] - r["share_C"]) < 1e-12
    kal = tmp_path / "kalibr.yaml"
    kal.write_text("cam0:\n  camera_model: pinhole\n  distortion_coeffs: [%s]\n  distortion_model: equidistant\n"
                   "  intrinsics: [%s]\n  resolution: [512, 512]\n" % (", ".join(map(repr, TUM_D)), ", ".join(map(repr, TUM_K))))
    assert fc.main([str(kal), "--grid", "16"]) == 1
    orb = tmp_path / "orb.yaml"
    orb.write_text('%YAML:1.0\nCamera.type: "KannalaBrandt8"\nCamera1.fx: 190.97\nCamera1.fy: 190.97\nCamera1.cx: 150.0\n'
                   'Camera1.cy: 150.0\nCamera1.k1: 0.0\nCamera1.k2: 0.0\nCamera1.k3: 0.0\nCamera1.k4: 0.0\n'
                   'Camera.width: 300\nCamera.height: 300\n')
    assert fc.load(str(orb))[1] == [0.0, 0.0, 0.0, 0.0]
    assert fc.main([str(orb), "--grid", "16"]) == 0      # corner theta_d < pi/2: the whole image is region A
    ros = tmp_path / "ci.yaml"
    ros.write_text("image_width: 640\nimage_height: 480\ncamera_matrix:\n  rows: 3\n  cols: 3\n  data: [277.4, 0, 320.1, 0, "
                   "277.4, 242.1, 0, 0, 1]\ndistortion_model: equidistant\ndistortion_coefficients:\n  rows: 1\n  cols: 4\n"
                   "  data: [-0.0057, 0.0047, 0.0012, -0.0016]\n")
    K, k, w, h = fc.load(str(ros))
    assert K == (277.4, 277.4, 320.1, 242.1) and len(k) == 4 and (w, h) == (640, 480)
    bad = tmp_path / "pb.yaml"
    bad.write_text("image_width: 4\nimage_height: 4\ncamera_matrix:\n  data: [1,0,0,0,1,0,0,0,1]\ndistortion_model: plumb_bob\n"
                   "distortion_coefficients:\n  data: [0,0,0,0,0]\n")
    assert fc.main([str(bad)]) == 2


def test_ports_against_opencv_and_truth():
    np = pytest.importorskip("numpy")
    cv2 = pytest.importorskip("cv2")
    an = _load("m3zj_an", "experiments/m3zj_fisheye/analyse.py")
    t = np.array([0.2, 0.9, 1.4, 1.55, 1.65, 1.9])
    td = an.td_poly(t, TUM_D)
    ang = np.array([0.3, 1.1, 2.0, 2.6, 4.0, 5.5])
    xd, yd = td * np.cos(ang), td * np.sin(ang)
    assert np.allclose(an.truth_theta(td, TUM_D, math.pi), t, atol=1e-14, rtol=0)
    assert np.allclose(an.vins_theta(td, TUM_D), t, atol=1e-12, rtol=0)      # VINS-Fusion's companion-matrix roots
    fx, fy, cx, cy = TUM_K
    pts = np.stack([xd * fx + cx, yd * fy + cy], -1).reshape(-1, 1, 2)
    Kc = np.array([[fx, 0, cx], [0, fy, cy], [0, 0, 1.0]])
    o = cv2.fisheye.undistortPoints(pts, Kc, np.array(TUM_D)).reshape(-1, 2)
    for i in range(len(t)):
        mine = fc.opencv_loop(xd[i], yd[i], TUM_D)
        assert mine is not None and math.hypot(mine[0] - o[i, 0], mine[1] - o[i, 1]) < 1e-9 * (1 + abs(o[i]).max())
    ox, oy = an.orb3_unproject(xd, yd, TUM_D)
    inside = t < 1.5
    assert np.allclose(ox[inside], o[inside, 0], rtol=1e-5, atol=1e-6)
    mirrored = (o[:, 0] * xd + o[:, 1] * yd) < 0
    assert list(mirrored) == [False, False, False, False, True, True]
    assert list((ox * xd + oy * yd) < 0) == list(mirrored)
