"""Reading pixels out of the library: probes, cached previews, single frames and 360 reframes.

Everything here is read-only towards the library; the only files written are cached previews
under ``cfg.state_dir / "previews"``.

360 geometry (Insta360 X5)
--------------------------
An X5 shot is two fisheye images, one per lens, never stitched by the camera:

* ``.insp`` stills are one JPEG with both lenses side by side (11904x5952, 5952 px per lens).
* ``.insv`` video has two video streams, one per lens (3840x3840 or 1920x1920 each).
* The ``LRV_*.lrv`` proxy of an ``.insv`` is one 2:1 frame with both lenses side by side.

We bring every source into the ``.insp`` layout -- ``[rear lens | front lens]`` -- and work
on that "dual fisheye" array. The front lens is ``.insv`` stream 0 / the right half of an
``.insp`` or ``.lrv``; the rear lens (the one on the screen side, which usually sees the
person holding the camera) is stream 1 / the left half.

World frame: x right, y up, z forward. **yaw 0 looks along the front lens axis**, positive yaw
turns right, positive pitch looks up; yaw +-180 is the rear lens axis. The equirectangular
previews put yaw -180 at the left edge, 0 in the middle and +180 at the right edge.

Each lens is modelled as an equidistant fisheye centred in its square with the image circle's
half-width at FISHEYE_FOV/2 off-axis (rho = R * theta / (FOV/2)). The FOVs were fitted by
maximising gradient correlation of both lenses in the 10-degree band around the stitch line
over eight .insp scenes and seven .insv frames (a ~200 deg still and ~197 deg video lens circle;
the camera's own per-unit calibration string moved the fit by under 1 px at 1/4 scale, so it
is not used).

To avoid stitch seams, ``reframe_360_image`` renders from ONE lens whenever every ray of the
requested view is within SINGLE_LENS_MAX_DEG of that lens's axis (any view centred within
~20 deg of yaw 0 or 180 with a 90 deg hfov qualifies). Only views that really straddle the
side (yaw near +-90) sample both lenses, cross-faded over +-SEAM_FEATHER_DEG around 90 deg.
"""
from __future__ import annotations

import io
import json
import math
import os
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageCms, ImageDraw, ImageFont, ImageOps

from .config import Config
from .models import Asset

PREVIEW_SIZE = 1024
JPEG_QUALITY = 88
CONTACT_FRAMES = 8

# Fitted lens geometry (see module docstring). Video is cropped slightly tighter than stills.
X5_PHOTO_FOV_DEG = 200.0
X5_VIDEO_FOV_DEG = 197.0
# A ray within this angle of one lens axis is rendered from that lens alone (no seam). The
# usable circle reaches ~98-100 deg but the outer few degrees are vignetted and soft.
SINGLE_LENS_MAX_DEG = 95.0
# Half-width of the cross-fade between lenses around the 90 deg side line, for views that
# must use both. Narrow, because the lenses are ~3 cm apart and close objects ghost.
SEAM_FEATHER_DEG = 4.0

PROXY_EXT = (".lrf", ".lrv")
RAW_EXT = (".arw", ".dng")
_DRAFT_SCALES = (8, 4, 2, 1)   # JPEG DCT scaling Pillow's draft() can do


class MediaError(RuntimeError):
    """A file that ffmpeg/Pillow/rawpy cannot read (truncated, corrupt, unsupported)."""


# --------------------------------------------------------------------------- subprocess helpers

def _run(cmd: list[str], what: str) -> bytes:
    try:
        res = subprocess.run(cmd, capture_output=True, check=False)
    except FileNotFoundError as e:
        raise MediaError(f"{cmd[0]} not found ({what})") from e
    if res.returncode != 0:
        err = res.stderr.decode(errors="replace").strip().splitlines()
        raise MediaError(f"{what}: {err[-1] if err else 'exit ' + str(res.returncode)}")
    return res.stdout


def _ff(cfg: Config) -> list[str]:
    return [cfg.ffmpeg, "-nostdin", "-hide_banner", "-v", "error"]


