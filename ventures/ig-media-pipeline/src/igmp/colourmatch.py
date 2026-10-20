"""Camera-matched colour: a per-photo 3D LUT from RawTherapee's rendering to the camera's JPEG.

RawTherapee renders an A7RV ARW through the camera's colour matrix (there is no DCP for it).
That is colorimetrically fair but it is not Sony's picture: blues lean violet (asphalt,
periwinkle skies), yellow foliage goes lemon, red wood goes orange. Sony's rendering is not one
global hue twist either (a blue->cyan nudge that fixed skies turned blue-grey roofs teal), so
instead of guessing a look we measure it, per photo, against the JPEG the camera made of the
very same exposure:

1. RawTherapee renders a *reference* of the RAW: the same profile as the real edit (tone
   matched to the camera JPEG, white balance as shot, highlight reconstruction, capture
   sharpening, lens correction) but with no user edit, no crop, and none of the tools that
   run after the LUT, so its output is exactly what the LUT is fed. ``reduce_render`` shrinks
   it to ~1024 px, keeping each block's mean colour *and* the covariance of the colours in it.
2. ``align`` finds where the camera JPEG sits on it (the camera may crop to 16:9 or 1:1, its
   distortion correction scales a little differently, an embedded preview may be unrotated).
3. ``sample_pairs`` takes corresponding colours from both, blurred a little and only on flat,
   unclipped areas, because the JPEG's sharpening, noise reduction and any sub-pixel
   misregistration are not colour.
4. ``fit_lattice`` fits a smooth 17^3 lattice (lattice regression: least squares through
   trilinear interpolation, plus a second-difference smoothness penalty and a weak pull to the
   identity). Colours the photo contains are mapped to the camera's rendering; colours it does
   not contain stay as RawTherapee rendered them, with a smooth transition in between. That is
   what keeps a white-balance or saturation edit behaving: it moves colours a little outside
   what was seen, where the map is still smooth and close to the measured correction.
   The fit is noise-aware: RawTherapee applies the LUT to every full-resolution pixel, and
   through a curved map the average of noisy colours is not the map of their average. So the
   data term compares the camera's colour with the LUT's mean output over each colour's
   measured spread (six sigma points), not with its output at the mean. At ISO 12800 this was
   worth 0.35 dE00 in the final render (3.55 -> 3.19); at base ISO it changes nothing.
5. ``write_hald`` writes it as a 16-bit level-8 HaldCLUT (64^3) for RawTherapee's Film
   Simulation tool, applied in the final render.

Why a lattice and not a 3x3 matrix (plus curves)? On the validation set a linear-light matrix
fitted to the same pairs left a held-out mean CIEDE2000 of about 2.5 (from 4.9); the lattice
reached about 1.8 and also fixed hue-dependent differences a matrix cannot (golden aspens and a
neutral road in the same frame). A lattice with a matrix prior instead of the identity did as
well on the colours it was fitted on but worse on the rest. Held-out means: fitted on half of
a 6x6 checkerboard of blocks, measured on the other half.

RawTherapee facts this relies on (5.13, from the source and checked with rawtherapee-cli):
* ``[Film Simulation] Enabled / ClutFilename / Strength`` (Strength an integer, 0..100, a
  linear blend). An absolute ClutFilename is used as is; a missing or unreadable file is
  ignored *silently*, so the caller checks the file exists.
* The CLUT runs inside rgbProc after exposure, the tone curves (including the auto-matched
  one), the Exposure "Saturation" slider and the HSV equalizer, and before Lab: Shadows &
  Highlights, the Lab curves, vibrance and sharpening act on its output. Input is the working
  space converted to the CLUT's primaries (sRGB, unless the file name ends in another working
  profile's name) and encoded with the sRGB curve, clamped to 0..1; trilinear interpolation;
  16-bit PNGs keep 16-bit precision. Rendering a reference with an sRGB output profile and no
  tools after the CLUT therefore gives exactly the CLUT's input: a test LUT (squaring every
  channel) applied by RawTherapee matched numpy's prediction on that render to 0.01 dE, and
  the fitted LUT applied by RawTherapee matched numpy applying it per pixel to 0.07 dE.
* The auto-matched tone curve is computed before rgbProc from a neutral render and the
  embedded JPEG, so it does not see the CLUT and is the same in the reference and the edit.
"""
from __future__ import annotations

import contextlib
import io
import math
import struct
import zlib
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

FIT_VERSION = 2           # bump when anything below changes what a fit produces (cache key)
LATTICE_N = 17            # fitted lattice nodes per axis
SMOOTH = 0.002            # second-difference penalty (relative to the weighted data term)
RIDGE = 1e-4              # pull towards the identity where there is no data
BINS = 48                 # pairs are averaged in cubes of 1/48 of each channel before fitting
PAIR_BLUR = 1.5           # px (at ~1024 px) both images are blurred by before pairing
HALD_LEVEL = 8            # written CLUT: 512x512 image, 64 nodes per axis
MIN_NCC = 0.5             # alignment must correlate at least this well
MIN_PAIRS = 2000          # usable pixel pairs (of ~700k at the reference size)
MIN_GAIN = 0.1            # held-out mean dE must drop by at least this much


