"""Render a ReelPlan into a 1080x1920 Instagram reel, and turn a reel into a contact sheet.

One ffmpeg run builds the whole reel: every shot becomes a segment of exactly
round(duration_s * 30) frames, the segments are joined with hard cuts by the concat filter.
Without music (plan.music None, or setting music = "none") a silent stereo AAC track is added
and a sound is chosen later in the Instagram app; with music, see "Sound" below.

Per kind of shot:
  photo     The still is opened with Pillow (EXIF rotation, non-sRGB ICC converted to sRGB),
            the largest 9:16 box around shot.focus is cut out and resized to a 2x work canvas
            (2160x3840). In ffmpeg the frame is looped and a Ken Burns move from zoom_from to
            zoom_to is applied with the `perspective` filter evaluated per frame: corner
            positions are floats and the resampling is bicubic, so the move is sub-pixel smooth
            (no zoompan stair-stepping); the 2x canvas is then downscaled with lanczos. Zoom
            changes geometrically (constant perceived speed); the window stays centred on the
            focus but is clamped to the frame.
  video     -ss start_s, conform to 30 fps, scale to cover 1080x1920 (times zoom_from, held
            static: stills move, video already does), crop 9:16 around shot.focus. A clip that
            ends early holds its last frame.
  video360  Insta360 .insv: X5 files hold one 3840x3840 fisheye stream per lens; the two are
            hstacked into a dual-fisheye frame. A single 2:1 .insv stream is taken as dual
            fisheye too; other 2:1 files as equirectangular. ffmpeg v360 renders a rectilinear
            9:16 view at shot.view_yaw_deg (default 0) with a 95 degree vertical FOV (about the
            look of a phone's wide camera held upright), lanczos interpolation. No stitching
            blend: the seam sits at +-90 degrees from the lens axes and shows only when a view
            straddles it.
  photo360  Same v360 reframe of a dual-fisheye .insp (or equirect JPEG) still, then the photo
            Ken Burns move.
  sequence  Arrives as a video (the rendered timelapse / stop-motion clip) and is treated as one;
            for the fit layout or a pan the clip must keep its own aspect (not be pre-cut 9:16).

Layouts (shot.layout; photo and video only, 360 shots are always reframed flat views):
  fill      The above: a 9:16 crop around shot.focus. A wide frame keeps only part of its width
            (37% of a 3:2 photo).
  fit       The whole frame at the full 1080 width (a frame narrower than 9:16: the full height),
            over the same picture scaled to cover 1080x1920, blurred and darkened. The background
            is made at 1/4 size (cover-scale, gblur sigma 8, so ~32 px at full size; RGB x0.78),
            then upscaled bicubic: a blurred picture has nothing finer to lose. For a still it is
            made once and held; for a video every frame (a blurred copy of the moving clip). The
            foreground's centre sits at 46% of the height (883 px), not 50%: Instagram covers
            about the top 250 px (header) and the bottom 400+ px (caption, sound, the buttons
            column), so the clear band is ~250-1500 px with its middle at ~875; the optical centre
            of a frame is a little above the geometric one too. A 3:2 foreground spans 524-1244 px,
            16:9 580-1188. A photo foreground gets the Ken Burns move (zoom_from -> zoom_to, the
            same perspective method on a 2x canvas of the foreground) inside its own frame, so the
            picture never spills over its edges; a video foreground holds zoom_from (as fill). The
            still is prepared whole at 2x its size in the reel (2160 px wide).
Pans (shot.focus_to; fill only): the 9:16 crop centre moves from focus to focus_to over the shot
  on a smoothstep ease-in-out (zoom, if any, still geometric in time). A photo's still is cut as
  the union of the 9:16 boxes at both ends (at the 2x scale); a video is cover-scaled as above.
  Both ends are clamped so the largest window of the shot fits around them, so the eased path
  never touches the frame edge (a per-frame clamp stays as a guard but never engages: no kink).
  The motion is sub-pixel: a per-frame crop just bigger than the window (even offsets) follows it
  and perspective resamples the fraction, so the cost is that of a fill shot however long the
  pan (perspective on the whole canvas would cost canvas/window times as much). pan_window() is
  the Python twin. focus_to equal to focus (or None) renders exactly as before.

Yaw convention (shared with media.py's previews): view_yaw_deg is ffmpeg v360's yaw on the
dual-fisheye frame laid out [rear | front] - the .insp as stored, and for .insv the streams
stacked as [stream 1 | stream 0]. 0 is the front lens (stream 0, the right half), +-180 the
rear (screen-side) lens; positive turns right. Pitch and roll are 0, so a tilted camera gives
a tilted horizon (the X5 gyro data is not read).

Colour: every segment is converted to BT.709 limited range yuv420p. Then a gentle per-shot
auto-levels runs on luma only: from the 0.5/99.5 percentiles of a frame from the middle of the
shot, blacks above 0.06 are pulled down and whites below 0.85 pushed up by at most 0.06 each,
gain capped at 1.3, and nothing is ever lifted out of crushed blacks or pulled down from
clipped whites.
Well exposed shots (edited RAWs, normal camera footage) pass through untouched; flat ones (haze,
log-ish profiles) are brought closer so cuts between cameras jump less. Hue and white balance are
never touched. Turn it off with cfg.extra["reel_autolevels"] = False. HDR (HLG/PQ) sources are
not tone mapped (this ffmpeg has no zscale/libplacebo); a warning is logged.

Encoding: libx264 High, CRF 18 (capped at 30 Mb/s), preset slow, 30 fps CFR, BT.709 tags,
+faststart. cfg.extra["reel_encoder"] = "videotoolbox" switches to a 24 Mb/s hardware encode.
Video decoding uses VideoToolbox on macOS (falls back to software on its own).

Sound (render_reel(..., music=path) for a plan with plan.music set), all in the same ffmpeg run
as the picture:
  music    the track from plan.music.start_s (input-seeked; the reel's frame 0 is that beat),
           48 kHz stereo float
  natural  each video shot's own sound, trimmed to the shot with 10 ms fades at the cuts (stills
           and silent clips give silence). A first audio-only pass decodes both stems and measures
           each shot's steady level (30th percentile of 400 ms RMS blocks) and the music's mean
           level; every shot is then gained so its steady sound (wind, room, water) sits
           natural_sound_db (-12) under the music, by at most +12 dB. Louder moments (a voice, a
           wave, a cheer) stay louder, compressed 4:1 above 10 dB over that level
  ducking  sidechaincompress ducks the music (ratio 4, attack 50 ms, release 400 ms, hard knee)
           under natural sound more than 6 dB above its steady level; the sidechain is
           high-passed at 150 Hz, so steady sound and wind rumble never duck it
  mix      amix (no normalisation), fade in 0.1 s / out 0.6 s, then one make-up gain to -14 LUFS
           integrated (measured with ebur128 in a second audio-only pass) into alimiter run at
           4x the rate (so it holds true peaks, not just samples) with a -2 dBFS ceiling. When
           the gain would push peaks into the limiter, a few more passes
           search the gain with the limiter in the loop, allowing at most 8 dB of limiting (a
           spiky, quiet track then stays a little under -14 rather than being flattened).
           loudnorm is not used: when it cannot stay linear it silently switches to a dynamic
           mode that misses the target by several LU on peaky music, and runs at 192 kHz.
  output   AAC-LC 256 kb/s, 48 kHz stereo. The encoded file is measured: if the encoder pushed
           the true peak over -1 dBTP (Instagram's limit), the reel is rendered once more with
           the ceiling lowered by the excess
  natural_sound = false leaves out the clips' sound (music only).

cfg.extra knobs: reel_encoder, reel_crf, reel_preset, reel_work_scale (2.0), reel_360_vfov (95),
reel_360_lens_fov (200, X5), reel_autolevels (True), reel_hwaccel (True on macOS); sound:
natural_sound (True), natural_sound_db (-12), reel_lufs (-14), reel_peak_ceiling (-2.0).
"""
from __future__ import annotations

import dataclasses
import functools
import hashlib
import json
import logging
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

from .config import Config
from .models import ReelPlan, Shot

log = logging.getLogger(__name__)

OUT_W, OUT_H, FPS = 1080, 1920, 30
ASPECT = OUT_W / OUT_H                 # 9:16
X5_LENS_FOV = 200.0                    # measured on X5 footage: seams line up at ~200 degrees
DEFAULT_360_VFOV = 95.0
HDR_TRANSFERS = {"arib-std-b67", "smpte2084"}

__all__ = [
    "AudioMix", "Levels", "SegmentSource", "build_audio_args", "build_ffmpeg_args", "fit_box",
    "fit_placement", "fit_shots", "frames_for", "gentle_levels", "kenburns_window", "measure_audio",
    "pan_window", "parse_ebur128", "prepare_sources", "probe_media", "reel_contact_sheet",
    "render_reel", "steady_levels",
    # the segment pipeline
    "BUILTIN", "INTERMEDIATES", "LAST_RENDER", "Piece", "RENDER_VERSION", "TRANSITION_FRAMES", "TSpec", "Timing",
    "as_tspec", "build_reel_args", "build_segment_args", "build_sound_args", "build_transition_args",
    "fit_transitions", "plan_transitions", "render_reel_single_pass", "render_segment", "render_segments",
    "render_transition", "segment_key", "source_span", "timeline",
]


# --------------------------------------------------------------------------- pure helpers


def frames_for(seconds: float) -> int:
    """Frames a shot of this length gets at 30 fps (at least one)."""
    return max(1, int(round(seconds * FPS)))


def fit_shots(shots: list[Shot], max_seconds: float) -> list[Shot]:
    """Trim the plan so it is no longer than max_seconds: the last shot that crosses the limit
    is shortened, later ones dropped. A remainder under 0.3 s is dropped rather than flashed."""
    out, used = [], 0
    limit = frames_for(max_seconds) if max_seconds > 0 else 0
    for shot in shots:
        n = frames_for(shot.duration_s)
        if used + n > limit:
            n = limit - used
            if n >= frames_for(0.3):
                out.append(shot.model_copy(update={"duration_s": n / FPS}))
            break
        out.append(shot)
        used += n
    return out


def fit_box(src_w: float, src_h: float, aspect: float, focus: tuple[float, float],
            zoom: float = 1.0) -> tuple[float, float, float, float]:
    """Largest box of `aspect` (w/h) inside src_w x src_h, divided by zoom, centred on focus
    (fractions of the source) and shifted to stay inside. Returns floats (x, y, w, h)."""
    if src_w / src_h > aspect:
        h = float(src_h)
        w = h * aspect
    else:
        w = float(src_w)
        h = w / aspect
    zoom = max(1.0, zoom)
    w, h = w / zoom, h / zoom
    x = min(max(focus[0] * src_w - w / 2, 0.0), src_w - w)
    y = min(max(focus[1] * src_h - h / 2, 0.0), src_h - h)
    return x, y, w, h


def kenburns_window(n: int, frames: int, width: float, height: float,
                    focus: tuple[float, float], zoom_from: float, zoom_to: float
                    ) -> tuple[float, float, float, float]:
    """The source window (x, y, w, h) shown in frame n of a Ken Burns move. This is the Python
    twin of the per-frame ffmpeg expression in _kenburns_filter and is what the tests check."""
    p = n / (frames - 1) if frames > 1 else 0.0
    z = zoom_from * (zoom_to / zoom_from) ** p
    w, h = width / z, height / z
    cx = min(max(focus[0] * width, w / 2), width - w / 2)
    cy = min(max(focus[1] * height, h / 2), height - h / 2)
    return cx - w / 2, cy - h / 2, w, h


def _pan_moving(frames: int, zoom_from: float, zoom_to: float) -> bool:
    return frames > 1 and abs(float(zoom_to) - float(zoom_from)) >= 1e-9


def _pan_ends(canvas: tuple[float, float], base: tuple[float, float], focus: tuple[float, float],
              focus_to: tuple[float, float], zoom_from: float, zoom_to: float, moving: bool
              ) -> tuple[tuple[float, float], tuple[float, float]]:
    """Start and end centre of a pan (canvas pixels), each clamped so that the LARGEST window of
    the shot fits around it. The eased path between them then never meets the canvas edge, so
    the per-frame clamp never engages and the motion has no kink."""
    zmin = min(float(zoom_from), float(zoom_to))
    if moving:
        zmin = max(MIN_MOVING_ZOOM, zmin)
    hx, hy = base[0] / (2 * zmin), base[1] / (2 * zmin)

    def clamp(f: tuple[float, float]) -> tuple[float, float]:
        return (min(max(f[0] * canvas[0], hx), canvas[0] - hx),
                min(max(f[1] * canvas[1], hy), canvas[1] - hy))
    return clamp(focus), clamp(focus_to)


def pan_window(n: int, frames: int, canvas: tuple[float, float], base: tuple[float, float],
               focus: tuple[float, float], focus_to: tuple[float, float],
               zoom_from: float = 1.0, zoom_to: float = 1.0) -> tuple[float, float, float, float]:
    """The source window (x, y, w, h) in frame n of a pan over a canvas larger than the base
    9:16 window: the window is base / zoom (geometric in time, as kenburns_window, never below
    MIN_MOVING_ZOOM while moving) and its centre moves from focus to focus_to (fractions of the
    canvas, ends clamped as _pan_ends) on a smoothstep ease-in-out, clamped inside the canvas at
    every frame. Python twin of the per-frame expressions in _pan_filter."""
    zf, zt = float(zoom_from), float(zoom_to)
    moving = _pan_moving(frames, zf, zt)
    (c0x, c0y), (c1x, c1y) = _pan_ends(canvas, base, focus, focus_to, zf, zt, moving)
    p = min(1.0, n / (frames - 1)) if frames > 1 else 0.0
    z = max(MIN_MOVING_ZOOM, zf * (zt / zf) ** p) if moving else zf
    e = p * p * (3 - 2 * p)
    w, h = base[0] / z, base[1] / z
    cx = min(max(c0x + (c1x - c0x) * e, w / 2), canvas[0] - w / 2)
    cy = min(max(c0y + (c1y - c0y) * e, h / 2), canvas[1] - h / 2)
    return cx - w / 2, cy - h / 2, w, h


FIT_CENTRE_Y = 0.46     # fit foreground centre, fraction of the frame height (module docstring)
FIT_BG_DOWN = 4         # the fit background is blurred at 1/4 of the output size, then upscaled
FIT_BG_SIGMA = 8.0      # its gblur sigma at that size: about 32 px at 1080 wide
FIT_BG_DIM = 0.78       # and its brightness (an RGB multiply, about -1/3 stop)


def _even_round(v: float) -> int:
    return max(2, 2 * int(round(v / 2)))


