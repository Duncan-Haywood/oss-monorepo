"""Lens distortion correction from a lensfun database, for raw files that carry none of their own.

A camera DNG with a corrected lens stores the correction as a ``WarpRectilinear`` in ``OpcodeList3``
(``dng_opcodes``). Most raw files carry nothing: a Canon CR2, a DNG from most converters, a Pentax DNG.
Lensfun (https://github.com/lensfun/lensfun) keeps open distortion calibrations for about 1,500 lenses
in XML files (CC BY-SA 3.0). This module reads those files at run time (nothing of lensfun is
vendored here), finds the lens, interpolates its calibration to the shot's focal length and turns it
into a ``WarpRectilinear2``, which then runs through the same warp code as a camera's own opcode.

Every step follows lensfun's own source (libs/lensfun, read for this module, not recalled):

- **Matching** (``database.cpp`` ``MatchScore``, ``auxfun.cpp`` ``lfFuzzyStrCmp``): the EXIF lens
  name is split into words (runs of letters, runs of digits with dots, runs of punctuation; a lone
  punctuation mark or a lone ``f`` dropped; ``2.0`` read as ``2``), case-folded and sorted; every word
  must appear in the database name, scored ``200 x matched / (words in both)``. A lens must fit the
  camera's mount or one of its compatible mounts and be calibrated for a crop factor the camera's is
  at least 0.96 of. Lensfun also guesses focal and aperture ranges from the name and scores them;
  that part is not ported, so ties are reported in the notes.
- **Fixed-lens cameras** (lensfun's "fixed lens" entries): with no lens name, a camera is matched to the
  one lens on its own mount whose English name in the database is "fixed lens".
- **Interpolation** (``lens.cpp`` ``InterpolateDistortion``): the calibration set with the closest
  crop factor at or below 1/0.96 of the camera's; an exact focal length is used as is; otherwise the
  two nearest calibrations either side (and one more beyond each, when there is one) feed a cubic
  Hermite spline (``auxfun.cpp`` ``_lf_interpolate``) on ``term x focal``, divided by the focal length
  after (``__parameter_scales``: the scale is the focal length for ptlens, poly3 and poly5). Outside
  the calibrated range the nearest calibration is used unchanged.
- **Coordinates** (``modifier.cpp`` "About coordinate systems", ``mod-coord.cpp``
  ``rescale_polynomial_coefficients``): the Hugin models have ``r = 1`` at half the height of the
  *calibration* sensor (``43.27 mm / crop / hypot(aspect, 1) / 2``); an image pixel's size in mm comes
  from the camera's crop factor and the pixel diagonal (``hypot(w, h)``); and lensfun divides out the
  ptlens ``d = 1 - a - b - c`` (``a/d^4, b/d^3, c/d^2``), so the centre keeps its scale. The focal
  length cancels out of the distortion itself.

With ``s`` the DNG warp's ``r = 1`` (the distance to the farthest pixel) in Hugin units, the result is
an exact WarpRectilinear2 (``kr`` on ``r^0..r^3``)::

    ptlens: kr0 = 1, kr1 = c s / d^2, kr2 = b s^2 / d^3, kr3 = a s^3 / d^4
    poly3:  kr0 = 1, kr2 = k1 s^2 / (1 - k1)^3
    poly5:  kr0 = 1, kr2 = k1 s^2, kr4 = k2 s^4

``fill`` then zooms in (or out) by the factor that puts every border pixel's source just inside the
frame, as lensfun's ``GetAutoScale`` does, so no edge is smeared or left empty: scaling the corrected
coordinates by ``1/k`` is ``kr_p / k^(p+1)``, still exact.

<<<<<<< HEAD
Lateral colour (TCA, ``poly3`` and ``linear``) is composed onto the distortion per colour plane, exactly
(``plane_terms``; since 2026-11-13). Not ported: vignetting, lensfun's ``acm`` model (no profile in the database uses
=======
Not ported: lateral colour (TCA), vignetting, lensfun's ``acm`` model (no profile in the database uses
>>>>>>> origin/main
it) and projection changes for fisheye lenses (their distortion polynomial is applied as for a
rectilinear lens; lensfun does the same when no projection change is asked for).
"""

