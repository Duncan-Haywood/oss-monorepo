"""Develop one RAW into a finished photo with RawTherapee's command line.

``pp3_for`` turns an ``EditParams`` into a RawTherapee 5.13 processing profile (a partial
``.pp3``; RawTherapee fills every key we leave out with its neutral value). ``render_raw`` runs
``rawtherapee-cli`` headlessly with that profile and writes two JPEGs:

* the full-resolution, cropped edit (quality 95, 4:4:4, sRGB with the ICC profile embedded,
  camera EXIF carried over by RawTherapee), and
* the Instagram export, 1080x1350 (4:5) or 1080x1440 (3:4), made from the first in Pillow.

Base look (what all-default ``EditParams()`` gives)
    * Tone: RawTherapee's "Auto-Matched Curve" (``[Exposure] HistogramMatching``) fits a tone
      curve to the camera's embedded JPEG, so the starting point has the camera's brightness and
      contrast, which is also what the judge sees as the camera preview. Files without an
      embedded preview (Insta360 DNGs, ...) get the bundled "Standard Film Curve" instead.
      Histogram matching makes RawTherapee ignore ``[Exposure] Black`` and the second tone
      curve, so the black point is done with the Lab lightness curve.
    * Highlight reconstruction "Coloropp" (inpaint opposed), auto CA correction, lens
      correction from the maker's metadata (``LcMode=metadata``: Sony ARWs carry distortion,
      vignetting and CA data; files without it pass through unchanged), capture sharpening,
      AMaZE demosaic, Rec2020 working space, sRGB (RTv4_sRGB) output, no resize.
    * Colour: camera-matched when the camera's own JPEG is available (the sidecar JPEG passed
      as ``camera_jpeg``, else a RAW's embedded JPEG of at least ``MIN_REFERENCE_EDGE`` px).
      RawTherapee's matrix colour for the A7RV (no DCP exists) turns asphalt violet, skies
      periwinkle and red wood orange next to Sony's JPEG, and no single hue twist fixes that
      (a blue->cyan nudge turned blue-grey roofs teal). So ``render_raw`` renders a
      *reference* of the RAW (this profile with no user edit and no crop; see
      ``reference_pp3``), fits a smooth 3D LUT from it to the camera JPEG (``colourmatch``),
      and applies the LUT with RawTherapee's Film Simulation tool. The LUT sits after exposure, the tone curves,
      saturation and white balance and before Shadows & Highlights, the Lab curves and
      vibrance, so every edit still acts: white balance and exposure change what goes into
      it, vibrance and the black point act on what comes out. The LUT is cached per RAW in
      ``out_dir`` (``.<stem>.colour-<hash>_sRGB.png`` + ``.json``) and only used if it brings
      held-out parts of the frame closer to the camera's colours; otherwise, and for files
      without a camera JPEG, the render falls back to the matrix colour plus vibrance +10.
      Setting ``colour_match = false`` in the config (``cfg.extra``) turns it off.
    * White balance: "Camera" unless ``temperature_k`` is set. A custom temperature uses
      RawTherapee's Green = (camera's as-shot Green) x ``tint``: RawTherapee's absolute
      Green=1.0 is visibly green on some cameras (an A7RV daylight frame is 0.82 as shot), so
      tint 1.0 means "the camera's tint". ``render_raw`` asks RawTherapee for the as-shot value
      (``camera_white_balance``) and caches it per RAW in ``out_dir``.

Crop coordinates
    RawTherapee's ``[Crop]`` X/Y/W/H are pixels of the image *after* the camera's orientation
    has been applied (a portrait frame is cropped in portrait coordinates) and after the fine
    rotation; the rotation with ``AutoFill`` scales the picture up inside the same frame size,
    so the frame keeps its dimensions. RawTherapee clamps a crop that runs off the frame.
    The frame is the decoded sensor area (LibRaw size, or the camconst.json ``raw_crop``)
    less a 4 px demosaic border on each side; e.g. an A7RV ARW renders at 9556x6366 where
    rawpy reports 9566x6374. ``rt_frame_size`` estimates it from rawpy and the crop is kept
    ``CROP_MARGIN`` px inside every edge so a small misestimate cannot push it off the frame;
    any remaining aspect error is trimmed from the centre before the Instagram resize.

360 photos
    Insta360 X5 DNGs are an unstitched dual-fisheye pair. They are rendered like any other RAW
    (the crop lands on one of the circles, or between them); reframing 360 RAWs into a flat
    view is out of scope here.

Parallel use
    Every call works in its own temporary directory under ``out_dir``: the RAW is symlinked in
    there (``-c`` gets the link, ``-o`` an explicit file, so RawTherapee never writes next to
    the source), and ``RT_SETTINGS`` / ``RT_CACHE`` point inside it. RawTherapee writes its
    ``options`` file non-atomically whenever the settings directory has none, so processes
    sharing the default ``~/Library/Application Support/RawTherapee`` could race on a first
    run; private directories also keep the user's own RawTherapee settings out of the result.
    Output names carry a hash of the profile, so different edits of one RAW never overwrite
    each other, and identical edits rendered twice just replace the same files atomically.
    The colour-match reference is rendered in the same private directory; its LUT and the
    camera white balance are cached in ``out_dir`` under content-hashed names, written to a
    temporary file and moved into place, so parallel renders of one RAW at worst both fit it.
"""
from __future__ import annotations