def fit_placement(out_w: int, out_h: int, aspect: float) -> tuple[int, int, int, int]:
    """Where the foreground of a fit-layout shot sits in an out_w x out_h frame: (x, y, w, h),
    even integers. The whole picture at the full width (or, taller than the frame, at the full
    height, centred), its centre at FIT_CENTRE_Y of the height but kept inside the frame."""
    if aspect >= out_w / out_h:
        w, h = out_w, min(out_h, _even_round(out_w / aspect))
    else:
        w, h = min(out_w, _even_round(out_h * aspect)), out_h
    x = 2 * ((out_w - w) // 4)
    y = min(max(_even_round(FIT_CENTRE_Y * out_h - h / 2), 0), out_h - h)
    return x, y, w, h


@dataclass(frozen=True)
class Levels:
    """Luma remap in 0..1 terms: lo -> out_lo, hi -> out_hi, linear in between."""
    lo: float
    hi: float
    out_lo: float
    out_hi: float

    @property
    def gain(self) -> float:
        return (self.out_hi - self.out_lo) / (self.hi - self.lo)

    def lutyuv(self) -> str:
        """lutyuv filter for limited-range 8-bit luma (16..235); chroma untouched."""
        g = self.gain
        b = 16 + 219 * self.out_lo - g * (16 + 219 * self.lo)
        return f"lutyuv=y='clip(val*{g:.5f}+({b:.4f}),16,235)'"


BLACK_OK, WHITE_OK = 0.06, 0.85        # percentiles inside these count as well exposed


def gentle_levels(lo: float, hi: float, max_shift: float = 0.06, max_gain: float = 1.3
                  ) -> Levels | None:
    """Levels for a shot whose luma 0.5/99.5 percentiles are lo/hi (0..1), or None to leave it.

    Only ever stretches, and only flat shots: blacks above 0.06 come down (toward 0.03) and
    whites below 0.85 go up (toward 0.92), each by at most max_shift. Normal exposures pass
    through untouched. Whites are left alone in dark frames (hi <= 0.5, e.g. night) and
    near-uniform frames (a fade, a clear sky) are left alone entirely."""
    if hi - lo < 0.1:
        return None
    out_lo = max(0.03, lo - max_shift) if lo > BLACK_OK else lo
    out_hi = min(0.92, hi + max_shift) if 0.5 < hi < WHITE_OK else hi
    if (out_hi - out_lo) / (hi - lo) > max_gain:
        # keep the black/white balance of the stretch but cap its strength
        extra = (hi - lo) * max_gain - (hi - lo)
        want = (lo - out_lo) + (out_hi - hi)
        k = extra / want
        out_lo, out_hi = lo - (lo - out_lo) * k, hi + (out_hi - hi) * k
    if abs(out_lo - lo) < 0.004 and abs(out_hi - hi) < 0.004:
        return None
    return Levels(lo, hi, out_lo, out_hi)


@dataclass
class SegmentSource:
    """What the command builder needs to know about one shot's source.

    prepare_sources() fills this in from the files; tests can build it by hand."""
    kind: str                                   # photo | video | photo360 | video360
    path: str                                   # photo: the prepared 9:16 still
    width: int = 0                              # video: display size (rotation applied)
    height: int = 0
    duration: float = 0.0                       # video: clip length, 0 = unknown
    video_streams: int = 1                      # 360: 2 = one stream per lens (X5)
    projection: str = "flat"                    # flat | dfisheye | equirect
    lens_fov: float = X5_LENS_FOV               # dfisheye only
    focus: tuple[float, float] = (0.5, 0.5)     # photo: where shot.focus sits inside the still
    levels: Levels | None = None
    extra_inputs: list[str] = field(default_factory=list)  # e.g. ["-hwaccel", "videotoolbox"]
    audio: bool = False                         # video: has a sound track (natural sound)
    # photo pan: where shot.focus_to sits inside the still (then wider or taller than 9:16, and
    # width/height its size); None: no pan
    focus_to: tuple[float, float] | None = None
    fps: float = 0.0                            # video: frame rate (0 = unknown, taken as 30)
    denoise: bool = False                       # video: night/astro footage, hqdn3d in its segment
    origin: str = ""                            # the source file (photo: what the still was cut from)


def _settings(cfg: Config) -> dict:
    x = cfg.extra or {}
    return {
        "encoder": x.get("reel_encoder", "libx264"),
        "crf": x.get("reel_crf", 18),
        "preset": x.get("reel_preset", "slow"),
        "work_scale": float(x.get("reel_work_scale", 2.0)),
        "vfov": float(x.get("reel_360_vfov", DEFAULT_360_VFOV)),
        "lens_fov": float(x.get("reel_360_lens_fov", X5_LENS_FOV)),
        "autolevels": bool(x.get("reel_autolevels", True)),
        "hwaccel": bool(x.get("reel_hwaccel", sys.platform == "darwin")),
        "natural_sound": bool(x.get("natural_sound", True)),
        "natural_sound_db": float(x.get("natural_sound_db", -12.0)),
        "lufs": float(x.get("reel_lufs", -14.0)),
        "peak_ceiling": float(x.get("reel_peak_ceiling", -2.0)),
        "slowmo": str(x.get("reel_slowmo", "mci")),
        "denoise": str(x.get("reel_denoise", DENOISE)),
    }


def _work_size(cfg: Config) -> tuple[int, int]:
    s = _settings(cfg)["work_scale"]
    return 2 * round(OUT_W * s / 2), 2 * round(OUT_H * s / 2)


def _even(v: float) -> int:
    return max(2, 2 * int(math.ceil(v / 2)))


def _v360(src: SegmentSource, yaw: float, vfov: float, w: int, h: int, zoom: float = 1.0) -> str:
    """Rectilinear 9:16 view out of a dual-fisheye or equirect frame."""
    vt = math.tan(math.radians(vfov) / 2) / max(1.0, zoom)
    v = math.degrees(2 * math.atan(vt))
    hf = math.degrees(2 * math.atan(vt * w / h))
    yaw = ((yaw + 180.0) % 360.0) - 180.0
    if src.projection == "dfisheye":
        inp = f"input=dfisheye:ih_fov={src.lens_fov:g}:iv_fov={src.lens_fov:g}"
    else:
        inp = "input=e"
    return (f"v360={inp}:output=flat:h_fov={hf:.3f}:v_fov={v:.3f}:yaw={yaw:.3f}:pitch=0:roll=0"
            f":w={w}:h={h}:interp=lanczos")


MIN_MOVING_ZOOM = 1.0005


def _kenburns_filter(n_frames: int, w: int, h: int, focus: tuple[float, float],
                     zoom_from: float, zoom_to: float) -> str:
    """perspective filter (sense=source) whose corners follow kenburns_window() per frame."""
    zf, zt = float(zoom_from), float(zoom_to)
    if n_frames <= 1 or abs(zt - zf) < 1e-9:
        if abs(zf - 1.0) < 1e-9:
            return ""                                   # no move and no crop: skip resampling
        z = f"{zf:.6f}"
    else:
        # perspective's `in` counts from 1, so frame i is step (in-1); using `in` overshot zoom_to by one
        # step on the last frame (the root cause of the pull-out EINVAL)
        z = f"({zf:.6f}*pow({zt / zf:.8f},min(1,(in-1)/{n_frames - 1})))"
        # ffmpeg's perspective (eval=frame, sense=source) fails with EINVAL when the window reaches
        # the full frame on a later frame (a pull-out landing on zoom 1.0). Never quite uncrop:
        # 1.0005 is about one pixel at 2160 px wide.
        z = f"max({MIN_MOVING_ZOOM},{z})"
    fx, fy = focus[0] * w, focus[1] * h
    hw, hh_ = f"({w}/(2*{z}))", f"({h}/(2*{z}))"
    cx = f"clip({fx:.4f},{hw},{w}-{hw})"
    cy = f"clip({fy:.4f},{hh_},{h}-{hh_})"
    left, right = f"{cx}-{hw}", f"{cx}+{hw}"
    top, bottom = f"{cy}-{hh_}", f"{cy}+{hh_}"
    corners = {"x0": left, "y0": top, "x1": right, "y1": top,
               "x2": left, "y2": bottom, "x3": right, "y3": bottom}
    opts = ":".join(f"{k}='{v}'" for k, v in corners.items())
    return f"perspective={opts}:interpolation=cubic:sense=source:eval=frame"


PAN_MARGIN = 4          # the per-frame crop in front of a pan's perspective is this much bigger


def _pan_filter(n_frames: int, canvas: tuple[int, int], base: tuple[int, int],
                focus: tuple[float, float], focus_to: tuple[float, float],
                zoom_from: float = 1.0, zoom_to: float = 1.0) -> str:
    """crop + perspective + crop showing pan_window() per frame, at the base size (bw x bh).

    perspective's output is as big as its input, so run on the whole canvas a long pan would
    cost canvas/base times a fill shot. Instead a crop just bigger than the base window (an
    even pixel offset per frame, so 4:2:0 chroma stays aligned) follows the window, perspective
    resamples the sub-pixel remainder (and the zoom) at 1/z source pixels per output pixel from
    the window's corner, and the output's top-left bw x bh is the window. Both filters evaluate
    the same expression text; crop counts frames from n = 0, perspective from in = 1."""
    cw, ch = canvas
    bw, bh = base
    zf, zt = float(zoom_from), float(zoom_to)
    moving = _pan_moving(n_frames, zf, zt)
    (c0x, c0y), (c1x, c1y) = _pan_ends(canvas, base, focus, focus_to, zf, zt, moving)
    kw, kh = min(cw, bw + PAN_MARGIN), min(ch, bh + PAN_MARGIN)

    def terms(frame: str) -> tuple[str, str, str, str, str]:
        p = f"min(1,{frame}/{n_frames - 1})" if n_frames > 1 else "0"
        z = f"max({MIN_MOVING_ZOOM},{zf:.6f}*pow({zt / zf:.8f},{p}))" if moving else f"{zf:.6f}"
        e = f"({p})*({p})*(3-2*({p}))"
        hw, hh = f"({bw}/(2*{z}))", f"({bh}/(2*{z}))"
        left = f"(clip({c0x:.4f}+({c1x - c0x:.4f})*{e},{hw},{cw}-{hw})-{hw})"
        top = f"(clip({c0y:.4f}+({c1y - c0y:.4f})*{e},{hh},{ch}-{hh})-{hh})"
        # the crop's corner: 1-3 px before the window, even, inside the canvas
        ox = f"clip(2*floor(({left}-1)/2),0,{cw - kw})" if kw < cw else ""
        oy = f"clip(2*floor(({top}-1)/2),0,{ch - kh})" if kh < ch else ""
        return z, left, top, ox, oy

    parts = []
    _, _, _, ox, oy = terms("n")
    if ox or oy:
        parts.append(f"crop=w={kw}:h={kh}:x='{ox or 0}':y='{oy or 0}'")
    z, left, top, ox, oy = terms("(in-1)")
    x0 = f"{left}-{ox}" if ox else left
    y0 = f"{top}-{oy}" if oy else top
    x1, y2 = f"{x0}+{kw}/{z}", f"{y0}+{kh}/{z}"
    corners = {"x0": x0, "y0": y0, "x1": x1, "y1": y0, "x2": x0, "y2": y2, "x3": x1, "y3": y2}
    opts = ":".join(f"{k}='{v}'" for k, v in corners.items())
    parts.append(f"perspective={opts}:interpolation=cubic:sense=source:eval=frame")
    if (kw, kh) != (bw, bh):
        parts.append(f"crop={bw}:{bh}:0:0")
    return ",".join(parts)


def _fit_background(sw: int, sh: int, out_w: int, out_h: int, rgb: bool) -> str:
    """Chain (no labels): a sw x sh picture -> its blurred, darkened cover of out_w x out_h.
    The blur runs at 1/FIT_BG_DOWN size and the result is upscaled (smooth after the blur)."""
    bw, bh = _even(out_w / FIT_BG_DOWN), _even(out_h / FIT_BG_DOWN)
    s = max(bw / sw, bh / sh)
    cw, ch = max(bw, _even(sw * s)), max(bh, _even(sh * s))
    sigma = FIT_BG_SIGMA * out_w / OUT_W
    k = f"{FIT_BG_DIM:g}"
    if rgb:
        dim = f"colorchannelmixer=rr={k}:gg={k}:bb={k}"
    else:   # the same RGB multiply in Y'CbCr terms, for any range and bit depth
        mid = "(minval+maxval)/2"
        dim = (f"lutyuv=y='minval+(val-minval)*{k}':u='{mid}+(val-{mid})*{k}'"
               f":v='{mid}+(val-{mid})*{k}'")
    return (f"scale={cw}:{ch}:flags=bilinear,crop={bw}:{bh},gblur=sigma={sigma:.3g}:steps=2,{dim},"
            f"scale={out_w}:{out_h}:flags=bicubic")


def _fit_tag(label: str) -> str:
    return "fit" + re.sub(r"[^0-9a-z]", "", label)


def _is_fit(kind: str, shot: Shot) -> bool:
    return kind in ("photo", "video") and shot.layout == "fit"


def _pan_target(kind: str, shot: Shot) -> tuple[float, float] | None:
    """Where a fill shot's crop centre pans to, or None (no pan: today's still crop)."""
    ft = shot.focus_to
    if kind not in ("photo", "video") or shot.layout == "fit" or ft is None:
        return None
    if abs(ft.x - shot.focus.x) < 1e-6 and abs(ft.y - shot.focus.y) < 1e-6:
        return None
    return ft.x, ft.y


def _pan_canvas(src: SegmentSource, ww: int, wh: int) -> tuple[int, int]:
    """A pan still's canvas at the work size: the prepared still scaled so its full axis
    matches the ww x wh base window, never smaller than it."""
    w, h = (src.width, src.height) if src.width > 0 and src.height > 0 else (ww, wh)
    if w * wh >= h * ww:
        return max(ww, _even_round(w * wh / h)), wh
    return ww, max(wh, _even_round(h * ww / w))


def _to_out(levels: Levels | None, n: int) -> str:
    """Common tail of every segment: BT.709 limited yuv420p, levels, exactly n frames.

    accurate_rnd+full_chroma_int: without them swscale's fast matrix conversion (ffmpeg 8.1,
    arm64) lowers luma by ~2 codes on frames whose width is not a multiple of 16 - every
    1080-wide segment (aitx's conform uses the same flags)."""
    chain = "scale=flags=accurate_rnd+full_chroma_int:out_color_matrix=bt709:out_range=tv,format=yuv420p"
    if levels is not None:
        chain += "," + levels.lutyuv()
    return chain + f",tpad=stop_mode=clone:stop={n},trim=end_frame={n},setsar=1"


def _fit_still(src: SegmentSource, shot: Shot, label: str, n: int, cfg: Config, out_w: int,
               out_h: int, animate: bool, background: bool) -> str:
    """Fit layout, photo: the whole still at full width over its blurred cover. The foreground
    gets the Ken Burns move inside its own frame; the background is made once and held."""
    st = _settings(cfg)
    w, h = (src.width, src.height) if src.width > 0 and src.height > 0 else (out_w, out_h)
    x, y, fw, fh = fit_placement(out_w, out_h, w / h)
    gw, gh = _even_round(fw * st["work_scale"]), _even_round(fh * st["work_scale"])
    loop = f"loop=loop={n - 1}:size=1:start=0,settb=1/30,setpts=N"
    kb = _kenburns_filter(n if animate else 1, gw, gh, src.focus, shot.zoom_from,
                          shot.zoom_to if animate else shot.zoom_from)
    down = f"scale={fw}:{fh}:flags=lanczos"
    fg = f"{loop},{kb},{down}" if kb else f"{down},{loop}"      # a still foreground: shrink once
    head = f"{label}scale={gw}:{gh}:flags=lanczos"
    if not background:
        return f"{head},{fg},scale={out_w}:{out_h}"
    t = _fit_tag(label)
    return (f"{head},split=2[{t}f][{t}b];"
            f"[{t}b]{_fit_background(gw, gh, out_w, out_h, rgb=True)},{loop}[{t}bg];"
            f"[{t}f]{fg}[{t}fg];"
            f"[{t}bg][{t}fg]overlay=x={x}:y={y}:format=gbrp")


def _fit_video(src: SegmentSource, shot: Shot, label: str, out_w: int, out_h: int,
               background: bool, time: str | None = None) -> str:
    """Fit layout, video: the moving clip at full width over a blurred copy of itself."""
    sw, sh = max(src.width, 2), max(src.height, 2)
    x, y, fw, fh = fit_placement(out_w, out_h, sw / sh)
    z = max(1.0, shot.zoom_from)
    fg = f"scale={fw}:{fh}:flags=lanczos"
    if z > 1 + 1e-9:                                    # held zoom, inside the foreground's frame
        tw, th = _even(fw * z), _even(fh * z)
        cx = int(round(min(max(shot.focus.x * tw - fw / 2, 0), tw - fw)))
        cy = int(round(min(max(shot.focus.y * th - fh / 2, 0), th - fh)))
        fg = f"scale={tw}:{th}:flags=lanczos,crop={fw}:{fh}:{cx}:{cy}"
    head = f"{label}{time or _CONFORM}"
    if not background:                                  # levels: measure the picture itself
        return f"{head},{fg},scale={out_w}:{out_h}"
    t = _fit_tag(label)
    return (f"{head},split=2[{t}f][{t}b];"
            f"[{t}b]{_fit_background(sw, sh, out_w, out_h, rgb=False)}[{t}bg];"
            f"[{t}f]{fg}[{t}fg];"
            f"[{t}bg][{t}fg]overlay=x={x}:y={y}:format=yuv420")


_CONFORM = f"setpts=PTS-STARTPTS,fps={FPS}"     # a video's time base: from 0, conformed to 30 fps


def _geometry(src: SegmentSource, shot: Shot, label: str, n: int, cfg: Config,
              out_w: int = OUT_W, out_h: int = OUT_H, *, animate: bool = True,
              background: bool = True, time: str | None = None) -> str:
    """Spatial part of a segment: from input label(s) to an out_w x out_h picture. A fit-layout
    segment is a small graph (split, background, overlay) whose last chain is left open, so
    callers can append filters as for a plain chain. background=False leaves its blurred
    background out and squeezes the foreground to out_w x out_h (for levels analysis).
    time: a video's time mapping (speed changes, see _timing), replacing the plain conform to
    30 fps; n is then the number of frames that enter the geometry (pans count them)."""
    st = _settings(cfg)
    head = time or _CONFORM
    if src.kind == "photo" and _is_fit(src.kind, shot):
        return _fit_still(src, shot, label, n, cfg, out_w, out_h, animate, background)
    if src.kind == "video" and _is_fit(src.kind, shot):
        return _fit_video(src, shot, label, out_w, out_h, background, time)
    if src.kind in ("photo", "photo360"):
        ws = out_w * st["work_scale"] / OUT_W
        ww, wh = _even(out_w * ws), _even(out_h * ws)
        if src.kind == "photo" and src.focus_to is not None:
            cw, ch = _pan_canvas(src, ww, wh)
            zt = shot.zoom_to if animate else shot.zoom_from
            return ",".join([f"{label}scale={cw}:{ch}:flags=lanczos",
                             f"loop=loop={n - 1}:size=1:start=0", "settb=1/30", "setpts=N",
                             _pan_filter(n if animate else 1, (cw, ch), (ww, wh), src.focus,
                                         src.focus_to, shot.zoom_from, zt),
                             f"scale={out_w}:{out_h}:flags=lanczos"])
        if src.kind == "photo360":
            yaw = shot.view_yaw_deg or 0.0
            first, focus = _v360(src, yaw, st["vfov"], ww, wh), (0.5, 0.5)
        else:
            first, focus = f"scale={ww}:{wh}:flags=lanczos", src.focus
        parts = [f"{label}{first}", f"loop=loop={n - 1}:size=1:start=0", "settb=1/30", "setpts=N"]
        kb = _kenburns_filter(n if animate else 1, ww, wh, focus, shot.zoom_from,
                              shot.zoom_to if animate else shot.zoom_from)
        if kb:
            parts.append(kb)
        parts.append(f"scale={out_w}:{out_h}:flags=lanczos")
        return ",".join(parts)

    if src.kind == "video360":
        yaw = shot.view_yaw_deg or 0.0
        stack = label if src.video_streams < 2 else f"{label}hstack=inputs=2,"
        return (f"{stack}{head},"
                + _v360(src, yaw, st["vfov"], out_w, out_h, shot.zoom_from))

    # flat video: cover the frame, crop around the focus
    sw, sh = max(src.width, 2), max(src.height, 2)
    s = max(out_w / sw, out_h / sh) * max(1.0, shot.zoom_from)
    tw, th = _even(sw * s), _even(sh * s)
    pan_to = _pan_target(src.kind, shot)
    if pan_to is not None:                              # the crop moves, sub-pixel
        return (f"{label}{head},scale={tw}:{th}:flags=lanczos,"
                + _pan_filter(n, (tw, th), (out_w, out_h), (shot.focus.x, shot.focus.y), pan_to))
    x = int(round(min(max(shot.focus.x * tw - out_w / 2, 0), tw - out_w)))
    y = int(round(min(max(shot.focus.y * th - out_h / 2, 0), th - out_h)))
    return (f"{label}{head},scale={tw}:{th}:flags=lanczos,"
            f"crop={out_w}:{out_h}:{x}:{y}")


def source_span(shot: Shot, kind: str = "video") -> float:
    """Seconds of the source a shot shows: its length times its mean speed (a ramp from speed to
    speed_to integrates to their average, see _ramp_source_time). Stills ignore speed."""
    if kind in ("photo", "photo360"):
        return float(shot.duration_s)
    s0 = float(shot.speed)
    s1 = s0 if shot.speed_to is None else float(shot.speed_to)
    return float(shot.duration_s) * (s0 + s1) / 2


def _start(src: SegmentSource, shot: Shot) -> float:
    start = float(shot.start_s)
    if src.duration > 0:
        start = min(start, max(0.0, src.duration - source_span(shot, src.kind)))
    return max(0.0, start)


def _input_args(src: SegmentSource, shot: Shot) -> list[str]:
    if src.kind in ("photo", "photo360"):
        return ["-i", src.path]
    return [*src.extra_inputs, "-ss", f"{_start(src, shot):.3f}",
            "-t", f"{source_span(shot, src.kind) + 1.0:.3f}", "-i", src.path]


def _input_label(src: SegmentSource, i: int) -> str:
    if src.kind == "video360" and src.video_streams >= 2:
        # [rear | front], the layout of the camera's own .insp stills and of media.frame_at,
        # so yaw 0 is the front lens (stream 0) for photos, video and previews alike.
        return f"[{i}:v:1][{i}:v:0]"
    return f"[{i}:v:0]"


def build_ffmpeg_args(plan: ReelPlan, srcs: list[SegmentSource], out_path: str | Path,
                      cfg: Config, audio: AudioMix | None = None) -> list[str]:
    """The complete ffmpeg command line (argv, starting with cfg.ffmpeg) for a reel.

    srcs[i] describes plan.shots[i]; `audio` is the music mix (None: a silent track).
    Pure: reads no files, so tests can inspect it."""
    if len(srcs) != len(plan.shots):
        raise ValueError(f"{len(plan.shots)} shots but {len(srcs)} sources")
    if not plan.shots:
        raise ValueError("plan has no shots")
    st = _settings(cfg)
    args = [cfg.ffmpeg, "-hide_banner", "-nostdin", "-y"]
    chains, labels, total = [], [], 0
    for i, (shot, src) in enumerate(zip(plan.shots, srcs)):
        n = frames_for(shot.duration_s)
        total += n
        args += _input_args(src, shot)
        chains.append(_geometry(src, shot, _input_label(src, i), n, cfg) + ","
                      + _to_out(src.levels, n) + f"[s{i}]")
        labels.append(f"[s{i}]")
    seconds = total / FPS
    graph = ";".join(chains) + ";" + "".join(labels) + f"concat=n={len(labels)}:v=1:a=0[vout]"
    if audio is None:
        silent = len(plan.shots)
        args += ["-f", "lavfi", "-t", f"{seconds:.3f}", "-i",
                 "anullsrc=channel_layout=stereo:sample_rate=48000"]
        args += ["-filter_complex", graph, "-map", "[vout]", "-map", f"{silent}:a"]
        abitrate = "128k"
    else:
        args += _music_input(audio, seconds)
        graph += ";" + _audio_graph(plan, srcs, audio, len(plan.shots), "final")
        args += ["-filter_complex", graph, "-map", "[vout]", "-map", "[aout]"]
        abitrate = "256k"
    if st["encoder"] == "videotoolbox":
        args += ["-c:v", "h264_videotoolbox", "-profile:v", "high", "-b:v", "24M",
                 "-maxrate", "30M", "-bufsize", "60M"]
    else:
        args += ["-c:v", "libx264", "-preset", str(st["preset"]), "-crf", str(st["crf"]),
                 "-profile:v", "high", "-level:v", "4.2", "-maxrate", "30M", "-bufsize", "60M"]
    args += ["-pix_fmt", "yuv420p", "-r", str(FPS), "-fps_mode", "cfr", "-g", str(2 * FPS),
             "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709",
             "-color_trc", "bt709",
             "-c:a", "aac", "-b:a", abitrate, "-ar", "48000", "-ac", "2",
             "-frames:v", str(total), "-t", f"{seconds:.3f}",
             "-movflags", "+faststart", str(out_path)]
    return args


# --------------------------------------------------------------------------- sound


AFMT = "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo"
BLOCK_S, BLOCK_HOP_S = 0.4, 0.1        # level measurement blocks (as EBU momentary loudness)
SILENT_DB = -60.0                      # a shot quieter than this has no natural sound to speak of
NATURAL_BOOST_MAX = 12.0               # never raise a clip's own sound more than this
NATURAL_COMP_ABOVE = 10.0              # natural sound is compressed this far above its steady level
DUCK_ABOVE = 6.0                       # music ducks under natural sound this far above steady
MAX_LIMITING = 8.0                     # never push peaks more than this into the limiter
MAX_TRUE_PEAK = -1.0                   # Instagram's ceiling, checked on the encoded file
MEASURE_SR = 16000


@dataclass
class AudioMix:
    """The sound of a reel with music. The measured fields come from measure_audio(); left
    empty (as in tests) the mix uses unit gains."""
    music: str                                  # the track file
    start_s: float = 0.0                        # where in it the reel starts
    natural: bool = True                        # mix the clips' own sound under the music
    natural_db: float = -12.0                   # steady natural sound, dB under the music's level
    lufs: float = -14.0                         # integrated loudness of the final mix
    ceiling_db: float = -2.0                    # limiter ceiling (sample peak, dBFS)
    fade_in: float = 0.1
    fade_out: float = 0.6
    music_db: float | None = None               # measured: the window's mean RMS level, dBFS
    natural_beds: list[float | None] | None = None   # measured: each shot's steady level, dBFS
    gain_db: float | None = None                # measured: make-up gain to `lufs` (None: none yet)

    def natural_gains(self, srcs: list[SegmentSource]) -> list[float | None]:
        """dB gain per shot for its own sound; None for shots that contribute silence."""
        if not self.natural:
            return [None] * len(srcs)
        if self.natural_beds is None or self.music_db is None:
            return [0.0 if _has_sound(s) else None for s in srcs]
        target = self.music_db + self.natural_db
        return [None if (b is None or b <= SILENT_DB or not _has_sound(s))
                else round(min(NATURAL_BOOST_MAX, target - b), 2)
                for s, b in zip(srcs, self.natural_beds)]

    def steady_db(self) -> float:
        """Level the natural sound's steady part is brought to (dBFS)."""
        if self.music_db is None:
            return -30.0
        return self.music_db + self.natural_db


def _has_sound(src: SegmentSource) -> bool:
    return src.audio and src.kind in ("video", "video360")


def _amp(db: float, floor: float = 0.000976563) -> str:
    """dB -> linear amplitude, clamped to what sidechaincompress/acompressor/alimiter accept."""
    return f"{min(1.0, max(floor, 10 ** (db / 20))):.6f}"


def _music_input(audio: AudioMix, seconds: float) -> list[str]:
    return ["-ss", f"{audio.start_s:.3f}", "-t", f"{seconds + 1.0:.3f}", "-i", str(audio.music)]


def _natural_chain(plan: ReelPlan, srcs: list[SegmentSource], gains: list[float | None]) -> str:
    """Each shot's own sound (or silence), exactly as long as its frames, joined; ends unlabelled."""
    parts, labels = [], []
    for i, (shot, src, g) in enumerate(zip(plan.shots, srcs, gains)):
        d = frames_for(shot.duration_s) / FPS
        if g is None:
            parts.append(f"anullsrc=r=48000:cl=stereo,{AFMT},atrim=duration={d:.6f}[na{i}]")
        else:
            f = min(0.01, d / 4)
            parts.append(f"[{i}:a:0]asetpts=PTS-STARTPTS,aresample=48000,{AFMT},atrim=duration={d:.6f},"
                         f"afade=t=in:st=0:d={f:g},afade=t=out:st={d - f:.6f}:d={f:g},"
                         f"apad=whole_dur={d:.6f},volume={g:.2f}dB[na{i}]")
        labels.append(f"[na{i}]")
    return ";".join(parts) + ";" + "".join(labels) + f"concat=n={len(labels)}:v=0:a=1"


def _music_chain(music_input: int, seconds: float) -> str:
    return (f"[{music_input}:a:0]asetpts=PTS-STARTPTS,aresample=48000,{AFMT},"
            f"atrim=duration={seconds:.6f},apad=whole_dur={seconds:.6f}")


def _audio_graph(plan: ReelPlan, srcs: list[SegmentSource], audio: AudioMix, music_input: int,
                 stage: str) -> str:
    """Filter graph text for the sound.
    "stems":   the music window and the natural stem as mono 16 kHz float, [mus] and [nat]
    "measure": the mix, faded, with audio.gain_db and the limiter when a gain is set, into
               ebur128 (its summary goes to stderr), [aout]
    "final":   the mix, faded, gained, limited, exactly the reel's length, [aout]"""
    seconds = sum(frames_for(s.duration_s) for s in plan.shots) / FPS
    gains = audio.natural_gains(srcs) if stage != "stems" else (
        [0.0 if (audio.natural and _has_sound(s)) else None for s in srcs])
    natural = any(g is not None for g in gains)
    mono = f"aformat=sample_fmts=flt:channel_layouts=mono,aresample={MEASURE_SR}"
    if stage == "stems":
        out = [_music_chain(music_input, seconds) + f",{mono}[mus]"]
        if natural:
            out.append(_natural_chain(plan, srcs, gains) + f",{mono}[nat]")
        return ";".join(out)
    if stage not in ("measure", "final"):
        raise ValueError(f"unknown stage {stage!r}")
    return _mix_graph(_natural_chain(plan, srcs, gains) if natural else None, music_input, seconds, audio, stage)


def _mix_graph(natural: str | None, music_input: int, seconds: float, audio: AudioMix, stage: str) -> str:
    """The mix of a reel `seconds` long: `natural` (graph text whose last chain is left open: the
    natural-sound stem, gained per shot; None when no shot has sound) under the music from input
    music_input, as described in the module docstring. stage "measure" ends in ebur128, "final" in
    the exact length; both label the result [aout]."""
    steady = audio.steady_db()
    chains = []
    if natural is not None:
        chains.append(natural
                      + f",acompressor=threshold={_amp(steady + NATURAL_COMP_ABOVE)}:ratio=4:attack=5"
                        ":release=200:knee=2:makeup=1,asplit=2[nmix][nsc]")
        # the sidechain hears no rumble (wind, handling), and never ends before the music
        chains.append("[nsc]highpass=f=150,apad[sc]")
        chains.append(_music_chain(music_input, seconds) + "[mus]")
        chains.append(f"[mus][sc]sidechaincompress=threshold={_amp(steady + DUCK_ABOVE)}:ratio=4:attack=50"
                      ":release=400:knee=1:makeup=1[duck]")
        chains.append("[duck][nmix]amix=inputs=2:normalize=0:duration=first:dropout_transition=0,")
    else:
        chains.append(_music_chain(music_input, seconds) + ",")
    chains[-1] += (f"afade=t=in:st=0:d={audio.fade_in:g},"
                   f"afade=t=out:st={max(0.0, seconds - audio.fade_out):.3f}:d={audio.fade_out:g}")
    if audio.gain_db is not None:
        # limiting at 4x the rate catches the peaks between samples too (a true-peak limiter)
        chains[-1] += (f",volume={audio.gain_db:.2f}dB,aresample=192000,"
                       f"alimiter=limit={_amp(audio.ceiling_db, 0.0625)}:attack=5:release=50:level=false"
                       ":latency=1,aresample=48000")
    if stage == "measure":
        chains[-1] += ",ebur128=peak=true[aout]"
    else:
        chains[-1] += f",{AFMT},apad=whole_dur={seconds:.6f},atrim=duration={seconds:.6f}[aout]"
    return ";".join(chains)


def build_audio_args(plan: ReelPlan, srcs: list[SegmentSource], audio: AudioMix, cfg: Config,
                     stage: str, outputs: dict[str, str] | None = None) -> list[str]:
    """Audio-only measurement passes (pure).
    stage "stems":   decode the music window and the natural-sound stem (when there is one) to
                     raw mono 16 kHz float files, outputs = {"mus": path, "nat": path};
    stage "measure": the mix as it would be rendered with audio.gain_db, into ebur128."""
    seconds = sum(frames_for(s.duration_s) for s in plan.shots) / FPS
    args = [cfg.ffmpeg, "-hide_banner", "-nostdin", "-nostats", "-y"]
    for shot, src in zip(plan.shots, srcs):
        args += _input_args(src, shot)
    args += _music_input(audio, seconds)
    graph = _audio_graph(plan, srcs, audio, len(plan.shots), stage)
    if stage == "stems":
        outputs = outputs or {}
        args += ["-filter_complex", graph, "-map", "[mus]", "-f", "f32le", outputs.get("mus", "music.f32")]
        if "[nat]" in graph:
            args += ["-map", "[nat]", "-f", "f32le", outputs.get("nat", "natural.f32")]
        return args
    return args + ["-filter_complex", graph, "-map", "[aout]", "-f", "null", "-"]


def steady_levels(pcm: np.ndarray, sr: int, durations: list[float]) -> list[float | None]:
    """Each shot's steady level (dBFS): the 30th percentile of 400 ms RMS blocks (100 ms hop)
    over its stretch of the stem. Short shots get one block. None for digital silence."""
    out, pos = [], 0
    size, hop = int(BLOCK_S * sr), int(BLOCK_HOP_S * sr)
    for d in durations:
        n = int(round(d * sr))
        seg = pcm[pos: pos + n].astype(np.float64)
        pos += n
        if len(seg) == 0:
            out.append(None)
            continue
        blocks = [seg] if len(seg) <= size else [seg[i:i + size] for i in range(0, len(seg) - size + 1, hop)]
        level = float(np.percentile([10 * np.log10(np.mean(b ** 2) + 1e-20) for b in blocks], 30))
        out.append(round(level, 2) if level > -100 else None)
    return out


def _mean_db(pcm: np.ndarray, sr: int) -> float:
    """Energy-mean level (dBFS) of the 400 ms blocks above -70 dBFS: the music's working level."""
    size, hop = int(BLOCK_S * sr), int(BLOCK_HOP_S * sr)
    x = pcm.astype(np.float64)
    if len(x) < size:
        return float(10 * np.log10(np.mean(x ** 2) + 1e-20))
    p = np.array([np.mean(x[i:i + size] ** 2) for i in range(0, len(x) - size + 1, hop)])
    p = p[p > 1e-7] if (p > 1e-7).any() else p
    return float(10 * np.log10(p.mean() + 1e-20))


def parse_ebur128(stderr: str) -> tuple[float, float]:
    """(integrated LUFS, true peak dBTP) from ebur128's summary; -70 / -inf for silence."""
    summary = stderr[stderr.rfind("Summary:"):]
    i = re.search(r"I:\s+(-?[\d.]+|-inf) LUFS", summary)
    tp = re.search(r"Peak:\s+(-?[\d.]+|-?inf) dBFS", summary)
    if not i or not tp:
        raise RuntimeError("no ebur128 summary in ffmpeg output")
    return float(i.group(1)), float(tp.group(1))


def measure_audio(plan: ReelPlan, srcs: list[SegmentSource], audio: AudioMix, cfg: Config,
                  workdir: Path) -> AudioMix:
    """Audio-only passes that fill in the mix's measured fields:
    1. stems: the music window's level and each shot's steady natural level -> natural gains;
    2. the mix as is (ebur128): the make-up gain to audio.lufs. If that gain would push true
       peaks over the limiter ceiling, the gain is searched with the limiter in the loop (a few
       more passes), giving peaks at most MAX_LIMITING dB of limiting (a spiky, quiet track then
       ends up a little under the target rather than flattened)."""
    outs = {"mus": str(workdir / "music.f32"), "nat": str(workdir / "natural.f32")}
    _run(build_audio_args(plan, srcs, audio, cfg, "stems", outs), timeout=600)
    audio.music_db = round(_mean_db(np.fromfile(outs["mus"], np.float32), MEASURE_SR), 2)
    if audio.natural and Path(outs["nat"]).exists():
        audio.natural_beds = steady_levels(np.fromfile(outs["nat"], np.float32), MEASURE_SR,
                                           [frames_for(s.duration_s) / FPS for s in plan.shots])
    else:
        audio.natural_beds = [None] * len(plan.shots)

    def loudness() -> tuple[float, float]:
        err = _run(build_audio_args(plan, srcs, audio, cfg, "measure"), timeout=600).stderr
        return parse_ebur128(err.decode(errors="replace"))

    return _fit_gain(audio, loudness)


def _fit_gain(audio: AudioMix, loudness) -> AudioMix:
    """Set audio.gain_db so the mix lands at audio.lufs: loudness() measures the mix as it would
    render with the current gain_db (integrated LUFS, true peak dBTP). See measure_audio."""
    audio.gain_db = None
    i0, tp0 = loudness()
    if i0 <= -69:                                       # nothing audible: leave it alone
        audio.gain_db = 0.0
        return audio
    gain = audio.lufs - i0
    if tp0 + gain <= audio.ceiling_db:                  # a plain gain; the limiter stays idle
        audio.gain_db = round(gain, 2)
        log.debug("reel sound: music %.1f dBFS, natural %s, gain %.2f dB", audio.music_db,
                  audio.natural_beds, gain)
        return audio
    cap = audio.ceiling_db - tp0 + MAX_LIMITING
    tried: list[tuple[float, float]] = []
    for _ in range(5):
        gain = min(gain, cap)
        audio.gain_db = round(gain, 2)
        level, _ = loudness()
        tried.append((audio.gain_db, level))
        miss = audio.lufs - level
        if abs(miss) <= 0.1 or (miss > 0 and gain >= cap - 1e-6):
            break
        slope = 1.0
        if len(tried) >= 2 and abs(tried[-1][0] - tried[-2][0]) > 1e-3:
            slope = (tried[-1][1] - tried[-2][1]) / (tried[-1][0] - tried[-2][0])
            slope = min(1.0, max(0.2, slope))
        gain += miss / slope
    audio.gain_db = min(tried, key=lambda t: abs(audio.lufs - t[1]))[0]
    log.debug("reel sound: music %.1f dBFS, natural %s, gain %.2f dB into the limiter (tried %s)",
              audio.music_db, audio.natural_beds, audio.gain_db, tried)
    return audio


# --------------------------------------------------------------------------- files and probes


def _run(args: list[str], timeout: float = 900) -> subprocess.CompletedProcess:
    proc = subprocess.run(args, capture_output=True, timeout=timeout)
    if proc.returncode != 0:
        # progress lines ("frame= ... time=") use \r and drown the actual error: keep the rest
        lines = proc.stderr.decode(errors="replace").replace("\r", "\n").splitlines()
        lines = [l for l in lines if l.strip() and not l.lstrip().startswith(("frame=", "size="))]
        # lead with the lines that name the problem, then the tail
        key = [l for l in lines if any(w in l.lower() for w in ("error", "invalid", "failed", "cannot", "no such"))]
        err = "\n".join(key[:12] + ["..."] + lines[-6:])
        raise RuntimeError(f"{Path(args[0]).name} failed ({proc.returncode}): {err[-2500:]}")
    return proc


def probe_media(path: str | Path, cfg: Config) -> dict:
    """ffprobe summary: duration, picture streams (cover art skipped), display size, transfer."""
    out = _run([cfg.ffprobe, "-v", "error", "-show_streams", "-show_format", "-of", "json",
                str(path)], timeout=60).stdout
    data = json.loads(out or b"{}")
    pics = [s for s in data.get("streams", [])
            if s.get("codec_type") == "video" and not s.get("disposition", {}).get("attached_pic")]
    info = {"duration": float(data.get("format", {}).get("duration") or 0), "video_streams": len(pics),
            "width": 0, "height": 0, "transfer": "", "fps": 0.0, "audio": any(
                s.get("codec_type") == "audio" for s in data.get("streams", []))}
    if pics:
        s = pics[0]
        w, h = int(s.get("width") or 0), int(s.get("height") or 0)
        rot = 0
        for sd in s.get("side_data_list", []) or []:
            if "rotation" in sd:
                rot = int(float(sd["rotation"]))
        rot = rot or int(float((s.get("tags") or {}).get("rotate", 0) or 0))
        if abs(rot) % 180 == 90:
            w, h = h, w
        info.update(width=w, height=h, transfer=s.get("color_transfer", "") or "",
                    fps=_rate(s.get("avg_frame_rate")) or _rate(s.get("r_frame_rate")))
        if s.get("duration"):
            info["duration"] = float(s["duration"])
    return info


def _rate(text: str | None) -> float:
    """ffprobe's "30000/1001" -> 29.97 (0 when missing or 0/0)."""
    try:
        num, _, den = str(text or "0").partition("/")
        return float(num) / float(den or 1) if float(den or 1) else 0.0
    except ValueError:
        return 0.0


def _open_srgb(path: str | Path, need_scale: float | None = None) -> Image.Image:
    """Open a still upright and in sRGB. need_scale lets the JPEG decoder shrink big files."""
    img = Image.open(path)
    if need_scale and img.format == "JPEG" and need_scale < 0.5:
        img.draft("RGB", (max(1, int(img.width * need_scale)), max(1, int(img.height * need_scale))))
    img = ImageOps.exif_transpose(img)
    icc = img.info.get("icc_profile")
    if icc:
        try:
            from PIL import ImageCms
            import io
            prof = ImageCms.ImageCmsProfile(io.BytesIO(icc))
            name = ImageCms.getProfileDescription(prof) or ""
            if "srgb" not in name.lower().replace(" ", ""):
                img = ImageCms.profileToProfile(img.convert("RGB"), prof, ImageCms.createProfile("sRGB"),
                                                outputMode="RGB")
        except Exception as e:                          # a broken profile is not worth failing on
            log.warning("ignoring ICC profile of %s: %s", path, e)
    return img.convert("RGB")


def prepare_still(path: str | Path, focus: tuple[float, float], out_path: Path,
                  size: tuple[int, int]) -> tuple[Path, tuple[float, float]]:
    """Cut the largest 9:16 box around focus out of a photo, resized to `size`.
    Returns the written file and where the focus point lands inside it (fractions)."""
    with Image.open(path) as probe:
        ow, oh = probe.size
    # Let huge JPEGs decode at 1/2, 1/4 or 1/8 size when the 9:16 box needs far fewer pixels.
    # The box is smallest relative to the frame when the long side is horizontal, so this
    # bound holds whatever the EXIF orientation turns out to be.
    _, _, _, bh = fit_box(max(ow, oh), min(ow, oh), ASPECT, (0.5, 0.5))
    img = _open_srgb(path, need_scale=size[1] / max(bh, 1.0) * 1.05)
    W, H = img.size
    x, y, w, h = fit_box(W, H, ASPECT, focus)
    still = img.resize(size, Image.LANCZOS, box=(x, y, x + w, y + h), reducing_gap=3.0)
    still.save(out_path)
    inside = ((focus[0] * W - x) / w, (focus[1] * H - y) / h)
    return out_path, (min(max(inside[0], 0.0), 1.0), min(max(inside[1], 0.0), 1.0))


def _box_bound(path: str | Path) -> float:
    """Height of the largest 9:16 box in the photo, whatever its EXIF orientation turns out to be
    (smallest when the long side is horizontal): bounds how far the JPEG decoder may shrink it."""
    with Image.open(path) as probe:
        ow, oh = probe.size
    return fit_box(max(ow, oh), min(ow, oh), ASPECT, (0.5, 0.5))[3]


def prepare_pan_still(path: str | Path, focus: tuple[float, float], focus_to: tuple[float, float],
                      out_path: Path, size: tuple[int, int]
                      ) -> tuple[Path, tuple[int, int], tuple[float, float], tuple[float, float]]:
    """For a pan: cut the union of the 9:16 boxes around focus and focus_to (each clamped inside
    the photo) at the scale that makes one box `size`. Returns the file, its size (even, at least
    `size`) and where focus and focus_to land inside it (fractions)."""
    img = _open_srgb(path, need_scale=size[1] / max(_box_bound(path), 1.0) * 1.05)
    W, H = img.size
    ax, ay, bw, bh = fit_box(W, H, ASPECT, focus)
    ex, ey, _, _ = fit_box(W, H, ASPECT, focus_to)
    x0, y0, x1, y1 = min(ax, ex), min(ay, ey), max(ax, ex) + bw, max(ay, ey) + bh
    s = size[1] / bh
    out = (max(size[0], _even_round((x1 - x0) * s)), max(size[1], _even_round((y1 - y0) * s)))
    img.resize(out, Image.LANCZOS, box=(x0, y0, x1, y1), reducing_gap=3.0).save(out_path)

    def inside(f: tuple[float, float]) -> tuple[float, float]:
        return (min(max((f[0] * W - x0) / (x1 - x0), 0.0), 1.0),
                min(max((f[1] * H - y0) / (y1 - y0), 0.0), 1.0))
    return out_path, out, inside(focus), inside(focus_to)


def prepare_fit_still(path: str | Path, out_path: Path, work_scale: float = 2.0
                      ) -> tuple[Path, tuple[int, int]]:
    """For the fit layout: the whole photo, upright and sRGB, at work_scale times its size in the
    reel (fit_placement), so the foreground needs no further resize. Returns the file and size."""
    with Image.open(path) as probe:
        ow, oh = probe.size
    need = max(min(OUT_W / ow, OUT_H / oh), min(OUT_W / oh, OUT_H / ow)) * work_scale * 1.05
    img = _open_srgb(path, need_scale=need)
    _, _, fw, fh = fit_placement(OUT_W, OUT_H, img.width / img.height)
    out = (_even_round(fw * work_scale), _even_round(fh * work_scale))
    img.resize(out, Image.LANCZOS, reducing_gap=3.0).save(out_path)
    return out_path, out


def _luma_percentiles(rgb: np.ndarray) -> tuple[float, float]:
    a = rgb.astype(np.float32) / 255.0
    y = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    lo, hi = np.percentile(y, [0.5, 99.5])
    return float(lo), float(hi)


def _analysis_frame(src: SegmentSource, shot: Shot, cfg: Config) -> np.ndarray:
    """One small RGB frame from the middle of the shot, framed as it will be in the reel."""
    w, h = 136, 240
    n = 1
    label = _input_label(src, 0)
    if src.kind in ("photo", "photo360"):
        inputs = ["-i", src.path]
        geo = _geometry(src, shot, label, n, cfg, w, h, animate=False)
    else:
        mid = _start(src, shot) + source_span(shot, src.kind) / 2
        if src.duration > 0:
            mid = min(mid, max(0.0, src.duration - 0.1))
        inputs = [*src.extra_inputs, "-ss", f"{mid:.3f}", "-i", src.path]
        geo = _geometry(src, shot, label, n, cfg, w, h, background=False)
    out = _run([cfg.ffmpeg, "-hide_banner", "-nostdin", "-v", "error", *inputs,
                "-filter_complex", geo + ",format=rgb24[o]", "-map", "[o]", "-frames:v", "1",
                "-f", "rawvideo", "-"], timeout=300).stdout
    if len(out) < w * h * 3:
        raise RuntimeError(f"no analysis frame from {src.path}")
    return np.frombuffer(out[: w * h * 3], np.uint8).reshape(h, w, 3)


def _projection(path: str, info: dict, override: str | None) -> str:
    if override:
        return override
    if info["video_streams"] >= 2 or path.lower().endswith((".insv", ".insp")):
        return "dfisheye"
    return "equirect"


def prepare_sources(plan: ReelPlan, sources: dict[str, dict], workdir: Path, cfg: Config
                    ) -> list[SegmentSource]:
    """Probe videos, cut photo stills, measure levels. Writes only inside workdir."""
    st = _settings(cfg)
    work = _work_size(cfg)
    hw = ["-hwaccel", "videotoolbox"] if st["hwaccel"] else []

    def one(i: int, shot: Shot) -> SegmentSource:
        entry = sources.get(shot.asset_id)
        if not entry:
            raise KeyError(f"no source for asset {shot.asset_id}")
        kind, path = entry["kind"], str(entry["path"])
        if not Path(path).exists():
            raise FileNotFoundError(path)
        if kind == "photo":
            name, focus, pan_to = workdir / f"still_{i:02d}.ppm", (shot.focus.x, shot.focus.y), None
            if _is_fit(kind, shot):
                still, size = prepare_fit_still(path, name, st["work_scale"])
            elif (pan_to := _pan_target(kind, shot)) is not None:
                still, size, focus, pan_to = prepare_pan_still(path, focus, pan_to, name, work)
            else:
                (still, focus), size = prepare_still(path, focus, name, work), work
            src = SegmentSource(kind, str(still), *size, focus=focus, focus_to=pan_to, origin=path)
        elif kind == "photo360":
            with Image.open(path) as im:
                w, h = im.size
            src = SegmentSource(kind, path, w, h,
                                projection=_projection(path, {"video_streams": 1}, entry.get("projection")),
                                lens_fov=float(entry.get("lens_fov", st["lens_fov"])), origin=path)
        elif kind in ("video", "video360"):
            info = probe_media(path, cfg)
            if not info["video_streams"]:
                raise ValueError(f"{path} has no video stream")
            if info["transfer"] in HDR_TRANSFERS:
                log.warning("%s is HDR (%s); it is not tone mapped", path, info["transfer"])
            src = SegmentSource(kind, path, info["width"], info["height"], info["duration"],
                                video_streams=info["video_streams"] if kind == "video360" else 1,
                                extra_inputs=list(hw), audio=bool(info["audio"]), fps=float(info.get("fps") or 0.0),
                                denoise=bool(entry.get("denoise", False)), origin=path)
            if kind == "video360":
                src.projection = _projection(path, info, entry.get("projection"))
                src.lens_fov = float(entry.get("lens_fov", st["lens_fov"]))
                if src.projection != "dfisheye" or info["video_streams"] < 2:
                    src.video_streams = 1
        else:
            raise ValueError(f"unknown kind {kind!r} for {shot.asset_id}")
        if st["autolevels"]:
            try:
                if kind == "photo":
                    with Image.open(src.path) as im:
                        rgb = np.asarray(im.convert("RGB").resize((136, 240), Image.BILINEAR))
                else:
                    rgb = _analysis_frame(src, shot, cfg)
                src.levels = gentle_levels(*_luma_percentiles(rgb))
            except Exception as e:                      # levels are a nicety, never fatal
                log.warning("levels skipped for %s: %s", path, e)
        return src

    with ThreadPoolExecutor(max_workers=min(6, len(plan.shots)) or 1) as pool:
        return list(pool.map(lambda a: one(*a), enumerate(plan.shots)))


def render_reel_single_pass(plan: ReelPlan, sources: dict[str, dict], out_path: str | Path, cfg: Config,
                            music: str | Path | None = None) -> Path:
    """The renderer before segments, kept for comparison: the whole reel in one ffmpeg run
    (build_ffmpeg_args), hard cuts only, no speed changes. sources[asset_id] = {"kind": ..., "path": ...};
    optional keys for 360: "projection" ("dfisheye" | "equirect"), "lens_fov" (degrees).
    For photos pass the full-resolution edit (rawedit.render_raw(...)["full"]) or the camera
    JPG: a 9:16 cut of the 1080-wide feed export, zoomed, would be upscaled and soft.
    music: the audio file of plan.music.track_id; with plan.music set, the reel gets the mixed
    sound described in the module docstring, else a silent track.

    Shots past cfg.reel_cap(plan.length_class) are trimmed. Temp files live in a private directory
    and the reel is written under a unique name and renamed into place, so parallel calls are safe."""
    out_path = Path(out_path)
    shots = fit_shots(plan.shots, cfg.reel_cap(plan.length_class))
    if not shots:
        raise ValueError("plan has no usable shots")
    if len(shots) != len(plan.shots) or any(a is not b for a, b in zip(shots, plan.shots)):
        log.warning("plan %s trimmed to %.2f s", plan.event_key, cfg.reel_cap(plan.length_class))
    plan = plan.model_copy(update={"shots": shots})
    out_path.parent.mkdir(parents=True, exist_ok=True)
    workdir = Path(tempfile.mkdtemp(prefix="igmp-reel-"))
    tmp_out = out_path.with_name(f".{out_path.stem}.{uuid.uuid4().hex[:8]}.mp4")
    try:
        srcs = prepare_sources(plan, sources, workdir, cfg)
        audio = None
        if music is not None and plan.music is not None:
            st = _settings(cfg)
            audio = measure_audio(plan, srcs, AudioMix(
                str(music), plan.music.start_s, natural=st["natural_sound"], natural_db=st["natural_sound_db"],
                lufs=st["lufs"], ceiling_db=st["peak_ceiling"]), cfg, workdir)
        args = build_ffmpeg_args(plan, srcs, tmp_out, cfg, audio=audio)
        log.debug("ffmpeg %s", " ".join(args))
        _run(args, timeout=1800)
        if audio is not None:
            # the AAC encoder can overshoot the limiter by a few tenths of a dB (rarely more):
            # check the file, and once, render again with the ceiling lowered by the excess
            level, peak = _file_loudness(tmp_out, cfg)
            if peak > MAX_TRUE_PEAK:
                log.warning("reel %s: true peak %.2f dBTP after encoding; re-rendering", plan.event_key, peak)
                audio.ceiling_db -= peak - MAX_TRUE_PEAK + 0.2
                _run(build_ffmpeg_args(plan, srcs, tmp_out, cfg, audio=audio), timeout=1800)
                level, peak = _file_loudness(tmp_out, cfg)
            log.info("reel %s: sound %.1f LUFS, %.1f dBTP", plan.event_key, level, peak)
        frames = sum(frames_for(s.duration_s) for s in shots)
        info = probe_media(tmp_out, cfg)
        if (info["width"], info["height"]) != (OUT_W, OUT_H) or abs(info["duration"] - frames / FPS) > 0.1:
            raise RuntimeError(f"unexpected reel: {info['width']}x{info['height']} {info['duration']:.2f}s")
        os.replace(tmp_out, out_path)
        return out_path
    finally:
        tmp_out.unlink(missing_ok=True)
        shutil.rmtree(workdir, ignore_errors=True)


def _file_loudness(path: Path, cfg: Config) -> tuple[float, float]:
    err = _run([cfg.ffmpeg, "-hide_banner", "-nostdin", "-nostats", "-i", str(path), "-vn",
                "-af", "ebur128=peak=true", "-f", "null", "-"], timeout=300).stderr
    return parse_ebur128(err.decode(errors="replace"))


# --------------------------------------------------------------------------- segments


RENDER_VERSION = "2"            # in every cache key: bump when segment or transition output changes
GRID_SLACK_S = 0.0001          # sped-up/slowed source times count as on the output frame grid this close
REAL_FRAMES_FPS = 29.5          # slow motion shows the source's own frames while it plays this many fps
STILL_KINDS = ("photo", "photo360")
STEM_RATE = 48000               # natural-sound stems: 48 kHz stereo 16-bit PCM, 1600 samples a frame

# All-intra intermediates: name -> (family, encoder args). A transition clip is in its A segment's
# family (aitx's contract): "prores" (ProRes 422) or "x264" (all-intra libx264). prores_videotoolbox
# is handed 10-bit 4:2:2 (p210le, converted by ffmpeg): given 8-bit 4:2:0 it converts it itself, as
# BT.601, which shifts every colour of a BT.709 segment (a saturated bar's luma by ~20 codes).
INTERMEDIATES: dict[str, tuple[str, tuple[str, ...]]] = {
    "prores_vt": ("prores", ("-c:v", "prores_videotoolbox", "-profile:v", "hq", "-pix_fmt", "p210le")),
    "prores_ks": ("prores", ("-c:v", "prores_ks", "-profile:v", "3", "-vendor", "apl0", "-pix_fmt", "yuv422p10le")),
    "x264": ("x264", ("-c:v", "libx264", "-preset", "fast", "-crf", "10", "-g", "1", "-keyint_min", "1", "-bf", "0",
                      "-pix_fmt", "yuv420p")),
    "prores_vt_lt": ("prores", ("-c:v", "prores_videotoolbox", "-profile:v", "lt", "-pix_fmt", "p210le")),
    "x264_draft": ("x264", ("-c:v", "libx264", "-preset", "ultrafast", "-crf", "16", "-g", "1", "-keyint_min", "1",
                            "-bf", "0", "-pix_fmt", "yuv420p")),
}
FINAL_ORDER = ("prores_vt", "x264")             # "auto": the first whose encoder this ffmpeg has
DRAFT_ORDER = ("prores_vt_lt", "x264_draft")
SLOWMO = {   # frame interpolation for slow motion the source has no frames for (cfg.extra reel_slowmo)
    "mci": "minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1",
    "blend": "minterpolate=fps=30:mi_mode=blend",
    "dup": "",
}
DENOISE = "hqdn3d=3:2.5:4:3.5"  # night/astro clips (source entry "denoise": true); cfg.extra reel_denoise


@functools.lru_cache(maxsize=8)
def _encoders(ffmpeg: str) -> frozenset[str]:
    """Encoder names this ffmpeg has (empty if it can't be asked)."""
    try:
        out = subprocess.run([ffmpeg, "-hide_banner", "-encoders"], capture_output=True, timeout=30).stdout
    except (OSError, subprocess.TimeoutExpired):
        return frozenset()
    return frozenset(m.group(1) for m in re.finditer(r"^\s*[VAS][A-Z.]{5}\s+(\S+)", out.decode(errors="replace"), re.M))


def _intermediate(cfg: Config, draft: bool = False) -> str:
    """Name of the intermediate segments are written in (INTERMEDIATES): cfg.extra
    reel_intermediate / reel_draft_intermediate, or "auto" (FINAL_ORDER / DRAFT_ORDER)."""
    x = cfg.extra or {}
    want = str(x.get("reel_draft_intermediate" if draft else "reel_intermediate", "auto"))
    if want in INTERMEDIATES:
        return want
    have = _encoders(cfg.ffmpeg)
    for name in (DRAFT_ORDER if draft else FINAL_ORDER):
        if INTERMEDIATES[name][1][1] in have:
            return name
    return "x264"


def _family_args(family: str, cfg: Config) -> tuple[str, ...]:
    """Encoder args for a clip in this family: the configured intermediate when it is of that family."""
    name = _intermediate(cfg)
    if INTERMEDIATES[name][0] == family:
        return INTERMEDIATES[name][1]
    if family == "prores":
        return INTERMEDIATES["prores_vt" if "prores_videotoolbox" in _encoders(cfg.ffmpeg) else "prores_ks"][1]
    return INTERMEDIATES["x264"][1]


def _draft_cfg(cfg: Config) -> Config:
    """The settings a draft renders with: work scale 1 (stills are cut and moved at output size)."""
    if (cfg.extra or {}).get("reel_work_scale") == 1.0:
        return cfg
    return dataclasses.replace(cfg, extra={**(cfg.extra or {}), "reel_work_scale": 1.0})


def _workers(cfg: Config, jobs: int) -> int:
    n = int((cfg.extra or {}).get("reel_workers", 0)) or (os.cpu_count() or 4)
    return max(1, min(n, jobs))


def _threads(cfg: Config, workers: int) -> int:
    """Threads per ffmpeg when `workers` run at once: about 1.5x the cores between them."""
    t = int((cfg.extra or {}).get("reel_threads", 0))
    cores = os.cpu_count() or 4
    return t or max(2, min(cores, int(round(1.5 * cores / max(1, workers)))))


def _file_id(path: str | Path) -> list:
    """What a cache key knows of a file: its real path, size and modification time."""
    try:
        st = os.stat(path)
        return [str(Path(path).resolve()), st.st_size, st.st_mtime_ns]
    except OSError:
        return [str(path), 0, 0]


def _place(cached: Path, out: str | Path) -> Path:
    """Make `out` a copy of a cached file (a hard link when possible), replacing what is there."""
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(f".{out.name}.{uuid.uuid4().hex[:8]}")
    try:
        os.link(cached, tmp)
    except OSError:
        shutil.copyfile(cached, tmp)
    os.replace(tmp, out)
    return out


def _touch(path: Path) -> None:
    try:
        os.utime(path)
    except OSError:
        pass


@dataclass(frozen=True)
class SegInfo:
    frames: int
    codec: str
    audio: bool


def _seg_info(path: str | Path, cfg: Config) -> SegInfo:
    """Frame count (from the container's index), video codec and whether there is a sound stem."""
    out = _run([cfg.ffprobe, "-v", "error", "-show_entries", "stream=codec_type,codec_name,nb_frames",
                "-of", "json", str(path)], timeout=60).stdout
    streams = json.loads(out or b"{}").get("streams") or []
    v = next((s for s in streams if s.get("codec_type") == "video"), None)
    if v is None:
        raise ValueError(f"{path} has no video stream")
    frames = int(v.get("nb_frames") or 0)
    if not frames:      # no index count (some containers): count the packets
        out = _run([cfg.ffprobe, "-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries",
                    "stream=nb_read_packets", "-of", "csv=p=0", str(path)], timeout=120).stdout
        frames = int(out.decode().strip() or 0)
    return SegInfo(frames, v.get("codec_name", ""), any(s.get("codec_type") == "audio" for s in streams))


# ------------------------------------------------------------------ speed


def _ramp_source_time(tau, duration: float, s0: float, s1: float):
    """Source seconds shown at output time tau of a shot that ramps from speed s0 to s1 over
    `duration`: the integral of s0 + (s1 - s0) * smoothstep(tau / duration), i.e.
    s0*tau + (s1 - s0) * duration * (p^3 - p^4/2) with p = tau / duration; after the end the
    speed stays s1. The whole shot uses duration * (s0 + s1) / 2 seconds of the source."""
    tau = np.asarray(tau, float)
    p = np.clip(tau / duration, 0.0, 1.0)
    inside = s0 * np.minimum(tau, duration) + (s1 - s0) * duration * (p ** 3 - p ** 4 / 2)
    return inside + s1 * np.maximum(tau - duration, 0.0)


def _ramp_setpts(s0: float, s1: float, duration: float) -> str:
    """setpts (on a microsecond time base) mapping source time to output time for a ramp.

    setpts needs output time as a function of source time: the inverse of _ramp_source_time,
    which has no closed form. It is fitted as a polynomial in x = t / span (x in 0..1) to within
    20 us of output time (checked monotonic), evaluated in Horner form; past the end of the span
    it continues at speed s1. If no polynomial up to degree 15 fits, a 48-piece linear table is
    used instead (within ~0.1 ms for any ramp the plan allows)."""
    span = duration * (s0 + s1) / 2
    tau = np.linspace(0.0, duration, 2401)
    x, y = _ramp_source_time(tau, duration, s0, s1) / span, tau / duration
    xs = f"((PTS-STARTPTS)*TB/{span:.9f})"
    dense = np.linspace(0.0, 1.0, 4001)
    poly = None
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        for deg in range(4, 16):
            c = np.polyfit(x, y, deg)
            if (np.abs(np.polyval(c, x) - y).max() * duration < 2e-5
                    and (np.diff(np.polyval(c, dense)) > 0).all()):
                poly = f"{c[0]:.17g}"
                for ci in c[1:]:
                    poly = f"({poly})*{xs}+({ci:.17g})"
                break
    if poly is None:
        knots = np.interp(np.linspace(0, 1, 49), x, y)
        poly = f"{knots[-1]:.12g}"
        for k in range(47, -1, -1):
            a, b = k / 48, (k + 1) / 48
            seg = f"({knots[k]:.12g}+({xs}-{a:.12g})*{(knots[k + 1] - knots[k]) * 48:.12g})"
            poly = f"if(lt({xs},{b:.12g}),{seg},{poly})"
    tail = f"1+({xs}-1)*{span / (duration * s1):.9f}"
    return f"settb=AVTB,setpts='if(lte({xs},1),{poly},{tail})*{duration:.9f}/TB'"


@dataclass(frozen=True)
class Timing:
    """How a shot's frames come out of its source (see _timing)."""
    method: str             # still | normal | fast | real | interpolated (ramp-... for a ramp)
    time: str               # head of the video chain, before the geometry ("" for stills)
    post: str               # after the geometry: frame interpolation, or ""
    span: float             # source seconds used
    geo_frames: int         # frames that enter the geometry (pans count these)
    audio: str              # keep | tempo | mute
    tempo: float = 1.0


def _timing(shot: Shot, src: SegmentSource, cfg: Config, n: int) -> Timing:
    """A video shot's speed as filters. speed 1: the plain conform to 30 fps. Constant speed s:
    setpts=(PTS-STARTPTS)/s, then fps=30 picks the source's own frames - for speed-ups, and for
    slow motion when the source still plays >= REAL_FRAMES_FPS (a 60 fps clip at 0.5x); slower
    than that the slowed frames go through the geometry as they are and are interpolated to 30
    fps after it, at output size (cfg.extra reel_slowmo: mci | blend | dup). A ramp (speed_to)
    maps time through _ramp_setpts and is interpolated when any part of it is too slow for real
    frames. Sound: kept at speed 1, atempo for constant speed-ups, muted for slow motion and ramps."""
    d = float(shot.duration_s)
    if src.kind in STILL_KINDS:
        return Timing("still", "", "", d, n, "mute")
    s0 = float(shot.speed)
    s1 = s0 if shot.speed_to is None else float(shot.speed_to)
    span = d * (s0 + s1) / 2
    if abs(s0 - 1) < 1e-6 and abs(s1 - 1) < 1e-6:
        return Timing("normal", _CONFORM, "", span, n, "keep")
    ramp = abs(s1 - s0) > 1e-6
    slow = min(s0, s1)
    fps_src = src.fps if src.fps > 0 else float(FPS)
    method = _settings(cfg)["slowmo"]
    head = _ramp_setpts(s0, s1, d) if ramp else f"settb=AVTB,setpts=(PTS-STARTPTS)/{s0:.6g}"
    pre = "ramp-" if ramp else ""
    if slow >= 1 - 1e-6 or fps_src * slow >= REAL_FRAMES_FPS or not SLOWMO.get(method):
        kind = "fast" if slow >= 1 - 1e-6 else "real"
        tempo = not ramp and s0 > 1 + 1e-6
        # fps keeps, for each frame, the last source frame nearest to it. A source frame exactly
        # half a frame off the grid (every odd frame of a 2x speed-up) is a tie, which the
        # microsecond time base's rounding settles at random: GRID_SLACK_S later settles it for
        # the next frame, so the frames exactly on the grid are the ones shown.
        return Timing(pre + kind, f"{head},setpts=PTS+{GRID_SLACK_S}/TB,fps={FPS}", "", span, n,
                      "tempo" if tempo else "mute", s0 if tempo else 1.0)
    return Timing(pre + "interpolated", head, SLOWMO[method], span, max(2, int(round(span * fps_src))), "mute")


# ------------------------------------------------------------------ one segment


def _segment_settings(cfg: Config, draft: bool) -> dict:
    st = _settings(cfg)
    name = _intermediate(cfg, draft)
    return {"work_scale": st["work_scale"], "vfov": st["vfov"], "lens_fov": st["lens_fov"],
            "autolevels": st["autolevels"], "hwaccel": st["hwaccel"], "inter": [name, *INTERMEDIATES[name][1]],
            "slowmo": SLOWMO.get(st["slowmo"], st["slowmo"]), "denoise": st["denoise"], "real_fps": REAL_FRAMES_FPS}


def segment_key(shot: Shot, src: SegmentSource, cfg: Config, *, draft: bool = False) -> str:
    """Cache key of a segment: a hash of everything its pictures and stem depend on - the shot's
    render fields (not its asset id or transition; a still ignores start and speed), the source
    file (path, size, mtime; for a photo the file the still was cut from), what prepare_sources
    measured (size, focus, levels, projection, frame rate, sound, denoise), draft, the intermediate
    and its encoder settings, and RENDER_VERSION."""
    c = _draft_cfg(cfg) if draft else cfg
    still = src.kind in STILL_KINDS
    drop = {"asset_id", "transition"} | ({"start_s", "speed", "speed_to"} if still else set())
    fields = shot.model_dump(mode="json", exclude=drop)
    s = {"kind": src.kind, "width": src.width, "height": src.height, "duration": round(src.duration, 4),
         "video_streams": src.video_streams, "projection": src.projection, "lens_fov": src.lens_fov,
         "focus": src.focus, "focus_to": src.focus_to,
         "levels": dataclasses.asdict(src.levels) if src.levels else None,
         "audio": src.audio, "fps": round(src.fps, 4), "denoise": src.denoise,
         "path": "" if src.origin else src.path}
    blob = {"v": RENDER_VERSION, "shot": fields, "src": s, "file": _file_id(src.origin or src.path),
            "draft": bool(draft), "settings": _segment_settings(c, draft)}
    return hashlib.sha256(json.dumps(blob, sort_keys=True, default=str).encode()).hexdigest()[:32]


def build_segment_args(shot: Shot, src: SegmentSource, out: str | Path, cfg: Config, *, draft: bool = False,
                       threads: int = 0) -> list[str]:
    """The ffmpeg command line for one segment (pure): exactly frames_for(shot.duration_s) frames
    of the shot alone, 1080x1920 30 fps BT.709 tv-range, in the intermediate, with its natural
    sound (or silence) as a 48 kHz stereo PCM stem of exactly the same length."""
    c = _draft_cfg(cfg) if draft else cfg
    st = _settings(c)
    n = frames_for(shot.duration_s)
    d = n / FPS
    tm = _timing(shot, src, c, n)
    video = src.kind not in STILL_KINDS
    t = ["-threads", str(threads)] if threads else []
    args = [c.ffmpeg, "-hide_banner", "-nostdin", "-v", "error", "-y"]
    inp = _input_args(src, shot)
    args += [*t, *inp]
    if threads:
        args += ["-filter_complex_threads", str(threads)]
    chain = _geometry(src, shot, _input_label(src, 0), tm.geo_frames if video else n, c,
                      time=tm.time if video else None)
    if video and src.denoise and st["denoise"]:
        chain += "," + st["denoise"]
    if tm.post:
        chain += "," + tm.post
    chain += "," + _to_out(src.levels, n) + "[vout]"
    if _has_sound(src) and tm.audio != "mute":
        tempo = f",atempo={tm.tempo:.6g}" if tm.audio == "tempo" else ""
        sound = (f"[0:a:0]asetpts=PTS-STARTPTS,aresample={STEM_RATE},{AFMT}{tempo},atrim=duration={d:.6f},"
                 f"apad=whole_dur={d:.6f},atrim=duration={d:.6f}[aout]")
    else:
        sound = f"anullsrc=r={STEM_RATE}:cl=stereo,{AFMT},atrim=duration={d:.6f}[aout]"
    enc = INTERMEDIATES[_intermediate(c, draft)][1]
    return args + ["-filter_complex", chain + ";" + sound, "-map", "[vout]", *enc, *t,
                   "-r", str(FPS), "-fps_mode", "cfr", "-frames:v", str(n),
                   "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
                   "-map", "[aout]", "-c:a", "pcm_s16le", "-ar", str(STEM_RATE), "-ac", "2", "-f", "mov", str(out)]


def _segment_dir(cfg: Config) -> Path:
    return cfg.state_dir / "segments"


def render_segment(shot: Shot, src: SegmentSource, cfg: Config, out: str | Path | None = None, *,
                   draft: bool = False, threads: int = 0) -> Path:
    """One shot (src from prepare_sources) -> its segment file (see build_segment_args), cached at
    cfg.state_dir/segments/<segment_key>.mov: a second call with the same inputs is a cache hit.
    It is written under a temporary name in that folder and renamed, so parallel calls are safe.
    out: also put it there (a hard link) and return that path."""
    key = segment_key(shot, src, cfg, draft=draft)
    cache = _segment_dir(cfg)
    path = cache / f"{key}.mov"
    if path.exists():
        _touch(path)
    else:
        cache.mkdir(parents=True, exist_ok=True)
        tmp = cache / f".{key}.{uuid.uuid4().hex[:8]}.mov"
        try:
            _run(build_segment_args(shot, src, tmp, cfg, draft=draft, threads=threads), timeout=3600)
            got, want = _seg_info(tmp, cfg).frames, frames_for(shot.duration_s)
            if got != want:
                raise RuntimeError(f"segment of {shot.asset_id} has {got} frames, expected {want}")
            os.replace(tmp, path)
        finally:
            tmp.unlink(missing_ok=True)
    return _place(path, out) if out is not None else path


def _meta_key(shot: Shot, entry: dict, cfg: Config) -> str:
    """Key of what prepare_sources finds for a shot (its SegmentSource): the source file and entry,
    the shot's fields and the settings preparing depends on."""
    st = _settings(cfg)
    blob = {"v": RENDER_VERSION, "entry": {k: str(v) for k, v in entry.items() if k != "path"},
            "file": _file_id(entry["path"]), "shot": shot.model_dump(mode="json", exclude={"asset_id", "transition"}),
            "settings": [st["work_scale"], st["autolevels"], st["lens_fov"], st["vfov"], st["hwaccel"]]}
    return hashlib.sha256(json.dumps(blob, sort_keys=True, default=str).encode()).hexdigest()[:32]


def _load_meta(path: Path) -> SegmentSource | None:
    try:
        d = json.loads(path.read_text())
        d["levels"] = Levels(**d["levels"]) if d.get("levels") else None
        d["focus"] = tuple(d["focus"])
        d["focus_to"] = tuple(d["focus_to"]) if d.get("focus_to") else None
        return SegmentSource(**d)
    except (OSError, ValueError, TypeError, KeyError):
        return None


def _save_meta(path: Path, src: SegmentSource) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{uuid.uuid4().hex[:8]}")
    tmp.write_text(json.dumps(dataclasses.asdict(src)))
    os.replace(tmp, path)


def _sources_for(plan: ReelPlan, sources: dict[str, dict], cfg: Config, draft: bool, workdir: Path
                 ) -> list[SegmentSource]:
    """prepare_sources, skipped for shots whose segment is already cached: what prepare_sources found
    for them last time is kept next to the segments (segments/meta/<key>.json), so a revision cuts
    stills and measures levels only for the shots it changed."""
    meta = _segment_dir(cfg) / "meta"
    srcs: list[SegmentSource | None] = [None] * len(plan.shots)
    need, keys = [], {}
    for i, shot in enumerate(plan.shots):
        entry = sources.get(shot.asset_id)
        if not entry or not entry.get("path"):
            raise KeyError(f"no source for asset {shot.asset_id}")
        keys[i] = _meta_key(shot, entry, cfg)
        src = _load_meta(meta / f"{keys[i]}.json")
        if src is not None and (_segment_dir(cfg) / f"{segment_key(shot, src, cfg, draft=draft)}.mov").exists():
            srcs[i] = src
            _touch(meta / f"{keys[i]}.json")
        else:
            need.append(i)
    if need:
        sub = plan.model_copy(update={"shots": [plan.shots[i] for i in need]})
        for i, src in zip(need, prepare_sources(sub, sources, workdir, cfg)):
            srcs[i] = src
            _save_meta(meta / f"{keys[i]}.json", src)
    return srcs  # type: ignore[return-value]


def _render_segments(plan: ReelPlan, sources: dict[str, dict], cfg: Config, draft: bool, workdir: Path
                     ) -> tuple[list[Path], list[SegmentSource], dict]:
    c = _draft_cfg(cfg) if draft else cfg
    t0 = time.monotonic()
    srcs = _sources_for(plan, sources, c, draft, workdir)
    t1 = time.monotonic()
    keys = [segment_key(s, src, c, draft=draft) for s, src in zip(plan.shots, srcs)]
    todo = len({k for k in keys if not (_segment_dir(c) / f"{k}.mov").exists()})
    workers = _workers(c, max(1, todo))
    threads = _threads(c, workers)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        paths = list(pool.map(lambda a: render_segment(a[0], a[1], c, draft=draft, threads=threads),
                              zip(plan.shots, srcs)))
    stats = {"prepare_s": round(t1 - t0, 2), "segments_s": round(time.monotonic() - t1, 2),
             "segments": len(paths), "rendered": todo, "workers": workers, "threads": threads}
    return paths, srcs, stats


def render_segments(plan: ReelPlan, sources: dict[str, dict], cfg: Config, *, draft: bool = False) -> list[Path]:
    """Every shot of the plan as a segment (render_segment), in parallel (cfg.extra reel_workers,
    default one per core; reel_threads per ffmpeg, default ~1.5x cores / workers), cached. One
    path per plan shot, in order (the plan is not trimmed to its cap here). Callers measure the
    cuts on these (direction.reel_features) before choosing transitions; render_reel then finds
    them in the cache."""
    workdir = Path(tempfile.mkdtemp(prefix="igmp-seg-"))
    try:
        return _render_segments(plan, sources, cfg, draft, workdir)[0]
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


# --------------------------------------------------------------------------- transitions


# default lengths in frames (even, so a transition sits centred on its cut); plan names and aitx kinds
TRANSITION_FRAMES: dict[str, int] = {
    "cut": 0, "whip-left": 8, "whip-right": 8, "zoom-in": 10, "crossfade": 16, "dip-black": 18, "wipe": 28,
    "flash": 10, "morph": 16, "zoom-through": 14, "ramp-cut": 18,
    "whip": 8, "zoom_through": 14, "speed_ramp_cut": 18, "match_dissolve": 16, "luma_dip": 18,
    "depth_parallax_through": 20, "generative": 24,
}
PLAN_TO_AITX = {"morph": "morph", "zoom-through": "zoom_through", "flash": "flash", "ramp-cut": "speed_ramp_cut"}
# the renderer's own transitions: name -> (xfade transition, easing, motion-blur axis)
BUILTIN: dict[str, tuple[str, str, str | None]] = {
    "crossfade": ("fade", "smooth", None),
    "whip-left": ("slideleft", "cubic", "h"),       # the picture slides left (the camera swings right)
    "whip-right": ("slideright", "cubic", "h"),
    "whip-up": ("slideup", "cubic", "v"),
    "whip-down": ("slidedown", "cubic", "v"),
    "zoom-in": ("zoomin", "smooth", None),
    "dip-black": ("fade", "smooth", None),            # + fades through black (DIP): xfade's fadeblack never gets there
    "wipe": ("wipeleft", "smooth", None),           # before/after: the edit sweeps in from the right
    "flash-white": ("fadewhite", "smooth", None),
}
# what an aitx kind becomes when aitx can't render it at full quality here ("cut": no clip)
AITX_STAND_IN = {"morph": "crossfade", "match_dissolve": "crossfade", "zoom_through": "zoom-in",
                 "depth_parallax_through": "zoom-in", "generative": "zoom-in", "luma_dip": "dip-black",
                 "flash": "flash-white", "speed_ramp_cut": "cut"}
# built-ins that dip through a colour: A fades to it by the cut and B out of it, under a dissolve,
# so the cut itself sits at (nearly) that colour
DIP: dict[str, str] = {"dip-black": "black"}
WHIP_STAND_IN = {"right": "whip-left", "left": "whip-right", "up": "whip-down", "down": "whip-up"}
EASE = {"smooth": "X*X*(3-2*X)", "cubic": "if(lt(X,0.5),4*X*X*X,1-pow(2-2*X,3)/2)"}
WHIP_BLUR = 0.15        # motion blur sigma per pixel moved per frame (a 180 degree shutter's box ~ 0.144)
AUDIO_FADE_S = 0.015    # at the cut inside a transition's sound stem (as aitx)


def _ease(name: str, p: float) -> float:
    p = min(max(p, 0.0), 1.0)
    if name == "cubic":
        return 4 * p ** 3 if p < 0.5 else 1 - (2 - 2 * p) ** 3 / 2
    return p * p * (3 - 2 * p)


@dataclass(frozen=True)
class TSpec:
    """A transition as the renderer handles it: kind (a BUILTIN name, an aitx kind, or "cut"),
    frames (even; 0 for a cut) and the spec as a dict (aitx.as_spec takes it)."""
    kind: str
    frames: int
    data: dict = field(default_factory=dict)

    @property
    def halves(self) -> tuple[int, int]:
        return self.frames // 2, self.frames - self.frames // 2

    def direction(self) -> str | None:
        return self.data.get("direction") or (self.data.get("params") or {}).get("direction")


def as_tspec(spec) -> TSpec:
    """Any transition description -> TSpec: a TSpec (as it is), an aitx Transition / TransitionSpec, a dict, any object
    with .kind and .duration_s (and .params), a plain kind name, or None (a cut). Plan names map to
    aitx kinds (morph, zoom-through -> zoom_through, flash, ramp-cut -> speed_ramp_cut); the rest of
    the plan's names are built-ins. A missing duration takes TRANSITION_FRAMES; frames are rounded
    to even."""
    from . import aitx
    if isinstance(spec, TSpec):         # already fitted/normalised (its .direction is a method, not data)
        return spec
    if spec is None:
        return TSpec("cut", 0, {"kind": "cut"})
    if isinstance(spec, str):
        d: dict = {"kind": spec}
    elif isinstance(spec, dict):
        d = dict(spec)
    elif isinstance(spec, aitx.TransitionSpec):
        d = spec.model_dump(mode="json")
    else:
        d = {k: getattr(spec, k) for k in ("kind", "duration_s", "reason", "params", *aitx.PARAM_KEYS)
             if hasattr(spec, k)}
        if hasattr(d.get("params"), "model_dump"):
            d["params"] = d["params"].model_dump()
    raw = d.get("kind") or "cut"
    raw = str(getattr(raw, "value", raw)).strip().lower()
    kind = "cut" if raw in ("cut", "none") else PLAN_TO_AITX.get(raw, raw)
    if kind not in BUILTIN and kind.replace("-", "_") in aitx.KINDS:
        kind = kind.replace("-", "_")
    if kind not in BUILTIN and kind not in aitx.KINDS:
        raise ValueError(f"unknown transition kind {raw!r}")
    d["kind"] = kind
    if kind == "cut":
        return TSpec("cut", 0, {**d, "duration_s": 0.0})
    dur = float(d.get("duration_s") or 0.0)
    n = int(round(dur * FPS)) if dur > 0 else TRANSITION_FRAMES.get(raw, TRANSITION_FRAMES.get(kind, 16))
    n = max(2, 2 * int(math.floor(n / 2 + 0.5)))         # even, halves rounded up
    d["duration_s"] = n / FPS
    return TSpec(kind, n, d)


def fit_transitions(frames: list[int], specs: list) -> list[TSpec]:
    """Shorten transitions that would eat a whole segment, as aitx.fit_specs: every segment keeps at
    least one frame of its own and the counts stay even; one that cannot fit becomes a cut."""
    out = [as_tspec(s) for s in specs]
    for i, s in enumerate(out):
        if s.kind == "cut":
            continue
        ha, hb = s.halves
        room_a = frames[i] - 1 - (out[i - 1].halves[1] if i > 0 else 0)
        room_b = frames[i + 1] - 1
        k = min(ha, max(0, room_a)), min(hb, max(0, room_b))
        if k != (ha, hb):
            m = min(k)
            if m < 1:
                log.warning("transition %d (%s) does not fit its segments; cutting", i, s.kind)
                out[i] = TSpec("cut", 0, {**s.data, "kind": "cut", "duration_s": 0.0})
            else:
                log.warning("transition %d (%s) shortened to %d frames to fit", i, s.kind, 2 * m)
                out[i] = TSpec(s.kind, 2 * m, {**s.data, "duration_s": 2 * m / FPS})
    return out


def plan_transitions(plan: ReelPlan) -> list:
    """One aitx.Transition per cut, from Shot.transition of the arriving shot, at TRANSITION_FRAMES:
    morph, zoom-through, flash and ramp-cut as aitx kinds (morph, zoom_through, flash,
    speed_ramp_cut); cut, crossfade, whip-left/-right, zoom-in, dip-black and wipe as the
    renderer's built-ins."""
    from . import aitx
    out = []
    for shot in plan.shots[1:]:
        name = shot.transition
        if name == "cut":
            out.append(aitx.Transition(kind="cut", duration_s=0.0, reason="plan"))
        else:
            out.append(aitx.Transition(kind=PLAN_TO_AITX.get(name, name),
                                       duration_s=TRANSITION_FRAMES[name] / FPS, reason="plan"))
    return out


def _whip_sigmas(n: int, ease: str, size: int) -> list[float]:
    """Motion-blur sigma per frame of an eased slide over `size` pixels: WHIP_BLUR times the
    distance moved around that frame; none on the first and last frames (A and B exactly)."""
    out = []
    for i in range(n):
        if i in (0, n - 1):
            out.append(0.0)
            continue
        v = size * (_ease(ease, (i + 0.5) / (n - 1)) - _ease(ease, (i - 0.5) / (n - 1)))
        out.append(round(min(150.0, WHIP_BLUR * v), 3))
    return out


def build_transition_args(a_seg: str | Path, b_seg: str | Path, kind: str, n: int, a_frames: int, out: str | Path,
                          cfg: Config, *, family: str = "prores", audio: tuple[bool, bool] = (True, True),
                          threads: int = 0) -> list[str]:
    """ffmpeg command line for a built-in transition clip (pure). A' = A's last ha frames, then
    its last frame held hb frames; B' = B's first frame held ha frames, then its first hb frames
    (ha = n//2, hb = n - ha). Both are retimed by the easing (setpts: frame i at
    (n-1)/30 * ease(i/(n-1))) and crossed with xfade over (n-1)/30 s from offset 0, so frame 0 is
    A at the trim point, frame n-1 is B just before it resumes, and the move eases in and out;
    then back to 30 fps CFR. Whips add a directional gblur whose sigma follows the speed of the
    slide (sendcmd per frame). Sound: A's audio under its last ha frames then B's under its first
    hb, 15 ms fades at the cut; silence for a side without a stem."""
    xf, ease, axis = BUILTIN[kind]
    ha, hb = n // 2, n - n // 2
    dur = (n - 1) / FPS
    e = EASE[ease].replace("X", f"(N/{n - 1})")
    t = ["-threads", str(threads)] if threads else []
    args = [cfg.ffmpeg, "-hide_banner", "-nostdin", "-v", "error", "-y",
            *t, "-ss", f"{(a_frames - ha - 0.5) / FPS:.6f}", "-i", str(a_seg),
            *t, "-t", f"{(hb + 2) / FPS:.6f}", "-i", str(b_seg)]
    fmt = "format=yuv422p10le" if family == "prores" else "format=yuv420p"
    warp = f"settb=1/{FPS * 1000},setpts='{dur:.9f}*{e}/TB'"
    blur = ""
    if axis:
        sig = _whip_sigmas(n, ease, OUT_W if axis == "h" else OUT_H)
        opt = "sigma" if axis == "h" else "sigmaV"
        cmds = ";".join(f"{max(0.0, (i - 0.5) / FPS):.6f} gblur@whip {opt} {s:g}" for i, s in enumerate(sig))
        blur = (f",sendcmd=c='{cmds}',gblur@whip=sigma=0:sigmaV=0:steps=3"
                f":enable='between(n,1,{n - 2})'")
    dip_a = dip_b = ""
    if kind in DIP:     # in eased time: A is gone by half way, B starts from there
        dip_a = f",fade=t=out:st=0:d={dur / 2:.9f}:color={DIP[kind]}"
        dip_b = f",fade=t=in:st={dur / 2:.9f}:d={dur / 2:.9f}:color={DIP[kind]}"
    graph = [f"[0:v:0]trim=end_frame={ha},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop={hb},{fmt},{warp}{dip_a}[ta]",
             f"[1:v:0]trim=end_frame={hb},setpts=PTS-STARTPTS,tpad=start_mode=clone:start={ha},{fmt},{warp}{dip_b}[tb]",
             f"[ta][tb]xfade=transition={xf}:duration={dur:.9f}:offset=0,settb=1/{FPS},setpts=N{blur},"
             f"setsar=1[vout]"]
    for j, (has, d, skip, fade) in enumerate([(audio[0], ha / FPS, 0.5 / FPS, "out"), (audio[1], hb / FPS, 0.0, "in")]):
        f = min(AUDIO_FADE_S, d / 4)
        fd = f"afade=t=out:st={d - f:.6f}:d={f:.4f}" if fade == "out" else f"afade=t=in:st=0:d={f:.4f}"
        if has:
            graph.append(f"[{j}:a:0]asetpts=PTS-STARTPTS,aresample={STEM_RATE},{AFMT},atrim=start={skip:.6f}:"
                         f"duration={d:.6f},asetpts=PTS-STARTPTS,apad=whole_dur={d:.6f},atrim=duration={d:.6f},"
                         f"{fd}[x{j}]")
        else:
            graph.append(f"anullsrc=r={STEM_RATE}:cl=stereo,{AFMT},atrim=duration={d:.6f}[x{j}]")
    graph.append("[x0][x1]concat=n=2:v=0:a=1[aout]")
    return args + ["-filter_complex", ";".join(graph), "-map", "[vout]", *_family_args(family, cfg), *t,
                   "-r", str(FPS), "-frames:v", str(n),
                   "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
                   "-map", "[aout]", "-c:a", "pcm_s16le", "-ar", str(STEM_RATE), "-ac", "2", "-f", "mov", str(out)]


def _builtin_transition(a_seg: str | Path, b_seg: str | Path, kind: str, n: int, cfg: Config,
                        ia: SegInfo, ib: SegInfo, threads: int = 0) -> Path:
    """A built-in transition clip, cached at cfg.state_dir/transitions/<hash>.mov (the hash of the
    kind, length, both segment files (path, size, mtime), the clip's encoder and RENDER_VERSION)."""
    ha, hb = n // 2, n - n // 2
    if ha > ia.frames - 1 or hb > ib.frames - 1:
        raise ValueError(f"{kind} of {n} frames needs {ha}+{hb}; the segments have {ia.frames} and {ib.frames}")
    family = "prores" if ia.codec == "prores" else "x264"
    blob = {"v": RENDER_VERSION, "kind": kind, "n": n, "a": _file_id(a_seg), "b": _file_id(b_seg),
            "fa": ia.frames, "enc": list(_family_args(family, cfg)), "fx": BUILTIN[kind], "dip": DIP.get(kind),
            "blur": WHIP_BLUR}
    key = hashlib.sha256(json.dumps(blob, sort_keys=True).encode()).hexdigest()[:32]
    cache = cfg.state_dir / "transitions"
    path = cache / f"{key}.mov"
    if path.exists():
        _touch(path)
        return path
    cache.mkdir(parents=True, exist_ok=True)
    tmp = cache / f".{key}.{uuid.uuid4().hex[:8]}.mov"
    try:
        _run(build_transition_args(a_seg, b_seg, kind, n, ia.frames, tmp, cfg, family=family,
                                   audio=(ia.audio, ib.audio), threads=threads), timeout=600)
        got = _seg_info(tmp, cfg).frames
        if got != n:
            raise RuntimeError(f"{kind} transition has {got} frames, expected {n}")
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)
    return path