@lru_cache(maxsize=512)
def _probe_cached(path: str, ffprobe: str, mtime: float) -> dict:
    out = _run([ffprobe, "-v", "error", "-print_format", "json", "-show_format", "-show_streams",
                path], f"ffprobe {Path(path).name}")
    data = json.loads(out or b"{}")
    streams = data.get("streams", [])
    video = [s for s in streams if s.get("codec_type") == "video"
             and not s.get("disposition", {}).get("attached_pic")]
    if not video:
        raise MediaError(f"no video stream in {path}")
    v = video[0]
    rotation = 0
    for sd in v.get("side_data_list", []) or []:
        if "rotation" in sd:
            rotation = int(round(float(sd["rotation"])))
    if "rotate" in v.get("tags", {}):
        rotation = int(v["tags"]["rotate"])
    w, h = int(v["width"]), int(v["height"])
    if rotation % 180:
        w, h = h, w
    num, _, den = (v.get("avg_frame_rate") or v.get("r_frame_rate") or "0/1").partition("/")
    fps = float(num) / float(den or 1) if float(den or 1) else 0.0
    duration = float(data.get("format", {}).get("duration") or v.get("duration") or 0.0)
    return {
        "duration_s": duration,
        "width": w,
        "height": h,
        "fps": fps,
        "video_streams": len(video),
        "video_indexes": [int(s["index"]) for s in video],
        "codec": v.get("codec_name", ""),
        "rotation": rotation,
        "has_audio": any(s.get("codec_type") == "audio" for s in streams),
    }


def probe(path: str | Path, cfg: Config) -> dict:
    """Facts about a video: duration_s, width/height (as displayed, rotation applied), fps,
    video_streams (attached cover pictures excluded; 2 for an X5 .insv), video_indexes,
    codec, rotation, has_audio. Raises MediaError for unreadable files. A clip whose drive is away
    answers from what `igmp stage` recorded of it, or from its proxy (proxies.py)."""
    p = Path(path)
    try:
        mtime = p.stat().st_mtime
    except OSError as e:
        from . import proxies
        if (info := proxies.recorded_info(cfg, p)) is not None:
            return info
        if (px := proxies.proxy_for(cfg, p)) is not None:
            return probe(px, cfg)
        raise MediaError(str(e)) from e
    return dict(_probe_cached(str(p), cfg.ffprobe, mtime))


def _is_360_video(path: Path) -> bool:
    return path.suffix.lower() == ".insv"


def proxy_path(asset: Asset) -> Path | None:
    """The camera's low-resolution copy of a video (.LRF from DJI, .lrv from Insta360), if any."""
    for f in asset.files:
        if Path(f).suffix.lower() in PROXY_EXT and Path(f).exists():
            return Path(f)
    return None


def _video_source(asset: Asset, cfg: Config) -> tuple[Path, dict, bool]:
    """(path, probe, is_proxy): the proxy when it exists, is readable and matches the clip's
    length, else the original. Proxies decode 5-20x faster and are plenty for sampling. With the
    drive away, the staged proxy (proxies.py) stands in for the original."""
    from .proxies import available
    main = Path(available(asset.preview, cfg) or "")
    main_info = None
    try:
        main_info = probe(main, cfg)
    except MediaError:
        pass
    px = proxy_path(asset)
    if px is not None:
        try:
            info = probe(px, cfg)
            if main_info is None or abs(info["duration_s"] - main_info["duration_s"]) < 1.0:
                return px, info, True
        except MediaError:
            pass
    if main_info is None:
        raise MediaError(f"unreadable video {main}")
    return main, main_info, False


# --------------------------------------------------------------------------- image helpers

def _font(px: int) -> ImageFont.ImageFont:
    try:
        return ImageFont.load_default(size=px)
    except Exception:   # Pillow without FreeType
        return ImageFont.load_default()


def _label(img: Image.Image, text: str, xy: tuple[int, int] = (4, 4), px: int = 14) -> None:
    d = ImageDraw.Draw(img)
    f = _font(px)
    x0, y0, x1, y1 = d.textbbox(xy, text, font=f)
    d.rectangle((x0 - 3, y0 - 2, x1 + 3, y1 + 2), fill=(0, 0, 0))
    d.text(xy, text, fill=(255, 255, 255), font=f)


def _to_srgb(img: Image.Image) -> Image.Image:
    icc = img.info.get("icc_profile")
    img = img.convert("RGB") if img.mode != "RGB" else img
    if icc:
        try:
            src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
            if "srgb" not in (ImageCms.getProfileDescription(src) or "").lower():
                img = ImageCms.profileToProfile(img, src, ImageCms.createProfile("sRGB"),
                                                outputMode="RGB")
        except Exception:
            pass
    return img


def _fit(img: Image.Image, size: int) -> Image.Image:
    """Long edge = size (never upscales)."""
    w, h = img.size
    s = size / max(w, h)
    if s >= 1:
        return img
    return img.resize((max(1, round(w * s)), max(1, round(h * s))), Image.Resampling.LANCZOS,
                      reducing_gap=2.0)