import hashlib
import io
import json
import math
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

from . import colourmatch
from .config import Config
from .models import EditParams, Point

# width:height of the portrait crops we make, and the Instagram export size for each
# Instagram's feed shapes: portrait 4:5 (most screen), 3:4, square, and wide 1.91:1 for
# landscapes a tall crop would gut.
ASPECTS: dict[str, tuple[int, int]] = {"4:5": (4, 5), "3:4": (3, 4), "1:1": (1, 1), "1.91:1": (191, 100)}
IG_SIZES: dict[str, tuple[int, int]] = {"4:5": (1080, 1350), "3:4": (1080, 1440), "1:1": (1080, 1080),
                                        "1.91:1": (1080, 566)}
# [Crop] Ratio/Orientation as RawTherapee's GUI stores a portrait crop of each aspect (the
# engine ignores both; they only matter if someone opens the .pp3 in RawTherapee). Labels come
# from rtengine/aspectratios.cc; for a label written short side first ("4:5") the GUI stores
# the orientation inverted "for historical reasons" (rtgui/tools/crop.cc), so a portrait 4:5
# is Ratio=4:5 + Orientation=Landscape, while a portrait 3:4 is Ratio=4:3 + Orientation=Portrait.
RT_CROP_RATIO = {"4:5": ("4:5", "Landscape"), "3:4": ("4:3", "Portrait"), "1:1": ("1:1", "Landscape"),
                 "1.91:1": ("Free", "Landscape")}

PP3_VERSION = 353            # [Version] Version written by RawTherapee 5.13
RT_APP_VERSION = "5.13"
DEMOSAIC_BORDER = 4          # [RAW Bayer] Border: pixels RawTherapee drops on each side
CROP_MARGIN = 8              # keep the crop this far inside the estimated frame
FULL_QUALITY = 95
IG_QUALITY = 92
RT_TIMEOUT_S = 900           # a 140 MB Insta360 DNG takes well under a minute on an M1 Max
GREEN_RANGE = (0.02, 10.0)   # RawTherapee clamps [White Balance] Green to 0.02..100

# Tone curves (x;y pairs after the curve type; 1 = spline). From the bundled
# "Standard Film Curve - ISO Low.pp3", rounded.
FILM_CURVE = "1;0;0;0.11;0.09;0.32;0.43;0.66;0.87;1;1;"
# Base look on top of the neutral render when there is no camera JPEG to match. RawTherapee's
# matrix colour for the A7RV renders blue skies periwinkle (sRGB hue ~215 deg where the camera
# JPEG has ~203); a hue nudge of blues towards cyan (centred on working-space hue 225 deg, zero
# at 180 and 270) pulled skies back but also turned blue-grey metal roofs teal, so it is off;
# camera-matched colour (see the module notes) fixes both. A little vibrance gives the slight
# punch of a camera JPEG; a matched render already has the camera's saturation.
BASE_BLUE_HUE_SHIFT_DEG = 0
BASE_VIBRANCE = 10

# Camera-matched colour (see colourmatch.py)
REFERENCE_EDGE = 1024        # the full-size reference render is reduced to about this long edge
MIN_REFERENCE_EDGE = 960     # smaller embedded JPEGs are not used as the camera's colour
CLUT_STRENGTH = 100          # [Film Simulation] Strength, integer 0..100 (a linear blend)


class RawRenderError(RuntimeError):
    """rawtherapee-cli failed or produced no image."""


# --------------------------------------------------------------------------- crop maths

def aspect_ratio(aspect: str) -> float:
    """'4:5' -> 0.8 (width / height)."""
    w, h = _aspect_parts(aspect)
    return w / h


def _aspect_parts(aspect: str) -> tuple[int, int]:
    try:
        return ASPECTS[aspect]
    except KeyError:
        raise ValueError(f"unsupported aspect {aspect!r}; use one of {sorted(ASPECTS)}") from None


def crop_box(raw_size: tuple[int, int], aspect: str, focus: Point | tuple[float, float] = (0.5, 0.5),
             zoom: float = 1.0, margin: int = 0) -> tuple[int, int, int, int]:
    """The crop rectangle (x, y, w, h) in pixels of a ``raw_size`` = (width, height) frame.

    The box has exactly the target aspect (its sides are multiples of the ratio's terms). At
    zoom 1.0 it is the largest such box that fits inside the frame less ``margin`` px on every
    side; zoom z divides both sides by z. It is centred on ``focus`` (0..1 of the frame) and
    then shifted, never shrunk, to stay inside the frame.
    """
    fw, fh = (int(v) for v in raw_size)
    aw, ah = _aspect_parts(aspect)
    fx, fy = (focus.x, focus.y) if isinstance(focus, Point) else focus
    zoom = max(1.0, float(zoom))
    avail_w, avail_h = fw - 2 * margin, fh - 2 * margin
    k = math.floor(min(avail_w / aw, avail_h / ah) / zoom)
    if k < 1:
        raise ValueError(f"frame {raw_size} is too small for a {aspect} crop")
    w, h = aw * k, ah * k
    x = _clamp(round(fx * fw - w / 2), margin, fw - margin - w)
    y = _clamp(round(fy * fh - h / 2), margin, fh - margin - h)
    return x, y, w, h


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