def _transition(a_seg: str | Path, b_seg: str | Path, ts: TSpec, cfg: Config, ia: SegInfo, ib: SegInfo,
                threads: int = 0) -> tuple[Path | None, str]:
    """(clip, how it was rendered) for a fitted spec: aitx when aitx.supports() it, else a built-in
    (aitx kinds through their stand-ins); (None, "cut") for a cut."""
    from . import aitx
    if ts.kind == "cut" or ts.frames == 0:
        return None, "cut"
    probe = {**ts.data, "kind": ts.kind, "duration_s": ts.frames / FPS}
    if aitx.supports(probe, cfg):      # never for the built-ins: aitx leaves those to the renderer
        path, _, _ = aitx.cached_transition(a_seg, b_seg, aitx.as_spec(probe), cfg)
        return path, f"aitx:{ts.kind}"
    kind = ts.kind
    if kind not in BUILTIN:
        kind = WHIP_STAND_IN.get(ts.direction() or "right", "whip-left") if kind == "whip" else \
            AITX_STAND_IN.get(kind, "crossfade")
        log.info("transition %s: aitx can't render it at full quality here; built-in %s instead", ts.kind, kind)
        if kind == "cut":
            return None, "cut"
    return _builtin_transition(a_seg, b_seg, kind, ts.frames, cfg, ia, ib, threads), kind