class ColourMatchError(RuntimeError):
    """No trustworthy colour match for this photo (the caller renders without one)."""


# --------------------------------------------------------------------------- colour maths

_SRGB_TO_XYZ = np.array([[0.4124564, 0.3575761, 0.1804375],
                         [0.2126729, 0.7151522, 0.0721750],
                         [0.0193339, 0.1191920, 0.9503041]])
_D65 = np.array([0.95047, 1.0, 1.08883])
# Adobe RGB (1998) -> XYZ (D65); a camera set to Adobe RGB marks its JPEG "uncalibrated"
_ADOBE_TO_XYZ = np.array([[0.5767309, 0.1855540, 0.1881852],
                          [0.2973769, 0.6273491, 0.0752741],
                          [0.0270343, 0.0706872, 0.9911085]])


def srgb_to_linear(v: np.ndarray) -> np.ndarray:
    v = np.asarray(v, dtype=np.float64)
    return np.where(v <= 0.04045, v / 12.92, ((np.clip(v, 0.04045, None) + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(v: np.ndarray) -> np.ndarray:
    v = np.asarray(v, dtype=np.float64)
    return np.where(v <= 0.0031308, v * 12.92, 1.055 * np.clip(v, 0.0031308, None) ** (1 / 2.4) - 0.055)


def srgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    """sRGB (encoded, 0..1, RGB on the last axis) -> CIELAB (D65)."""
    xyz = srgb_to_linear(rgb) @ _SRGB_TO_XYZ.T / _D65
    f = np.where(xyz > (6 / 29) ** 3, np.cbrt(xyz), xyz / (3 * (6 / 29) ** 2) + 4 / 29)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def delta_e2000(lab1: np.ndarray, lab2: np.ndarray) -> np.ndarray:
    """CIEDE2000 colour difference (kL = kC = kH = 1), elementwise over the leading axes."""
    L1, a1, b1 = np.moveaxis(np.asarray(lab1, dtype=np.float64), -1, 0)
    L2, a2, b2 = np.moveaxis(np.asarray(lab2, dtype=np.float64), -1, 0)
    c7 = ((np.hypot(a1, b1) + np.hypot(a2, b2)) / 2) ** 7
    g = 0.5 * (1 - np.sqrt(c7 / (c7 + 25.0 ** 7)))
    a1p, a2p = a1 * (1 + g), a2 * (1 + g)
    c1, c2 = np.hypot(a1p, b1), np.hypot(a2p, b2)
    h1 = np.degrees(np.arctan2(b1, a1p)) % 360
    h2 = np.degrees(np.arctan2(b2, a2p)) % 360
    chroma0 = c1 * c2 == 0
    dh = h2 - h1
    dh = np.where(dh > 180, dh - 360, np.where(dh < -180, dh + 360, dh))
    dh = np.where(chroma0, 0, dh)
    dH = 2 * np.sqrt(c1 * c2) * np.sin(np.radians(dh) / 2)
    lm, cm = (L1 + L2) / 2, (c1 + c2) / 2
    hs = h1 + h2
    hm = np.where(np.abs(h1 - h2) > 180, np.where(hs < 360, hs + 360, hs - 360), hs) / 2
    hm = np.where(chroma0, hs, hm)
    t = (1 - 0.17 * np.cos(np.radians(hm - 30)) + 0.24 * np.cos(np.radians(2 * hm))
         + 0.32 * np.cos(np.radians(3 * hm + 6)) - 0.20 * np.cos(np.radians(4 * hm - 63)))
    cm7 = cm ** 7
    rt = -np.sin(np.radians(60 * np.exp(-(((hm - 275) / 25) ** 2)))) * 2 * np.sqrt(cm7 / (cm7 + 25.0 ** 7))
    sl = 1 + 0.015 * (lm - 50) ** 2 / np.sqrt(20 + (lm - 50) ** 2)
    sc, sh = 1 + 0.045 * cm, 1 + 0.015 * cm * t
    dl, dc, dhh = (L2 - L1) / sl, (c2 - c1) / sc, dH / sh
    return np.sqrt(np.maximum(dl ** 2 + dc ** 2 + dhh ** 2 + rt * dc * dhh, 0))


def mean_delta_e(a: np.ndarray, b: np.ndarray) -> float:
    """Mean CIEDE2000 between two sRGB colour arrays of the same shape."""
    if a.size == 0:
        return float("nan")
    return float(delta_e2000(srgb_to_lab(np.clip(a, 0, 1)), srgb_to_lab(np.clip(b, 0, 1))).mean())


# --------------------------------------------------------------------------- images

def _box_blur(a: np.ndarray, r: int, axis: int) -> np.ndarray:
    """Mean over a 2r+1 window along one axis, edges replicated."""
    pad = [(0, 0)] * a.ndim
    pad[axis] = (r + 1, r)
    c = np.cumsum(np.pad(a, pad, mode="edge"), axis=axis, dtype=np.float64)
    n = a.shape[axis]

    def sl(start):
        return tuple(slice(start, start + n) if i == axis else slice(None) for i in range(a.ndim))

    return ((c[sl(2 * r + 1)] - c[sl(0)]) * (1.0 / (2 * r + 1))).astype(a.dtype, copy=False)


def blur(a: np.ndarray, sigma: float) -> np.ndarray:
    """Approximately Gaussian blur over the first two axes (three box passes per axis)."""
    if sigma <= 0:
        return a
    r = max(1, round(math.sqrt(4 * sigma * sigma + 1) / 2 - 0.5))
    out = a
    for axis in (0, 1):
        for _ in range(3):
            out = _box_blur(out, r, axis)
    return out


def to_array(im: Image.Image) -> np.ndarray:
    """8-bit Pillow image -> float32 RGB 0..1."""
    return np.asarray(im.convert("RGB"), dtype=np.float32) / 255.0


def load_reference(src: str | Path | bytes, min_edge: int = 1024) -> np.ndarray:
    """The camera's JPEG (a path, or the bytes of a RAW's embedded JPEG) as upright sRGB floats.

    Decoded at the smallest JPEG DCT scale whose long edge is still >= ``min_edge`` (a 61 MP
    JPEG decodes in a fraction of a second at 1/8). Adobe RGB JPEGs (an embedded ICC profile,
    or EXIF ColorSpace "uncalibrated" as cameras write it) are converted to sRGB.
    """
    im = Image.open(io.BytesIO(src) if isinstance(src, (bytes, bytearray)) else src)
    w, h = im.size
    scale = max(1, min(8, max(w, h) // max(1, min_edge)))
    if im.format in ("JPEG", "MPO") and scale > 1:
        im.draft("RGB", (math.ceil(w / scale), math.ceil(h / scale)))
    exif = im.getexif()
    icc = im.info.get("icc_profile")
    im = ImageOps.exif_transpose(im).convert("RGB")
    if icc:
        from PIL import ImageCms
        with contextlib.suppress(OSError, ValueError, ImageCms.PyCMSError):   # bad profile: pixels as sRGB
            prof = ImageCms.ImageCmsProfile(io.BytesIO(icc))
            if "srgb" not in (ImageCms.getProfileDescription(prof) or "").lower():
                im = ImageCms.profileToProfile(im, prof, ImageCms.createProfile("sRGB"), outputMode="RGB")
        return to_array(im)
    rgb = to_array(im)
    if exif.get_ifd(0x8769).get(0xA001) == 0xFFFF:
        lin = np.clip(rgb, 0, 1).astype(np.float64) ** (563 / 256)
        xyz = lin @ _ADOBE_TO_XYZ.T
        rgb = np.clip(linear_to_srgb(xyz @ np.linalg.inv(_SRGB_TO_XYZ).T), 0, 1).astype(np.float32)
    return rgb


def luma(rgb: np.ndarray) -> np.ndarray:
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


def _resize(a: np.ndarray, size: tuple[int, int], box=None) -> np.ndarray:
    """Resize an (H, W[, C]) float array to size = (w, h) with Lanczos, optionally from a
    fractional source box (x0, y0, x1, y1)."""
    chans = [a] if a.ndim == 2 else [a[..., c] for c in range(a.shape[2])]
    out = [np.asarray(Image.fromarray(np.ascontiguousarray(c, dtype=np.float32), "F")
                      .resize(size, Image.LANCZOS, box=box)) for c in chans]
    return out[0] if a.ndim == 2 else np.stack(out, -1)


def reduce_render(full: np.ndarray, edge: int = 1024, rows: int = 32) -> tuple[np.ndarray, np.ndarray]:
    """Shrink a full-resolution 8-bit render by an integer factor to about ``edge`` px, keeping
    what the LUT will meet: the mean colour of every block of pixels and the covariance of the
    colours within it (noise and fine texture).

    That covariance matters because RawTherapee applies the LUT to every full-resolution pixel
    and the result is seen downscaled: through a curved map the mean of noisy colours is not
    the map of their mean (at ISO 12800 the difference was 1.6 dE00). Returns (mean (h, w, 3),
    cov (h, w, 6) with entries rr, gg, bb, rg, rb, gb), float32, sRGB-encoded 0..1 units.
    """
    H, W = full.shape[:2]
    f = max(1, math.ceil(max(H, W) / edge))
    h, w = H // f, W // f
    mean = np.empty((h, w, 3), np.float32)
    cov = np.empty((h, w, 6), np.float32)
    pairs = [(0, 0), (1, 1), (2, 2), (0, 1), (0, 2), (1, 2)]
    for r0 in range(0, h, rows):
        r1 = min(h, r0 + rows)
        x = full[r0 * f:r1 * f, :w * f].astype(np.float32).reshape(r1 - r0, f, w, f, 3) * (1 / 255)
        m = x.mean(axis=(1, 3))
        mean[r0:r1] = m
        for k, (i, j) in enumerate(pairs):
            cov[r0:r1, :, k] = (x[..., i] * x[..., j]).mean(axis=(1, 3)) - m[..., i] * m[..., j]
    return mean, cov


# --------------------------------------------------------------------------- alignment

def _structure(rgb: np.ndarray) -> np.ndarray:
    """Band-passed luma: edges and texture, without the tone differences between renderings."""
    g = luma(rgb).astype(np.float64)
    return blur(g, 0.7) - blur(g, 2.5)


def _ncc_map(image: np.ndarray, templ: np.ndarray) -> np.ndarray:
    """Normalised cross-correlation of ``templ`` at every position fully inside ``image``."""
    H, W = image.shape
    h, w = templ.shape
    t = templ - templ.mean()
    tn = math.sqrt(float((t * t).sum())) or 1.0
    corr = np.fft.irfft2(np.fft.rfft2(image) * np.conj(np.fft.rfft2(t, s=(H, W))), s=(H, W))
    corr = corr[: H - h + 1, : W - w + 1]
    c1 = np.pad(image, ((1, 0), (1, 0))).cumsum(0).cumsum(1)
    c2 = np.pad(image * image, ((1, 0), (1, 0))).cumsum(0).cumsum(1)

    def window(c):
        return c[h:, w:] - c[:-h, w:] - c[h:, :-w] + c[:-h, :-w]

    s1 = window(c1)
    var = np.maximum(window(c2) - s1 * s1 / (h * w), 1e-12)
    return corr / (np.sqrt(var) * tn)


def _peak(m: np.ndarray) -> tuple[float, float, float]:
    """(value, x, y) of the maximum, with a parabolic sub-pixel refinement."""
    y, x = divmod(int(np.argmax(m)), m.shape[1])
    v = float(m[y, x])

    def refine(a, b, c):
        den = a - 2 * b + c
        return 0.5 * (a - c) / den if den < 0 else 0.0

    dx = refine(m[y, x - 1], v, m[y, x + 1]) if 0 < x < m.shape[1] - 1 else 0.0
    dy = refine(m[y - 1, x], v, m[y + 1, x]) if 0 < y < m.shape[0] - 1 else 0.0
    return v, x + dx, y + dy


def _best_placement(img_s: np.ndarray, ref_s: np.ndarray, scales, inner: float = 0.8):
    """Best (ncc, scale, x, y) such that ``ref_s`` scaled by ``scale`` has its top-left corner at
    (x, y) of ``img_s``. Matches the central ``inner`` part of the reference, so the reference
    may overhang the image a little."""
    H, W = img_s.shape
    hr, wr = ref_s.shape
    bx, by = wr * (1 - inner) / 2, hr * (1 - inner) / 2
    best = (-2.0, 1.0, 0.0, 0.0)
    for s in scales:
        tw, th = round(wr * inner * s), round(hr * inner * s)
        if tw < 16 or th < 16 or tw >= W or th >= H:
            continue
        v, x, y = _peak(_ncc_map(img_s, _resize(ref_s, (tw, th), box=(bx, by, wr - bx, hr - by))))
        if v > best[0]:
            sx, sy = tw / (wr * inner), th / (hr * inner)
            best = (v, (sx + sy) / 2, x - bx * sx, y - by * sy)
    return best


def align(img: np.ndarray, ref: np.ndarray, *, work_edge: int = 384) -> dict | None:
    """Where the camera JPEG ``ref`` sits on the render ``img`` (both sRGB float arrays).

    The camera JPEG may be cropped to another aspect (16:9, 1:1, 4:3 in camera), scaled a
    little differently (in-camera distortion correction), or rotated (an embedded preview
    without orientation). Tries the right-angle rotations that fit the shapes, a +-6 % scale
    range and every translation, by normalised cross-correlation of band-passed luma at
    ~``work_edge`` px. Returns {"ref": ref resampled onto img's grid, "mask": where it covers
    img, "ncc", "rot" (degrees), "scale" (img px per ref px), "offset"} or None.
    """
    H, W = img.shape[:2]
    rots = [0, 2] if (W >= H) == (ref.shape[1] >= ref.shape[0]) else [1, 3]
    k = work_edge / max(H, W)
    ws = (max(16, round(W * k)), max(16, round(H * k)))
    img_s = _structure(_resize(img, ws))
    best = None
    for rot in rots:
        r = np.rot90(ref, rot)
        hr, wr = r.shape[:2]
        kr = min(1.0, work_edge * 1.25 / max(hr, wr))
        r_s = _structure(_resize(r, (max(16, round(wr * kr)), max(16, round(hr * kr)))))
        s0 = min(ws[0] / r_s.shape[1], ws[1] / r_s.shape[0])
        cand = _best_placement(img_s, r_s, s0 * np.linspace(0.94, 1.06, 25))
        cand = _best_placement(img_s, r_s, cand[1] * np.linspace(0.9965, 1.0035, 15))
        if best is None or cand[0] > best[0]:
            best = (*cand, rot, r, kr)
    if best is None:
        return None
    ncc, s, x, y, rot, r, kr = best
    scale = s * kr / k                       # img px per (rotated) ref px
    ox, oy = x / k, y / k                    # the ref's top-left corner on img
    hr, wr = r.shape[:2]
    x0, y0 = max(0, math.ceil(ox)), max(0, math.ceil(oy))
    x1, y1 = min(W, math.floor(ox + wr * scale)), min(H, math.floor(oy + hr * scale))
    if x1 - x0 < 16 or y1 - y0 < 16:
        return None
    box = ((x0 - ox) / scale, (y0 - oy) / scale, (x1 - ox) / scale, (y1 - oy) / scale)
    out = np.zeros((H, W, 3), np.float32)
    out[y0:y1, x0:x1] = _resize(r, (x1 - x0, y1 - y0), box=box)
    mask = np.zeros((H, W), bool)
    mask[y0:y1, x0:x1] = True
    return {"ref": out, "mask": mask, "ncc": ncc, "rot": rot * 90, "scale": scale, "offset": (ox, oy)}


# --------------------------------------------------------------------------- pairs

def _erode(mask: np.ndarray, r: int) -> np.ndarray:
    return blur(mask.astype(np.float32), r) > 0.999


def _grow(mask: np.ndarray, r: int) -> np.ndarray:
    return blur(mask.astype(np.float32), r) > 1e-3


def sample_pairs(img: np.ndarray, ref: np.ndarray, mask: np.ndarray, *, sigma: float = 1.5,
                 clip: float = 0.96, edge_pct: float = 70.0):
    """Corresponding colours: x from the render, y from the aligned camera JPEG.

    Both are blurred a little (their sharpening, noise reduction and demosaicing differ). Left
    out: pixels near the edge of the JPEG's frame, near a nearly clipped channel in either image
    (clipping is not colour), and the busiest ``100 - edge_pct`` % of the frame, where a
    sub-pixel misregistration changes the colour. Returns x, y as (N, 3) float64 arrays, the
    boolean mask of the pixels used, and the two blurred images.
    """
    a = blur(img.astype(np.float32), sigma)
    b = blur(ref.astype(np.float32), sigma)
    ok = _erode(mask, 3)
    ok &= ~_grow((img.max(-1) >= clip) | (ref.max(-1) >= clip), 3)
    la, lb = luma(a), luma(b)
    detail = blur(np.abs(la - blur(la, 3.0)) + np.abs(lb - blur(lb, 3.0)), 2.0)
    if ok.any():
        ok &= detail <= max(float(np.percentile(detail[ok], edge_pct)), 0.004)
    return a[ok].astype(np.float64), b[ok].astype(np.float64), ok, (a, b)


def bin_pairs(x: np.ndarray, y: np.ndarray, bins: int = BINS, cov: np.ndarray | None = None):
    """Average the pairs whose render colour falls in the same 1/bins cube of RGB.

    Returns (x_mean, y_mean, count, cov_mean): one row per occupied cube, so a big even sky is
    a few hundred rows with large counts rather than 100k near-duplicates. ``cov`` (N, 6) is
    the within-pixel colour covariance of each pair (see ``reduce_render``), averaged the same
    way; cov_mean is None without it.
    """
    q = np.clip((x * bins).astype(np.int64), 0, bins - 1)
    key = q[:, 0] + bins * q[:, 1] + bins * bins * q[:, 2]
    uniq, inv, cnt = np.unique(key, return_inverse=True, return_counts=True)
    k = len(uniq)
    inv = inv.ravel()

    def avg(a):
        return np.stack([np.bincount(inv, a[:, c], k) for c in range(a.shape[1])], 1) / cnt[:, None]

    return avg(x), avg(y), cnt.astype(np.float64), (None if cov is None else avg(cov))


# --------------------------------------------------------------------------- lattice

def identity_lattice(n: int) -> np.ndarray:
    """(n**3, 3) node colours of the identity map; node index = r + n*g + n*n*b."""
    v = np.linspace(0.0, 1.0, n)
    b, g, r = np.meshgrid(v, v, v, indexing="ij")
    return np.stack([r.ravel(), g.ravel(), b.ravel()], -1)


def _corners(x: np.ndarray, n: int):
    """Trilinear interpolation: (M, 8) node indices and (M, 8) weights for colours x (M, 3)."""
    p = np.clip(x, 0.0, 1.0) * (n - 1)
    i0 = np.minimum(np.floor(p).astype(np.int64), n - 2)
    f = p - i0
    idx, wts = [], []
    for db in (0, 1):
        for dg in (0, 1):
            for dr in (0, 1):
                idx.append((i0[:, 0] + dr) + n * (i0[:, 1] + dg) + n * n * (i0[:, 2] + db))
                wts.append((f[:, 0] if dr else 1 - f[:, 0]) * (f[:, 1] if dg else 1 - f[:, 1])
                           * (f[:, 2] if db else 1 - f[:, 2]))
    return np.stack(idx, 1), np.stack(wts, 1)


def _sigma_points(x: np.ndarray, cov: np.ndarray) -> np.ndarray:
    """(M, 6, 3): x +- sqrt(3) L e_j (L L' = cov), the six equal-weight points with the mean
    and covariance of each colour's spread. A pair that would leave the RGB cube is pulled in
    (both points, so the mean is kept): the pixels it stands for were clipped there anyway."""
    c = np.asarray(cov, dtype=np.float64)
    S = np.empty((len(x), 3, 3))
    for k, (i, j) in enumerate([(0, 0), (1, 1), (2, 2), (0, 1), (0, 2), (1, 2)]):
        S[:, i, j] = S[:, j, i] = c[:, k]
    w, v = np.linalg.eigh(S)                               # robust square root of a PSD matrix
    L = v * np.sqrt(np.clip(w, 0, None))[:, None, :]
    d = math.sqrt(3) * np.moveaxis(L, 2, 1)                # (M, 3 directions, 3 channels)
    room = np.minimum(x[:, None, :], 1 - x[:, None, :]).clip(0, None)
    with np.errstate(divide="ignore", invalid="ignore"):
        scale = np.where(np.abs(d) > 1e-12, room / np.abs(d), np.inf).min(-1, keepdims=True)
    d = d * np.minimum(1.0, scale)
    return np.concatenate([x[:, None, :] + d, x[:, None, :] - d], 1)


def _rows(x: np.ndarray, cov: np.ndarray | None, n: int):
    """Interpolation rows for colours x: plain trilinear corners, or with ``cov`` the average
    over the sigma points of each colour's spread (what the LUT's output averages to)."""
    if cov is None:
        return _corners(x, n)
    pts = _sigma_points(x, cov)
    idx, w = _corners(pts.reshape(-1, 3), n)
    k = pts.shape[1] * 8
    return idx.reshape(len(x), k), w.reshape(len(x), k) / pts.shape[1]


def expected_output(lattice: np.ndarray, x: np.ndarray, cov: np.ndarray | None = None) -> np.ndarray:
    """What the lattice turns colours x (M, 3) into once seen downscaled: the mean of its output
    over each colour's spread ``cov`` (M, 6), or simply its output without one."""
    if cov is None:
        return apply_lattice(lattice, x)
    idx, w = _rows(np.asarray(x, dtype=np.float64), cov, round(lattice.shape[0] ** (1 / 3)))
    return np.einsum("mk,mkc->mc", w, lattice[idx])


def apply_lattice(lattice: np.ndarray, x: np.ndarray) -> np.ndarray:
    """Map colours x (..., 3) through a (n**3, 3) lattice by trilinear interpolation, the way
    RawTherapee applies a HaldCLUT."""
    n = round(lattice.shape[0] ** (1 / 3))
    flat = np.asarray(x, dtype=np.float64).reshape(-1, 3)
    out = np.empty_like(flat)
    for s in range(0, len(flat), 1 << 18):          # bounded memory on big images
        idx, w = _corners(flat[s:s + (1 << 18)], n)
        out[s:s + (1 << 18)] = np.einsum("mk,mkc->mc", w, lattice[idx])
    return out.reshape(np.shape(x))


def _d2(v: np.ndarray, axis: int) -> np.ndarray:
    return np.diff(v, n=2, axis=axis)


def _d2t(d: np.ndarray, axis: int) -> np.ndarray:
    """Transpose of _d2."""
    shape = list(d.shape)
    shape[axis] += 2
    n = shape[axis]
    out = np.zeros(shape)

    def sl(a, b):
        return tuple(slice(a, b) if i == axis else slice(None) for i in range(len(shape)))

    out[sl(0, n - 2)] += d
    out[sl(1, n - 1)] -= 2 * d
    out[sl(2, n)] += d
    return out


def _smooth_op(v: np.ndarray, n: int) -> np.ndarray:
    """D'D v, D = second differences along the three lattice axes."""
    g = v.reshape(n, n, n, -1)
    out = np.zeros_like(g)
    for axis in range(3):
        out += _d2t(_d2(g, axis), axis)
    return out.reshape(v.shape)


def _smooth_diag(n: int) -> np.ndarray:
    i = np.arange(n)
    d1 = (i <= n - 3) * 1.0 + ((i >= 1) & (i <= n - 2)) * 4.0 + (i >= 2) * 1.0
    b, g, r = np.meshgrid(d1, d1, d1, indexing="ij")
    return (r + g + b).ravel()


def fit_lattice(x: np.ndarray, y: np.ndarray, w: np.ndarray | None = None, cov: np.ndarray | None = None, *,
                n: int = LATTICE_N, smooth: float = SMOOTH, ridge: float = RIDGE, iters: int = 500,
                tol: float = 1e-6) -> np.ndarray:
    """A (n**3, 3) lattice T with T(x) ~ y that is smooth and close to the identity I where
    there is no data. Minimises

        sum w |E T(x) - y|^2 / sum w  +  smooth |D2 (T - I)|^2  +  ridge |T - I|^2

    (D2: second differences along each axis) by preconditioned conjugate gradients. E T(x) is
    T(x), or with ``cov`` the mean of T over each colour's spread (``expected_output``), so the
    map is right for the noisy full-resolution pixels it will be applied to.
    """
    w = np.ones(len(x)) if w is None else np.asarray(w, dtype=np.float64)
    w = w / w.sum()
    eye = identity_lattice(n)
    idx, cw = _rows(np.asarray(x, dtype=np.float64), cov, n)
    flat_idx = idx.ravel()
    m = n ** 3
    resid = y - np.einsum("mk,mkc->mc", cw, eye[idx])      # what the correction R = T - I must explain

    def scatter(vals):                       # A' vals for (M, 3) vals
        return np.stack([np.bincount(flat_idx, (cw * vals[:, c:c + 1]).ravel(), m) for c in range(3)], 1)

    def op(v):
        av = np.einsum("mk,mkc->mc", cw, v[idx]) * w[:, None]
        return scatter(av) + smooth * _smooth_op(v, n) + ridge * v

    rhs = scatter(resid * w[:, None])
    diag = (np.bincount(flat_idx, (cw * cw * w[:, None]).ravel(), m) + smooth * _smooth_diag(n) + ridge)[:, None]
    R = np.zeros((m, 3))
    r = rhs.copy()
    z = r / diag
    p = z.copy()
    rz = (r * z).sum(0)
    stop = tol * max(1e-30, float(np.sqrt((rhs * rhs).sum())))       # relative residual
    for _ in range(iters):
        q = op(p)
        alpha = rz / np.maximum((p * q).sum(0), 1e-300)
        R += alpha * p
        r -= alpha * q
        if float(np.sqrt((r * r).sum())) <= stop:
            break
        z = r / diag
        rz_new = (r * z).sum(0)
        p = z + (rz_new / np.maximum(rz, 1e-300)) * p
        rz = rz_new
    return eye + R


# --------------------------------------------------------------------------- the fit

@dataclass
class CameraFit:
    """A fitted render -> camera map and how well it did."""
    lattice: np.ndarray
    ncc: float                      # alignment correlation
    pairs: int                      # pixel pairs used
    heldout_before: float           # mean dE00 on held-out blocks, render vs camera
    heldout_after: float            # ...after the map (fitted on the other blocks)
    before: float                   # mean dE00 over the whole overlap (edges included)
    after: float
    notes: dict = field(default_factory=dict)


def _with_anchors(x, y, w, cov=None):
    """Pin black and white (a weak 1 % weight each): highlights and shadows are where the pairs
    are thinnest, and the map should not tint them."""
    anchors = np.array([[0.0, 0.0, 0.0], [1.0, 1.0, 1.0]])
    return (np.vstack([x, anchors]), np.vstack([y, anchors]), np.append(w, [0.01 * w.sum()] * 2),
            None if cov is None else np.vstack([cov, np.zeros((2, 6))]))


def fit_camera_map(render: np.ndarray, reference: np.ndarray, cov: np.ndarray | None = None, *,
                   blocks: int = 6) -> CameraFit:
    """Fit the map from RawTherapee's reference render to the camera JPEG.

    ``render`` is the reference render (sRGB floats, ~1024 px), ``reference`` the camera JPEG
    (sRGB floats, any size >= the render's), ``cov`` the render's within-pixel colour
    covariance from ``reduce_render`` (optional; without it the map is fitted as if the LUT
    met clean colours). The map is checked before it is trusted: fitted on half of a
    ``blocks`` x ``blocks`` checkerboard and measured on the other half, it must bring the
    held-out colours at least MIN_GAIN dE00 closer to the camera's. The returned lattice is
    then fitted on all pairs. Raises ColourMatchError when the JPEG cannot be aligned, there is
    too little usable area, or the map does not generalise.
    """
    a = align(render, reference)
    if a is None or a["ncc"] < MIN_NCC:
        raise ColourMatchError(f"camera JPEG does not align with the RAW (ncc {a['ncc'] if a else 0:.2f})")
    x, y, ok, (rb, cb) = sample_pairs(render, a["ref"], a["mask"], sigma=PAIR_BLUR)
    if len(x) < MIN_PAIRS:
        raise ColourMatchError(f"only {len(x)} usable pixel pairs")
    cv = None if cov is None else blur(cov.astype(np.float32), PAIR_BLUR)
    c = None if cv is None else cv[ok].astype(np.float64)
    H, W = ok.shape
    yy, xx = np.mgrid[:H, :W]
    train = ((yy * blocks // H) + (xx * blocks // W)) % 2 == 0
    sel = train[ok]
    if sel.sum() < MIN_PAIRS // 2 or (~sel).sum() < MIN_PAIRS // 2:
        raise ColourMatchError("usable pixels too unevenly spread to cross-check the fit")

    def part(v, m):
        return None if v is None else v[m]

    half = fit_lattice(*_with_anchors(*bin_pairs(x[sel], y[sel], cov=part(c, sel))))
    held = np.flatnonzero(~sel)[:: max(1, int((~sel).sum()) // 50000)]      # a mean needs no more
    before_h = mean_delta_e(x[held], y[held])
    after_h = mean_delta_e(np.clip(expected_output(half, x[held], part(c, held)), 0, 1), y[held])
    if not after_h <= before_h - MIN_GAIN:
        raise ColourMatchError(f"fit does not generalise (held-out dE {before_h:.2f} -> {after_h:.2f})")
    lattice = np.clip(fit_lattice(*_with_anchors(*bin_pairs(x, y, cov=c))), 0, 1)
    cover = _erode(a["mask"], 3)
    cover[1::2] = False                       # every other row and column is plenty for a summary
    cover[:, 1::2] = False
    rc, cc = rb[cover].astype(np.float64), cb[cover]
    return CameraFit(lattice=lattice, ncc=a["ncc"], pairs=len(x), heldout_before=before_h,
                     heldout_after=after_h, before=mean_delta_e(rc, cc),
                     after=mean_delta_e(expected_output(lattice, rc, part(cv, cover)), cc),
                     notes={"rot": a["rot"], "scale": a["scale"]})


# --------------------------------------------------------------------------- HaldCLUT

def hald_identity(level: int) -> np.ndarray:
    """(level**3, level**3, 3) identity HaldCLUT as floats: pixel i (row-major) holds
    red = i % N, green = (i // N) % N, blue = i // N**2 in steps of 1 / (N - 1), N = level**2."""
    n = level * level
    i = np.arange(n ** 3)
    side = level ** 3
    return (np.stack([i % n, (i // n) % n, i // (n * n)], -1) / (n - 1)).reshape(side, side, 3)


def write_hald(lattice: np.ndarray, path: str | Path, level: int = HALD_LEVEL) -> None:
    """Write the lattice as a 16-bit HaldCLUT PNG for RawTherapee's Film Simulation (sRGB-encoded
    sRGB-primaries input and output, which is what RawTherapee uses for a CLUT whose file name
    does not end in another working profile's name)."""
    ident = hald_identity(level)
    write_png16(path, np.clip(apply_lattice(lattice, ident.reshape(-1, 3)), 0, 1).reshape(ident.shape))


def write_png16(path: str | Path, rgb: np.ndarray) -> None:
    """Write an (H, W, 3) float 0..1 image as a 16-bit RGB PNG (Pillow writes 8-bit RGB only)."""
    a = np.round(np.clip(rgb, 0, 1) * 65535).astype(">u2")
    h, w = a.shape[:2]
    rows = a.reshape(h, w * 3).view(np.uint8)
    raw = np.hstack([np.zeros((h, 1), np.uint8), rows]).tobytes()      # filter type 0 per row

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    Path(path).write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 16, 2, 0, 0, 0))
                           + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))


def read_png16(path: str | Path) -> np.ndarray:
    """Read a PNG written by write_png16 (16-bit RGB, filter 0) back as floats 0..1."""
    data = Path(path).read_bytes()
    pos, idat, w, h = 8, b"", 0, 0
    while pos < len(data):
        n, tag = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + n]
        if tag == b"IHDR":
            w, h = struct.unpack(">II", body[:8])
        elif tag == b"IDAT":
            idat += body
        pos += 12 + n
    rows = np.frombuffer(zlib.decompress(idat), np.uint8).reshape(h, 1 + w * 6)[:, 1:]
    return rows.copy().view(">u2").reshape(h, w, 3).astype(np.float64) / 65535
