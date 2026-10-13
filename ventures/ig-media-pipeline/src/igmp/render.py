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

import json
import logging
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
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
    "fit_shots", "frames_for", "gentle_levels", "kenburns_window", "measure_audio", "parse_ebur128",
    "prepare_sources", "probe_media", "reel_contact_sheet", "render_reel", "steady_levels",
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
        z = f"({zf:.6f}*pow({zt / zf:.8f},in/{n_frames - 1}))"
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


def _to_out(levels: Levels | None, n: int) -> str:
    """Common tail of every segment: BT.709 limited yuv420p, levels, exactly n frames."""
    chain = "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p"
    if levels is not None:
        chain += "," + levels.lutyuv()
    return chain + f",tpad=stop_mode=clone:stop={n},trim=end_frame={n},setsar=1"


def _geometry(src: SegmentSource, shot: Shot, label: str, n: int, cfg: Config,
              out_w: int = OUT_W, out_h: int = OUT_H, *, animate: bool = True) -> str:
    """Spatial part of a segment: from input label(s) to an out_w x out_h picture."""
    st = _settings(cfg)
    if src.kind in ("photo", "photo360"):
        ws = out_w * st["work_scale"] / OUT_W
        ww, wh = _even(out_w * ws), _even(out_h * ws)
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
        return (f"{stack}setpts=PTS-STARTPTS,fps={FPS},"
                + _v360(src, yaw, st["vfov"], out_w, out_h, shot.zoom_from))

    # flat video: cover the frame, crop around the focus
    sw, sh = max(src.width, 2), max(src.height, 2)
    s = max(out_w / sw, out_h / sh) * max(1.0, shot.zoom_from)
    tw, th = _even(sw * s), _even(sh * s)
    x = int(round(min(max(shot.focus.x * tw - out_w / 2, 0), tw - out_w)))
    y = int(round(min(max(shot.focus.y * th - out_h / 2, 0), th - out_h)))
    return (f"{label}setpts=PTS-STARTPTS,fps={FPS},scale={tw}:{th}:flags=lanczos,"
            f"crop={out_w}:{out_h}:{x}:{y}")


def _start(src: SegmentSource, shot: Shot) -> float:
    start = float(shot.start_s)
    if src.duration > 0:
        start = min(start, max(0.0, src.duration - shot.duration_s))
    return max(0.0, start)


def _input_args(src: SegmentSource, shot: Shot) -> list[str]:
    if src.kind in ("photo", "photo360"):
        return ["-i", src.path]
    return [*src.extra_inputs, "-ss", f"{_start(src, shot):.3f}",
            "-t", f"{shot.duration_s + 1.0:.3f}", "-i", src.path]


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
    steady = audio.steady_db()
    chains = []
    if natural:
        chains.append(_natural_chain(plan, srcs, gains)
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
            "width": 0, "height": 0, "transfer": "", "audio": any(
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
        info.update(width=w, height=h, transfer=s.get("color_transfer", "") or "")
        if s.get("duration"):
            info["duration"] = float(s["duration"])
    return info


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
        mid = _start(src, shot) + shot.duration_s / 2
        if src.duration > 0:
            mid = min(mid, max(0.0, src.duration - 0.1))
        inputs = [*src.extra_inputs, "-ss", f"{mid:.3f}", "-i", src.path]
        geo = _geometry(src, shot, label, n, cfg, w, h)
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
            still, focus = prepare_still(path, (shot.focus.x, shot.focus.y),
                                         workdir / f"still_{i:02d}.ppm", work)
            src = SegmentSource(kind, str(still), *work, focus=focus)
        elif kind == "photo360":
            with Image.open(path) as im:
                w, h = im.size
            src = SegmentSource(kind, path, w, h,
                                projection=_projection(path, {"video_streams": 1}, entry.get("projection")),
                                lens_fov=float(entry.get("lens_fov", st["lens_fov"])))
        elif kind in ("video", "video360"):
            info = probe_media(path, cfg)
            if not info["video_streams"]:
                raise ValueError(f"{path} has no video stream")
            if info["transfer"] in HDR_TRANSFERS:
                log.warning("%s is HDR (%s); it is not tone mapped", path, info["transfer"])
            src = SegmentSource(kind, path, info["width"], info["height"], info["duration"],
                                video_streams=info["video_streams"] if kind == "video360" else 1,
                                extra_inputs=list(hw), audio=bool(info["audio"]))
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

    with ThreadPoolExecutor(max_workers=min(4, len(plan.shots)) or 1) as pool:
        return list(pool.map(lambda a: one(*a), enumerate(plan.shots)))


def render_reel(plan: ReelPlan, sources: dict[str, dict], out_path: str | Path, cfg: Config,
                music: str | Path | None = None) -> Path:
    """Render the plan to out_path (MP4). sources[asset_id] = {"kind": ..., "path": ...};
    optional keys for 360: "projection" ("dfisheye" | "equirect"), "lens_fov" (degrees).
    For photos pass the full-resolution edit (rawedit.render_raw(...)["full"]) or the camera
    JPG: a 9:16 cut of the 1080-wide feed export, zoomed, would be upscaled and soft.
    music: the audio file of plan.music.track_id; with plan.music set, the reel gets the mixed
    sound described in the module docstring, else a silent track.

    Shots past cfg.reel_seconds are trimmed. Temp files live in a private directory and the
    reel is written under a unique name and renamed into place, so parallel calls are safe."""
    out_path = Path(out_path)
    shots = fit_shots(plan.shots, cfg.reel_seconds)
    if not shots:
        raise ValueError("plan has no usable shots")
    if len(shots) != len(plan.shots) or any(a is not b for a, b in zip(shots, plan.shots)):
        log.warning("plan %s trimmed to %.2f s", plan.event_key, cfg.reel_seconds)
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