def render_transition(a_seg: str | Path, b_seg: str | Path, spec, out: str | Path | None, cfg: Config
                      ) -> Path | None:
    """The transition clip between segments A and B (aitx's contract: n = round(duration_s * 30)
    frames, rounded to even, standing in for A's last n//2 and B's first n - n//2 frames, in A's
    codec family, with a sound stem of the same length). spec: anything as_tspec takes - plan
    names, aitx kinds, aitx.Transition / TransitionSpec, dicts. When aitx.supports(spec) it is
    rendered (and cached) by aitx; otherwise by a built-in xfade transition
    (build_transition_args): crossfade, whip-left/-right, zoom-in, dip-black, wipe, and stand-ins
    for aitx kinds it can't render at full quality (morph / match_dissolve -> crossfade,
    zoom_through / depth_parallax_through / generative -> zoom-in, luma_dip -> dip-black, flash ->
    a white dip, whip -> a slide its way, speed_ramp_cut -> a cut). It is shortened to fit the
    segments (fit_transitions). None for a cut. Built-ins are cached under
    cfg.state_dir/transitions; out: also put the clip there (a hard link) and return that path."""
    ts = as_tspec(spec)
    if ts.kind == "cut":
        return None
    ia, ib = _seg_info(a_seg, cfg), _seg_info(b_seg, cfg)
    ts = fit_transitions([ia.frames, ib.frames], [ts])[0]
    path, _ = _transition(a_seg, b_seg, ts, cfg, ia, ib)
    if path is None or out is None:
        return path
    return _place(Path(path), out)


