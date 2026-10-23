import numpy as np
import cv2
from skimage import data

from sensing_kploc.kploc import apply_h, degrade, localisation_errors, random_homography, summarise


def img():
    return cv2.cvtColor(data.astronaut(), cv2.COLOR_RGB2GRAY)


def test_apply_h_identity_and_shift():
    p = np.array([[10.0, 20.0], [5.5, 7.0]])
    assert np.allclose(apply_h(np.eye(3), p), p)
    H = np.eye(3)
    H[:2, 2] = [3, -2]
    assert np.allclose(apply_h(H, p), p + [3, -2])


def test_random_homography_near_identity():
    H = random_homography(np.random.default_rng(0), (512, 512))
    assert abs(np.linalg.det(H[:2, :2]) - 1) < 0.5 and abs(H[2, 2] - 1) < 1e-9


def test_degrade_noise_level_and_blur():
    a = np.full((200, 200), 128, np.uint8)
    n = degrade(a, noise_sigma=10, rng=np.random.default_rng(0))
    assert 9 < n.astype(float).std() < 11
    assert degrade(a, blur_sigma=2).std() == 0


def test_integer_shift_is_exact():
    a = img()
    H = np.eye(3)
    H[:2, 2] = [7, 4]
    b = cv2.warpPerspective(a, H, a.shape[::-1])
    e, _, k = localisation_errors(a, b, H)
    assert len(e) > 100 and np.abs(np.median(e)) < 0.01


def test_noise_raises_error():
    rng = np.random.default_rng(0)
    a = img()
    H = random_homography(np.random.default_rng(1), a.shape)
    b = cv2.warpPerspective(a, H, a.shape[::-1])
    clean = summarise(localisation_errors(a, b, H)[0])["rms"]
    noisy = summarise(localisation_errors(degrade(a, 20, rng=rng), degrade(b, 20, rng=rng), H)[0])["rms"]
    assert noisy > clean