# --------------------------------------------------------------------------- profile

def pp3_for(params: EditParams, raw_size: tuple[int, int], aspect: str, *, tone: str = "auto",
            margin: int = 0, camera_green: float = 1.0, clut: str | Path | None = None,
            clut_note: str = "") -> str:
    """A RawTherapee processing profile applying ``params`` with a ``aspect`` crop.

    ``raw_size`` is the (width, height) of the frame RawTherapee crops (see the module notes).
    ``tone`` is "auto" (curve matched to the camera's embedded JPEG) or "film" (fixed
    film-like curve, for files without an embedded preview). ``margin`` keeps the crop that
    many pixels inside every edge. ``camera_green`` is RawTherapee's Green for the camera's
    as-shot white balance (see ``camera_white_balance``); a custom white balance uses
    ``Green = camera_green * tint`` so that tint 1.0 keeps the camera's green/magenta balance
    and only the temperature changes. ``clut`` is the camera-matched colour LUT (a HaldCLUT
    PNG, made absolute here); with it the base look's vibrance is left out, since the LUT
    already gives the camera's saturation. ``clut_note`` is a comment for that section.
    """
    return _profile(params, raw_size, aspect, tone=tone, margin=margin, camera_green=camera_green,
                    clut=clut, clut_note=clut_note)


def reference_pp3(raw_size: tuple[int, int], *, tone: str = "auto") -> str:
    """The profile of the render the camera-matched colour LUT is fitted on.

    It is ``pp3_for`` with the default edit (white balance as shot, tone matched the same way,
    the same highlight reconstruction, capture sharpening, lens correction and colour
    management) and without what does not belong at the LUT's input: no crop, no rotation, no
    LUT, and none of what RawTherapee runs after the LUT (USM sharpening, vibrance, Lab
    curves). So this render's sRGB output is exactly what the LUT is fed in an unedited render
    (checked: a test LUT applied by RawTherapee matched numpy's prediction to 0.07 dE00 per
    pixel). It is full size: the LUT meets every noisy full-resolution pixel, and the fit
    needs their spread, not just their averages (see ``colourmatch.reduce_render``).
    """
    return _profile(EditParams(), raw_size, "4:5", tone=tone, reference=True)


