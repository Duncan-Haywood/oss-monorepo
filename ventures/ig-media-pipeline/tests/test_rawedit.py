import configparser
import os
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from igmp import colourmatch, rawedit
from igmp.config import Config
from igmp.models import EditParams, Point

A7RV = (9556, 6366)            # what RawTherapee renders from an A7RV ARW, landscape
A7RV_PORTRAIT = (6366, 9556)


def parse(pp3: str) -> configparser.ConfigParser:
    cp = configparser.ConfigParser(interpolation=None)
    cp.optionxform = str        # RawTherapee keys are case-sensitive
    cp.read_string(pp3)
    return cp


# ---------------------------------------------------------------- crop maths

def test_aspect_ratio():
    assert rawedit.aspect_ratio("4:5") == pytest.approx(0.8)
    assert rawedit.aspect_ratio("3:4") == pytest.approx(0.75)
    with pytest.raises(ValueError):
        rawedit.aspect_ratio("16:9")


@pytest.mark.parametrize("aspect", ["4:5", "3:4"])
@pytest.mark.parametrize("frame", [A7RV, A7RV_PORTRAIT, (11896, 5944), (1001, 999)])
def test_default_crop_is_largest_centred_box_of_exact_aspect(aspect, frame):
    x, y, w, h = rawedit.crop_box(frame, aspect)
    fw, fh = frame
    assert abs(w / h - rawedit.aspect_ratio(aspect)) * h < 1          # exact within 1 px
    assert 0 <= x and 0 <= y and x + w <= fw and y + h <= fh
    aw, ah = rawedit.ASPECTS[aspect]
    assert w + aw > fw or h + ah > fh                                    # next size up would not fit
    assert abs((x + w / 2) - fw / 2) <= 1 and abs((y + h / 2) - fh / 2) <= 1


def test_landscape_source_uses_full_height_portrait_source_full_width():
    assert rawedit.crop_box(A7RV, "4:5")[3] == 6365                      # 5 * 1273
    x, y, w, h = rawedit.crop_box(A7RV_PORTRAIT, "4:5")
    assert w == 6364 and h == 7955                                       # 6366 wide is the limit


@pytest.mark.parametrize("aspect", ["4:5", "3:4"])
@pytest.mark.parametrize("focus", [(0, 0), (1, 1), (0, 1), (1, 0), (0.02, 0.97)])
@pytest.mark.parametrize("frame", [A7RV, A7RV_PORTRAIT])
def test_focus_near_corners_is_clamped_inside(aspect, focus, frame):
    for zoom in (1.0, 1.4, 2.0):
        x, y, w, h = rawedit.crop_box(frame, aspect, Point(x=focus[0], y=focus[1]), zoom)
        assert 0 <= x and 0 <= y and x + w <= frame[0] and y + h <= frame[1]
        # pushed against the edge the focus is nearest to
        if focus[0] == 0:
            assert x == 0
        if focus[0] == 1:
            assert x + w == frame[0]


def test_zoom_shrinks_box_around_focus():
    base = rawedit.crop_box(A7RV, "4:5", (0.5, 0.5), 1.0)
    zoomed = rawedit.crop_box(A7RV, "4:5", (0.5, 0.5), 2.0)
    assert zoomed[2] == pytest.approx(base[2] / 2, abs=4)
    assert zoomed[3] == pytest.approx(base[3] / 2, abs=5)
    x, y, w, h = rawedit.crop_box(A7RV, "4:5", (0.35, 0.6), 1.4)
    assert abs(x + w / 2 - 0.35 * A7RV[0]) <= 1 and abs(y + h / 2 - 0.6 * A7RV[1]) <= 1


def test_margin_keeps_crop_off_the_edges():
    x, y, w, h = rawedit.crop_box(A7RV, "4:5", (0, 0), 1.0, margin=8)
    assert (x, y) == (8, 8) and y + h <= A7RV[1] - 8
    x, y, w, h = rawedit.crop_box(A7RV, "3:4", (1, 1), 1.3, margin=8)
    assert x + w == A7RV[0] - 8 or x + w <= A7RV[0] - 8
    assert y + h <= A7RV[1] - 8