from __future__ import annotations

import glob
import math
import os
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Iterable

from shootflow.dng_opcodes import WarpRectilinear2

DIAGONAL_35MM = math.hypot(36.0, 24.0)

# EXIF and TIFF tags read here.
TAG_MAKE = 271
TAG_MODEL = 272
TAG_FOCAL_LENGTH = 37386
TAG_FOCAL_35MM = 41989
TAG_LENS_MAKE = 42035
TAG_LENS_MODEL = 42036
TAG_DNG_LENS_INFO = 50736


class LensProfileError(ValueError):
    pass


@dataclass(frozen=True)
class Distortion:
    focal: float
    model: str  # "ptlens", "poly3" or "poly5"
    terms: tuple[float, float, float]  # ptlens a, b, c; poly3 k1, 0, 0; poly5 k1, k2, 0


<<<<<<< HEAD
@dataclass(frozen=True)
class Tca:
    """Lateral colour at one focal length: red and blue scaled about the centre, after the distortion."""

    focal: float
    model: str  # "poly3" or "linear"
    terms: tuple[float, ...]  # vr, vb, cr, cb, br, bb (linear: kr, kb, 0, 0, 0, 0)


=======
>>>>>>> origin/main
@dataclass
class CalibrationSet:
    crop: float
    aspect: float
    distortion: list[Distortion] = field(default_factory=list)
<<<<<<< HEAD
    tca: list[Tca] = field(default_factory=list)
=======
>>>>>>> origin/main


@dataclass
class Lens:
    maker: tuple[str, ...]
    models: tuple[str, ...]  # every language variant; the first is the main name
    mounts: tuple[str, ...]
    kind: str
    calibrations: list[CalibrationSet]
    source: str = ""

    @property
    def name(self) -> str:
        return self.models[0] if self.models else "?"


@dataclass
class Camera:
    makers: tuple[str, ...]
    models: tuple[str, ...]
    mount: str
    crop: float


@dataclass
class LensDb:
    cameras: list[Camera]
    lenses: list[Lens]
    compat: dict[str, tuple[str, ...]]  # mount -> compatible mounts
    files: int = 0


def _aspect(text: str | None, default: float) -> float:
    if text is None or not text.strip():
        return default
    t = text.strip()
    if ":" in t:
        a, b = t.split(":", 1)
        return float(a) / float(b)
    return float(t)


def _texts(el, tag: str) -> tuple[str, ...]:
    return tuple((e.text or "").strip() for e in el.findall(tag) if (e.text or "").strip())


def load_db(paths: Iterable[str] | str) -> LensDb:
    """Read lensfun XML files: a directory (every ``*.xml`` in it), a file, or a list of either."""

    if isinstance(paths, (str, os.PathLike)):
        paths = [paths]
    files: list[str] = []
    for p in paths:
        p = os.fspath(p)
        if os.path.isdir(p):
            files.extend(sorted(glob.glob(os.path.join(p, "*.xml"))))
        elif os.path.isfile(p):
            files.append(p)
        else:
            raise LensProfileError(f"lens database path not found: {p}")
    if not files:
        raise LensProfileError("no lensfun .xml files found in the lens database path")
    db = LensDb([], [], {}, len(files))
    for path in files:
        try:
            root = ET.parse(path).getroot()
        except ET.ParseError as exc:
            raise LensProfileError(f"{os.path.basename(path)}: not readable XML ({exc})") from None
        for m in root.findall("mount"):
            name = (m.findtext("name") or "").strip()
            if name:
                db.compat[name] = db.compat.get(name, ()) + _texts(m, "compat")
        for c in root.findall("camera"):
            try:
                crop = float((c.findtext("cropfactor") or "0").strip() or 0)
            except ValueError:
                crop = 0.0
            db.cameras.append(Camera(_texts(c, "maker"), _texts(c, "model"), (c.findtext("mount") or "").strip(), crop))
        for le in root.findall("lens"):
            try:
                db.lenses.append(_parse_lens(le, os.path.basename(path)))
            except ValueError:
                continue  # an entry lensfun itself would reject (a number that does not parse)
    return db