def _profile(params: EditParams, raw_size: tuple[int, int], aspect: str, *, tone: str, margin: int = 0,
             camera_green: float = 1.0, clut: str | Path | None = None, clut_note: str = "",
             reference: bool = False) -> str:
    if tone not in ("auto", "film"):
        raise ValueError(f"tone must be 'auto' or 'film', not {tone!r}")
    p = params
    x, y, w, h = crop_box(raw_size, aspect, p.crop_focus, p.crop_zoom, margin)
    matched = clut is not None
    sections: list[tuple[str, str, dict]] = []

    def add(name, note, **keys):
        sections.append((name, note, keys))

    add("Version", "", AppVersion=RT_APP_VERSION, Version=PP3_VERSION)

    exposure = dict(Auto=False, Compensation=_num(p.exposure_ev), Brightness=0,
                    Contrast=p.contrast, Saturation=p.saturation, Black=0,
                    HighlightCompr=p.highlights // 2, HighlightComprThreshold=0, ShadowCompr=50,
                    ClampOOG=True)
    if tone == "auto":
        exposure.update(HistogramMatching=True, CurveFromHistogramMatching=False,
                        CurveMode="FilmLike", Curve="0;", CurveMode2="Standard", Curve2="0;")
    else:
        exposure.update(HistogramMatching=False, CurveFromHistogramMatching=False,
                        CurveMode="FilmLike", Curve=FILM_CURVE, CurveMode2="Standard", Curve2="0;")
    add("Exposure", f"exposure {p.exposure_ev:+g} EV, contrast {p.contrast}, saturation {p.saturation}; "
        f"tone base: {'matched to the camera JPEG' if tone == 'auto' else 'standard film curve'}",
        **exposure)

    add("HLRecovery", "rebuild clipped highlights from the unclipped channels",
        Enabled=True, Method="Coloropp")

    add("Shadows & Highlights", f"highlight recovery {p.highlights} (with highlight compression "
        f"{p.highlights // 2} above), shadow lift {p.shadows}",
        Enabled=bool(p.highlights or p.shadows), Highlights=p.highlights, HighlightTonalWidth=70,
        Shadows=p.shadows, ShadowTonalWidth=30, Radius=40, Lab=False)

    add("Luminance Curve", f"black point {p.black_point:+d} (+ deepens, - lifts)",
        **_black_point_curve(p.black_point))

    # the base look applies only to the camera matrix's colour, never under a camera-matched LUT
    # (or in the reference the LUT is fitted on)
    base = 0 if matched or reference else BASE_VIBRANCE
    pastels = _clamp(base + p.vibrance, -100, 100)
    add("Vibrance", f"vibrance {p.vibrance} on top of the base {base}",
        Enabled=bool(pastels), Pastels=pastels, Saturated=_clamp(_half(pastels), -100, 100),
        PSThreshold="0;75;", ProtectSkins=True, AvoidColorShift=True, PastSatTog=False)

    hue = 0 if matched or reference else BASE_BLUE_HUE_SHIFT_DEG
    d = hue / 720                           # HSV equalizer: hue += (curve(hue) - 0.5) * 2
    add("HSV Equalizer", f"base look: blues {hue:g} deg towards cyan (skies)",
        Enabled=bool(d), HCurve=f"1;0;0.5;0.35;0.35;0.5;0.5;0.35;0.35;0.625;{0.5 - d:.4f};0.35;0.35;"
                                f"0.75;0.5;0.35;0.35;", SCurve="0;", VCurve="0;")

    if matched:
        # absolute, so RawTherapee ignores its ClutsDirectory; it ignores a missing file silently
        add("Film Simulation", clut_note or "camera-matched colour (per-photo LUT fitted to the camera JPEG)",
            Enabled=True, ClutFilename=str(Path(clut).absolute()), Strength=CLUT_STRENGTH)
    else:
        add("Film Simulation", "", Enabled=False)

    if p.temperature_k is None:
        add("White Balance", "as shot", Enabled=True, Setting="Camera")
    else:
        green = _clamp(camera_green * p.tint, GREEN_RANGE[0], GREEN_RANGE[1])
        add("White Balance", f"{p.temperature_k} K, tint {p.tint:g} (>1 greener) x camera green "
            f"{camera_green:g}", Enabled=True, Setting="Custom", Temperature=int(p.temperature_k),
            Green=_num(green), Equal=1)

    sharpen = p.sharpening > 0
    # USM runs after the LUT (on Lab), so the reference leaves it out; capture sharpening runs
    # before it and stays
    add("Sharpening", f"sharpening {p.sharpening}", Enabled=sharpen and not reference, Contrast=20, Method="usm",
        Radius=0.5, Amount=round(p.sharpening * 1.2), Threshold="20;80;2000;1200;", OnlyEdges=False,
        HalocontrolEnabled=True, HalocontrolAmount=85)
    add("PostDemosaicSharpening", "capture sharpening", Enabled=sharpen, Contrast=10,
        AutoContrast=True, AutoRadius=True)

    nr = p.noise_reduction
    add("Directional Pyramid Denoising", f"noise reduction {nr}", Enabled=nr > 0, Enhance=False,
        Median=False, Luma=round(nr * 0.6), Ldetail=50, Chroma=round(nr * 0.5), Method="Lab",
        LMethod="SLI", CMethod="MAN", C2Method="MANU", SMethod="shal", Redchro=0, Bluechro=0,
        Gamma=1.7, Passes=1)

    add("Common Properties for Transformations", "scale rotated images to hide the corners",
        Method="log", AutoFill=True)
    add("Rotation", f"straighten {p.straighten_deg:+g} deg (+ = clockwise)",
        Degree=_num(-p.straighten_deg))

    ratio, orientation = RT_CROP_RATIO[aspect]
    if reference:
        add("Crop", "reference: the whole frame", Enabled=False)
    else:
        add("Crop", f"{aspect} portrait, focus ({p.crop_focus.x:g}, {p.crop_focus.y:g}), zoom {p.crop_zoom:g}",
            Enabled=True, X=x, Y=y, W=w, H=h, FixedRatio=True, Ratio=ratio, Orientation=orientation)

    add("LensProfile", "distortion, vignetting and CA from the maker's metadata",
        LcMode="metadata", UseDistortion=True, UseVignette=True, UseCA=True)
    add("RAW", "auto chromatic aberration", CA=True, CAAvoidColourshift=True, CAAutoIterations=2)
    add("RAW Bayer", "", Method="amaze", Border=DEMOSAIC_BORDER)

    add("Color Management", "", InputProfile="(cameraICC)", ToneCurve=False, ApplyLookTable=True,
        ApplyBaselineExposureOffset=True, ApplyHueSatMap=True, DCPIlluminant=0,
        WorkingProfile="Rec2020", OutputProfile="RTv4_sRGB", OutputProfileIntent="Relative",
        OutputBPC=True)
    add("Resize", "", Enabled=False)

    kind = "colour reference" if reference else f"aspect {aspect}"
    lines = [f"# igmp RawTherapee profile ({RT_APP_VERSION}), {kind}, frame {raw_size[0]}x{raw_size[1]}"]
    for name, note, keys in sections:
        lines.append("")
        if note:
            lines.append(f"# {note}")
        lines.append(f"[{name}]")
        lines += [f"{k}={_fmt(v)}" for k, v in keys.items()]
    return "\n".join(lines) + "\n"


def _black_point_curve(bp: int) -> dict:
    """Lab lightness curve for the black point: +200 clips the darkest 6 % to black,
    -200 lifts black to 6 % grey. A straight two-point spline, so mid-tones barely move."""
    if bp == 0:
        return dict(Enabled=False, LCurve="0;")
    t = round(abs(bp) / 200 * 0.06, 4)
    curve = f"1;{t:g};0;1;1;" if bp > 0 else f"1;0;{t:g};1;1;"
    return dict(Enabled=True, Brightness=0, Contrast=0, Chromaticity=0, AvoidColorShift=False,
                RedAndSkinTonesProtection=0, LCredsk=True, LCurve=curve)