def test_crop_box_never_exceeds_frame_and_rejects_tiny_frames():
    for frame in [(5, 5), (4, 5), (100, 3)]:
        try:
            x, y, w, h = rawedit.crop_box(frame, "4:5")
        except ValueError:
            continue
        assert x + w <= frame[0] and y + h <= frame[1]
    with pytest.raises(ValueError):
        rawedit.crop_box((3, 3), "4:5")


# ---------------------------------------------------------------- profile

def test_default_profile_is_parseable_and_complete():
    cp = parse(rawedit.pp3_for(EditParams(), A7RV, "4:5"))
    for section in ["Version", "Exposure", "HLRecovery", "Shadows & Highlights", "Vibrance", "White Balance",
                    "Sharpening", "PostDemosaicSharpening", "Directional Pyramid Denoising", "Rotation",
                    "Common Properties for Transformations", "Crop", "LensProfile", "RAW", "Color Management"]:
        assert cp.has_section(section), section
    assert cp["Version"]["Version"] == str(rawedit.PP3_VERSION)
    assert cp["Exposure"]["HistogramMatching"] == "true"
    assert cp["Exposure"]["Compensation"] == "0"
    assert cp["HLRecovery"]["Enabled"] == "true"
    assert cp["Shadows & Highlights"]["Enabled"] == "false"
    assert cp["Vibrance"]["Enabled"] == "true"                       # the base look's small vibrance
    assert cp["Vibrance"]["Pastels"] == str(rawedit.BASE_VIBRANCE)
    if rawedit.BASE_BLUE_HUE_SHIFT_DEG:
        assert cp["HSV Equalizer"]["Enabled"] == "true" and cp["HSV Equalizer"]["HCurve"].startswith("1;")
    else:                                         # no base hue nudge: the equalizer stays off
        assert cp["HSV Equalizer"]["Enabled"] == "false"
    assert cp["Sharpening"]["Enabled"] == "true"
    assert cp["Directional Pyramid Denoising"]["Enabled"] == "false"
    assert cp["Rotation"]["Degree"] == "0"
    assert cp["Common Properties for Transformations"]["AutoFill"] == "true"
    assert cp["LensProfile"]["LcMode"] == "metadata"
    assert cp["Color Management"]["OutputProfile"] == "RTv4_sRGB"
    assert cp["Resize"]["Enabled"] == "false"


def test_profile_is_deterministic():
    p = EditParams(exposure_ev=0.7, temperature_k=6200, straighten_deg=3.0)
    assert rawedit.pp3_for(p, A7RV, "4:5") == rawedit.pp3_for(p.model_copy(), A7RV, "4:5")


def test_white_balance_camera_vs_custom():
    cam = parse(rawedit.pp3_for(EditParams(), A7RV, "4:5"))["White Balance"]
    assert cam["Setting"] == "Camera" and "Temperature" not in cam
    custom = parse(rawedit.pp3_for(EditParams(temperature_k=6200, tint=1.05), A7RV, "4:5"))["White Balance"]
    assert custom["Setting"] == "Custom"
    assert custom["Temperature"] == "6200"
    assert float(custom["Green"]) == pytest.approx(1.05)      # RT: Green > 1 is greener, like our tint


def test_tint_is_relative_to_camera_green():
    p = EditParams(temperature_k=5000, tint=1.1)
    wb = parse(rawedit.pp3_for(p, A7RV, "4:5", camera_green=0.82))["White Balance"]
    assert float(wb["Green"]) == pytest.approx(0.902)
    neutral = parse(rawedit.pp3_for(EditParams(temperature_k=5000), A7RV, "4:5", camera_green=0.56))
    assert float(neutral["White Balance"]["Green"]) == pytest.approx(0.56)
    # camera WB ignores it
    cam = parse(rawedit.pp3_for(EditParams(), A7RV, "4:5", camera_green=0.56))["White Balance"]
    assert "Green" not in cam


