import numpy as np
from capture_novelview.scene import render, camera, W, H
from capture_novelview.synth import synthesise, psnr, warp, fill_holes, hole_fraction


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


def _pair(gap, bystanders=()):
    a, b, t = 20 - gap / 2, 20 + gap / 2, 20.0
    ca, za = render(a, bystanders)
    cb, zb = render(b, bystanders)
    truth, zt = render(t, bystanders)
    out, have = synthesise([(ca, za, a), (cb, zb, b)], t)
    return ca, cb, truth, zt, out, have


def test_hole_filled_synthesis_beats_nearest_camera_at_wide_gaps():
    # quality audit 2026-11-17: with holes left sky blue the warp lost to the nearest camera past
    # about 30 degrees; filled from that camera (any real DIBR fallback) it wins at every gap.
    for gap in (45, 90):
        ca, cb, truth, _, out, have = _pair(gap)
        assert psnr(fill_holes(out, have, cb), truth) > psnr(cb, truth) + 3


def test_hole_fraction_is_over_non_sky_pixels():
    have = np.zeros((2, 4), bool)
    sky = np.zeros((2, 4), bool)
    sky[0] = True            # half the frame is sky
    have[1, :2] = True       # half the surface reached
    assert hole_fraction(have, sky) == 0.5
    _, _, _, zt, _, have = _pair(45)
    sky = ~np.isfinite(zt)
    assert hole_fraction(have, sky) > float((~(have | sky)).mean())


def test_warped_pixels_match_truth_at_a_real_gap():
    # identity warps cannot see a depth-scale or z-buffer error; a 15 degree warp can
    _, _, truth, zt, out, have = _pair(15)
    assert psnr(out, truth, have & np.isfinite(zt)) > 28