# --------------------------------------------------------------------------- the reel


@dataclass(frozen=True)
class Piece:
    """One input of the final assembly: `frames` frames of `path` from frame `first`. A segment
    piece carries its shot's index (shot); a transition clip carries A's (shot) and B's (shot_b)
    and `split`, the frames standing in for A (its first ha frames take A's natural-sound gain).
    fade_in / fade_out: 10 ms fades on the natural sound at a hard cut."""
    path: str
    first: int
    frames: int
    shot: int
    shot_b: int = -1
    split: int = 0
    fade_in: bool = False
    fade_out: bool = False


def timeline(paths: list[str | Path], frames: list[int], specs: list[TSpec], clips: list[str | Path | None]
             ) -> list[Piece]:
    """The pieces of the reel in order: each segment trimmed by the halves its neighbours'
    transitions took, each transition clip between them. Total frames = sum(frames)."""
    out = []
    for i, (p, f) in enumerate(zip(paths, frames)):
        before = specs[i - 1] if i > 0 else None
        after = specs[i] if i < len(specs) else None
        head = before.halves[1] if before is not None and before.kind != "cut" else 0
        tail = after.halves[0] if after is not None and after.kind != "cut" else 0
        out.append(Piece(str(p), head, f - head - tail, i, fade_in=head == 0, fade_out=tail == 0))
        if after is not None and after.kind != "cut":
            out.append(Piece(str(clips[i]), 0, after.frames, i, i + 1, split=after.halves[0]))
    return out