def test_strong_edit_maps_every_control():
    p = EditParams(exposure_ev=0.7, temperature_k=6200, tint=1.05, contrast=20, highlights=60, shadows=40,
                   black_point=50, vibrance=25, saturation=5, sharpening=150, noise_reduction=30,
                   straighten_deg=3.0, crop_focus=Point(x=0.35, y=0.6), crop_zoom=1.4)
    cp = parse(rawedit.pp3_for(p, A7RV, "4:5"))
    assert float(cp["Exposure"]["Compensation"]) == pytest.approx(0.7)
    assert cp["Exposure"]["Contrast"] == "20" and cp["Exposure"]["Saturation"] == "5"
    sh = cp["Shadows & Highlights"]
    assert sh["Enabled"] == "true" and sh["Highlights"] == "60" and sh["Shadows"] == "40"
    assert cp["Luminance Curve"]["Enabled"] == "true" and cp["Luminance Curve"]["LCurve"].startswith("1;")
    assert cp["Vibrance"]["Enabled"] == "true"
    assert cp["Vibrance"]["Pastels"] == str(25 + rawedit.BASE_VIBRANCE)
    nr = cp["Directional Pyramid Denoising"]
    assert nr["Enabled"] == "true" and int(nr["Luma"]) > 0 and int(nr["Chroma"]) > 0
    assert nr["CMethod"] == "MAN"                              # fixed chroma, no automatic estimate
    assert int(cp["Sharpening"]["Amount"]) > 0
    assert cp["Exposure"]["HighlightCompr"] == "30"           # half the highlight recovery
    assert float(cp["Rotation"]["Degree"]) == pytest.approx(-3.0)
    crop = cp["Crop"]
    box = tuple(int(crop[k]) for k in "XYWH")
    assert box == rawedit.crop_box(A7RV, "4:5", p.crop_focus, 1.4)
    assert crop["Enabled"] == "true"
    # RawTherapee's GUI stores a portrait 4:5 as Ratio=4:5 + Orientation=Landscape (see module)
    assert (crop["Ratio"], crop["Orientation"]) == ("4:5", "Landscape")


def test_sharpening_and_noise_reduction_off_at_zero():
    cp = parse(rawedit.pp3_for(EditParams(sharpening=0, noise_reduction=0), A7RV, "3:4"))
    assert cp["Sharpening"]["Enabled"] == "false"
    assert cp["PostDemosaicSharpening"]["Enabled"] == "false"
    assert cp["Directional Pyramid Denoising"]["Enabled"] == "false"
    assert (cp["Crop"]["Ratio"], cp["Crop"]["Orientation"]) == ("4:3", "Portrait")


def test_black_point_direction():
    crush = parse(rawedit.pp3_for(EditParams(black_point=200), A7RV, "4:5"))["Luminance Curve"]["LCurve"]
    lift = parse(rawedit.pp3_for(EditParams(black_point=-200), A7RV, "4:5"))["Luminance Curve"]["LCurve"]
    assert crush == "1;0.06;0;1;1;" and lift == "1;0;0.06;1;1;"
    off = parse(rawedit.pp3_for(EditParams(), A7RV, "4:5"))["Luminance Curve"]
    assert off["Enabled"] == "false"


def test_film_tone_for_files_without_a_preview():
    cp = parse(rawedit.pp3_for(EditParams(), A7RV, "4:5", tone="film"))
    assert cp["Exposure"]["HistogramMatching"] == "false"
    assert cp["Exposure"]["Curve"] == rawedit.FILM_CURVE
    with pytest.raises(ValueError):
        rawedit.pp3_for(EditParams(), A7RV, "4:5", tone="vivid")


def test_crop_in_profile_respects_margin():
    cp = parse(rawedit.pp3_for(EditParams(crop_focus=Point(x=0, y=0)), A7RV, "4:5", margin=8))
    assert (int(cp["Crop"]["X"]), int(cp["Crop"]["Y"])) == (8, 8)


def test_edit_name_differs_per_edit():
    a = rawedit.edit_name("/x/DSC1.ARW", rawedit.pp3_for(EditParams(), A7RV, "4:5"))
    b = rawedit.edit_name("/x/DSC1.ARW", rawedit.pp3_for(EditParams(exposure_ev=0.3), A7RV, "4:5"))
    assert a != b and a.startswith("DSC1_")


