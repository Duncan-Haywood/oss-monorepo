"""Camera geometry of homebot.perception (the rendering test needs OpenCV)."""
import math

import numpy as np
import pytest

from homebot import perception as P


def _project(X, K, cam_pos, R_cam):
    """World point -> pixel for a MuJoCo camera (looks along -z, y up)."""
    x_cv = P.MJ_TO_CV @ (R_cam.T @ (np.asarray(X) - cam_pos))
    uv = K @ (x_cv / x_cv[2])
    return uv[:2]


def _look_down(p, tilt):
    """MuJoCo camera at p looking forward (+x) and down by ``tilt`` rad."""
    fwd = np.array([math.cos(tilt), 0.0, -math.sin(tilt)])
    right = np.array([0.0, -1.0, 0.0])
    up = np.cross(right, fwd)
    return np.column_stack([right, up, -fwd])


def test_plane_localisation_inverts_the_projection():
    K = P.intrinsics(60.0, 1280, 720)
    cam = np.array([0.02, 0.0, 1.3])
    R = _look_down(cam, 1.07)
    rng = np.random.default_rng(0)
    for _ in range(20):
        c = np.array([rng.uniform(0.25, 0.4), rng.uniform(-0.3, 0.3), 0.791])
        yaw = rng.uniform(-0.8, 0.8)
        h = 0.015
        local = [(-h, h), (h, h), (h, -h), (-h, -h)]
        corners = np.array([_project(c + [math.cos(yaw) * a - math.sin(yaw) * b,
                                          math.sin(yaw) * a + math.cos(yaw) * b, 0.0], K, cam, R)
                            for a, b in local])
        est = P.locate_on_plane(corners, K, cam, R, 0.791)
        assert np.allclose(est, c, atol=1e-9)


def test_intrinsics_match_the_mujoco_field_of_view():
    K = P.intrinsics(60.0, 640, 480)
    # a point on the top edge of the image is 30 deg above the optical axis
    assert math.degrees(math.atan2(K[1, 2], K[1, 1])) == pytest.approx(30.0)


def test_detect_and_locate_a_rendered_marker(tmp_path):
    cv2 = pytest.importorskip("cv2")
    import mujoco

    png = tmp_path / "m.png"
    cv2.imwrite(str(png), P.marker_image(0, 320))
    xml = f"""<mujoco><asset><texture name="t" type="2d" file="{png}"/><material name="m" texture="t"/></asset>
    <visual><global offwidth="1280" offheight="720"/></visual>
    <worldbody><light pos="0 0 2"/><geom type="plane" size="1 1 0.1" rgba=".5 .5 .5 1"/>
    <body pos="0.3 -0.1 0.02"><geom type="box" size=".02 .02 .02" rgba=".2 .5 .9 1"/>
    <geom type="box" size=".02 .02 .0005" pos="0 0 .0205" material="m"/></body>
    <camera name="c" pos="0 0 0.55" xyaxes="0 -1 0 0.88 0 0.48" fovy="60"/></worldbody></mujoco>"""
    m = mujoco.MjModel.from_xml_string(xml)
    d = mujoco.MjData(m)
    mujoco.mj_forward(m, d)
    with mujoco.Renderer(m, 720, 1280) as r:
        r.update_scene(d, camera="c")
        img = r.render()
    corners = P.detect(img)
    assert corners is not None
    c = d.cam("c")
    K = P.intrinsics(60.0, 1280, 720)
    est = P.locate_on_plane(corners, K, c.xpos, c.xmat.reshape(3, 3), 0.041)
    assert np.hypot(est[0] - 0.3, est[1] + 0.1) < 0.002