_ORIENT = {2: Image.Transpose.FLIP_LEFT_RIGHT, 3: Image.Transpose.ROTATE_180,
           4: Image.Transpose.FLIP_TOP_BOTTOM, 5: Image.Transpose.TRANSPOSE,
           6: Image.Transpose.ROTATE_270, 7: Image.Transpose.TRANSVERSE,
           8: Image.Transpose.ROTATE_90}


def _orient(img: Image.Image, orientation: int) -> Image.Image:
    t = _ORIENT.get(orientation)
    return img.transpose(t) if t is not None else img


def _crop_to_aspect(img: Image.Image, aspect: float) -> Image.Image:
    """Centre-crop letterbox bars off an embedded preview whose frame has another aspect."""
    w, h = img.size
    if abs(w / h - aspect) / aspect < 0.02:
        return img
    if w / h > aspect:
        nw = round(h * aspect)
        return img.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    nh = round(w / aspect)
    return img.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))


def _open_jpeg(path: Path, min_long_edge: int) -> Image.Image:
    """Decode a camera JPEG as cheaply as possible at long edge >= min_long_edge, upright.

    Sony (and other MPF) JPEGs carry a 1920x1080-class second image that decodes in ~15 ms;
    otherwise libjpeg DCT scaling (draft) decodes at 1/2..1/8 size. A 61MP A7RV JPEG costs
    ~0.05 s via MPF vs ~0.3 s via draft (entropy decoding of the whole file dominates)."""
    try:
        img = Image.open(path)
        orientation = img.getexif().get(0x0112, 1)
        icc = img.info.get("icc_profile")
        w0, h0 = img.size
        pick = None
        for i in range(1, getattr(img, "n_frames", 1)):
            img.seek(i)
            w, h = img.size
            if (max(w, h) >= min_long_edge and abs(w / h - w0 / h0) / (w0 / h0) < 0.01
                    and (pick is None or w * h < pick[1])):
                pick = (i, w * h)
        if pick is not None:
            img.seek(pick[0])
        else:
            img = Image.open(path)
            if img.format in ("JPEG", "MPO"):
                s = min_long_edge / max(w0, h0)
                img.draft("RGB", (max(1, math.ceil(w0 * s)), max(1, math.ceil(h0 * s))))
        img.load()
        img = img.convert("RGB")
    except (OSError, ValueError, EOFError, Image.DecompressionBombError) as e:
        raise MediaError(f"cannot read image {path}: {e}") from e
    if icc:
        img.info["icc_profile"] = icc
    return _orient(img, orientation)


def _raw_thumb(path: Path) -> Image.Image:
    """The camera-rendered preview embedded in a RAW file, upright and without letterboxing
    (falls back to a half-size demosaic when there is no usable preview)."""
    import rawpy
    try:
        with rawpy.imread(str(path)) as raw:
            flip = raw.sizes.flip
            aspect = raw.sizes.width / raw.sizes.height
            try:
                th = raw.extract_thumb()
            except (rawpy.LibRawNoThumbnailError, rawpy.LibRawUnsupportedThumbnailError):
                th = None
            if th is not None and th.format == rawpy.ThumbFormat.JPEG:
                img = Image.open(io.BytesIO(th.data))
                img.load()
                img = img.convert("RGB")
            elif th is not None:
                img = Image.fromarray(th.data)
            if th is None or max(img.size) < 256:
                img = Image.fromarray(raw.postprocess(half_size=True, use_camera_wb=True,
                                                      output_bps=8))
                return img   # postprocess already applies the orientation
    except (rawpy.LibRawError, OSError) as e:
        raise MediaError(f"cannot read raw {path}: {e}") from e
    img = _crop_to_aspect(img, aspect)
    return {3: lambda i: i.transpose(Image.Transpose.ROTATE_180),
            5: lambda i: i.transpose(Image.Transpose.ROTATE_90),
            6: lambda i: i.transpose(Image.Transpose.ROTATE_270)}.get(flip, lambda i: i)(img)


def _load_still(path: Path, min_long_edge: int) -> Image.Image:
    if path.suffix.lower() in RAW_EXT:
        return _raw_thumb(path)
    return _to_srgb(_open_jpeg(path, min_long_edge))