def _pieces_natural(pieces: list[Piece], gains: list[float | None]) -> str | None:
    """The natural-sound stem of the timeline (graph text, last chain open): every piece's stem
    trimmed exactly as its picture, at its shot's gain (a transition's: A's for its first `split`
    frames, B's after), 10 ms fades at hard cuts; None when no shot has sound."""
    if all(g is None for g in gains):
        return None
    parts, labels = [], []

    def vol(g: float | None) -> str:
        return "volume=0" if g is None else f"volume={g:.2f}dB"
    for k, p in enumerate(pieces):
        d = p.frames / FPS
        if p.shot_b < 0:
            g = gains[p.shot]
            if g is None:
                parts.append(f"anullsrc=r={STEM_RATE}:cl=stereo,{AFMT},atrim=duration={d:.6f}[na{k}]")
            else:
                f = min(0.01, d / 4)
                fades = (f",afade=t=in:st=0:d={f:g}" if p.fade_in else "") + \
                        (f",afade=t=out:st={d - f:.6f}:d={f:g}" if p.fade_out else "")
                parts.append(f"[{k}:a:0]atrim=start={p.first / FPS:.6f}:duration={d:.6f},asetpts=PTS-STARTPTS,"
                             f"aresample={STEM_RATE},{AFMT},apad=whole_dur={d:.6f},atrim=duration={d:.6f}"
                             f"{fades},{vol(g)}[na{k}]")
            labels.append(f"[na{k}]")
            continue
        ga, gb = gains[p.shot], gains[p.shot_b]
        if ga is None and gb is None:
            parts.append(f"anullsrc=r={STEM_RATE}:cl=stereo,{AFMT},atrim=duration={d:.6f}[na{k}]")
            labels.append(f"[na{k}]")
            continue
        da = p.split / FPS
        parts.append(f"[{k}:a:0]asetpts=PTS-STARTPTS,aresample={STEM_RATE},{AFMT},apad=whole_dur={d:.6f},"
                     f"atrim=duration={d:.6f},asplit=2[nx{k}][ny{k}]")
        parts.append(f"[nx{k}]atrim=end={da:.6f},{vol(ga)}[na{k}a]")
        parts.append(f"[ny{k}]atrim=start={da:.6f},asetpts=PTS-STARTPTS,{vol(gb)}[na{k}b]")
        labels += [f"[na{k}a]", f"[na{k}b]"]
    return ";".join(parts) + ";" + "".join(labels) + f"concat=n={len(labels)}:v=0:a=1"


