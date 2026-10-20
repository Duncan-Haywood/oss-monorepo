import configparser
import json
import os
import sys
import textwrap
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from igmp import colourmatch as cm
from igmp import rawedit
from igmp.config import Config
from igmp.models import EditParams

SRC = Path(__file__).resolve().parents[1] / "src"


# ---------------------------------------------------------------- synthetic scenes

def scene(h=320, w=480, seed=0) -> np.ndarray:
    """A textured test picture with a wide spread of colours: smooth colour fields (sky-like
    blues, foliage, skin-like tones, greys) plus fine luminance texture to align on."""
    rng = np.random.default_rng(seed)
    coarse = rng.random((6, 9, 3)).astype(np.float32)
    field = cm._resize(coarse, (w, h))                       # smooth colour field
    yy = np.mgrid[:h, :w][0] / max(h, w)
    sky = np.stack([0.35 + 0.2 * yy, 0.55 + 0.2 * yy, 0.9 - 0.1 * yy], -1)
    img = np.where((yy < 0.25)[..., None], sky, field * 0.8 + 0.1)
    texture = cm.blur(rng.standard_normal((h, w)).astype(np.float32), 1.0) * 0.08
    for _ in range(25):                                      # flat patches with sharp edges
        y0, x0 = rng.integers(0, h - 40), rng.integers(0, w - 60)
        img[y0:y0 + rng.integers(15, 40), x0:x0 + rng.integers(20, 60)] = rng.random(3) * 0.8 + 0.1
    return np.clip(img + texture[..., None], 0.02, 0.95).astype(np.float32)


def camera_look(rgb: np.ndarray) -> np.ndarray:
    """A made-up 'camera rendering': blues lean cyan, reds warmer, a little more contrast."""
    lin = cm.srgb_to_linear(rgb)
    m = np.array([[1.10, -0.06, -0.04], [-0.03, 1.04, -0.01], [0.00, 0.14, 0.86]])
    out = cm.linear_to_srgb(np.clip(lin @ m.T, 0, 1))
    return np.clip(0.5 + (out - 0.5) * 1.06, 0, 1)


def as_camera_jpeg(rgb: np.ndarray, path: Path, *, upscale=2.0, band=16 / 9, rotate=False, quality=95):
    """Save ``rgb`` the way a camera would: a centred band of another aspect, bigger, as a JPEG."""
    h, w = rgb.shape[:2]
    bh = min(h, round(w / band))
    y0 = (h - bh) // 2
    band_img = cm._resize(rgb[y0:y0 + bh], (round(w * upscale), round(bh * upscale)))
    im = Image.fromarray((np.clip(band_img, 0, 1) * 255 + 0.5).astype(np.uint8))
    if rotate:
        im = im.transpose(Image.Transpose.ROTATE_90)
    im.save(path, quality=quality)
    return path


# ---------------------------------------------------------------- colour maths

# Sharma, Wu & Dalal (2005) CIEDE2000 test pairs
SHARMA = [((50, 2.6772, -79.7751), (50, 0, -82.7485), 2.0425),
          ((50, 0, 0), (50, -1, 2), 2.3669),
          ((50, 2.49, -0.001), (50, -2.49, 0.0009), 7.1792),
          ((50, -0.001, 2.49), (50, 0.0009, -2.49), 4.8045),
          ((50, 2.5, 0), (73, 25, -18), 27.1492),
          ((60.2574, -34.0099, 36.2677), (60.4626, -34.1751, 39.4387), 1.2644),
          ((22.7233, 20.0904, -46.694), (23.0331, 14.973, -42.5619), 2.0373),
          ((90.8027, -2.0831, 1.441), (91.1528, -1.6435, 0.0447), 1.4441)]


def test_delta_e2000_matches_published_pairs():
    a = np.array([p[0] for p in SHARMA], float)
    b = np.array([p[1] for p in SHARMA], float)
    assert cm.delta_e2000(a, b) == pytest.approx([p[2] for p in SHARMA], abs=1e-4)
    assert cm.delta_e2000(b, a) == pytest.approx([p[2] for p in SHARMA], abs=1e-4)