def test_profile_with_a_colour_lut(tmp_path):
    clut = tmp_path / "x.colour-abc_sRGB.png"
    cp = parse(rawedit.pp3_for(EditParams(vibrance=20), A7RV, "4:5", clut=clut, clut_note="matched"))
    fs = cp["Film Simulation"]
    assert fs["Enabled"] == "true" and fs["ClutFilename"] == str(clut.absolute())
    assert fs["Strength"] == str(rawedit.CLUT_STRENGTH) == "100"     # RawTherapee reads an integer
    assert cp["Vibrance"]["Pastels"] == "20"                          # the edit's vibrance, no base look
    assert cp["HSV Equalizer"]["Enabled"] == "false"
    plain = parse(rawedit.pp3_for(EditParams(vibrance=20), A7RV, "4:5"))
    assert plain["Film Simulation"]["Enabled"] == "false"
    assert plain["Vibrance"]["Pastels"] == str(20 + rawedit.BASE_VIBRANCE)
    assert rawedit.pp3_for(EditParams(), A7RV, "4:5", clut=clut) != rawedit.pp3_for(EditParams(), A7RV, "4:5")


def test_reference_profile_is_the_unedited_whole_frame_at_the_luts_input():
    ref = parse(rawedit.reference_pp3(A7RV))
    edit = parse(rawedit.pp3_for(EditParams(), A7RV, "4:5"))
    assert ref["Crop"]["Enabled"] == "false" and ref["Resize"]["Enabled"] == "false"
    assert ref["Rotation"]["Degree"] == "0"
    # nothing that runs after the LUT, and no LUT
    for section in ("Film Simulation", "Vibrance", "Sharpening", "HSV Equalizer", "Luminance Curve",
                    "Shadows & Highlights", "Directional Pyramid Denoising"):
        assert ref[section]["Enabled"] == "false", section
    # the same as the default edit wherever it shapes the colours going into the LUT
    for section in ("Exposure", "HLRecovery", "White Balance", "PostDemosaicSharpening", "LensProfile",
                    "RAW", "RAW Bayer", "Color Management"):
        assert dict(ref[section]) == dict(edit[section]), section
    assert parse(rawedit.reference_pp3(A7RV, tone="film"))["Exposure"]["HistogramMatching"] == "false"


@pytest.mark.parametrize("setting,on", [(True, True), (False, False), ("off", False), ("false", False),
                                        ("on", True), ("auto", True), (None, False), (0, False)])
def test_colour_match_setting(setting, on):
    assert rawedit._colour_match_on(setting) is on


# ---------------------------------------------------------------- export

@pytest.mark.parametrize("aspect,src", [("4:5", (804, 1003)), ("3:4", (750, 1001)), ("4:5", (800, 1000))])
def test_instagram_export_exact_size(tmp_path, aspect, src):
    full = tmp_path / "full.jpg"
    Image.new("RGB", src, (120, 140, 160)).save(full, quality=95)
    out = tmp_path / "ig.jpg"
    assert rawedit.instagram_export(full, out, aspect) == src
    with Image.open(out) as im:
        assert im.size == rawedit.IG_SIZES[aspect] and im.format == "JPEG"


# ---------------------------------------------------------------- real RawTherapee (optional)

# Optional real-file check: point IGMP_SAMPLE_RAW at any camera RAW (it is read, never written).
SAMPLE = Path(os.environ.get("IGMP_SAMPLE_RAW", "/nonexistent/sample.ARW"))