def _half(v: int) -> int:
    return int(v / 2)


def _num(v: float) -> str:
    return f"{float(v):.4f}".rstrip("0").rstrip(".") or "0"


def _fmt(v) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    return str(v)


# --------------------------------------------------------------------------- rendering

def rt_frame_size(raw_path: str | Path) -> tuple[int, int]:
    """Estimated (width, height) of the frame RawTherapee renders, after the camera orientation:
    LibRaw's visible size (via rawpy) less the demosaic border on each side."""
    return _raw_info(raw_path)[0]


def has_embedded_preview(raw_path: str | Path) -> bool:
    """True when the RAW carries a JPEG preview big enough for histogram matching."""
    return _raw_info(raw_path)[1]


def _raw_info(raw_path: str | Path, min_preview: int = 320) -> tuple[tuple[int, int], bool, int]:
    """(RawTherapee frame size, has a preview for histogram matching, the preview's long edge)."""
    import rawpy

    with rawpy.imread(str(raw_path)) as raw:
        s = raw.sizes
        w, h = (s.height, s.width) if s.flip in (5, 6) else (s.width, s.height)   # 90 degree turns
        try:
            thumb = raw.extract_thumb()
        except Exception:      # LibRawNoThumbnailError, unsupported thumbnail formats, ...
            thumb = None
    edge = _jpeg_edge(thumb.data) if thumb is not None and thumb.format == rawpy.ThumbFormat.JPEG else 0
    return (w - 2 * DEMOSAIC_BORDER, h - 2 * DEMOSAIC_BORDER), edge >= min_preview, edge


def _jpeg_edge(data: bytes) -> int:
    try:
        with Image.open(io.BytesIO(data)) as im:
            return max(im.size)
    except (OSError, ValueError):       # not an image Pillow can read
        return 0


def embedded_jpeg(raw_path: str | Path) -> bytes | None:
    """The JPEG a RAW carries (the camera's own rendering), or None."""
    import rawpy

    try:
        with rawpy.imread(str(raw_path)) as raw:
            thumb = raw.extract_thumb()
    except (OSError, rawpy.LibRawError):        # no thumbnail, unsupported format, unreadable
        return None
    return bytes(thumb.data) if thumb.format == rawpy.ThumbFormat.JPEG else None


_AS_SHOT = re.compile(r"Raw As Shot White balance: temp ([0-9.]+), tint ([0-9.]+)")


def camera_white_balance(raw_path: str | Path, cfg: Config, work_dir: Path | None = None,
                         timeout: float = 180) -> tuple[float, float] | None:
    """RawTherapee's own (temperature, green) for the camera's as-shot white balance.

    RawTherapee prints it while loading the file when verbose; we run it on a throwaway 16 px
    crop and stop it as soon as the line appears (about the cost of decoding the RAW). Green
    is far from 1.0 on some cameras (A7RV daylight frames ~0.82, an Insta360 X5 night DNG
    0.56), so a custom temperature with Green=1.0 would look green on them.
    Returns None if RawTherapee does not report it.
    """
    raw_path = Path(raw_path).absolute()
    own = work_dir is None
    work = Path(tempfile.mkdtemp(prefix=".rt-wb-")) if own else Path(work_dir) / "wb"
    try:
        (work / "settings").mkdir(parents=True, exist_ok=True)
        # a partial options file is read as is (and not rewritten); everything else stays default
        (work / "settings" / "options").write_text("[General]\nVerbose=true\n")
        link = work / raw_path.name
        if not link.exists():
            os.symlink(raw_path, link)
        profile = work / "probe.pp3"
        profile.write_text("[Exposure]\nHistogramMatching=false\n[LensProfile]\nLcMode=none\n"
                           "[Crop]\nEnabled=true\nX=0\nY=0\nW=16\nH=16\n")
        env = dict(os.environ, RT_SETTINGS=str(work / "settings"), RT_CACHE=str(work / "cache"))
        proc = subprocess.Popen([cfg.rawtherapee_cli, "-o", str(work / "probe.jpg"), "-q", "-Y",
                                 "-p", str(profile), "-c", str(link)], env=env, text=True,
                                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT)
        timer = threading.Timer(timeout, proc.kill)
        timer.start()
        found = None
        try:
            for line in proc.stdout:
                m = _AS_SHOT.search(line)
                if m:
                    found = (float(m.group(1)), float(m.group(2)))
                    break
        finally:
            timer.cancel()
            if proc.poll() is None:
                proc.kill()
            proc.wait()
            proc.stdout.close()
        return found
    finally:
        shutil.rmtree(work, ignore_errors=True)


def _cached_camera_wb(raw_path: Path, cfg: Config, out_dir: Path, work: Path) -> tuple[float, float] | None:
    """camera_white_balance, remembered in out_dir per RAW (keyed on size and mtime)."""
    st = raw_path.stat()
    key = {"raw": str(raw_path), "size": st.st_size, "mtime_ns": st.st_mtime_ns}
    cache = out_dir / f".{raw_path.stem}.camwb.json"
    try:
        data = json.loads(cache.read_text())
        if all(data.get(k) == v for k, v in key.items()):
            return float(data["temp"]), float(data["green"])
    except (OSError, ValueError, KeyError, TypeError):
        pass
    wb = camera_white_balance(raw_path, cfg, work)
    if wb:
        tmp = work / "camwb.json"
        tmp.write_text(json.dumps({**key, "temp": wb[0], "green": wb[1]}))
        os.replace(tmp, cache)
    return wb