def _parse_lens(le, source: str) -> Lens:
    crop = float((le.findtext("cropfactor") or "1").strip() or 1)  # lfLens defaults: crop 1, aspect 3:2
    aspect = _aspect(le.findtext("aspect-ratio"), 1.5)
    sets: list[CalibrationSet] = []
    for cal in le.findall("calibration"):
        cs = CalibrationSet(
            float(cal.get("cropfactor", crop)), _aspect(cal.get("aspect-ratio"), aspect)
        )
        for d in cal.findall("distortion"):
            model = d.get("model", "")
            if model == "ptlens":
                terms = (float(d.get("a", 0)), float(d.get("b", 0)), float(d.get("c", 0)))
            elif model == "poly3":
                terms = (float(d.get("k1", 0)), 0.0, 0.0)
            elif model == "poly5":
                terms = (float(d.get("k1", 0)), float(d.get("k2", 0)), 0.0)
            else:
                continue
            cs.distortion.append(Distortion(float(d.get("focal")), model, terms))
<<<<<<< HEAD
        for t in cal.findall("tca"):
            model = t.get("model", "")
            if model == "poly3":
                one = {"vr": 1.0, "vb": 1.0}
                terms6 = tuple(float(t.get(k, one.get(k, 0.0))) for k in ("vr", "vb", "cr", "cb", "br", "bb"))
            elif model == "linear":
                terms6 = (float(t.get("kr", 1.0)), float(t.get("kb", 1.0)), 0.0, 0.0, 0.0, 0.0)
            else:
                continue  # acm: not carried
            cs.tca.append(Tca(float(t.get("focal")), model, terms6))
=======
>>>>>>> origin/main
        sets.append(cs)
    return Lens(
        _texts(le, "maker"), _texts(le, "model"), _texts(le, "mount"),
        (le.findtext("type") or "rectilinear").strip(), sets, source,
    )


# --- Matching (lensfun's lfFuzzyStrCmp and MatchScore) -------------------------------------------------------------


def split_words(text: str) -> list[str]:
    """Lensfun's ``lfFuzzyStrCmp::Split``: words by character class, case-folded, sorted (as bytes)."""

    out: list[str] = []
    i, n = 0, len(text)
    while i < n:
        while i < n and text[i].isspace():
            i += 1
        if i >= n:
            break
        start = i
        ch = text[i]
        i += 1
        strip = 0
        if ch.isascii() and ch.isdigit():
            while i < n and ((text[i].isascii() and text[i].isdigit()) or text[i] == "."):
                i += 1
            if i - start >= 2 and text[i - 2] == "." and text[i - 1] == "0":
                strip = 2
        elif _ispunct(ch):
            while i < n and _ispunct(text[i]):
                i += 1
        else:
            while i < n and not text[i].isspace() and not (text[i].isascii() and text[i].isdigit()) and not _ispunct(text[i]):
                i += 1
        if i - start == 1 and (_ispunct(ch) or ch.lower() == "f") and ch not in "*+":
            continue
        out.append(text[start : i - strip].casefold())
    return sorted(out, key=lambda w: w.encode("utf-8"))


def _ispunct(ch: str) -> bool:
    # C ispunct in the "C" locale: printable ASCII that is neither alphanumeric nor a space.
    return ch.isascii() and ch.isprintable() and not ch.isalnum() and not ch.isspace()


def fuzzy_score(pattern: list[str], match_text: str) -> int:
    """``lfFuzzyStrCmp::Compare`` with every pattern word required: 0, or 200 x matched / (both word counts)."""

    match = split_words(match_text)
    if not match or not pattern:
        return 0
    mi, score = 0, 0
    for word in pattern:
        wb = word.encode("utf-8")
        while mi < len(match):
            mb = match[mi].encode("utf-8")
            if wb == mb:
                score += 1
                break
            if wb < mb:
                return 0
            mi += 1
        if mi >= len(match):
            return 0
        mi += 1
    return (score * 200) // (len(pattern) + len(match))


def _norm(s: str) -> str:
    return " ".join(s.casefold().split())


def specific(name: str) -> bool:
    """Whether a lens name has a word beyond numbers and "mm" (``105mm`` alone names no lens)."""

    return any(not w[0].isdigit() and w != "mm" and not _ispunct(w[0]) for w in split_words(name))


