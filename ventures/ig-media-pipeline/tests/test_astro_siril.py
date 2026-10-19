import shutil
from types import SimpleNamespace

import numpy as np
import pytest

from igmp import astro_core as core
from igmp import astro_siril as siril
from test_astro import H, HORIZON_Y, W, sky_frame

needs_siril = pytest.mark.skipif(not shutil.which("siril-cli"), reason="siril not installed")
CFG = SimpleNamespace(extra={})


def test_fits_round_trip_keeps_orientation(tmp_path):
    img = np.zeros((40, 60, 3), np.float32)
    img[2, 5] = (1, 0.5, 0.25)                      # near the top-left corner
    siril.write_fits(tmp_path / "a.fit", img)
    back = siril.read_fits(tmp_path / "a.fit")
    assert back.shape == img.shape and np.array_equal(back, img)
    assert (tmp_path / "a.fit").stat().st_size % 2880 == 0


def test_land_is_filled_with_sky_tone():
    f = sky_frame(0)
    f[int(H * 0.9), 100] = 1.0                      # a lit window on the land
    sky = core.horizon_mask([(0, HORIZON_Y), (1, HORIZON_Y)], (H, W))
    out = siril.sky_only(f, sky)
    assert np.allclose(out[~sky], out[~sky][0]) and np.array_equal(out[sky], f[sky])


def test_script_registers_on_our_reference_and_stacks_with_rejection():
    s = siril.script(5)
    assert "setref sky_ 5" in s and "-transf=homography" in s and "rej w 3 3" in s and "-32b" in s


def test_turned_off_or_missing_means_builtin():
    assert siril.cli(SimpleNamespace(extra={"astro_stacker": "builtin"})) is None
    assert siril.cli(SimpleNamespace(extra={"siril_cli": "/nonexistent/siril-cli"})) is None


@needs_siril
def test_siril_stack_aligns_onto_the_reference_and_cuts_noise():
    frames = [sky_frame(k, deg_per_frame=0.08) for k in range(9)]
    sky = core.horizon_mask([(0, HORIZON_Y), (1, HORIZON_Y)], (H, W))
    ref = 4
    out = siril.stack(frames, sky, ref, CFG)
    clean = sky_frame(ref, noise=0.0)
    # bright stars sit where the reference has them, at close to full peak
    for x, y, _ in core.find_stars(core.luminance(clean), mask=sky)[:15]:
        yi, xi = int(round(y)), int(round(x))
        if 10 < xi < W - 10 and 10 < yi < H * HORIZON_Y - 10:
            assert out[yi - 1:yi + 2, xi - 1:xi + 2, 0].max() == pytest.approx(
                clean[yi - 1:yi + 2, xi - 1:xi + 2, 0].max(), rel=0.35)
    patch = (slice(40, 120), slice(200, 400))
    assert np.std(out[patch] - clean[patch]) < 0.6 * np.std(frames[ref][patch] - clean[patch])


@needs_siril
def test_siril_failure_raises_for_the_fallback():
    blank = [np.full((H, W, 3), 0.05, np.float32) for _ in range(3)]
    with pytest.raises(siril.SirilError):
        siril.stack(blank, np.ones((H, W), bool), 1, CFG)