def _colour_match_on(setting) -> bool:
    """cfg.extra["colour_match"] / the render_raw argument: true (default), false, "on"/"off"."""
    if isinstance(setting, str):
        return setting.strip().lower() not in ("off", "false", "no", "0", "none", "")
    return bool(setting)


def _file_key(path: Path) -> dict:
    st = path.stat()
    return {"path": str(path), "size": st.st_size, "mtime_ns": st.st_mtime_ns}


def camera_colour(raw_path: Path, cfg: Config, out_dir: Path, work: Path, *, frame: tuple[int, int],
                  tone: str, preview_edge: int = 0, camera_jpeg: str | Path | None = None,
                  timeout: float = RT_TIMEOUT_S) -> tuple[Path | None, dict]:
    """The camera-matched colour LUT for ``raw_path`` (a HaldCLUT PNG in ``out_dir``), or None.

    The camera's colour comes from ``camera_jpeg`` (the JPEG the camera wrote next to the RAW)
    or, failing that, the RAW's embedded JPEG when it is at least ``MIN_REFERENCE_EDGE`` px.
    The LUT is fitted on a reference render made in ``work`` (see ``reference_pp3``) and cached
    in ``out_dir``, keyed on the RAW, the camera JPEG, the reference profile and the fit
    version; a fit that was not good enough is cached as such and not retried. RawTherapee
    failing on the reference is not cached. Never raises for a bad match: returns (None, info)
    and the caller renders with the camera matrix's colour.

    ``info`` has "status" ("matched", "no camera JPEG", or "failed: <why>"), and when there was
    a fit "reference", the mean CIEDE2000 to the camera JPEG before/after on held-out parts of
    the frame ("heldout_de") and over the whole overlap ("frame_de"), "seconds" spent on the
    fit (0 when "cached").
    """
    t0 = time.monotonic()
    ref_path = Path(camera_jpeg).expanduser().absolute() if camera_jpeg else None
    if ref_path is not None and ref_path.is_file():
        ref_key, ref_kind = _file_key(ref_path), "camera JPEG"
    elif preview_edge >= MIN_REFERENCE_EDGE:
        ref_key, ref_kind, ref_path = {"embedded": True}, "embedded JPEG", None
    else:
        return None, {"status": "no camera JPEG"}
    profile_text = reference_pp3(frame, tone=tone)
    key = {"fit": colourmatch.FIT_VERSION, "raw": _file_key(raw_path), "camera": ref_key,
           "profile": profile_text}
    digest = hashlib.sha1(json.dumps(key, sort_keys=True).encode()).hexdigest()[:12]
    # the "_sRGB" suffix names the CLUT's colour space for RawTherapee (its default anyway)
    clut = out_dir / f".{raw_path.stem}.colour-{digest}_sRGB.png"
    meta = out_dir / f".{raw_path.stem}.colour-{digest}.json"
    try:
        info = json.loads(meta.read_text())
        if info.get("status") != "matched" or clut.is_file():
            return (clut if info.get("status") == "matched" else None), {**info, "cached": True, "seconds": 0}
    except (OSError, ValueError):
        pass

    def done(info: dict, path: Path | None) -> tuple[Path | None, dict]:
        info = {**info, "reference": ref_kind, "seconds": round(time.monotonic() - t0, 2), "cached": False}
        tmp = work / "colour.json"
        tmp.write_text(json.dumps({k: v for k, v in info.items() if k not in ("seconds", "cached")}))
        os.replace(tmp, meta)
        return path, info

    try:
        if ref_path is not None:
            reference = colourmatch.load_reference(ref_path)
        else:
            data = embedded_jpeg(raw_path)
            if not data:
                return None, {"status": "no camera JPEG"}
            reference = colourmatch.load_reference(data)
    except Exception as e:  # noqa: BLE001 - PIL raises a zoo of errors on damaged files; never fail the render
        return None, {"status": f"failed: unreadable camera JPEG ({e})", "reference": ref_kind}
    try:
        render, spread = _render_reference(raw_path, cfg, work, profile_text, timeout)
        fit = colourmatch.fit_camera_map(render, reference, spread)
        tmp = work / "colour.png"
        colourmatch.write_hald(fit.lattice, tmp)
        os.replace(tmp, clut)
    except colourmatch.ColourMatchError as e:      # a property of this photo: remember it
        return done({"status": f"failed: {e}"}, None)
    except Exception as e:  # noqa: BLE001 - RawTherapee, disk, ...: never fail the render; retry next time
        return None, {"status": f"failed: {type(e).__name__}: {e}"[:500], "reference": ref_kind}
    return done({"status": "matched", "clut": str(clut), "ncc": round(fit.ncc, 3), "pairs": fit.pairs,
                 "heldout_de": [round(fit.heldout_before, 2), round(fit.heldout_after, 2)],
                 "frame_de": [round(fit.before, 2), round(fit.after, 2)]}, clut)


