import numpy as np
import cv2
from skimage import data
from sensing_matchreal import classify, sift_matches


def test_classify_labels_each_class_and_nan():
    err = np.array([[1, 1], [10, 0.5], [10, 10], [100, 50], [np.nan, np.nan]], float)
    assert list(classify(err)) == ["ok", "along", "near", "far", "nan"]


def test_classify_respects_epipolar_direction():
    err = np.array([[0.5, 12.0]])
    assert classify(err)[0] == "near"
    assert classify(err, epipolar_dir=(0.0, 1.0))[0] == "along"


def test_identity_pair_matches_itself_with_low_ratio():
    im = (data.camera()).astype(np.uint8)
    p1, p2, ratio, mutual = sift_matches(im, im, nfeatures=500)
    assert np.hypot(*(p2 - p1).T).max() < 1e-6 and np.median(ratio) < 0.2 and mutual.all()


def test_translated_pair_errors_match_translation():
    im = data.camera().astype(np.uint8)
    M = np.float32([[1, 0, 7], [0, 1, 3]])
    im2 = cv2.warpAffine(im, M, (im.shape[1], im.shape[0]))
    p1, p2, ratio, mutual = sift_matches(im, im2, nfeatures=500)
    good = ratio < 0.7
    err = p2[good] - (p1[good] + [7, 3])
    assert good.sum() > 50 and np.median(np.hypot(*err.T)) < 1.0
