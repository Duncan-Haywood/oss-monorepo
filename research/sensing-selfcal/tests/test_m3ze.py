"""Milestone 3ze: config parsing, duplicate merging and the OpenCV corner round trip."""
import importlib.util
import os

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(HERE, "..", "experiments", "m3ze_fleet")


def _load(name, file):
    s = importlib.util.spec_from_file_location(name, os.path.join(D, file))
    m = importlib.util.module_from_spec(s)
    s.loader.exec_module(m)
    return m


fetch = _load("m3ze_fetch", "fetch.py")

ORB = """%YAML:1.0
Camera.type: "PinHole"
Camera1.fx: 458.654
Camera1.fy: 457.296
Camera1.cx: 367.215
Camera1.cy: 248.375
Camera1.k1: -0.28340811
Camera1.k2: 0.07395907
Camera1.p1: 0.00019359
Camera1.p2: 1.76187114e-05
Camera.width: 752
Camera.height: 480
"""
VINS = """%YAML:1.0
model_type: PINHOLE
image_width: 752
image_height: 480
distortion_parameters:
   k1: -2.917e-01
   k2: 8.228e-02
   p1: 5.333e-05
   p2: -1.578e-04
projection_parameters:
   fx: 4.616e+02
   fy: 4.603e+02
   cx: 3.630e+02
   cy: 2.481e+02
"""
KALIBR = """%YAML:1.0 # comment
cam0:
  camera_model: pinhole
  distortion_coeffs: [-0.05, 0.14, 0.001, -0.001]
  distortion_model: radtan
  intrinsics: [816.9, 811.6, 608.5, 263.5] #fu, fv, cu, cv
  resolution: [1280, 560]
cam1:
  camera_model: pinhole
  distortion_coeffs:
    - 0.0069
    - -0.0091
    - 0.0002
    - 0.0021
  distortion_model: radtan
  intrinsics:
    - 380.9
    - 380.3
    - 324.7
    - 224.7
  resolution:
    - 640
    - 480
cam2:
  camera_model: pinhole
  distortion_coeffs: [0.1, 0.2, 0.3, 0.4]
  distortion_model: equidistant
  intrinsics: [190.9, 190.9, 254.9, 256.9]
  resolution: [512, 512]
"""


def test_parse_three_formats():
    (o,) = fetch.parse(ORB)
    assert o["model"] == "radtan" and o["fx"] == 458.654 and o["k2"] == 0.07395907 and o["k3"] == 0 and o["width"] == 752
    (v,) = fetch.parse(VINS)
    assert v["fx"] == 461.6 and v["k1"] == -0.2917 and v["p2"] == -1.578e-4 and v["height"] == 480
    k = fetch.parse(KALIBR)
    assert [c["cam"] for c in k] == ["cam0", "cam1", "cam2"]
    assert k[0]["k2"] == 0.14 and k[0]["width"] == 1280 and k[1]["fy"] == 380.3 and k[1]["k1"] == 0.0069
    assert k[2]["model"] == "equidistant" and k[2]["k1"] == 0.0     # fisheye coefficients are not read as radtan


def test_distinct_merges_and_fills_size():
    pytest.importorskip("cv2")
    analyse = _load("m3ze_an", "analyse.py")
    a = dict(fetch.parse(ORB)[0], url="u1")
    b = dict(a, url="u2", width=None, height=None)
    g = analyse.distinct([b, a])
    assert len(g) == 1 and g[0]["sources"] == ["u2#Camera1", "u1#Camera1"] and g[0]["cam"]["width"] == 752


def test_round_trip_small_when_monotone_large_past_a_fold():
    pytest.importorskip("cv2")
    analyse = _load("m3ze_an", "analyse.py")
    mild = dict(fx=500.0, fy=500.0, cx=320.0, cy=240.0, k1=-0.05, k2=0.01, p1=0.0, p2=0.0, k3=0.0, width=640, height=480)
    assert max(analyse.round_trip(mild)) < 0.01
    assert analyse.min_slope(mild) > 0.8
    # k2 < 0 alone folds at x^4 = 1 / (5 |k2|); with k2 = -0.5 that is x = 0.795, rho = 0.636, 318 px: inside 400 px
    fold = dict(mild, k1=0.0, k2=-0.5)
    assert max(analyse.round_trip(fold)) > 1.0
    assert analyse.min_slope(fold) <= 1e-3