def prepare_colour_match(raw_path, out_dir: Path, cfg: Config, *, camera_jpeg: str | Path | None = None) -> dict:
    """Fit (or find cached) the camera-matched colour LUT that ``render_raw`` would use for
    ``raw_path`` into ``out_dir``, without rendering the photo. It costs one RawTherapee render
    plus ~4 s (~15 s for a 61 MP ARW on an M1 Max), so a pipeline can run it while it waits for
    edit settings; ``render_raw`` then finds it cached. Returns the same info dict as the
    "colour" entry of ``render_raw``."""
    raw_path = Path(raw_path).expanduser().absolute()
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    try:
        frame, preview, preview_edge = _raw_info(raw_path)
    except Exception as e:
        raise RawRenderError(f"cannot read {raw_path.name} with rawpy: {e}") from e
    work = Path(tempfile.mkdtemp(prefix=f".rt-{raw_path.stem}-", dir=out_dir))
    try:
        return camera_colour(raw_path, cfg, out_dir, work, frame=frame, tone="auto" if preview else "film",
                             preview_edge=preview_edge, camera_jpeg=camera_jpeg,
                             timeout=float(cfg.extra.get("rawtherapee_timeout", RT_TIMEOUT_S)))[1]
    finally:
        shutil.rmtree(work, ignore_errors=True)


def _render_reference(raw_path: Path, cfg: Config, work: Path, profile_text: str, timeout: float):
    """Render the colour reference at full size (8-bit TIFF, ~180 MB for 61 MP, kept in the
    local temp dir rather than next to the outputs) and reduce it to (mean, covariance) at
    ~``REFERENCE_EDGE`` px (``colourmatch.reduce_render``)."""
    ref_dir = work / "colour"
    (ref_dir / "in").mkdir(parents=True, exist_ok=True)
    link = ref_dir / "in" / raw_path.name
    if not link.exists():
        os.symlink(raw_path, link)
    profile = ref_dir / "reference.pp3"
    profile.write_text(profile_text)
    with tempfile.TemporaryDirectory(prefix=".igmp-colour-") as tmp:
        out = Path(tmp) / "reference.tif"
        _run_cli(cfg.rawtherapee_cli, ["-o", str(out), "-q", "-Y", "-t", "-b8", "-p", str(profile),
                                       "-c", str(link)], work, timeout, raw_path.name, out)
        with Image.open(out) as im:
            full = np.asarray(im.convert("RGB"))
        return colourmatch.reduce_render(full, REFERENCE_EDGE)


def _run_cli(cli: str, args: list[str], work: Path, timeout: float, what: str, out: Path) -> None:
    """Run rawtherapee-cli with private settings/cache dirs in ``work``; raise RawRenderError
    unless it exits cleanly and writes ``out``."""
    env = dict(os.environ, RT_SETTINGS=str(work / "settings"), RT_CACHE=str(work / "cache"))
    try:
        proc = subprocess.run([cli, *args], env=env, capture_output=True, text=True, timeout=timeout,
                              stdin=subprocess.DEVNULL, check=False)
    except subprocess.TimeoutExpired as e:
        raise RawRenderError(f"rawtherapee-cli timed out after {timeout:.0f}s on {what}") from e
    if proc.returncode != 0 or not out.is_file() or out.stat().st_size == 0:
        log = (proc.stderr or "") + (proc.stdout or "")
        raise RawRenderError(f"rawtherapee-cli failed on {what} (exit {proc.returncode}): {log.strip()[-2000:]}")


def edit_name(raw_path: str | Path, pp3: str) -> str:
    """'DSC02201' + short hash of the profile: one name per distinct edit."""
    digest = hashlib.sha1(pp3.encode()).hexdigest()[:10]
    return f"{Path(raw_path).stem}_{digest}"