def find_camera(db: LensDb, make: str | None, model: str | None) -> Camera | None:
    """A camera whose maker and model equal the EXIF ones (case and spacing ignored), as lensfun's FindCameras."""

    if not model:
        return None
    mk, md = _norm(make or ""), _norm(model)
    for cam in db.cameras:
        if md in (_norm(m) for m in cam.models) and (not mk or mk in (_norm(m) for m in cam.makers)):
            return cam
    return None


def _crop_score(camera_crop: float, lens: Lens) -> int:
    best = 0
    for cs in lens.calibrations:
        c = cs.crop
        if camera_crop > 0.01 and camera_crop < c * 0.96:
            continue
        for limit, pts in ((1.41, 2), (1.31, 4), (1.21, 6), (1.11, 8), (1.01, 10), (1.0, 5), (0.96, 3)):
            if camera_crop >= c * limit:
                best = max(best, pts)
                break
    return best


def find_lenses(db: LensDb, name: str, camera: Camera | None = None, crop: float | None = None,
                maker: str | None = None) -> list[tuple[int, Lens]]:
    """Lenses matching ``name``, best first, scored as lensfun's ``MatchScore`` (less the focal/aperture guess)."""

    pattern = split_words(name)
    if not pattern:
        return []
    mounts: tuple[str, ...] = ()
    if camera is not None and camera.mount:
        mounts = (camera.mount,) + db.compat.get(camera.mount, ())
    cam_crop = camera.crop if camera is not None and camera.crop > 0 else (crop or 0.0)
    hits: list[tuple[int, Lens]] = []
    for lens in db.lenses:
        score = 0
        if cam_crop and lens.calibrations:
            cs = _crop_score(cam_crop, lens)
            if not cs:
                continue
            score += cs
        if lens.mounts and mounts:
            if camera is not None and camera.mount in lens.mounts:
                score += 10
            elif any(m in lens.mounts for m in mounts[1:]):
                score += 9
            else:
                continue
        if maker and lens.maker:
            if _norm(maker) not in (_norm(m) for m in lens.maker):
                continue
            score += 10
        model_score = max((fuzzy_score(pattern, m) for m in lens.models), default=0)
        if not model_score:
            continue
        score += max(1, (model_score * 4) // 10)
        hits.append((score, lens))
    hits.sort(key=lambda t: -t[0])
    return hits


def fixed_lens(db: LensDb, camera: Camera) -> Lens | None:
    """The camera's built-in lens: the one lens on its own mount that lensfun names "fixed lens" in a language variant.

    (Lensfun gives each fixed-lens camera a mount of its own and its lens that English name; 263 of its lenses
    have it. A rare interchangeable mount with a single profiled lens is not taken for a fixed lens.)
    """

    if not camera.mount:
        return None
    on_mount = [
        lens for lens in db.lenses
        if camera.mount in lens.mounts and any(_norm(m) == "fixed lens" for m in lens.models)
    ]
    return on_mount[0] if len(on_mount) == 1 else None


# --- Interpolation (lensfun's InterpolateDistortion) ---------------------------------------------------------------


def hermite(y1: float | None, y2: float, y3: float, y4: float | None, t: float) -> float:
    """``_lf_interpolate``: a cubic Hermite spline from y2 to y3; a missing neighbour gives the chord's slope."""

    tg2 = (y3 - y2) if y1 is None else (y3 - y1) * 0.5
    tg3 = (y3 - y2) if y4 is None else (y4 - y2) * 0.5
    t2 = t * t
    t3 = t2 * t
    return (2 * t3 - 3 * t2 + 1) * y2 + (t3 - 2 * t2 + t) * tg2 + (-2 * t3 + 3 * t2) * y3 + (t3 - t2) * tg3


def calibration_set(lens: Lens, crop: float) -> CalibrationSet | None:
    best, ratio = None, 1e6
    for cs in lens.calibrations:
        if not cs.distortion or cs.crop <= 0:
            continue
        r = crop / cs.crop
        if r >= 0.96 and r < ratio:
            best, ratio = cs, r
    return best


<<<<<<< HEAD
def interpolate_tca(lens: Lens, crop: float, focal: float) -> Tca | None:
    """Lensfun's ``InterpolateTCA``: the set with the nearest crop at least 0.96 of the camera's, then the
    distortion's spline rules, with the ``v`` terms (the first two) not scaled by focal length
    (``__parameter_scales``, ``LF_MODIFY_TCA``)."""

    best, ratio = None, 1e6
    for cs in lens.calibrations:
        if not cs.tca or cs.crop <= 0:
            continue
        r = crop / cs.crop
        if r >= 0.96 and r < ratio:
            best, ratio = cs, r
    if best is None:
        return None
    model = best.tca[0].model
    same = [t for t in best.tca if t.model == model]
    for t in same:
        if t.focal == focal:
            return t
    below = sorted((t for t in same if t.focal < focal), key=lambda t: focal - t.focal)
    above = sorted((t for t in same if t.focal > focal), key=lambda t: t.focal - focal)
    if not below or not above:
        return (below or above)[0]
    s1, s2 = below[0], above[0]
    s0 = below[1] if len(below) > 1 else None
    s3 = above[1] if len(above) > 1 else None
    t_ = (focal - s1.focal) / (s2.focal - s1.focal)
    out = []
    for i in range(6):
        sc = (lambda c: 1.0) if i < 2 else (lambda c: c.focal)
        y0 = s0.terms[i] * sc(s0) if s0 else None
        y3 = s3.terms[i] * sc(s3) if s3 else None
        v = hermite(y0, s1.terms[i] * sc(s1), s2.terms[i] * sc(s2), y3, t_)
        out.append(v if i < 2 else v / focal)
    return Tca(focal, model, tuple(out))


def _tca_set(lens: Lens, crop: float) -> CalibrationSet | None:
    best, ratio = None, 1e6
    for cs in lens.calibrations:
        if cs.tca and cs.crop > 0 and crop / cs.crop >= 0.96 and crop / cs.crop < ratio:
            best, ratio = cs, crop / cs.crop
    return best


def _pmul(a, b):
    out = [0.0] * (len(a) + len(b) - 1)
    for i, x in enumerate(a):
        if x:
            for j, y in enumerate(b):
                out[i + j] += x * y
    return out


def plane_terms(kr: tuple[float, ...], tca: Tca | None, s: float) -> list[tuple[float, ...]]:
    """kr0..kr14 per plane (R, G, B) with lateral colour composed onto the distortion, exactly.

    Lensfun runs TCA on the distorted point (``ApplySubpixelGeometryDistortion``: coordinate callbacks,
    then subpixel ones). With ``f_D`` the distortion's factor (``kr``) and ``q = r f_D(r)``, red and blue
    read from ``q f_T(q)``, ``f_T = v + c R + b R^2`` in Hugin units (``R = s q``; lensfun scales ``c`` by
    ``hugin_scaling`` and ``b`` by its square). So the plane's factor is ``f_D(r) f_T(s r f_D(r))``, a
    polynomial of degree at most 4 + 2 * 5 = 14: the 15 terms a WarpRectilinear2 plane holds.
    """

    fd = list(kr)
    while len(fd) > 1 and fd[-1] == 0.0:
        fd.pop()
    if tca is None:
        return [tuple(kr)] * 3
    q = [0.0] + fd
    q2 = _pmul(q, q)
    out = []
    for coeffs in ((tca.terms[0], tca.terms[2], tca.terms[4]), (1.0, 0.0, 0.0), (tca.terms[1], tca.terms[3], tca.terms[5])):
        v, c, b = coeffs
        ft = [v] + [0.0] * (len(q2) - 1)
        for i, x in enumerate(q):
            ft[i] += c * s * x
        for i, x in enumerate(q2):
            ft[i] += b * s * s * x
        f = _pmul(fd, ft)
        while len(f) > 15 and abs(f[-1]) == 0.0:
            f.pop()
        if len(f) > 15:
            raise LensProfileError("lateral colour composed onto this distortion needs more than 15 terms")
        out.append(tuple(f) + (0.0,) * (15 - len(f)))
    return out


=======
>>>>>>> origin/main
def interpolate_distortion(lens: Lens, crop: float, focal: float) -> tuple[Distortion, CalibrationSet] | None:
    cs = calibration_set(lens, crop)
    if cs is None:
        return None
    model = None
    below: list[Distortion] = []  # nearest first
    above: list[Distortion] = []
    for d in cs.distortion:
        if model is None:
            model = d.model
        elif d.model != model:
            continue  # lensfun takes the first model a lens lists
        df = focal - d.focal
        if df == 0.0:
            return d, cs
        (below if df > 0 else above).append(d)
    # __insert_spline keeps the two nearest on each side: spline[1], spline[0] below; spline[2], spline[3] above.
    below.sort(key=lambda d: focal - d.focal)
    above.sort(key=lambda d: d.focal - focal)
    s1 = below[0] if below else None
    s0 = below[1] if len(below) > 1 else None
    s2 = above[0] if above else None
    s3 = above[1] if len(above) > 1 else None
    if s1 is None or s2 is None:
        near = s1 or s2
        return (near, cs) if near is not None else None
    t = (focal - s1.focal) / (s2.focal - s1.focal)
    terms = []
    for i in range(3):
        y0 = s0.terms[i] * s0.focal if s0 else None
        y3 = s3.terms[i] * s3.focal if s3 else None
        terms.append(hermite(y0, s1.terms[i] * s1.focal, s2.terms[i] * s2.focal, y3, t) / focal)
    return Distortion(focal, model or s1.model, (terms[0], terms[1], terms[2])), cs


# --- To a WarpRectilinear2 -----------------------------------------------------------------------------------------


def hugin_scale(cs: CalibrationSet, image_crop: float, w: int, h: int) -> float:
    """``s``: the DNG warp's ``r = 1`` (centre to the farthest pixel centre) in Hugin units of the calibration."""

    half_height_mm = DIAGONAL_35MM / cs.crop / math.hypot(cs.aspect, 1.0) / 2.0
    mm_per_px = DIAGONAL_35MM / image_crop / math.hypot(w, h)
    m_px = math.hypot((w - 1) / 2.0, (h - 1) / 2.0) or 1.0
    return m_px * mm_per_px / half_height_mm


def radial_terms(dist: Distortion, s: float) -> tuple[float, ...]:
    """kr0..kr14 of the WarpRectilinear2 that is lensfun's correction (``rescale_polynomial_coefficients``)."""

    kr = [0.0] * 15
    kr[0] = 1.0
    if dist.model == "ptlens":
        a, b, c = dist.terms
        d = 1.0 - a - b - c
        kr[1], kr[2], kr[3] = c * s / d**2, b * s**2 / d**3, a * s**3 / d**4
    elif dist.model == "poly3":
        k1 = dist.terms[0]
        kr[2] = k1 * s**2 / (1.0 - k1) ** 3
    elif dist.model == "poly5":
        k1, k2 = dist.terms[0], dist.terms[1]
        kr[2], kr[4] = k1 * s**2, k2 * s**4
    else:
        raise LensProfileError(f"distortion model {dist.model!r} is not supported")
    return tuple(kr)


def _source_radius(kr: tuple[float, ...], r: float) -> float:
    f = 0.0
    for p in range(14, -1, -1):
        f = f * r + kr[p]
    return r * f


def scale_terms(kr: tuple[float, ...], k: float) -> tuple[float, ...]:
    """The warp with corrected coordinates divided by ``k`` (``k > 1`` zooms in): ``kr_p / k^(p+1)``."""

    return tuple(v / k ** (p + 1) for p, v in enumerate(kr))


def fill_scale(kr: tuple[float, ...], w: int, h: int, samples: int = 64) -> float:
    """The zoom ``k`` that puts every border pixel's source inside the frame, the edge of it on the frame's edge.

    Border pixels are sampled ``samples`` per side; for each, the largest ``k`` that keeps its source outside
    or on the frame is found by bisection, and the largest of those is the answer (so all are inside).
    """

    cx, cy = (w - 1) / 2.0, (h - 1) / 2.0
    m = math.hypot(cx, cy) or 1.0
    pts = []
    for i in range(samples + 1):
        t = i / samples
        pts += [(t * (w - 1), 0.0), (t * (w - 1), h - 1.0), (0.0, t * (h - 1)), (w - 1.0, t * (h - 1))]

    def inside(k: float) -> bool:
        kk = scale_terms(kr, k)
        for x, y in pts:
            dx, dy = (x - cx) / m, (y - cy) / m
            r = math.hypot(dx, dy)
            if r == 0.0:
                continue
            rs = _source_radius(kk, r) / r
            sx, sy = cx + m * dx * rs, cy + m * dy * rs
            if sx < -1e-9 or sy < -1e-9 or sx > w - 1 + 1e-9 or sy > h - 1 + 1e-9:
                return False
        return True

    lo, hi = 0.25, 4.0
    if not inside(hi):
        raise LensProfileError("no zoom between 0.25x and 4x keeps the corrected frame inside the picture")
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        if inside(mid):
            hi = mid
        else:
            lo = mid
    return hi


@dataclass
class Correction:
    warp: WarpRectilinear2
    lens: Lens
    distortion: Distortion
    crop: float
    scale: float
    notes: list[str]


<<<<<<< HEAD
def build_warp(lens: Lens, focal: float, crop: float, w: int, h: int, fill: bool = True, tca: bool = True) -> Correction:
=======
def build_warp(lens: Lens, focal: float, crop: float, w: int, h: int, fill: bool = True) -> Correction:
>>>>>>> origin/main
    found = interpolate_distortion(lens, crop, focal)
    if found is None:
        raise LensProfileError(
            f"{lens.name}: no distortion calibration for crop factor {crop:g} (lensfun needs the camera's crop "
            "to be at least 0.96 of the calibration's)"
        )
    dist, cs = found
<<<<<<< HEAD
    s = hugin_scale(cs, crop, w, h)
    kr = radial_terms(dist, s)
    lateral = interpolate_tca(lens, crop, focal) if tca else None
    if lateral is not None:
        # TCA's Hugin units are those of the set InterpolateTCA chose (one set per lens in lensfun's files).
        tset = _tca_set(lens, crop)
        assert tset is not None  # interpolate_tca found a calibration in it
        planes = plane_terms(kr, lateral, hugin_scale(tset, crop, w, h))
    else:
        planes = [kr]
    k = max(fill_scale(p, w, h) for p in planes) if fill else 1.0
    if k != 1.0:
        planes = [scale_terms(p, k) for p in planes]
    warp = WarpRectilinear2(tuple(p + (0.0, 0.0, 0.0, 1.0) for p in planes), 0.5, 0.5, False)
=======
    kr = radial_terms(dist, hugin_scale(cs, crop, w, h))
    k = fill_scale(kr, w, h) if fill else 1.0
    if k != 1.0:
        kr = scale_terms(kr, k)
    warp = WarpRectilinear2((kr + (0.0, 0.0, 0.0, 1.0),), 0.5, 0.5, False)
>>>>>>> origin/main
    notes = []
    focals = sorted({d.focal for d in cs.distortion if d.model == dist.model})
    if focal in focals:
        how = f"calibrated at {focal:g} mm"
    elif focal < focals[0] or focal > focals[-1]:
        how = f"{focal:g} mm is outside the calibrated {focals[0]:g}-{focals[-1]:g} mm; nearest calibration used"
    else:
        how = f"interpolated to {focal:g} mm from calibrations at {', '.join(f'{v:g}' for v in focals)} mm"
    notes.append(
        f"lens correction from lensfun: {lens.name} [{lens.source}], {dist.model}, {how}; crop factor {crop:g}"
<<<<<<< HEAD
        + (f"; lateral colour {lateral.model}" if lateral is not None else "")
=======
>>>>>>> origin/main
        + (f", zoom {k:.4f} to fill the frame" if fill else ", no fill zoom")
    )
    return Correction(warp, lens, dist, crop, k, notes)


# --- From a raw file's tags ----------------------------------------------------------------------------------------


def _ascii(ifd, tag: int) -> str | None:
    if ifd is None:
        return None
    v = ifd.get(tag)
    if not v:
        return None
    if isinstance(v, (tuple, list)) and v and isinstance(v[0], int):
        text = bytes(v).split(b"\0")[0].decode("latin-1")
    else:
        text = str(v[0]) if isinstance(v, (tuple, list)) else str(v)
    text = text.strip()
    return text or None


def _number(ifd, tag: int) -> float | None:
    if ifd is None:
        return None
    v = ifd.get(tag)
    if not v:
        return None
    try:
        x = float(v[0])
    except (TypeError, ValueError):
        return None
    return x if x > 0 and math.isfinite(x) else None


@dataclass
class ShotInfo:
    make: str | None
    model: str | None
    lens: str | None
    lens_make: str | None
    focal: float | None
    focal_35mm: float | None


def shot_info(ifd0, exif) -> ShotInfo:
    """Camera, lens and focal length from IFD0 and the EXIF IFD (either may hold the EXIF tags in a DNG)."""

    def pick(fn, tag):
        return fn(exif, tag) or fn(ifd0, tag)

    focal = pick(_number, TAG_FOCAL_LENGTH)
    if focal is None:
        info = ifd0.get(TAG_DNG_LENS_INFO) if ifd0 is not None else None
        if info and len(info) >= 2 and info[0] and info[0] == info[1]:
            focal = float(info[0])  # a prime lens: LensInfo gives the focal length
    return ShotInfo(
        _ascii(ifd0, TAG_MAKE), _ascii(ifd0, TAG_MODEL), pick(_ascii, TAG_LENS_MODEL), pick(_ascii, TAG_LENS_MAKE),
        focal, pick(_number, TAG_FOCAL_35MM),
    )


def correction_for(db: LensDb, info: ShotInfo, w: int, h: int, *, lens_name: str | None = None,
<<<<<<< HEAD
                   focal: float | None = None, crop: float | None = None, fill: bool = True,
                   tca: bool = True) -> Correction:
=======
                   focal: float | None = None, crop: float | None = None, fill: bool = True) -> Correction:
>>>>>>> origin/main
    """Choose the lens and build its warp; ``lens_name``, ``focal`` and ``crop`` override the file's tags."""

    notes: list[str] = []
    camera = find_camera(db, info.make, info.model)
    if crop is None:
        if camera is not None and camera.crop > 0:
            crop = camera.crop
        elif info.focal and info.focal_35mm:
            crop = info.focal_35mm / info.focal
            notes.append(f"crop factor {crop:.3f} from the EXIF 35 mm equivalent focal length")
    if crop is None or crop <= 0:
        raise LensProfileError(
            f"crop factor unknown: the camera ({info.make or '?'} {info.model or '?'}) is not in the lens database "
            "and the file has no 35 mm equivalent focal length; pass --lens-crop"
        )
    focal = focal or info.focal
    if not focal:
        raise LensProfileError("focal length unknown: the file has no FocalLength tag; pass --lens-focal")
    name = lens_name or info.lens
    if name and not lens_name and not specific(name):
        raise LensProfileError(
            f"the file's lens name {name!r} gives only numbers (a third-party lens, as Canon bodies write them), "
            "which would match any lens of that focal length; pass --lens"
        )
    lens: Lens | None
    if name:
        hits = find_lenses(db, name, camera, crop)
        if not hits:
            raise LensProfileError(f"no lens in the database matches {name!r}" + (
                f" on the {camera.mount} mount" if camera is not None and camera.mount else ""))
        lens = hits[0][1]
        ties = list(dict.fromkeys(h[1].name for h in hits[1:] if h[0] == hits[0][0] and h[1].name != lens.name))
        if ties:
            notes.append(f"lens match tied with {', '.join(ties[:3])}; took {lens.name} (pass --lens to choose)")
    else:
        lens = fixed_lens(db, camera) if camera is not None else None
        if lens is None:
            raise LensProfileError("the file names no lens and the camera is not a fixed-lens camera in the "
                                   "database; pass --lens")
        notes.append(f"fixed-lens camera: {lens.name}")
<<<<<<< HEAD
    result = build_warp(lens, focal, crop, w, h, fill=fill, tca=tca)
=======
    result = build_warp(lens, focal, crop, w, h, fill=fill)
>>>>>>> origin/main
    result.notes = notes + result.notes
    return result
