import math
import pytest
from capture_crop import (FF_HALF_DIAG_MM, px_per_degree, focal_px, native_equiv_focal,
                          equirect_width_for, crop_upscale, distance_for_framing,
                          feature_magnification, background_scale)


def test_half_diagonal():
    assert FF_HALF_DIAG_MM == pytest.approx(21.633, abs=1e-3)


def test_px_per_degree():
    assert px_per_degree(7680) == pytest.approx(21.333, abs=1e-3)


def test_focal_px_matches_angular_pitch():
    f = focal_px(7680)
    # one pixel at the centre subtends 1/f rad = 360/W degrees
    assert math.degrees(1 / f) == pytest.approx(360 / 7680)


def test_native_focal_8k_vertical_1080():
    assert native_equiv_focal(7680, 1080, 1920) == pytest.approx(24.0, abs=0.1)


def test_native_focal_scales_with_width_and_inverse_output():
    a = native_equiv_focal(7680, 1080, 1920)
    assert native_equiv_focal(15360, 1080, 1920) == pytest.approx(2 * a)
    assert native_equiv_focal(7680, 2160, 3840) == pytest.approx(a / 2)


def test_inverse_round_trip():
    for f in (16, 24, 35, 50, 85, 135):
        w = equirect_width_for(f, 1080, 1920)
        assert native_equiv_focal(w, 1080, 1920) == pytest.approx(f)


def test_upscale_floor_and_ratio():
    assert crop_upscale(7680, 16, 1080, 1920) == 1.0
    assert crop_upscale(7680, 48, 1080, 1920) == pytest.approx(2.0, rel=0.01)


def test_distance_for_framing():
    # 50 mm on a 24 mm short side, 0.3 m head: 0.625 m
    assert distance_for_framing(50, 0.3) == pytest.approx(0.625)


def test_feature_magnification():
    assert feature_magnification(1.0, 0.1) == pytest.approx(1 / 0.9)
    assert feature_magnification(3.0, 0.1) < feature_magnification(0.8, 0.1)
    with pytest.raises(ValueError):
        feature_magnification(0.1, 0.1)


def test_background_scale_grows_with_distance():
    assert background_scale(3.0, 20) > background_scale(0.8, 20)
    assert background_scale(1.0, 0.0) == 1.0