def render_raw(raw_path, params: EditParams, out_dir: Path, cfg: Config, aspect=None, *,
               camera_jpeg: str | Path | None = None, colour_match: bool | str | None = None) -> dict:
    """Develop ``raw_path`` with ``params`` into ``out_dir``.

    ``camera_jpeg`` is the camera's own JPEG of the shot (``Asset.preview``); with it (or with a
    big enough JPEG embedded in the RAW) the colours are matched to the camera's rendering, see
    the module notes. ``colour_match`` overrides ``cfg.extra["colour_match"]`` (default on);
    off, or with no camera JPEG, the render uses the camera matrix's colour plus the base look.

    Returns a dict:
      "full"       Path of the full-resolution cropped JPEG (q95, 4:4:4, sRGB ICC, camera EXIF)
      "ig"         Path of the Instagram JPEG, exactly 1080x1350 (4:5) or 1080x1440 (3:4), q92
      "instagram"  same as "ig"
      "pp3"        Path of the RawTherapee profile used (kept next to the outputs)
      "seconds"    wall-clock time of the whole call
      "size"       (width, height) of the full JPEG
      "frame"      (width, height) the crop was computed against
      "crop"       (x, y, width, height) asked of RawTherapee
      "tone"       "auto" (matched to the camera JPEG) or "film"
      "camera_wb"  (temperature, green) of the as-shot white balance in RawTherapee's terms,
                   only measured (and cached in out_dir) when params set a temperature
      "colour"     camera-matched colour: {"status": "matched" | "off" | "no camera JPEG" |
                   "failed: ...", ...} (see ``camera_colour``)
    Raises RawRenderError (a RuntimeError) if RawTherapee fails or writes nothing. A failed
    colour match never raises: the photo is rendered without it.
    """
    t0 = time.monotonic()
    raw_path = Path(raw_path).expanduser().absolute()
    aspect = aspect or cfg.photo_aspect
    _aspect_parts(aspect)
    if not raw_path.is_file():
        raise FileNotFoundError(raw_path)
    cli = cfg.rawtherapee_cli
    if not (Path(cli).is_file() or shutil.which(cli)):
        raise RawRenderError(f"rawtherapee-cli not found at {cli}")
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    timeout = float(cfg.extra.get("rawtherapee_timeout", RT_TIMEOUT_S))
    match = _colour_match_on(cfg.extra.get("colour_match", True) if colour_match is None else colour_match)

    try:
        frame, preview, preview_edge = _raw_info(raw_path)
    except Exception as e:      # rawpy.LibRawError and friends are not RuntimeErrors
        raise RawRenderError(f"cannot read {raw_path.name} with rawpy: {e}") from e
    tone = "auto" if preview else "film"
    crop = crop_box(frame, aspect, params.crop_focus, params.crop_zoom, CROP_MARGIN)

    work = Path(tempfile.mkdtemp(prefix=f".rt-{raw_path.stem}-", dir=out_dir))
    try:
        camera_wb = None
        if params.temperature_k is not None:
            camera_wb = _cached_camera_wb(raw_path, cfg, out_dir, work)
        clut, colour = None, {"status": "off"}
        if match:
            clut, colour = camera_colour(raw_path, cfg, out_dir, work, frame=frame, tone=tone,
                                         preview_edge=preview_edge, camera_jpeg=camera_jpeg, timeout=timeout)
        note = ""
        if clut is not None:
            before, after = colour.get("heldout_de", ["?", "?"])
            note = (f"camera-matched colour: per-photo LUT fitted to the {colour.get('reference', 'camera JPEG')} "
                    f"(held-out mean dE00 {before} -> {after})")
        pp3 = pp3_for(params, frame, aspect, tone=tone, margin=CROP_MARGIN,
                      camera_green=camera_wb[1] if camera_wb else 1.0, clut=clut, clut_note=note)
        name = edit_name(raw_path, pp3)
        full_path, ig_path, pp3_path = (out_dir / f"{name}.jpg", out_dir / f"{name}_ig.jpg",
                                        out_dir / f"{name}.pp3")

        (work / "in").mkdir()
        link = work / "in" / raw_path.name       # RawTherapee only ever sees this private link
        os.symlink(raw_path, link)
        profile = work / "profile.pp3"
        profile.write_text(pp3)
        rendered = work / "out.jpg"
        _run_cli(cli, ["-o", str(rendered), "-q", "-Y", f"-j{FULL_QUALITY}", "-js3", "-b8",
                       "-p", str(profile), "-c", str(link)], work, timeout, raw_path.name, rendered)

        ig_tmp = work / "ig.jpg"
        size = instagram_export(rendered, ig_tmp, aspect)
        os.replace(profile, pp3_path)
        os.replace(rendered, full_path)
        os.replace(ig_tmp, ig_path)
    finally:
        shutil.rmtree(work, ignore_errors=True)

    return {"full": full_path, "ig": ig_path, "instagram": ig_path, "pp3": pp3_path,
            "seconds": round(time.monotonic() - t0, 2), "size": size, "frame": frame, "crop": crop,
            "tone": tone, "camera_wb": camera_wb, "colour": colour}


def instagram_export(full_jpeg: Path, out: Path, aspect: str) -> tuple[int, int]:
    """Trim ``full_jpeg`` to the exact aspect (from the centre), resize to the Instagram size with
    a light sharpen, and save as an sRGB JPEG. Returns the full JPEG's (width, height)."""
    tw, th = IG_SIZES[aspect]
    with Image.open(full_jpeg) as im:
        size = im.size
        icc = im.info.get("icc_profile")
        exif = im.getexif()
        im = im.convert("RGB")
        w, h = size
        if w * th > h * tw:                         # too wide: trim the sides
            nw = round(h * tw / th)
            box = ((w - nw) // 2, 0, (w - nw) // 2 + nw, h)
        else:                                       # too tall: trim top and bottom
            nh = round(w * th / tw)
            box = (0, (h - nh) // 2, w, (h - nh) // 2 + nh)
        small = im.resize((tw, th), Image.LANCZOS, box=box, reducing_gap=3.0)
    small = small.filter(ImageFilter.UnsharpMask(radius=0.8, percent=40, threshold=2))
    exif[0x0112] = 1                                # pixels are already upright
    for tag in (0xA002, 0xA003):                    # stale pixel dimensions, if present
        exif.get_ifd(0x8769).pop(tag, None)
    kwargs = dict(quality=IG_QUALITY, subsampling=0, optimize=True, exif=exif.tobytes())
    if icc:
        kwargs["icc_profile"] = icc
    small.save(out, "JPEG", **kwargs)
    return size
