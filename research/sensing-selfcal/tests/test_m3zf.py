"""Milestone 3zf: ROS camera_info parsing (three layouts), the eight-term guard and duplicate merging."""
import importlib.util
import os

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(HERE, "..", "experiments", "m3zf_ros")


def _load(name, file):
    s = importlib.util.spec_from_file_location(name, os.path.join(D, file))
    m = importlib.util.module_from_spec(s)
    s.loader.exec_module(m)
    return m


fetch = _load("m3zf_fetch", "fetch.py")

# camera_calibration's output: nested blocks, flow lists wrapped over lines
CALIB = """camera_matrix:
  cols: 3
  data: [335.87982792873066, 0.0, 330.6663135051057, 0.0, 334.9147057575178, 225.95445389340048,
    0.0, 0.0, 1.0]
  rows: 3
camera_name: a313/camera_node
distortion_coefficients:
  cols: 5
  data: [-0.298328790993675, 0.07329882517888836, 0.000511320263891666, -0.0014420346224727004,
    0.0]
  rows: 1
distortion_model: plumb_bob
image_height: 480
image_width: 640
projection_matrix:
  cols: 4
  data: [244.259033203125, 0.0, 328.7359011283843, 0.0, 0.0, 271.3584899902344, 219.11520496018966,
    0.0, 0.0, 0.0, 1.0, 0.0]
  rows: 3
"""
# the same, written by a YAML dumper in block style
BLOCK = """camera_matrix:
  cols: 3
  data:
  - 309.1791995555939
  - 0.0
  - 220.67496030014146
  - 0.0
  - 309.8923403865892
  - 322.2815791925517
  - 0.0
  - 0.0
  - 1.0
  rows: 3
distortion_coefficients:
  cols: 5
  data:
  - -0.3543517592168695
  - 0.16442205538110652
  - 0.0019406748564795508
  - 0.001
  - 0.0
  rows: 1
distortion_model: plumb_bob
image_height: 640
image_width: 480
"""
# a sensor_msgs/CameraInfo dump (Apollo): top-level D, K, width, height; a header block first
INFO = """header:
  seq: 0
  frame_id: front_6mm
height: 1080
width: 1920
distortion_model: plumb_bob
D: [-0.544499, 0.276915, -0.001540, 0.005511, 0.000000, 0.000000, 0.000000, 0.000000]
K: [1992.669891, 0.000000, 937.768962, 0.000000, 1990.404142, 453.083499, 0.000000, 0.000000, 1.000000]
P: [1703.447510, 0.000000, 943.254273, 0.000000, 0.000000, 1896.693115, 444.134985, 0.000000, 0.0, 0.0, 1.0, 0.0]
roi:
  x_offset: 0
  height: 0
  width: 0
"""


def test_parse_three_layouts():
    a = fetch.parse(CALIB)
    assert (a["fx"], a["cy"], a["width"], a["height"]) == (335.87982792873066, 225.95445389340048, 640, 480)
    assert a["D"] == [-0.298328790993675, 0.07329882517888836, 0.000511320263891666, -0.0014420346224727004, 0.0]
    assert a["model"] == "plumb_bob"
    b = fetch.parse(BLOCK)
    assert (b["fx"], b["cx"], b["width"], b["height"]) == (309.1791995555939, 220.67496030014146, 480, 640)
    assert b["D"][:2] == [-0.3543517592168695, 0.16442205538110652] and len(b["D"]) == 5
    c = fetch.parse(INFO)
    assert (c["fx"], c["fy"], c["width"], c["height"]) == (1992.669891, 1990.404142, 1920, 1080)  # not roi's 0
    assert len(c["D"]) == 8 and c["D"][1] == 0.276915
    assert fetch.parse("foo: 1\n") is None


def test_normalise_and_distinct():
    pytest.importorskip("numpy")
    pytest.importorskip("cv2")
    an = _load("m3zf_analyse", "analyse.py")
    c = dict(fetch.parse(INFO), url="u1", repo="ApolloAuto/apollo")
    n = an.normalise(c)
    assert n["k3"] == 0.0 and n["p2"] == 0.005511
    with pytest.raises(ValueError):
        an.normalise(dict(c, D=c["D"][:5] + [0.1, 0, 0]))
    a1 = dict(fetch.parse(CALIB), url="https://raw.githubusercontent.com/duckietown/duckiefleet/s/a.yaml",
              repo="duckietown/duckiefleet")
    a2 = dict(a1, url="https://raw.githubusercontent.com/duckietown/dt-core/s/a.yaml", repo="duckietown/dt-core")
    a3 = dict(a1, D=[-0.3] + a1["D"][1:], url="x", repo="duckietown/dt-core")
    g = an.distinct([a1, a2, a3])
    assert len(g) == 2
    big = [x for x in g if len(x["sources"]) == 2][0]
    assert big["repos"] == ["duckietown/dt-core", "duckietown/duckiefleet"] and an.is_duckiebot(big)
