import numpy as np
from capture_novelview.scene import render, camera, W, H
from capture_novelview.synth import synthesise, psnr, warp


def test_render_deterministic_and_shapes():
    c1, z1 = render(10)
    c2, z2 = render(10)
    assert c1.shape == (H, W, 3) and z1.shape == (H, W)
    assert np.array_equal(c1, c2)
    assert np.isfinite(z1).any() and (~np.isfinite(z1)).any()  # ground/subject and sky


def test_subject_is_nearer_than_ground_behind_it():
    _, z = render(0)
    assert z[H // 2, W // 2] < 3.2  # the cylinder, about R - r from the camera


def test_warp_to_same_pose_is_identity_on_valid_pixels():
    c, z = render(20)
    out, ok = warp(c, z, 20, 20)
    m = ok & np.isfinite(z)
    assert m.mean() > 0.6
    assert psnr(out, c, m) > 40


def test_synthesis_beats_nearest_camera_at_small_gap():
    a, b, t = 18.0, 22.0, 20.0
    ca, za = render(a)
    cb, zb = render(b)
    truth, _ = render(t)
    out, have = synthesise([(ca, za, a), (cb, zb, b)], t)
    assert psnr(out, truth) > psnr(ca, truth)


def test_error_grows_with_gap():
    def p(g):
        a, b, t = 20 - g / 2, 20 + g / 2, 20.0
        ca, za = render(a)
        cb, zb = render(b)
        truth, _ = render(t)
        return psnr(synthesise([(ca, za, a), (cb, zb, b)], t)[0], truth)
    assert p(4) > p(30) > p(90)


def test_depth_noise_hurts():
    a, b, t = 12.5, 27.5, 20.0
    ca, za = render(a)
    cb, zb = render(b)
    truth, _ = render(t)
    clean = psnr(synthesise([(ca, za, a), (cb, zb, b)], t)[0], truth)
    noisy = psnr(synthesise([(ca, za, a), (cb, zb, b)], t, depth_noise=0.1)[0], truth)
    assert noisy < clean


def test_camera_faces_target():
    c, rot = camera(37)
    to_t = np.array([0, 0.9, 0]) - c
    assert np.dot(rot[2], to_t / np.linalg.norm(to_t)) > 0.999