def test_render_raw_end_to_end(tmp_path):
    cfg = Config(library_roots=[], output_dir=tmp_path)
    if not Path(cfg.rawtherapee_cli).exists():
        pytest.skip("rawtherapee-cli not installed")
    if not SAMPLE.exists():
        pytest.skip("set IGMP_SAMPLE_RAW to a camera RAW to run this")
    src_dir = tmp_path / "library"                              # a private view of the source folder
    src_dir.mkdir()
    raw = src_dir / SAMPLE.name
    raw.symlink_to(SAMPLE)
    before = set(os.listdir(src_dir))
    params = EditParams(temperature_k=5600, crop_focus=Point(x=0.4, y=0.5), crop_zoom=1.2)
    result = rawedit.render_raw(raw, params, tmp_path / "edits", cfg)
    assert set(os.listdir(src_dir)) == before                   # nothing written next to the source
    with Image.open(result["ig"]) as im:
        assert im.size == (1080, 1350)
    w, h = result["size"]
    assert abs(w / h - 0.8) * h < 2
    assert result["full"].exists() and result["pp3"].exists()
    assert not [p for p in (tmp_path / "edits").iterdir() if p.name.startswith(".rt-")]
    temp, green = result["camera_wb"]                           # measured by RawTherapee itself
    assert 2000 < temp < 12000 and 0.3 < green < 2
    assert "Green=%s" % rawedit._num(green) in result["pp3"].read_text()


def test_render_raw_errors_are_runtime_errors(tmp_path):
    junk = tmp_path / "junk.ARW"
    junk.write_bytes(b"not a raw file" * 100)
    missing_cli = Config(library_roots=[], output_dir=tmp_path, rawtherapee_cli=str(tmp_path / "nope"))
    with pytest.raises(rawedit.RawRenderError):
        rawedit.render_raw(junk, EditParams(), tmp_path / "out", missing_cli)
    fake_cli = Config(library_roots=[], output_dir=tmp_path, rawtherapee_cli=sys.executable)
    with pytest.raises(RuntimeError, match="junk.ARW"):
        rawedit.render_raw(junk, EditParams(), tmp_path / "out", fake_cli)
    assert not [p for p in (tmp_path / "out").iterdir()]                # no temp dirs left behind


def test_render_raw_camera_matched_colour(tmp_path):
    """Real RawTherapee on IGMP_SAMPLE_RAW (read only): with its camera JPEG (a .JPG next to it,
    else the embedded one) the colours move towards the camera's, the LUT is reused by a second
    edit, and a white-balance edit still changes the colour through the LUT."""
    cfg = Config(library_roots=[], output_dir=tmp_path)
    if not Path(cfg.rawtherapee_cli).exists():
        pytest.skip("rawtherapee-cli not installed")
    if not SAMPLE.exists():
        pytest.skip("set IGMP_SAMPLE_RAW to a camera RAW to run this")
    src_dir = tmp_path / "library"
    src_dir.mkdir()
    raw = src_dir / SAMPLE.name
    raw.symlink_to(SAMPLE)
    jpg = next((SAMPLE.with_suffix(e) for e in (".JPG", ".jpg") if SAMPLE.with_suffix(e).exists()), None)
    before = set(os.listdir(src_dir))
    out = tmp_path / "edits"
    first = rawedit.render_raw(raw, EditParams(), out, cfg, camera_jpeg=jpg)
    c = first["colour"]
    if c["status"] == "no camera JPEG":
        pytest.skip("the sample has no camera JPEG to match")
    assert c["status"] == "matched", c
    assert c["frame_de"][1] < c["frame_de"][0] and c["heldout_de"][1] < c["heldout_de"][0]
    assert Path(c["clut"]).is_file() and "[Film Simulation]\nEnabled=true" in first["pp3"].read_text()

    def mean_b(result):                       # CIELAB b* (yellow +, blue -) of the Instagram image
        with Image.open(result["ig"]) as im:
            rgb = np.asarray(im.convert("RGB"), dtype=np.float64) / 255
        return float(colourmatch.srgb_to_lab(rgb)[..., 2].mean())

    warm = rawedit.render_raw(raw, EditParams(temperature_k=7500), out, cfg, camera_jpeg=jpg)
    cool = rawedit.render_raw(raw, EditParams(temperature_k=3800), out, cfg, camera_jpeg=jpg)
    assert warm["colour"]["cached"] and cool["colour"]["cached"]
    assert mean_b(warm) > mean_b(first) > mean_b(cool) and mean_b(warm) - mean_b(cool) > 8
    assert set(os.listdir(src_dir)) == before                   # nothing written next to the source
    assert not [p for p in out.iterdir() if p.name.startswith(".rt-")]