def _save_jpeg(img: Image.Image, dest: Path) -> Path:
    """Atomic write, so a crash or a parallel worker never leaves half a JPEG in the cache."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=dest.parent, suffix=".tmp.jpg")
    os.close(fd)
    try:
        img.convert("RGB").save(tmp, "JPEG", quality=JPEG_QUALITY, optimize=True)
        os.replace(tmp, dest)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    return dest


# --------------------------------------------------------------------------- video frames

def _scaled_dims(w: int, h: int, size: int) -> tuple[int, int]:
    s = min(1.0, size / max(w, h))
    return max(2, round(w * s / 2) * 2), max(2, round(h * s / 2) * 2)


def _decode_rgb(cmd_tail: list[str], w: int, h: int, cfg: Config, what: str) -> np.ndarray:
    out = _run(_ff(cfg) + cmd_tail + ["-f", "rawvideo", "-pix_fmt", "rgb24", "-"], what)
    if len(out) < w * h * 3:
        raise MediaError(f"{what}: no frame decoded")
    return np.frombuffer(out[: w * h * 3], np.uint8).reshape(h, w, 3)


def frame_at(path: str | Path, t: float, cfg: Config, size: int = PREVIEW_SIZE) -> Image.Image:
    """One RGB frame at t seconds, long edge = size (never upscaled), rotation applied.
    For an X5 .insv the two lens streams come back side by side in the .insp layout
    ([rear | front], each lens size/2 wide); an .lrv proxy already has that layout."""
    p = Path(path)
    info = probe(p, cfg)
    t = max(0.0, min(float(t), max(0.0, info["duration_s"] - 0.05)))
    if _is_360_video(p) and info["video_streams"] >= 2:
        lens = min(info["width"], max(2, size // 2))
        i0, i1 = info["video_indexes"][:2]
        graph = (f"[0:{i0}]scale={lens}:{lens}:flags=area[f];[0:{i1}]scale={lens}:{lens}:flags=area[r];"
                 f"[r][f]hstack=inputs=2[out]")
        arr = _decode_rgb(["-ss", f"{t:.3f}", "-i", str(p), "-filter_complex", graph,
                           "-map", "[out]", "-frames:v", "1"], 2 * lens, lens, cfg,
                          f"frame {t:.2f}s of {p.name}")
        return Image.fromarray(arr.copy())
    w, h = _scaled_dims(info["width"], info["height"], size)
    arr = _decode_rgb(["-ss", f"{t:.3f}", "-i", str(p), "-map", f"0:{info['video_indexes'][0]}",
                       "-vf", f"scale={w}:{h}:flags=area", "-frames:v", "1"], w, h, cfg,
                      f"frame {t:.2f}s of {p.name}")
    return Image.fromarray(arr.copy())


def _sample_times(duration: float, n: int) -> list[float]:
    return [duration * (i + 0.5) / n for i in range(n)]


def sample_frames(asset: Asset, cfg: Config, fps: float = 2.0,
                  size: int = 320) -> list[tuple[float, np.ndarray]]:
    """Grey uint8 frames (long edge = size) every 1/fps seconds, for measuring a clip.
    Uses the low-res proxy when there is one. For a 360 clip the frames are the central
    square of the front-lens fisheye (no black corners). Raises MediaError if unreadable."""
    src, info, is_proxy = _video_source(asset, cfg)
    idx = info["video_indexes"][0]
    if _is_360_video(src) or (asset.kind == "video360" and is_proxy):
        # inscribed square of the front lens: stream 0 of an .insv, right half of an .lrv
        side = 0.66
        if src.suffix.lower() == ".insv":
            crop = f"crop={side}*iw:{side}*ih"
        else:
            crop = f"crop={side}*ih:{side}*ih:iw/2+{(1 - side) / 2}*ih:{(1 - side) / 2}*ih"
        w = h = size
        vf = f"{crop},fps={fps},scale={w}:{h}:flags=area,format=gray"
    else:
        w, h = _scaled_dims(info["width"], info["height"], size)
        vf = f"fps={fps},scale={w}:{h}:flags=area,format=gray"
    out = _run(_ff(cfg) + ["-i", str(src), "-map", f"0:{idx}", "-an", "-sn", "-dn", "-vf", vf,
                           "-f", "rawvideo", "-pix_fmt", "gray", "-"],
               f"sampling {src.name}")
    n = len(out) // (w * h)
    frames = np.frombuffer(out[: n * w * h], np.uint8).reshape(n, h, w)
    return [(round(i / fps, 3), frames[i]) for i in range(n)]


# --------------------------------------------------------------------------- 360 geometry

def _rotation(yaw_deg: float, pitch_deg: float, roll_deg: float = 0.0) -> np.ndarray:
    """Camera-to-world rotation: roll about the view axis, then pitch up, then yaw right."""
    y, p, r = (math.radians(v) for v in (yaw_deg, pitch_deg, roll_deg))
    ry = np.array([[math.cos(y), 0, math.sin(y)], [0, 1, 0], [-math.sin(y), 0, math.cos(y)]])
    rp = np.array([[1, 0, 0], [0, math.cos(p), math.sin(p)], [0, -math.sin(p), math.cos(p)]])
    rr = np.array([[math.cos(r), math.sin(r), 0], [-math.sin(r), math.cos(r), 0], [0, 0, 1]])
    return ry @ rp @ rr


def _rect_rays(yaw: float, pitch: float, hfov: float, w: int, h: int,
               roll: float = 0.0) -> np.ndarray:
    f = (w / 2) / math.tan(math.radians(hfov) / 2)
    xs = (np.arange(w, dtype=np.float32) + 0.5 - w / 2) / f
    ys = -(np.arange(h, dtype=np.float32) + 0.5 - h / 2) / f
    xx, yy = np.meshgrid(xs, ys)
    d = np.stack([xx, yy, np.ones_like(xx)], -1)
    d /= np.linalg.norm(d, axis=-1, keepdims=True)
    return d @ _rotation(yaw, pitch, roll).T.astype(np.float32)


def _equirect_rays(w: int, h: int) -> np.ndarray:
    lon = np.radians((np.arange(w, dtype=np.float32) + 0.5) / w * 360.0 - 180.0)
    lat = np.radians(90.0 - (np.arange(h, dtype=np.float32) + 0.5) / h * 180.0)
    lon, lat = np.meshgrid(lon, lat)
    return np.stack([np.cos(lat) * np.sin(lon), np.sin(lat), np.cos(lat) * np.cos(lon)], -1)


def _bilinear(img: np.ndarray, u: np.ndarray, v: np.ndarray) -> np.ndarray:
    h, w = img.shape[:2]
    u = np.clip(u, 0, w - 1.001)
    v = np.clip(v, 0, h - 1.001)
    x0 = u.astype(np.int32)
    y0 = v.astype(np.int32)
    fx = (u - x0)[..., None]
    fy = (v - y0)[..., None]
    a = img[y0, x0].astype(np.float32)
    b = img[y0, x0 + 1].astype(np.float32)
    c = img[y0 + 1, x0].astype(np.float32)
    d = img[y0 + 1, x0 + 1].astype(np.float32)
    top = a + (b - a) * fx
    bot = c + (d - c) * fx
    return top + (bot - top) * fy


def _sample_lens(dual: np.ndarray, rays: np.ndarray, rear: bool, fov_deg: float) -> np.ndarray:
    """Sample one lens of a [rear | front] dual-fisheye array along world rays."""
    lw = dual.shape[1] // 2
    img = dual[:, :lw] if rear else dual[:, lw:]
    x, y, z = rays[..., 0], rays[..., 1], rays[..., 2]
    if rear:   # the rear lens looks along -z; its image right is world -x
        x, z = -x, -z
    theta = np.arccos(np.clip(z, -1.0, 1.0))
    phi = np.arctan2(y, x)
    rho = theta * ((lw / 2) / math.radians(fov_deg / 2))
    c = (lw - 1) / 2
    return _bilinear(img, c + rho * np.cos(phi), (img.shape[0] - 1) / 2 - rho * np.sin(phi))


def _render(dual: np.ndarray, rays: np.ndarray, fov_deg: float, seamless: bool) -> np.ndarray:
    """Colour for each world ray from a [rear | front] dual fisheye. With seamless=True a ray
    set that fits inside one lens is drawn from that lens alone."""
    theta_front = np.degrees(np.arccos(np.clip(rays[..., 2], -1.0, 1.0)))
    if seamless and theta_front.max() <= SINGLE_LENS_MAX_DEG:
        out = _sample_lens(dual, rays, rear=False, fov_deg=fov_deg)
    elif seamless and (180.0 - theta_front).max() <= SINGLE_LENS_MAX_DEG:
        out = _sample_lens(dual, rays, rear=True, fov_deg=fov_deg)
    else:
        wf = np.clip((90.0 + SEAM_FEATHER_DEG - theta_front) / (2 * SEAM_FEATHER_DEG), 0, 1)
        wf = (wf * wf * (3 - 2 * wf))[..., None]   # smoothstep
        out = np.zeros(rays.shape[:-1] + (dual.shape[2],), np.float32)
        front = wf[..., 0] > 0
        rear = wf[..., 0] < 1
        if front.any():
            out[front] = _sample_lens(dual, rays[front], False, fov_deg) * wf[front]
        if rear.any():
            out[rear] += _sample_lens(dual, rays[rear], True, fov_deg) * (1 - wf[rear])
    return np.clip(out + 0.5, 0, 255).astype(np.uint8)


def _lens_px_per_deg(lens_px: float, fov_deg: float) -> float:
    return (lens_px / 2) / (fov_deg / 2)


def _view_px_per_deg(out_w: int, hfov_deg: float) -> float:
    """Pixels per degree at the centre of a rectilinear view."""
    return (out_w / 2) / math.tan(math.radians(hfov_deg) / 2) * math.pi / 180


def _load_dual(path: Path, cfg: Config, px_per_deg: float,
               t: float | None = None) -> tuple[np.ndarray, float]:
    """A [rear | front] dual-fisheye RGB array of an X5 still or video frame, decoded just
    big enough for px_per_deg, plus the lens FOV that goes with it."""
    ext = path.suffix.lower()
    if ext in (".insv", ".lrv", ".mp4", ".mov"):
        info = probe(path, cfg)
        fov = X5_VIDEO_FOV_DEG
        if ext == ".insv" and info["video_streams"] >= 2:
            native = info["width"]
        else:
            native = info["height"]   # side-by-side proxy: lens width = frame height
        lens = int(min(native, max(64, math.ceil(px_per_deg * fov))))
        lens += lens % 2
        img = frame_at(path, t or 0.0, cfg, size=2 * lens) if ext == ".insv" else None
        if img is None:
            info_t = max(0.0, min(t or 0.0, info["duration_s"] - 0.05))
            arr = _decode_rgb(["-ss", f"{info_t:.3f}", "-i", str(path), "-map",
                               f"0:{info['video_indexes'][0]}", "-vf",
                               f"scale={2 * lens}:{lens}:flags=area", "-frames:v", "1"],
                              2 * lens, lens, cfg, f"frame of {path.name}")
            return arr, fov
        return np.asarray(img.convert("RGB")), fov
    fov = X5_PHOTO_FOV_DEG
    if ext in RAW_EXT:
        img = _raw_thumb(path)
    else:
        try:
            img = Image.open(path)
            w, h = img.size
        except (OSError, ValueError) as e:
            raise MediaError(f"cannot read {path}: {e}") from e
        need = px_per_deg * fov   # lens width in px
        scale = next((s for s in _DRAFT_SCALES if h / s >= need), 1)
        img.draft("RGB", (math.ceil(w / scale), math.ceil(h / scale)))
        try:
            img.load()
        except OSError as e:
            raise MediaError(f"cannot decode {path}: {e}") from e
    img = img.convert("RGB")
    if abs(img.width - 2 * img.height) > 2:
        raise MediaError(f"{path.name} is {img.width}x{img.height}, not a side-by-side dual fisheye")
    return np.asarray(img), fov


def reframe_360_image(path: str | Path, yaw_deg: float, pitch_deg: float, hfov_deg: float,
                      out_w: int, out_h: int, cfg: Config, t: float | None = None,
                      roll_deg: float = 0.0) -> Image.Image:
    """A flat (rectilinear) view out of an X5 360 still (.insp, or its DNG) or video (.insv /
    .lrv at time t seconds, default 0). yaw 0 = front lens axis, +yaw right, +pitch up.
    Views that fit inside one lens are drawn from that lens alone, so they have no seam."""
    p = Path(path)
    if not 1 <= hfov_deg <= 170:
        raise ValueError("hfov_deg must be within 1..170 for a rectilinear view")
    dual, fov = _load_dual(p, cfg, _view_px_per_deg(out_w, hfov_deg), t)
    rays = _rect_rays(yaw_deg, pitch_deg, hfov_deg, out_w, out_h, roll_deg)
    return Image.fromarray(_render(dual, rays, fov, seamless=True))


def equirect_360(path: str | Path, cfg: Config, width: int = 2048,
                 t: float | None = None) -> Image.Image:
    """A 2:1 equirectangular panorama of an X5 still or video frame: yaw -180 at the left
    edge, 0 (front lens) in the middle, +180 at the right; lenses cross-faded at +-90."""
    p = Path(path)
    width -= width % 2
    dual, fov = _load_dual(p, cfg, width / 360.0, t)
    return Image.fromarray(_render(dual, _equirect_rays(width, width // 2), fov, seamless=False))


def _equirect_from_dual(dual: np.ndarray, fov: float, width: int) -> Image.Image:
    return Image.fromarray(_render(dual, _equirect_rays(width, width // 2), fov, seamless=False))


def _views_from_dual(dual: np.ndarray, fov: float, yaws: list[float], side: int,
                     hfov: float = 90.0) -> list[Image.Image]:
    return [Image.fromarray(_render(dual, _rect_rays(y, 0.0, hfov, side, side), fov, True))
            for y in yaws]


def v360_filter(yaw_deg: float, pitch_deg: float, hfov_deg: float, out_w: int, out_h: int,
                roll_deg: float = 0.0, fisheye_fov_deg: float = X5_VIDEO_FOV_DEG,
                front: str = "[0:v:0]", rear: str = "[0:v:1]", out: str = "[v]") -> str:
    """An ffmpeg -filter_complex graph doing the same reframe as reframe_360_image on a whole
    .insv (both lens streams) in one pass, for rendering moving clips. Unlike
    reframe_360_image it switches lenses with a hard edge at +-90 deg from the front axis."""
    vfov = math.degrees(2 * math.atan(math.tan(math.radians(hfov_deg) / 2) * out_h / out_w))
    # [rear | front], the same layout as .insp stills and render.py, so yaw 0 is the front lens
    return (f"{rear}{front}hstack=inputs=2,v360=input=dfisheye:output=flat:"
            f"ih_fov={fisheye_fov_deg}:iv_fov={fisheye_fov_deg}:h_fov={hfov_deg:.3f}:"
            f"v_fov={vfov:.3f}:yaw={yaw_deg:.3f}:pitch={pitch_deg:.3f}:roll={roll_deg:.3f}:"
            f"w={out_w}:h={out_h}:interp=lanczos{out}")


# --------------------------------------------------------------------------- previews

def _preview_path(asset: Asset, cfg: Config, size: int) -> Path:
    name = f"{asset.id}.jpg" if size == PREVIEW_SIZE else f"{asset.id}_{size}.jpg"
    return cfg.state_dir / "previews" / name


def _yaw_bar(width: int, height: int = 18) -> Image.Image:
    bar = Image.new("RGB", (width, height), (0, 0, 0))
    d = ImageDraw.Draw(bar)
    f = _font(max(9, height - 6))
    for yaw in range(-180, 181, 45):
        x = min(width - 1, round((yaw + 180) / 360 * width))
        d.line((x, 0, x, 4), fill=(255, 255, 255))
        text = f"{yaw}"
        tw = d.textlength(text, font=f)
        d.text((min(max(0, x - tw / 2), width - tw), 4), text, fill=(255, 255, 255), font=f)
    return bar


def _photo360_preview(dual: np.ndarray, fov: float, size: int) -> Image.Image:
    """Equirect panorama with a yaw scale, over four flat 90-degree views (yaw 0/90/180/-90)."""
    w = size
    pano = _equirect_from_dual(dual, fov, w)
    bar = _yaw_bar(w)
    side = w // 4
    yaws = [0.0, 90.0, 180.0, -90.0]
    views = _views_from_dual(dual, fov, yaws, side)
    sheet = Image.new("RGB", (w, pano.height + bar.height + side), (0, 0, 0))
    sheet.paste(pano, (0, 0))
    sheet.paste(bar, (0, pano.height))
    for i, (yaw, v) in enumerate(zip(yaws, views)):
        _label(v, f"yaw {yaw:+.0f}", px=12)
        sheet.paste(v, (i * side, pano.height + bar.height))
    return sheet


def _grid(tiles: list[Image.Image], size: int) -> tuple[Image.Image, int, int, int]:
    """Lay equal tiles out in the column count that gives the biggest tiles inside a
    size x size box. Returns (sheet, cols, cell_w, cell_h)."""
    tw, th = tiles[0].size
    n = len(tiles)
    # only layouts without empty cells (8 frames: 4x2 or 2x4 in practice); never upscale
    s, cols = max((min(1.0, size / (c * tw), size / (n // c * th)), c)
                  for c in range(1, n + 1) if n % c == 0)
    rows = math.ceil(n / cols)
    cw, ch = max(1, int(tw * s)), max(1, int(th * s))
    sheet = Image.new("RGB", (cols * cw, rows * ch), (0, 0, 0))
    for i, t in enumerate(tiles):
        t = t.resize((cw, ch), Image.Resampling.LANCZOS) if t.size != (cw, ch) else t
        sheet.paste(t, ((i % cols) * cw, (i // cols) * ch))
    return sheet, cols, cw, ch


def contact_sheet(asset: Asset, cfg: Config, size: int = PREVIEW_SIZE,
                  n: int = CONTACT_FRAMES) -> Image.Image:
    """n evenly spaced frames of a clip in a grid (long edge <= size), each labelled with its
    time in seconds. For 360 clips each cell is four flat 90-degree views at yaw
    0/90/180/-90 side by side, in two columns of cells."""
    src, info, _ = _video_source(asset, cfg)
    duration = info["duration_s"] or (asset.duration_s or 0.0)
    times = _sample_times(duration, n)
    if asset.preview and not Path(asset.preview).exists():   # a staged proxy: only its stretches have frames
        from .proxies import entry_for, stretch_times
        e = entry_for(cfg, asset.preview)
        if e and e.get("stretches"):
            times = stretch_times(e["stretches"], n)
    if asset.kind == "video360":
        side = size // 8   # 2 columns x 4 views

        def tile(t: float) -> Image.Image:
            dual, fov = _load_dual(src, cfg, _view_px_per_deg(side, 90.0), t)
            cell = Image.new("RGB", (4 * side, side))
            for i, v in enumerate(_views_from_dual(dual, fov, [0.0, 90.0, 180.0, -90.0], side)):
                cell.paste(v, (i * side, 0))
                if i:
                    ImageDraw.Draw(cell).line((i * side, 0, i * side, side), fill=(0, 0, 0))
            return cell
    else:
        def tile(t: float) -> Image.Image:
            return frame_at(src, t, cfg, size=size // 2)

    with ThreadPoolExecutor(max_workers=min(4, n)) as pool:
        tiles = list(pool.map(tile, times))
    if asset.kind == "video360":
        cols, (cw, ch), top = 2, tiles[0].size, 16
        sheet = Image.new("RGB", (cols * cw, top + math.ceil(n / cols) * (ch + 2)), (0, 0, 0))
        d, f = ImageDraw.Draw(sheet), _font(11)
        for c in range(cols * 4):   # header: which way each column of views looks
            d.text((c * side + 4, 2), f"yaw {[0, 90, 180, -90][c % 4]}", fill=(255, 255, 255), font=f)
        for i, t in enumerate(tiles):
            sheet.paste(t, ((i % cols) * cw, top + (i // cols) * (ch + 2)))
        ch += 2
    else:
        sheet, cols, cw, ch = _grid(tiles, size)
        top = 0
    fmt = "{:.2f}s" if duration < 4 else "{:.1f}s"
    for i, t in enumerate(times):
        _label(sheet, fmt.format(t), ((i % cols) * cw + 4, top + (i // cols) * ch + 4), px=14)
    return sheet


def preview_image(asset: Asset, cfg: Config, size: int = PREVIEW_SIZE) -> Path:
    """A cached sRGB JPEG with long edge = size that shows what the asset is:
    photo: the camera JPEG (or the RAW's embedded preview), EXIF orientation applied.
    photo360: equirect panorama + yaw scale + four flat 90-degree views (see _photo360_preview).
    video: contact sheet of 8 evenly spaced frames, each labelled with its time in seconds.
    video360: contact sheet of 8 times, each four flat views at yaw 0/90/180/-90.
    sequence: 12 evenly spaced member frames labelled '#index t=+Ns' under 'N frames every X s'."""
    dest = _preview_path(asset, cfg, size)
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    if asset.kind == "sequence":    # no file of its own: a sheet of its member stills (sequences.py)
        from . import sequences
        sheet = sequences.contact_sheet(asset, sequences.member_assets(asset, cfg), size)
        return _save_jpeg(_fit(sheet, size), dest)
    if not asset.preview:
        raise MediaError(f"asset {asset.id} has no preview file")
    from .proxies import available
    src = Path(available(asset.preview, cfg))       # the staged proxy while the drive is away
    if asset.kind == "photo":
        img = _fit(_load_still(src, size), size)
    elif asset.kind == "photo360":
        dual, fov = _load_dual(src, cfg, size / 360.0)
        img = _photo360_preview(dual, fov, size)
    else:
        img = _fit(contact_sheet(asset, cfg, size), size)
    return _save_jpeg(img, dest)