def _timeline_sound(pieces: list[Piece], gains: list[float | None], audio: AudioMix, music_input: int,
                    stage: str) -> str:
    seconds = sum(p.frames for p in pieces) / FPS
    natural = _pieces_natural(pieces, gains)
    if stage == "stems":
        mono = f"aformat=sample_fmts=flt:channel_layouts=mono,aresample={MEASURE_SR}"
        out = [_music_chain(music_input, seconds) + f",{mono}[mus]"]
        if natural is not None:
            out.append(natural + f",{mono}[nat]")
        return ";".join(out)
    return _mix_graph(natural, music_input, seconds, audio, stage)


def build_sound_args(pieces: list[Piece], gains: list[float | None], audio: AudioMix, cfg: Config, stage: str,
                     outputs: dict[str, str] | None = None) -> list[str]:
    """Audio-only passes over a timeline (pure; video is not decoded): "stems" (the music window
    and the natural stem as mono 16 kHz float, outputs {"mus", "nat"}), "measure" (the mix into
    ebur128), "final" (the mix as the reel will carry it, AAC 256k, outputs {"aac": path})."""
    seconds = sum(p.frames for p in pieces) / FPS
    args = [cfg.ffmpeg, "-hide_banner", "-nostdin", "-nostats", "-y"]
    for p in pieces:
        args += ["-vn", "-i", p.path]
    args += _music_input(audio, seconds)
    graph = _timeline_sound(pieces, gains, audio, len(pieces), stage)
    outputs = outputs or {}
    if stage == "stems":
        args += ["-filter_complex", graph, "-map", "[mus]", "-f", "f32le", outputs.get("mus", "music.f32")]
        if "[nat]" in graph:
            args += ["-map", "[nat]", "-f", "f32le", outputs.get("nat", "natural.f32")]
        return args
    args += ["-filter_complex", graph, "-map", "[aout]"]
    if stage == "measure":
        return args + ["-f", "null", "-"]
    return args + ["-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2", "-t", f"{seconds:.3f}",
                   "-f", "mp4", outputs.get("aac", "sound.m4a")]