def test_srgb_to_lab_reference_points():
    lab = cm.srgb_to_lab(np.array([[1.0, 1.0, 1.0], [0.0, 0.0, 0.0], [0.5, 0.5, 0.5]]))
    assert lab[0] == pytest.approx([100, 0, 0], abs=0.01)
    assert lab[1] == pytest.approx([0, 0, 0], abs=0.01)
    assert lab[2][0] == pytest.approx(53.39, abs=0.05) and abs(lab[2][1]) < 0.01
    assert cm.linear_to_srgb(cm.srgb_to_linear(np.linspace(0, 1, 11))) == pytest.approx(np.linspace(0, 1, 11))


# ---------------------------------------------------------------- lattice and HaldCLUT

def test_identity_lattice_is_identity():
    x = np.random.default_rng(1).random((1000, 3))
    assert cm.apply_lattice(cm.identity_lattice(17), x) == pytest.approx(x, abs=1e-12)


def test_hald_identity_layout():
    # level 2: 4 nodes per axis, 8x8 image, red fastest, then green, then blue
    h = cm.hald_identity(2)
    assert h.shape == (8, 8, 3)
    flat = h.reshape(-1, 3)
    for i in (0, 1, 5, 17, 63):
        assert flat[i] == pytest.approx([(i % 4) / 3, ((i // 4) % 4) / 3, (i // 16) / 3])


def test_png16_roundtrip_and_hald_of_identity_is_identity(tmp_path):
    path = tmp_path / "id.png"
    cm.write_hald(cm.identity_lattice(17), path, level=4)
    with Image.open(path) as im:                    # a valid PNG of the right size
        assert im.size == (64, 64)
    raw = path.read_bytes()
    assert raw[24] == 16 and raw[25] == 2           # IHDR bit depth 16, colour type RGB
    back = cm.read_png16(path)
    assert back == pytest.approx(cm.hald_identity(4), abs=1 / 65535)


def test_fit_lattice_learns_seen_colours_and_leaves_unseen_ones():
    rng = np.random.default_rng(2)
    # data only around blues and greys
    blues = np.clip(np.array([0.3, 0.45, 0.8]) + rng.normal(0, 0.06, (3000, 3)), 0, 1)
    greys = np.repeat(rng.random((2000, 1)), 3, 1)
    x = np.vstack([blues, greys])
    y = camera_look(x)
    lat = cm.fit_lattice(*cm.bin_pairs(x, y)[:3])
    assert np.abs(cm.apply_lattice(lat, blues) - camera_look(blues)).mean() < 0.01
    red = np.array([[0.85, 0.15, 0.1]])             # far from any data: barely touched
    assert np.abs(cm.apply_lattice(lat, red) - red).max() < 0.04
    # smooth: no large second differences anywhere in the lattice
    g = lat.reshape(17, 17, 17, 3)
    assert max(np.abs(np.diff(g, 2, axis=a)).max() for a in range(3)) < 0.08


def test_reduce_render_gives_block_means_and_spread():
    rng = np.random.default_rng(3)
    base = np.repeat(np.repeat(rng.integers(40, 200, (4, 6, 3)), 5, 0), 5, 1)       # 20x30, 5x5 blocks
    noise = rng.choice([-10, 10], size=base.shape)                                  # +-10 levels
    full = (base + noise).astype(np.uint8)
    mean, cov = cm.reduce_render(full, edge=6)
    assert mean.shape == (4, 6, 3) and cov.shape == (4, 6, 6)
    assert mean == pytest.approx(full.reshape(4, 5, 6, 5, 3).mean((1, 3)) / 255, abs=1e-6)
    assert cov[..., :3].mean() == pytest.approx((10 / 255) ** 2, rel=0.15)           # per-channel variance
    assert np.abs(cov[..., 3:]).mean() < cov[..., :3].mean() / 3                      # independent channels


def test_noise_aware_fit_is_right_for_noisy_pixels(tmp_path):
    """The LUT is applied to every noisy full-resolution pixel and seen downscaled; a fit that
    knows the spread must land closer to the camera's colours than one that assumes clean ones."""
    rng = np.random.default_rng(4)
    clean = scene(160, 240, seed=6)
    big = np.repeat(np.repeat(clean, 6, 0), 6, 1)
    full = np.clip(np.round((big + rng.normal(0, 0.07, big.shape)) * 255), 0, 255).astype(np.uint8)
    mean, cov = cm.reduce_render(full, edge=240)
    cam = cm.load_reference(as_camera_jpeg(camera_look(clean), tmp_path / "cam.jpg", upscale=4), min_edge=240)
    target = camera_look(clean)

    def seen(lattice):                  # LUT on every pixel, then shrunk, vs the camera's colours
        out = cm.apply_lattice(lattice, full.astype(np.float64) / 255).reshape(160, 6, 240, 6, 3).mean((1, 3))
        return cm.mean_delta_e(out[40:120, 40:200], target[40:120, 40:200])

    plain = cm.fit_camera_map(mean, cam)
    aware = cm.fit_camera_map(mean, cam, cov)
    assert seen(aware.lattice) < 0.95 * seen(plain.lattice)


# ---------------------------------------------------------------- alignment and the fit

def test_load_reference_orients_and_decodes_small(tmp_path):
    img = Image.new("RGB", (2400, 1200), (200, 120, 40))
    exif = Image.Exif()
    exif[0x0112] = 6                                 # stored landscape, shown portrait
    path = tmp_path / "cam.jpg"
    img.save(path, exif=exif.tobytes(), quality=95)
    ref = cm.load_reference(path, min_edge=500)
    assert ref.shape[0] > ref.shape[1] and max(ref.shape[:2]) >= 500
    assert max(ref.shape[:2]) <= 1200                # DCT-scaled, not decoded at full size
    assert ref[5, 5] == pytest.approx(np.array([200, 120, 40]) / 255, abs=0.02)


def test_load_reference_converts_adobe_rgb(tmp_path):
    exif = Image.Exif()
    exif.get_ifd(0x8769)[0xA001] = 0xFFFF           # how cameras mark an Adobe RGB JPEG
    path = tmp_path / "adobe.jpg"
    Image.new("RGB", (64, 64), (60, 200, 60)).save(path, exif=exif.tobytes(), quality=100)
    srgb = cm.load_reference(path, min_edge=32)[10, 10]
    # Adobe RGB green is outside sRGB: same pixel values read as sRGB would be duller
    assert srgb[1] > 200 / 255 and srgb[0] < 60 / 255


def test_align_finds_crop_scale_and_rotation(tmp_path):
    img = scene()
    ref = cm.load_reference(as_camera_jpeg(img, tmp_path / "cam.jpg", upscale=2.2, rotate=True), min_edge=400)
    a = cm.align(img, ref)
    assert a is not None and a["ncc"] > 0.8 and a["rot"] in (90, 270)
    assert a["scale"] == pytest.approx(480 / ref.shape[0], rel=0.01)     # ref is rotated back
    assert a["mask"].mean() == pytest.approx(270 / 320, abs=0.02)        # the 16:9 band
    m = cm._erode(a["mask"], 3)
    assert np.abs(cm.blur(a["ref"], 1.5)[m] - cm.blur(img, 1.5)[m]).mean() < 0.02


def test_align_rejects_an_unrelated_picture():
    a = cm.align(scene(seed=3), scene(seed=4))
    assert a is None or a["ncc"] < cm.MIN_NCC


def test_fit_camera_map_learns_the_camera_look(tmp_path):
    img = scene()
    cam = cm.load_reference(as_camera_jpeg(camera_look(img), tmp_path / "cam.jpg"), min_edge=400)
    fit = cm.fit_camera_map(img, cam)
    assert fit.heldout_after < fit.heldout_before / 2
    assert fit.after < fit.before / 2 and fit.after < 1.5
    # the map is the look on the colours of the scene
    sample = img[::7, ::7].reshape(-1, 3)
    assert cm.mean_delta_e(cm.apply_lattice(fit.lattice, sample), camera_look(sample)) < 1.5


def test_fit_camera_map_refuses_a_jpeg_of_another_photo(tmp_path):
    cam = cm.load_reference(as_camera_jpeg(scene(seed=5), tmp_path / "other.jpg"), min_edge=400)
    with pytest.raises(cm.ColourMatchError):
        cm.fit_camera_map(scene(), cam)


def test_fit_camera_map_refuses_when_there_is_nothing_to_gain(tmp_path):
    img = scene()
    cam = cm.load_reference(as_camera_jpeg(img, tmp_path / "same.jpg", quality=100), min_edge=400)
    with pytest.raises(cm.ColourMatchError, match="generalise"):
        cm.fit_camera_map(img, cam)


# ---------------------------------------------------------------- render_raw with a stand-in RawTherapee

FAKE_CLI = textwrap.dedent("""\
    #!{python}
    # Stand-in for rawtherapee-cli: renders a stored test picture, applying the profile's
    # [Film Simulation] HaldCLUT the way RawTherapee does (trilinear, sRGB-encoded).
    import configparser, os, sys
    import numpy as np
    from PIL import Image
    from igmp import colourmatch as cm
    args = sys.argv[1:]
    out = args[args.index("-o") + 1]
    profile = configparser.ConfigParser(interpolation=None)
    profile.optionxform = str
    profile.read(args[args.index("-p") + 1])
    reference = profile.get("Crop", "Enabled", fallback="true") == "false"     # the uncropped colour reference
    with open(os.environ["FAKE_RT_LOG"], "a") as log:
        log.write(("reference" if reference else "final") + "\\n")
    img = np.load(os.environ["FAKE_RT_SCENE"])
    if profile.get("Film Simulation", "Enabled", fallback="false") == "true":
        clut = cm.read_png16(profile.get("Film Simulation", "ClutFilename"))
        img = cm.apply_lattice(clut.reshape(-1, 3), img)
    im = Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8))
    if not reference:
        im = im.resize((im.width * 2, im.height * 2))
    im.save(out, "TIFF" if "-t" in args else "JPEG", quality=95)
""")


@pytest.fixture
def fake_rt(tmp_path, monkeypatch):
    """A RAW-like file, a camera JPEG with a known look, and a stand-in rawtherapee-cli."""
    img = scene()
    np.save(tmp_path / "scene.npy", img)
    cli = tmp_path / "rawtherapee-cli"
    cli.write_text(FAKE_CLI.format(python=sys.executable))
    cli.chmod(0o755)
    src = tmp_path / "library"
    src.mkdir()
    raw = src / "DSC00001.ARW"
    raw.write_bytes(b"not really a raw file")
    cam = as_camera_jpeg(camera_look(img), src / "DSC00001.JPG")
    monkeypatch.setenv("FAKE_RT_SCENE", str(tmp_path / "scene.npy"))
    monkeypatch.setenv("FAKE_RT_LOG", str(tmp_path / "rt.log"))
    monkeypatch.setenv("PYTHONPATH", str(SRC) + os.pathsep + os.environ.get("PYTHONPATH", ""))
    monkeypatch.setattr(rawedit, "_raw_info", lambda path: ((960, 640), True, 0))   # no embedded JPEG
    cfg = Config(library_roots=[], output_dir=tmp_path, rawtherapee_cli=str(cli))

    def calls():                        # which renders the stand-in was asked for, in order
        log = tmp_path / "rt.log"
        return log.read_text().split() if log.exists() else []

    return {"img": img, "raw": raw, "cam": cam, "cfg": cfg, "src": src, "out": tmp_path / "edits", "calls": calls}


def _profile(path) -> configparser.ConfigParser:
    cp = configparser.ConfigParser(interpolation=None)
    cp.optionxform = str
    cp.read(path)
    return cp


def test_render_raw_matches_camera_colour_and_caches_the_lut(fake_rt):
    f = fake_rt
    before = sorted(os.listdir(f["src"]))
    r = rawedit.render_raw(f["raw"], EditParams(), f["out"], f["cfg"], camera_jpeg=f["cam"])
    c = r["colour"]
    assert c["status"] == "matched" and c["reference"] == "camera JPEG" and not c["cached"]
    assert c["heldout_de"][1] < c["heldout_de"][0]
    clut = Path(c["clut"])
    assert clut.is_file() and clut.parent == f["out"] and clut.name.endswith("_sRGB.png")
    fs = _profile(r["pp3"])["Film Simulation"]
    assert fs["Enabled"] == "true" and fs["ClutFilename"] == str(clut) and fs["Strength"] == "100"
    assert _profile(r["pp3"])["Vibrance"]["Enabled"] == "false"         # no base vibrance on top
    # the render through the LUT is much closer to the camera's colours than the plain one
    with Image.open(r["full"]) as im:
        out = cm.to_array(im.resize((480, 320), Image.BOX))
    look = camera_look(f["img"])
    assert cm.mean_delta_e(out, look) < cm.mean_delta_e(f["img"], look) / 2
    assert f["calls"]() == ["reference", "final"]
    # a second edit of the same RAW reuses the LUT: no second reference render
    r2 = rawedit.render_raw(f["raw"], EditParams(exposure_ev=0.3), f["out"], f["cfg"], camera_jpeg=f["cam"])
    assert r2["colour"]["cached"] and r2["colour"]["clut"] == c["clut"]
    assert f["calls"]() == ["reference", "final", "final"]
    assert sorted(os.listdir(f["src"])) == before                      # nothing written next to the source
    assert not [p for p in f["out"].iterdir() if p.name.startswith(".rt-")]
    meta = json.loads(next(f["out"].glob(".DSC00001.colour-*.json")).read_text())
    assert meta["status"] == "matched"


def test_render_raw_colour_match_off_or_without_camera_jpeg(fake_rt):
    f = fake_rt
    off = rawedit.render_raw(f["raw"], EditParams(), f["out"], f["cfg"], camera_jpeg=f["cam"], colour_match=False)
    assert off["colour"] == {"status": "off"}
    cp = _profile(off["pp3"])
    assert cp["Film Simulation"]["Enabled"] == "false"
    assert cp["Vibrance"]["Pastels"] == str(rawedit.BASE_VIBRANCE)      # base look instead
    none = rawedit.render_raw(f["raw"], EditParams(), f["out"], f["cfg"])   # no JPEG, no embedded one
    assert none["colour"]["status"] == "no camera JPEG"
    assert f["calls"]() == ["final", "final"]
    cfg_off = Config(library_roots=[], output_dir=f["cfg"].output_dir, rawtherapee_cli=f["cfg"].rawtherapee_cli,
                     extra={"colour_match": "off"})
    r = rawedit.render_raw(f["raw"], EditParams(), f["out"], cfg_off, camera_jpeg=f["cam"])
    assert r["colour"]["status"] == "off"


def test_render_raw_falls_back_when_the_jpeg_is_of_another_photo(fake_rt, tmp_path):
    f = fake_rt
    wrong = as_camera_jpeg(scene(seed=9), tmp_path / "wrong.jpg")
    r = rawedit.render_raw(f["raw"], EditParams(), f["out"], f["cfg"], camera_jpeg=wrong)
    assert r["colour"]["status"].startswith("failed:") and r["full"].exists()
    assert _profile(r["pp3"])["Film Simulation"]["Enabled"] == "false"
    # the verdict is cached: a revision does not render the reference again
    r2 = rawedit.render_raw(f["raw"], EditParams(exposure_ev=0.2), f["out"], f["cfg"], camera_jpeg=wrong)
    assert r2["colour"]["cached"] and r2["colour"]["status"] == r["colour"]["status"]
    assert f["calls"]() == ["reference", "final", "final"]


def test_render_raw_survives_a_broken_reference_render(fake_rt, monkeypatch):
    f = fake_rt

    def broken(*a, **k):
        raise rawedit.RawRenderError("simulated failure")

    monkeypatch.setattr(rawedit, "_render_reference", broken)
    r = rawedit.render_raw(f["raw"], EditParams(), f["out"], f["cfg"], camera_jpeg=f["cam"])
    assert r["colour"]["status"].startswith("failed:") and r["full"].exists()
    assert not list(f["out"].glob(".DSC00001.colour-*"))                 # not cached: retried next time


def test_prepare_colour_match_warms_the_cache(fake_rt):
    f = fake_rt
    info = rawedit.prepare_colour_match(f["raw"], f["out"], f["cfg"], camera_jpeg=f["cam"])
    assert info["status"] == "matched"
    r = rawedit.render_raw(f["raw"], EditParams(), f["out"], f["cfg"], camera_jpeg=f["cam"])
    assert r["colour"]["cached"] and f["calls"]() == ["reference", "final"]