def _final_video_args(cfg: Config, draft: bool) -> list[str]:
    st = _settings(cfg)
    if draft:
        if "h264_videotoolbox" in _encoders(cfg.ffmpeg):
            return ["-c:v", "h264_videotoolbox", "-profile:v", "high", "-b:v", "12M", "-maxrate", "20M",
                    "-bufsize", "40M", "-prio_speed", "1"]
        return ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-profile:v", "high"]
    if st["encoder"] == "videotoolbox":
        return ["-c:v", "h264_videotoolbox", "-profile:v", "high", "-b:v", "18M", "-maxrate", "20M",
                "-bufsize", "40M"]
    return ["-c:v", "libx264", "-preset", str(st["preset"]), "-crf", str(st["crf"]), "-profile:v", "high",
            "-level:v", "4.2", "-maxrate", "20M", "-bufsize", "40M"]


def build_reel_args(pieces: list[Piece], gains: list[float | None], out: str | Path, cfg: Config,
                    audio: AudioMix | None = None, *, draft: bool = False, threads: int = 2) -> list[str]:
    """The final ffmpeg (pure): the pieces trimmed and concatenated, one encode. Sound: none ->
    a silent stereo AAC 128k track; with `audio` the mix over the timeline (_mix_graph), AAC 256k.
    Video: libx264 High CRF (reel_crf, 18) capped at 20 Mb/s (h264_videotoolbox ~18 Mb/s when
    reel_encoder = "videotoolbox"; a quick h264_videotoolbox encode for a draft), 30 fps CFR, GOP
    60, BT.709 tags, +faststart, exactly the pieces' frames."""
    total = sum(p.frames for p in pieces)
    seconds = total / FPS
    args = [cfg.ffmpeg, "-hide_banner", "-nostdin", "-v", "error", "-y"]
    chains, labels = [], []
    for k, p in enumerate(pieces):
        args += ["-threads", str(threads), "-i", p.path]
        chains.append(f"[{k}:v:0]trim=start_frame={p.first}:end_frame={p.first + p.frames},setpts=PTS-STARTPTS,"
                      f"format=yuv420p[v{k}]")
        labels.append(f"[v{k}]")
    graph = ";".join(chains) + ";" + "".join(labels) + f"concat=n={len(pieces)}:v=1:a=0[vout]"
    if audio is None:
        args += ["-f", "lavfi", "-t", f"{seconds:.3f}", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]
        args += ["-filter_complex", graph, "-map", "[vout]", "-map", f"{len(pieces)}:a"]
        abitrate = "128k"
    else:
        args += _music_input(audio, seconds)
        graph += ";" + _timeline_sound(pieces, gains, audio, len(pieces), "final")
        args += ["-filter_complex", graph, "-map", "[vout]", "-map", "[aout]"]
        abitrate = "256k"
    return args + [*_final_video_args(cfg, draft), "-pix_fmt", "yuv420p", "-r", str(FPS), "-fps_mode", "cfr",
                   "-g", str(2 * FPS), "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709",
                   "-color_trc", "bt709", "-c:a", "aac", "-b:a", abitrate, "-ar", "48000", "-ac", "2",
                   "-frames:v", str(total), "-t", f"{seconds:.3f}", "-movflags", "+faststart", "-f", "mp4",
                   str(out)]


def _measure_timeline(pieces: list[Piece], seg_pieces: list[Piece], has_sound: list[bool], audio: AudioMix,
                      cfg: Config, workdir: Path) -> AudioMix:
    """measure_audio over the timeline: each shot's steady level from its whole segment stem, the
    music window's level, then the make-up gain with the mix measured as it will render."""
    outs = {"mus": str(workdir / "music.f32"), "nat": str(workdir / "natural.f32")}
    stem_gains = [0.0 if (audio.natural and h) else None for h in has_sound]
    _run(build_sound_args(seg_pieces, stem_gains, audio, cfg, "stems", outs), timeout=900)
    audio.music_db = round(_mean_db(np.fromfile(outs["mus"], np.float32), MEASURE_SR), 2)
    if audio.natural and Path(outs["nat"]).exists():
        audio.natural_beds = steady_levels(np.fromfile(outs["nat"], np.float32), MEASURE_SR,
                                           [p.frames / FPS for p in seg_pieces])
    else:
        audio.natural_beds = [None] * len(seg_pieces)

    def loudness() -> tuple[float, float]:
        err = _run(build_sound_args(pieces, _gains(audio, has_sound), audio, cfg, "measure"), timeout=900).stderr
        return parse_ebur128(err.decode(errors="replace"))
    return _fit_gain(audio, loudness)


def _gains(audio: AudioMix, has_sound: list[bool]) -> list[float | None]:
    """Per shot natural-sound gain (dB) for the timeline: AudioMix.natural_gains on stand-in
    sources (a slowed or ramped clip is muted: no sound)."""
    return audio.natural_gains([SegmentSource("video" if h else "photo", "", audio=h) for h in has_sound])


def _specs_for(plan: ReelPlan, transitions) -> list:
    cuts = len(plan.shots) - 1
    if transitions is None:
        return plan_transitions(plan)
    specs = list(transitions)
    if len(specs) > cuts:
        specs = specs[:cuts]
    elif len(specs) < cuts:
        log.warning("%d transitions for %d cuts; the rest are cuts", len(specs), cuts)
        specs += [None] * (cuts - len(specs))
    return specs


def render_reel(plan: ReelPlan, sources: dict[str, dict], out_path: str | Path, cfg: Config, *,
                music: str | Path | None = None, draft: bool = False, transitions=None) -> Path:
    """Render the plan to out_path (MP4) through cached segments. sources[asset_id] = {"kind": ...,
    "path": ...}; optional keys: for 360 "projection" ("dfisheye" | "equirect") and "lens_fov"
    (degrees), for video "denoise" (true: night/astro footage). For photos pass the
    full-resolution edit (rawedit.render_raw(...)["full"]) or the camera JPG.
    music: the audio file of plan.music.track_id; with plan.music set, the reel gets the mixed
    sound described in the module docstring, else a silent track.
    transitions: one per cut (aitx.Transition / TransitionSpec / dict / a kind name; aitx kinds or
    built-ins), None = plan_transitions(plan). draft: draft segments (work scale 1, a faster
    intermediate) and a quick hardware final encode - for the critic; shipped reels are final.

    The plan is trimmed to cfg.reel_cap(plan.length_class); segments are rendered (or found in
    the cache) in parallel, transitions in parallel, then one ffmpeg assembles and encodes. Temp
    files live in a private directory and the reel is written under a unique name and renamed
    into place, so parallel calls are safe."""
    out_path = Path(out_path)
    shots = fit_shots(plan.shots, cfg.reel_cap(plan.length_class))
    if not shots:
        raise ValueError("plan has no usable shots")
    if len(shots) != len(plan.shots) or any(a is not b for a, b in zip(shots, plan.shots)):
        log.warning("plan %s trimmed to %.2f s", plan.event_key, cfg.reel_cap(plan.length_class))
    specs = _specs_for(plan.model_copy(update={"shots": shots}), transitions)
    plan = plan.model_copy(update={"shots": shots})
    out_path.parent.mkdir(parents=True, exist_ok=True)
    workdir = Path(tempfile.mkdtemp(prefix="igmp-reel-"))
    tmp_out = out_path.with_name(f".{out_path.stem}.{uuid.uuid4().hex[:8]}.mp4")
    c = _draft_cfg(cfg) if draft else cfg
    t_start = time.monotonic()
    try:
        _prune_cache(cfg)
        segs, srcs, stats = _render_segments(plan, sources, cfg, draft, workdir)
        frames = [frames_for(s.duration_s) for s in shots]
        fitted = fit_transitions(frames, specs)
        codec = "prores" if INTERMEDIATES[_intermediate(c, draft)][0] == "prores" else "h264"
        infos = [SegInfo(n, codec, True) for n in frames]      # what render_segment wrote

        def job(i: int) -> tuple[Path | None, str]:
            ts = fitted[i]
            ia, ib = infos[i], infos[i + 1]
            try:
                return _transition(segs[i], segs[i + 1], ts, c, ia, ib, threads=2)
            except Exception as e:                      # a failed transition never sinks the reel
                log.warning("transition %d (%s) failed: %s; trying the built-in stand-in", i, ts.kind, e)
                kind = ts.kind if ts.kind in BUILTIN else (
                    WHIP_STAND_IN.get(ts.direction() or "right") if ts.kind == "whip" else AITX_STAND_IN.get(ts.kind))
                if kind and kind != "cut":
                    try:
                        return _builtin_transition(segs[i], segs[i + 1], kind, ts.frames, c, ia, ib, 2), kind
                    except Exception as e2:
                        log.warning("transition %d built-in %s failed too: %s; cutting", i, kind, e2)
                return None, "cut"

        t1 = time.monotonic()
        todo = [i for i, ts in enumerate(fitted) if ts.kind != "cut"]
        clips: list[Path | None] = [None] * len(fitted)
        how: dict[int, str] = {}
        if todo:
            with ThreadPoolExecutor(max_workers=_workers(c, len(todo))) as pool:
                for i, (clip, kind) in zip(todo, pool.map(job, todo)):
                    clips[i], how[i] = clip, kind
        fitted = [ts if clips[i] is not None or ts.kind == "cut" else TSpec("cut", 0, {"kind": "cut"})
                  for i, ts in enumerate(fitted)]
        stats["transitions_s"] = round(time.monotonic() - t1, 2)
        stats["transitions"] = {i: how[i] for i in todo}
        pieces = timeline(segs, frames, fitted, clips)
        has_sound = [_has_sound(src) and _timing(s, src, c, n).audio != "mute"
                     for s, src, n in zip(shots, srcs, frames)]
        t2 = time.monotonic()
        audio, gains = None, [None] * len(shots)
        if music is not None and plan.music is not None:
            st = _settings(c)
            audio = AudioMix(str(music), plan.music.start_s, natural=st["natural_sound"],
                             natural_db=st["natural_sound_db"], lufs=st["lufs"], ceiling_db=st["peak_ceiling"])
            seg_pieces = [Piece(str(p), 0, n, i, fade_in=True, fade_out=True)
                          for i, (p, n) in enumerate(zip(segs, frames))]
            audio = _measure_timeline(pieces, seg_pieces, has_sound, audio, c, workdir)
            gains = _gains(audio, has_sound)
            # the AAC encoder can overshoot the limiter by a few tenths of a dB: encode the sound
            # alone (the final encode makes the same bits), check it, lower the ceiling if needed
            for _ in range(2):
                m4a = workdir / "sound.m4a"
                _run(build_sound_args(pieces, gains, audio, c, "final", {"aac": str(m4a)}), timeout=900)
                level, peak = _file_loudness(m4a, c)
                if peak <= MAX_TRUE_PEAK:
                    break
                log.warning("reel %s: true peak %.2f dBTP after encoding; lowering the ceiling", plan.event_key, peak)
                audio.ceiling_db -= peak - MAX_TRUE_PEAK + 0.2
        stats["sound_s"] = round(time.monotonic() - t2, 2)
        t3 = time.monotonic()
        args = build_reel_args(pieces, gains, tmp_out, c, audio, draft=draft)
        log.debug("ffmpeg %s", " ".join(args))
        _run(args, timeout=3600)
        if audio is not None:
            level, peak = _file_loudness(tmp_out, c)
            if peak > MAX_TRUE_PEAK:            # not expected after the check above
                log.warning("reel %s: true peak %.2f dBTP; re-rendering", plan.event_key, peak)
                audio.ceiling_db -= peak - MAX_TRUE_PEAK + 0.2
                _run(build_reel_args(pieces, gains, tmp_out, c, audio, draft=draft), timeout=3600)
                level, peak = _file_loudness(tmp_out, c)
            log.info("reel %s: sound %.1f LUFS, %.1f dBTP", plan.event_key, level, peak)
        stats["final_s"] = round(time.monotonic() - t3, 2)
        total = sum(frames)
        info = probe_media(tmp_out, c)
        got = _seg_info(tmp_out, c).frames
        if (info["width"], info["height"]) != (OUT_W, OUT_H) or got != total or \
                abs(info["duration"] - total / FPS) > 0.1:
            raise RuntimeError(f"unexpected reel: {info['width']}x{info['height']} {got} frames "
                               f"{info['duration']:.2f}s (expected {total})")
        os.replace(tmp_out, out_path)
        stats["total_s"] = round(time.monotonic() - t_start, 2)
        LAST_RENDER.clear()
        LAST_RENDER.update(stats)
        log.info("reel %s rendered%s: %s", plan.event_key, " (draft)" if draft else "", stats)
        return out_path
    finally:
        tmp_out.unlink(missing_ok=True)
        shutil.rmtree(workdir, ignore_errors=True)


LAST_RENDER: dict = {}      # timings of the last render_reel in this process (for logs and benchmarks)
_PRUNED: set[str] = set()


def _prune_cache(cfg: Config) -> None:
    """Once per process and state dir: delete cached segments and transitions not used for
    cfg.extra reel_cache_days (30) days (a hit refreshes a file's mtime), and temp files a crash
    left behind more than a day ago."""
    root = str(cfg.state_dir)
    if root in _PRUNED:
        return
    _PRUNED.add(root)
    days = float((cfg.extra or {}).get("reel_cache_days", 30))
    now = time.time()
    for sub in ("segments", "segments/meta", "transitions"):
        d = cfg.state_dir / sub
        if not d.is_dir():
            continue
        for f in d.iterdir():
            try:
                age = now - f.stat().st_mtime
                if f.is_file() and ((f.name.startswith(".") and age > 86400) or (days > 0 and age > days * 86400)):
                    f.unlink()
            except OSError:
                pass


# --------------------------------------------------------------------------- contact sheet


def _font(size: int):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:                                   # Pillow without FreeType
        return ImageFont.load_default()


def reel_contact_sheet(video_path: str | Path, cfg: Config, every_s: float = 0.5, cols: int = 6,
                       thumb_h: int = 300) -> Image.Image:
    """Frames every `every_s` seconds (from 0), in a grid `cols` wide, each labelled with its
    timestamp, so a critic can "watch" the reel in one image."""
    info = probe_media(video_path, cfg)
    if not info["width"]:
        raise ValueError(f"{video_path} has no video")
    tw = _even(thumb_h * info["width"] / info["height"])
    times = [round(k * every_s, 3) for k in range(int(info["duration"] / every_s + 1e-6) + 1)
             if k * every_s < info["duration"] - 1e-3] or [0.0]
    # select the first frame, then the first frame at least every_s after the last pick
    expr = f"isnan(prev_selected_t)+gte(t-prev_selected_t,{every_s - 0.5 / FPS:.4f})"
    out = _run([cfg.ffmpeg, "-hide_banner", "-nostdin", "-v", "error", "-i", str(video_path),
                "-vf", f"select='{expr}',scale={tw}:{thumb_h}:flags=area,format=rgb24",
                "-fps_mode", "passthrough", "-f", "rawvideo", "-"], timeout=600).stdout
    size = tw * thumb_h * 3
    frames = [np.frombuffer(out[i:i + size], np.uint8).reshape(thumb_h, tw, 3)
              for i in range(0, len(out) - size + 1, size)][: len(times)]
    times = times[: len(frames)]
    gap = 4
    rows = max(1, math.ceil(len(frames) / cols))
    sheet = Image.new("RGB", (cols * tw + (cols + 1) * gap, rows * thumb_h + (rows + 1) * gap), (24, 24, 24))
    draw = ImageDraw.Draw(sheet)
    font = _font(max(12, thumb_h // 14))
    for k, (t, fr) in enumerate(zip(times, frames)):
        x = gap + (k % cols) * (tw + gap)
        y = gap + (k // cols) * (thumb_h + gap)
        sheet.paste(Image.fromarray(fr), (x, y))
        text = f"{t:.1f}s"
        box = draw.textbbox((0, 0), text, font=font)
        draw.rectangle((x, y, x + box[2] + 8, y + box[3] + 6), fill=(0, 0, 0))
        draw.text((x + 4, y + 2), text, fill=(255, 255, 255), font=font)
    return sheet
