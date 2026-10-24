"""Transitions between reel shots, AI and not, and the reference assembler that uses them.

How the renderer calls it
  render.py renders each shot as a segment file (1080x1920, 30 fps; ProRes, or all-intra x264
  `-crf 10 -g 1`; each with the shot's natural sound as a stem) and keeps its own xfade kinds
  (BUILTIN_KINDS: cut, crossfade, whip-left/right, zoom-in, dip-black). For a spec whose kind is in
  SUPPORTED and for which supports(spec, cfg) is True, it delegates to

    render_transition(a_seg, b_seg, spec, out, cfg)

  which writes ONLY the transition clip: n = round(duration_s * 30) frames standing in for the last
  n//2 frames of A and the first n - n//2 frames of B, in A's codec family (ProRes 422 HQ, else
  all-intra x264 crf 10), with a sound stem of exactly n frames (A's tail then B's head, 15 ms fades
  at the cut; silence where there is none). The cut point stays where it was, so the reel's length
  and its beat grid do not change. spec is duck-typed (as_spec): this module's TransitionSpec or
  Transition, the renderer's own pydantic spec, any object with .kind, .duration_s and an optional
  .params (dict or object) or the parameters as attributes, or a plain dict. The director
  (direction.py) returns the same wire shape: Transition(kind, duration_s, params, reason).

  join(segments, specs, out, cfg) is the reference assembler: transitions in a process pool, cached
  by a content hash of A's tail, B's head, the spec and the backend; segments trimmed by the halves
  their neighbours took; one concat and one final libx264 encode, with either a finished sound
  track (copied when AAC) or the pieces' natural-sound stems joined exactly as the pictures are.

  Segments carry no handles (no frames past the cut), so inside a transition the side that leaves
  plays to the cut point and then holds its last frame, and the side that arrives holds its first
  frame until the cut point and then plays. The first transition frame is A's frame at the trim
  point and the last is B's frame just before B resumes, so both joins are seamless.

Quality gating
  A kind is only rendered as itself when its real backend is here: morph and speed_ramp_cut need
  RIFE, depth_parallax_through needs Depth Anything, generative needs its pipeline (enabled,
  installed, downloaded). Otherwise render_transition renders a clean stand-in (effective_kind):
  morph -> match_dissolve, speed_ramp_cut -> a straight cut, depth_parallax_through ->
  zoom_through, generative -> depth_parallax_through -> zoom_through; supports() says False and the
  director never offers it. The weaker backends (ffmpeg minterpolate, the heuristic depth) are used
  only with allow_fallback in the spec's params or cfg.extra aitx_allow_fallback = true.

Kinds (TransitionSpec.kind)
  cut                     zero length: a straight cut on the beat (the default; most cuts).
  morph                   AI frame interpolation from A into B. RIFE (rife-ncnn-vulkan; Metal via
                          MoltenVK on a Mac) interpolates every frame pair (A playing, B playing) at
                          an eased time; without RIFE, ffmpeg minterpolate (mci, aobmc, bidir)
                          interpolates between A's frame at the trim point and B's last transition
                          frame, and a guard dissolves instead when its output falls apart. Works
                          when the two frames are similar (direction.py gates it on similarity).
  depth_parallax_through  AI depth (Depth Anything V2 Small through transformers; a horizon and
                          texture heuristic without it) turns A's frame at the trim point and B's
                          last frame into 2.5D scenes: A dollies in with near things moving more than
                          far ones, crossfades at the peak, and B dollies out to rest. The scene is
                          split into up to three depth planes at the strongest depth edges, each
                          plane is mesh-warped by its own (smooth) depth and its hidden parts are
                          filled by push-pull inpainting, so edges do not stretch.
  generative              Optional, off by default (cfg.extra aitx_generative = true): LTX-Video
                          (diffusers LTXConditionPipeline) generates the in-between frames
                          conditioned on A's frame at the trim point (frame 0) and B's last frame
                          (frame N-1), within a time budget; falls back to depth_parallax_through.
  whip                    A fast directional pan out of A into B: an eased (cubic) move along the
                          strip [A | B] with true motion blur (a box integral over the 360 degree
                          shutter interval) and a feathered seam. direction is the camera's.
  zoom_through            Push into A's subject point, cross at the peak, emerge from B's subject
                          point; geometric zoom with radial motion blur from the shutter interval.
  match_dissolve          A dissolve with both subjects locked together: the subject point travels
                          from A's to B's position and each side is framed (zoom only as much as
                          needed, never past the frame) to keep its subject on that path. Without
                          focus points the shift is measured by phase correlation.
  luma_dip                A luma-keyed dip through a soft gradient taken from the frames' own colours
                          (dark: shadows go first and B's highlights arrive first, as stars do; light:
                          the reverse). Never a black frame.
  flash                   A short warm light-leak (or white) flash in linear light with bloom; the cut
                          sits under its peak.
  speed_ramp_cut          A slows from 100% to about 40% into a straight cut (interpolated frames:
                          RIFE, else minterpolate); B is untouched.

Settings (cfg.extra, all optional)
  aitx_interpolator  "auto" (RIFE when found, else minterpolate) | "rife" | "minterpolate"
  aitx_rife          path to rife-ncnn-vulkan (default: PATH, ~/bin, ~/Applications, /opt/homebrew/bin)
  aitx_rife_model    "rife-v4.6" (a directory next to the binary, or a path)
  aitx_rife_gpu      None: auto (use this); -1: CPU (gave corrupted frames in a Linux build)
  aitx_depth         "auto" (Depth Anything when installed and downloaded, else heuristic)
                     | "depth-anything" | "heuristic" | "flat"
  aitx_depth_model   "depth-anything/Depth-Anything-V2-Small-hf"
  aitx_device        "auto" (mps, cuda, cpu) or a torch device string
  aitx_allow_downloads  False: models load from the local Hugging Face cache only
  aitx_allow_fallback   False: no minterpolate morphs or ramps, no heuristic-depth parallax (above)
  aitx_generative    False; aitx_generative_model ("Lightricks/LTX-Video-0.9.5"),
                     aitx_generative_steps (30), aitx_generative_budget_s (420),
                     aitx_generative_size ([576, 1024]), aitx_generative_max_frames (49)
  aitx_cache         transition cache directory (default <output_dir>/state/aitx-cache)
  aitx_workers       parallel transition renders (default min(4, CPUs))
  aitx_intermediate  "auto" (A's codec family) | "x264" | "prores"
  reel_encoder / reel_crf / reel_preset   the final encode, as render.py

Run `python -m igmp.aitx doctor` to see which backends are available, and
`python -m igmp.aitx demo OUT` to render every kind on synthetic footage with a contact sheet each.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import math
import os
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from dataclasses import dataclass, field
from fractions import Fraction
from pathlib import Path
from typing import Callable, Iterator, Literal

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel, Field

from .config import Config

log = logging.getLogger(__name__)

FPS = 30
OUT_W, OUT_H = 1080, 1920
AITX_VERSION = "2"

Kind = Literal["cut", "morph", "depth_parallax_through", "generative", "whip", "zoom_through",
               "match_dissolve", "luma_dip", "flash", "speed_ramp_cut"]
KINDS: tuple[str, ...] = ("cut", "morph", "depth_parallax_through", "generative", "whip", "zoom_through",
                          "match_dissolve", "luma_dip", "flash", "speed_ramp_cut")
AI_KINDS = frozenset({"morph", "depth_parallax_through", "generative"})
# what render.py hands to aitx (render_transition here renders every one of them)
SUPPORTED: frozenset[str] = frozenset({"morph", "depth_parallax_through", "generative", "whip", "zoom_through",
                                       "match_dissolve", "luma_dip", "flash", "speed_ramp_cut"})
# the renderer's own xfade-based kinds; the director may choose them too, and render_transition maps
# them onto the nearest aitx kind if it is ever handed one
BUILTIN_KINDS: frozenset[str] = frozenset({"cut", "crossfade", "whip-left", "whip-right", "zoom-in", "dip-black"})
ALIASES: dict[str, tuple[str, dict]] = {
    "none": ("cut", {}),
    "crossfade": ("match_dissolve", {"focus_a": (0.5, 0.5), "focus_b": (0.5, 0.5)}),   # no alignment
    # whip-left / whip-right name the way the picture slides (as xfade's slideleft does): the
    # content moves left, so the camera swings right
    "whip-left": ("whip", {"direction": "right"}),
    "whip-right": ("whip", {"direction": "left"}),
    "zoom-in": ("zoom_through", {}),
    "dip-black": ("luma_dip", {"color": "dark"}),
}
PARAM_KEYS = ("direction", "focus_a", "focus_b", "color", "strength", "prompt", "seed", "allow_fallback")
DEPTH_MODEL = "depth-anything/Depth-Anything-V2-Small-hf"
LTX_MODEL = "Lightricks/LTX-Video-0.9.5"

__all__ = [
    "AI_KINDS", "BUILTIN_KINDS", "KINDS", "SUPPORTED", "Transition", "TransitionSpec", "as_spec", "supports",
    "available_kinds", "Boundary", "SegInfo", "ClipWriter", "RifeInterpolator", "MinterpInterpolator",
    "parallax_scene", "parallax_frames", "parallax_still", "render_transition", "transition_key",
    "cached_transition", "join", "contact_sheet", "probe_segment", "read_frames", "backends_report",
]


# =========================================================================== spec


class TransitionSpec(BaseModel):
    """How to get from one segment to the next (the normalised form every renderer here takes). The
    clip covers the last n//2 frames of A and the first n - n//2 of B, n = round(duration_s * 30)."""
    kind: Kind = "cut"
    duration_s: float = Field(0.0, ge=0, le=3.0)
    direction: Literal["left", "right", "up", "down"] | None = Field(
        None, description="whip: the way the camera swings (content moves the other way)")
    focus_a: tuple[float, float] | None = Field(None, description="subject point in A, fractions of the frame")
    focus_b: tuple[float, float] | None = Field(None, description="subject point in B, fractions of the frame")
    color: Literal["dark", "light", "white", "warm"] | None = Field(
        None, description="luma_dip: dark (default) or light; flash: warm (default) or white")
    strength: float = Field(1.0, ge=0.1, le=2.0, description="effect intensity, 1 = the tuned default")
    prompt: str = Field("", description="generative: what the in-between should show")
    seed: int = 0
    allow_fallback: bool = Field(False, description="accept a visibly weaker backend (minterpolate, heuristic depth)")
    reason: str = Field("", description="why this transition (not part of the cache key)")

    def frames(self) -> int:
        return 0 if self.kind == "cut" else max(2, int(round(self.duration_s * FPS)))

    def halves(self) -> tuple[int, int]:
        n = self.frames()
        return n // 2, n - n // 2

    def key_fields(self) -> dict:
        return self.model_dump(exclude={"reason"}, mode="json")

    @property
    def params(self) -> dict:
        """The non-default parameters, as the wire format carries them."""
        d = self.model_dump(include=set(PARAM_KEYS), mode="json")
        default = TransitionSpec().model_dump(include=set(PARAM_KEYS), mode="json")
        return {k: v for k, v in d.items() if v != default[k]}

    def wire(self) -> "Transition":
        return Transition(kind=self.kind, duration_s=self.duration_s, params=self.params, reason=self.reason)


class Transition(BaseModel):
    """The shape transitions travel in between the director, reels.py and render.py: kind,
    duration_s, params, reason. kind is an aitx kind (SUPPORTED) or one of the renderer's built-ins
    (BUILTIN_KINDS); params holds direction, focus_a / focus_b ([x, y] in 0..1), color, strength,
    prompt, seed, allow_fallback."""
    kind: str = "cut"
    duration_s: float = 0.0
    params: dict = Field(default_factory=dict)
    reason: str = ""


def _point(v) -> tuple[float, float] | None:
    if v is None:
        return None
    if isinstance(v, dict):
        return float(v["x"]), float(v["y"])
    if hasattr(v, "x") and hasattr(v, "y"):
        return float(v.x), float(v.y)
    x, y = v
    return float(x), float(y)


def as_spec(spec) -> TransitionSpec:
    """Any transition description -> TransitionSpec: a TransitionSpec, a Transition, a dict, or any
    object with .kind and .duration_s and optionally .params (a dict or an object) and/or the
    parameters as attributes (direction, focus_a, focus_b, color, strength, prompt, seed,
    allow_fallback). Kinds may use hyphens; the renderer's built-ins map through ALIASES."""
    if isinstance(spec, TransitionSpec):
        return spec
    if isinstance(spec, dict):
        top = dict(spec)
    else:
        top = {k: getattr(spec, k) for k in ("kind", "duration_s", "reason", "params", *PARAM_KEYS)
               if hasattr(spec, k)}
    params = top.pop("params", None) or {}
    if not isinstance(params, dict):
        params = params.model_dump() if hasattr(params, "model_dump") else dict(vars(params))
    merged = {k: v for k, v in {**top, **params}.items() if v is not None}
    kind = merged.get("kind", "cut")
    kind = str(getattr(kind, "value", kind)).strip().lower()
    extra: dict = {}
    if kind in ALIASES:
        kind, extra = ALIASES[kind]
    elif kind.replace("-", "_") in KINDS:
        kind = kind.replace("-", "_")
    if kind not in KINDS:
        raise ValueError(f"unknown transition kind {kind!r}")
    fields = {**extra, **{k: merged[k] for k in PARAM_KEYS if k in merged}}
    for k in ("focus_a", "focus_b"):
        if k in fields:
            fields[k] = _point(fields[k])
    unknown = set(merged) - {"kind", "duration_s", "reason", *PARAM_KEYS}
    if unknown:
        log.debug("transition params ignored: %s", sorted(unknown))
    return TransitionSpec(kind=kind, duration_s=float(merged.get("duration_s", 0.0) or 0.0),
                          reason=str(merged.get("reason", "") or ""), **fields)


# =========================================================================== settings


def settings(cfg: Config) -> dict:
    x = cfg.extra or {}
    size = x.get("aitx_generative_size", (576, 1024))
    return {
        "interp": str(x.get("aitx_interpolator", "auto")),
        "rife": x.get("aitx_rife"),
        "rife_model": str(x.get("aitx_rife_model", "rife-v4.6")),
        "rife_gpu": x.get("aitx_rife_gpu"),
        "rife_jobs": int(x.get("aitx_rife_jobs", 2)),
        "depth": str(x.get("aitx_depth", "auto")),
        "depth_model": str(x.get("aitx_depth_model", DEPTH_MODEL)),
        "device": str(x.get("aitx_device", "auto")),
        "downloads": bool(x.get("aitx_allow_downloads", False)),
        "allow_fallback": bool(x.get("aitx_allow_fallback", False)),
        "generative": bool(x.get("aitx_generative", False)),
        "gen_model": str(x.get("aitx_generative_model", LTX_MODEL)),
        "gen_steps": int(x.get("aitx_generative_steps", 30)),
        "gen_budget_s": float(x.get("aitx_generative_budget_s", 420.0)),
        "gen_size": (int(size[0]), int(size[1])),
        "gen_max_frames": int(x.get("aitx_generative_max_frames", 49)),
        "cache": x.get("aitx_cache"),
        "workers": int(x.get("aitx_workers", 0)) or min(4, os.cpu_count() or 2),
        "intermediate": str(x.get("aitx_intermediate", "auto")),
        "encoder": x.get("reel_encoder", "libx264"),
        "crf": x.get("reel_crf", 18),
        "preset": x.get("reel_preset", "slow"),
    }


def _run(args: list[str], timeout: float = 600, input: bytes | None = None) -> subprocess.CompletedProcess:
    proc = subprocess.run(args, capture_output=True, timeout=timeout, input=input)
    if proc.returncode != 0:
        err = proc.stderr.decode(errors="replace").replace("\r", "\n").strip().splitlines()
        raise RuntimeError(f"{Path(args[0]).name} failed ({proc.returncode}): {' | '.join(err[-8:])[-1500:]}")
    return proc


# =========================================================================== segment I/O


@dataclass(frozen=True)
class SegInfo:
    path: str
    width: int
    height: int
    frames: int
    fps: float
    codec: str
    pix_fmt: str
    color_space: str = ""


def probe_segment(path: str | Path, cfg: Config) -> SegInfo:
    """Size, frame count (packets, no decoding), rate and codec of a segment's first video stream."""
    out = _run([cfg.ffprobe, "-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries",
                "stream=codec_name,width,height,pix_fmt,r_frame_rate,nb_read_packets,color_space",
                "-of", "json", str(path)], timeout=120).stdout
    streams = json.loads(out or b"{}").get("streams") or []
    if not streams:
        raise ValueError(f"{path} has no video stream")
    s = streams[0]
    return SegInfo(str(path), int(s["width"]), int(s["height"]), int(s.get("nb_read_packets") or 0),
                   float(Fraction(s.get("r_frame_rate") or "30/1")), s.get("codec_name", ""),
                   s.get("pix_fmt", ""), s.get("color_space", "") or "")


def _in_matrix(info: SegInfo) -> str:
    return "auto" if info.color_space in ("bt709", "bt470bg", "smpte170m", "bt2020nc") else "bt709"


def read_frames(path: str | Path, start: int, count: int, cfg: Config, info: SegInfo | None = None,
                size: tuple[int, int] | None = None) -> np.ndarray:
    """Frames start .. start+count-1 as uint16 RGB (count, H, W, 3), decoded with the BT.709 matrix.
    A segment that ends early repeats its last frame. size=(w, h) scales on the way (area)."""
    info = info or probe_segment(path, cfg)
    w, h = size or (info.width, info.height)
    args = [cfg.ffmpeg, "-hide_banner", "-nostdin", "-v", "error"]
    if start > 0:   # accurate input seek; half a frame early so rounding never drops frame `start`
        args += ["-ss", f"{(start - 0.5) / info.fps:.6f}"]
    flags = "area" if size else "bicubic"
    args += ["-i", str(path), "-map", "0:v:0", "-frames:v", str(count), "-vf",
             f"scale={w}:{h}:in_color_matrix={_in_matrix(info)}:flags={flags}+accurate_rnd+full_chroma_int,"
             "format=rgb48le", "-f", "rawvideo", "-pix_fmt", "rgb48le", "-"]
    raw = _run(args, timeout=600).stdout
    per = w * h * 3 * 2
    got = len(raw) // per
    if got == 0:
        raise RuntimeError(f"no frames at {start} in {path}")
    frames = np.frombuffer(raw[: got * per], "<u2").reshape(got, h, w, 3)
    if got < count:
        frames = np.concatenate([frames, np.repeat(frames[-1:], count - got, axis=0)])
    return frames


def _fmt_for(info: SegInfo, cfg: Config) -> str:
    want = settings(cfg)["intermediate"]
    if want in ("x264", "prores"):
        return want
    return "prores" if info.codec == "prores" else "x264"


def _encode_args(fmt: str) -> list[str]:
    if fmt == "prores":
        return ["-c:v", "prores_ks", "-profile:v", "3", "-vendor", "apl0", "-pix_fmt", "yuv422p10le"]
    return ["-c:v", "libx264", "-preset", "fast", "-crf", "10", "-g", "1", "-keyint_min", "1", "-bf", "0",
            "-pix_fmt", "yuv420p"]


@dataclass(frozen=True)
class AudioInfo:
    codec: str
    rate: int
    channels: int


def probe_audio(path: str | Path, cfg: Config) -> AudioInfo | None:
    """The first audio stream (the segment's natural-sound stem), or None."""
    out = _run([cfg.ffprobe, "-v", "error", "-select_streams", "a:0", "-show_entries",
                "stream=codec_name,sample_rate,channels", "-of", "json", str(path)], timeout=60).stdout
    streams = json.loads(out or b"{}").get("streams") or []
    if not streams:
        return None
    s = streams[0]
    return AudioInfo(s.get("codec_name", ""), int(s.get("sample_rate") or 48000), int(s.get("channels") or 2))


AUDIO_KEEP = ("pcm_s16le", "pcm_s24le", "pcm_s32le", "pcm_f32le", "aac", "alac")


def _audio_out(info: AudioInfo | None) -> tuple[list[str], int, str]:
    """(codec args, rate, channel layout) for a stem: the source's codec when it is PCM, AAC or ALAC
    (so a transition stem concatenates with the segments' own), else 16-bit PCM; 48 kHz stereo silence
    when there is no source."""
    if info is None:
        return ["-c:a", "pcm_s16le"], 48000, "stereo"
    codec = info.codec if info.codec in AUDIO_KEEP else "pcm_s16le"
    args = ["-c:a", codec] + (["-b:a", "256k"] if codec == "aac" else [])
    layout = {1: "mono", 2: "stereo"}.get(info.channels, f"{info.channels}c")
    return args, info.rate, layout


@dataclass
class AudioPart:
    """Seconds [start, start + duration) of a file's first audio stream; path None (or a file with no
    audio) is silence."""
    path: str | None
    start: float
    duration: float


FADE_S = 0.015          # at a join inside a stem: no click, still reads as a cut


class ClipWriter:
    """Encodes float RGB frames (H, W, 3, 0..1) into a segment-format clip. Writes a hidden temp file
    next to `out` and renames it into place on close; refuses to replace an existing file.
    audio: parts laid end to end into one stem of exactly n frames' length (a 15 ms fade either
    side of each join), in the codec of audio_info (see _audio_out); None: no audio stream."""

    def __init__(self, out: str | Path, cfg: Config, fmt: str, n: int, size: tuple[int, int],
                 audio: list[AudioPart] | None = None, audio_info: AudioInfo | None = None):
        self.out, self.n, self.size, self.count = Path(out), n, size, 0
        if self.out.exists():
            raise FileExistsError(self.out)
        self.out.parent.mkdir(parents=True, exist_ok=True)
        self.tmp = self.out.with_name(f".{self.out.stem}.{uuid.uuid4().hex[:8]}{self.out.suffix or '.mp4'}")
        self.err = tempfile.TemporaryFile()
        w, h = size
        args = [cfg.ffmpeg, "-hide_banner", "-nostdin", "-v", "error", "-n",
                "-f", "rawvideo", "-pix_fmt", "rgb48le", "-s", f"{w}x{h}", "-r", str(FPS), "-i", "-"]
        graph = ["[0:v]scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int[vout]"]
        amap: list[str] = ["-an"]
        if audio:
            codec_args, rate, layout = _audio_out(audio_info)
            fmt_a = f"aresample={rate},aformat=sample_fmts=fltp:sample_rates={rate}:channel_layouts={layout}"
            labels = []
            for j, part in enumerate(audio):
                d = part.duration
                fades = []
                if j > 0:
                    fades.append(f"afade=t=in:st=0:d={min(FADE_S, d / 4):.4f}")
                if j < len(audio) - 1:
                    f = min(FADE_S, d / 4)
                    fades.append(f"afade=t=out:st={max(0.0, d - f):.6f}:d={f:.4f}")
                tail = ",".join([f"atrim=duration={d:.6f}", f"apad=whole_dur={d:.6f}", f"atrim=duration={d:.6f}", *fades])
                if part.path:
                    k = 1 + len(labels)
                    args += ["-ss", f"{part.start:.6f}", "-t", f"{d + 0.2:.6f}", "-i", part.path]
                    graph.append(f"[{k}:a:0]asetpts=PTS-STARTPTS,{fmt_a},{tail}[a{j}]")
                    labels.append(j)
                else:
                    graph.append(f"anullsrc=r={rate}:cl={layout},{fmt_a},{tail}[a{j}]")
            total = n / FPS
            graph.append("".join(f"[a{j}]" for j in range(len(audio)))
                         + f"concat=n={len(audio)}:v=0:a=1,atrim=duration={total:.6f}[aout]")
            amap = ["-map", "[aout]", *codec_args]
        args += ["-filter_complex", ";".join(graph), "-map", "[vout]", *_encode_args(fmt), "-r", str(FPS),
                 "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
                 "-frames:v", str(n), *amap, str(self.tmp)]
        self.proc = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=self.err)

    def write(self, frame: np.ndarray) -> None:
        if frame.shape[:2] != (self.size[1], self.size[0]):
            raise ValueError(f"frame {frame.shape} is not {self.size}")
        self.proc.stdin.write(_u16(frame).tobytes())
        self.count += 1

    def close(self) -> Path:
        self.proc.stdin.close()
        code = self.proc.wait()
        self.err.seek(0)
        msg = self.err.read().decode(errors="replace").strip()
        self.err.close()
        if code != 0 or self.count != self.n:
            self.tmp.unlink(missing_ok=True)
            raise RuntimeError(f"clip encode failed ({code}, {self.count}/{self.n} frames): {msg[-800:]}")
        if self.out.exists():
            self.tmp.unlink(missing_ok=True)
            raise FileExistsError(self.out)
        os.replace(self.tmp, self.out)
        return self.out

    def abort(self) -> None:
        try:
            self.proc.stdin.close()
        except OSError:
            pass
        self.proc.kill()
        self.proc.wait()
        self.tmp.unlink(missing_ok=True)


# =========================================================================== image helpers
# Frames are float32 (H, W, 3) RGB in 0..1 (display gamma). Warps go through Pillow's C resamplers on
# float ('F') channels; blurs are cumulative-sum box filters.

LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)


def _f(u16: np.ndarray) -> np.ndarray:
    return u16.astype(np.float32) * np.float32(1 / 65535)


def _u16(f: np.ndarray) -> np.ndarray:
    return np.clip(f * 65535.0 + 0.5, 0, 65535).astype("<u2")


def _u8(f: np.ndarray) -> np.ndarray:
    return np.clip(f * 255.0 + 0.5, 0, 255).astype(np.uint8)


def luma(img: np.ndarray) -> np.ndarray:
    return img @ LUMA


def smoothstep(e0: float, e1: float, x):
    t = np.clip((np.asarray(x, np.float32) - e0) / max(e1 - e0, 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


def ease_in_out_cubic(p: float) -> float:
    p = min(1.0, max(0.0, p))
    return 4 * p ** 3 if p < 0.5 else 1 - (-2 * p + 2) ** 3 / 2


def ease_in_cubic(p: float) -> float:
    p = min(1.0, max(0.0, p))
    return p ** 3


def ease_out_cubic(p: float) -> float:
    p = min(1.0, max(0.0, p))
    return 1 - (1 - p) ** 3


def _chans(img: np.ndarray) -> list[Image.Image]:
    return [Image.fromarray(np.ascontiguousarray(img[..., c]), "F") for c in range(img.shape[2])]


def _stack(chs: list[Image.Image]) -> np.ndarray:
    return np.stack([np.asarray(c, np.float32) for c in chs], axis=-1)


def _affine(img: np.ndarray, coeffs: tuple, cubic: bool = False) -> np.ndarray:
    """Output pixel (x, y) samples img at (a x + b y + c, d x + e y + f); Pillow's continuous
    coordinates (pixel centres at +0.5). Samples outside the frame are clamped to its edge by
    construction of every caller (zoom >= 1 about an interior point)."""
    h, w = img.shape[:2]
    rs = Image.BICUBIC if cubic else Image.BILINEAR
    return _stack([c.transform((w, h), Image.AFFINE, coeffs, resample=rs) for c in _chans(img)])


def crop_resize(img: np.ndarray, box: tuple[float, float, float, float], cubic: bool = True,
                size: tuple[int, int] | None = None) -> np.ndarray:
    """The source window box = (x0, y0, x1, y1) (float pixels, inside the frame) resampled to size
    (default: the frame's own). Separable, so three to four times faster than an affine warp."""
    h, w = img.shape[:2]
    size = size or (w, h)
    rs = Image.BICUBIC if cubic else Image.BILINEAR
    return _stack([c.resize(size, rs, box=box) for c in _chans(img)])


def zoom_about(img: np.ndarray, z: float, cx: float, cy: float, cubic: bool = True) -> np.ndarray:
    """Scale by z (>= 1) about the pixel point (cx, cy), which stays put."""
    if abs(z - 1.0) < 1e-6:
        return img
    h, w = img.shape[:2]
    s = 1.0 / z
    return crop_resize(img, (cx - cx * s, cy - cy * s, cx + (w - cx) * s, cy + (h - cy) * s), cubic)


def radial_blur(img: np.ndarray, cx: float, cy: float, ratio: float, max_passes: int = 6) -> np.ndarray:
    """Zoom motion blur: the average of the image scaled by every factor in [1, ratio] about (cx, cy),
    built by repeated doubling (pass j averages with a copy scaled by q^(2^j)), so 2^m samples cost
    m resamples. A zoom's shutter interval [z_lo, z_hi] is the base image at z_lo with ratio z_hi / z_lo."""
    h, w = img.shape[:2]
    reach = max(math.hypot(x - cx, y - cy) for x in (0, w) for y in (0, h))
    span = (ratio - 1.0) * reach
    if span < 1.5:                      # under a pixel and a half of streak: invisible, keep it sharp
        return img
    m = min(max_passes, max(1, math.ceil(math.log2(span / 2.0 + 1))))
    q = ratio ** (1.0 / (2 ** m - 1))
    chans = [np.ascontiguousarray(img[..., c]) for c in range(img.shape[2])]
    for j in range(m):
        s = 1.0 / q ** (2 ** j)
        box = (cx - cx * s, cy - cy * s, cx + (w - cx) * s, cy + (h - cy) * s)
        chans = [0.5 * (c + np.asarray(Image.fromarray(c, "F").resize((w, h), Image.BILINEAR, box=box)))
                 for c in chans]
    return np.stack(chans, axis=-1)


def _box1d(a: np.ndarray, r: int, axis: int) -> np.ndarray:
    """Box blur of radius r along one axis, edges extended."""
    if r < 1:
        return a
    pad = [(0, 0)] * a.ndim
    pad[axis] = (r + 1, r)
    c = np.cumsum(np.pad(a, pad, mode="edge"), axis=axis, dtype=np.float32)
    n = a.shape[axis]
    hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
    lo = np.take(c, np.arange(0, n), axis=axis)
    return (hi - lo) / (2 * r + 1)


def box_blur(a: np.ndarray, r: int, passes: int = 2) -> np.ndarray:
    for _ in range(passes):
        a = _box1d(_box1d(a, r, 0), r, 1)
    return a


def _resize(a: np.ndarray, w: int, h: int, method=Image.BILINEAR) -> np.ndarray:
    """Resize a float (h, w) or (h, w, c) array with Pillow."""
    if a.ndim == 2:
        return np.asarray(Image.fromarray(np.ascontiguousarray(a, np.float32), "F").resize((w, h), method), np.float32)
    return _stack([c.resize((w, h), method) for c in _chans(np.asarray(a, np.float32))])


def _half(a: np.ndarray) -> np.ndarray:
    h, w = a.shape[0] // 2 * 2, a.shape[1] // 2 * 2
    a = a[:h, :w]
    return a.reshape(h // 2, 2, w // 2, 2, *a.shape[2:]).mean(axis=(1, 3))


def push_pull(values: np.ndarray, weight: np.ndarray) -> np.ndarray:
    """Fill where weight is 0 from the weighted values around it (pyramid push-pull): at every level
    the known part is composited over the upsampled coarser estimate, so holes get a smooth
    extension of their surroundings ("edge extend"), and known pixels are returned unchanged."""
    v = values.astype(np.float32)
    wt = np.clip(weight.astype(np.float32), 0, 1)
    if v.ndim == 2:
        return push_pull(v[..., None], wt)[..., 0]
    if wt.min() >= 1.0:
        return v
    pre = [(v * wt[..., None], wt)]
    while min(pre[-1][1].shape) > 2:
        pv, pw = pre[-1]
        if pv.shape[0] % 2 or pv.shape[1] % 2:
            pv = np.pad(pv, ((0, pv.shape[0] % 2), (0, pv.shape[1] % 2), (0, 0)), mode="edge")
            pw = np.pad(pw, ((0, pw.shape[0] % 2), (0, pw.shape[1] % 2)), mode="edge")
        pre.append((_half(pv), _half(pw)))
    cv, cw = pre[-1]
    tot = cw.sum()
    mean = (cv.sum(axis=(0, 1)) / tot) if tot > 0 else np.zeros(cv.shape[-1], np.float32)
    est = np.where(cw[..., None] > 1e-6, cv / np.maximum(cw, 1e-6)[..., None], mean)
    for pv, pw in reversed(pre[:-1]):
        up = _resize(est, pv.shape[1], pv.shape[0])
        est = pv + (1 - pw)[..., None] * up
    return np.where(wt[..., None] >= 1.0, v, est)


def _maxfilter3(a: np.ndarray, r: int = 1) -> np.ndarray:
    out = a
    for _ in range(r):
        p = np.pad(out, 1, mode="edge")
        h, w = out.shape
        out = np.max(np.stack([p[y:y + h, x:x + w] for y in range(3) for x in range(3)]), axis=0)
    return out


def _bilinear(arr: np.ndarray, x: np.ndarray, y: np.ndarray, W: int, H: int) -> np.ndarray:
    """Sample a (h, w) map that covers a W x H frame at frame coordinates (x, y), edges clamped."""
    h, w = arr.shape
    u = np.clip(x * (w / W) - 0.5, 0, w - 1.000001)
    v = np.clip(y * (h / H) - 0.5, 0, h - 1.000001)
    x0, y0 = u.astype(np.int64), v.astype(np.int64)
    fx, fy = u - x0, v - y0
    a00, a01 = arr[y0, x0], arr[y0, x0 + 1]
    a10, a11 = arr[y0 + 1, x0], arr[y0 + 1, x0 + 1]
    return (a00 * (1 - fx) + a01 * fx) * (1 - fy) + (a10 * (1 - fx) + a11 * fx) * fy


def phase_shift(a: np.ndarray, b: np.ndarray) -> tuple[float, float, float]:
    """(dx, dy, peak): b(x) ~ a(x - d) for two same-size greyscale images, by phase correlation with a
    Hann window and a parabolic sub-pixel peak. peak (0..1) is how sharp the correlation is."""
    h, w = a.shape
    win = np.outer(np.hanning(h), np.hanning(w)).astype(np.float32)
    fa = np.fft.rfft2((a - a.mean()) * win)
    fb = np.fft.rfft2((b - b.mean()) * win)
    r = fb * np.conj(fa)
    r /= np.abs(r) + 1e-9
    c = np.fft.irfft2(r, s=(h, w))
    iy, ix = np.unravel_index(int(np.argmax(c)), c.shape)
    peak = float(c[iy, ix])

    def sub(m1, m0, p1):
        d = m1 - 2 * m0 + p1
        return 0.0 if abs(d) < 1e-12 else 0.5 * (m1 - p1) / d
    dx = ix + sub(c[iy, (ix - 1) % w], c[iy, ix], c[iy, (ix + 1) % w])
    dy = iy + sub(c[(iy - 1) % h, ix], c[iy, ix], c[(iy + 1) % h, ix])
    if dx > w / 2:
        dx -= w
    if dy > h / 2:
        dy -= h
    return float(dx), float(dy), peak


# =========================================================================== the boundary


@dataclass
class Boundary:
    """A's last ha frames and B's first hb frames (uint16). Transition frame i shows A's frame
    a0 + i while A lasts (then its last frame) and B's frame i - ha once B has started (before
    that its first frame)."""
    a: np.ndarray
    b: np.ndarray

    @property
    def ha(self) -> int:
        return len(self.a)

    @property
    def hb(self) -> int:
        return len(self.b)

    @property
    def n(self) -> int:
        return self.ha + self.hb

    @property
    def size(self) -> tuple[int, int]:
        return self.a.shape[2], self.a.shape[1]

    def A(self, i: int) -> np.ndarray:
        return _f(self.a[min(max(i, 0), self.ha - 1)])

    def B(self, i: int) -> np.ndarray:
        return _f(self.b[min(max(i - self.ha, 0), self.hb - 1)])

    def p(self, i: float) -> float:
        return i / (self.n - 1) if self.n > 1 else 1.0


def load_boundary(a_seg: str | Path, b_seg: str | Path, spec: TransitionSpec, cfg: Config,
                  ia: SegInfo | None = None, ib: SegInfo | None = None) -> Boundary:
    ia = ia or probe_segment(a_seg, cfg)
    ib = ib or probe_segment(b_seg, cfg)
    if (ia.width, ia.height) != (ib.width, ib.height):
        raise ValueError(f"segments differ in size: {ia.width}x{ia.height} vs {ib.width}x{ib.height}")
    ha, hb = spec.halves()
    if ha > ia.frames or hb > ib.frames:
        raise ValueError(f"{spec.kind} {spec.duration_s:.2f}s needs {ha}+{hb} frames; segments have "
                         f"{ia.frames} and {ib.frames}")
    with ThreadPoolExecutor(2) as pool:
        fa = pool.submit(read_frames, a_seg, ia.frames - ha, ha, cfg, ia)
        fb = pool.submit(read_frames, b_seg, 0, hb, cfg, ib)
        return Boundary(fa.result(), fb.result())


# =========================================================================== AI: frame interpolation


def find_rife(cfg: Config) -> str | None:
    """The rife-ncnn-vulkan binary: cfg.extra aitx_rife, PATH, or an unzipped release in a usual place."""
    want = settings(cfg)["rife"]
    if want:
        return str(want) if Path(want).expanduser().exists() else None
    hit = shutil.which("rife-ncnn-vulkan")
    if hit:
        return hit
    home = Path.home()
    for base in (home / "bin", home / "Applications", home / "Downloads", home / "opt", Path("/opt/homebrew/bin"),
                 Path("/usr/local/bin"), Path("/Applications")):
        for p in [base / "rife-ncnn-vulkan", *sorted(base.glob("rife-ncnn-vulkan*/rife-ncnn-vulkan"))]:
            if p.is_file() and os.access(p, os.X_OK):
                return str(p)
    return None


class RifeInterpolator:
    """RIFE through the rife-ncnn-vulkan CLI, one pair at a time: `-0 a.png -1 b.png -o out.png
    -m rife-v4.6 -s t` (custom time steps need a rife-v4 model). On Apple silicon the macOS release
    runs on Metal through MoltenVK; -g -1 runs on the CPU. Pairs run `jobs` at a time."""
    name = "rife"

    def __init__(self, binary: str, model: str = "rife-v4.6", gpu: int | None = None, jobs: int = 2,
                 runner: Callable = subprocess.run):
        self.binary, self.gpu, self.jobs, self.run = binary, gpu, max(1, jobs), runner
        m = Path(model).expanduser()
        if not m.exists() and (Path(binary).parent / model).exists():
            m = Path(binary).parent / model
        self.model = str(m)
        if "rife-v4" not in self.model:
            raise ValueError(f"RIFE model {model!r}: arbitrary time steps need a rife-v4 model")
        self.tag = f"rife:{Path(self.model).name}"

    def command(self, a: Path, b: Path, out: Path, t: float) -> list[str]:
        cmd = [self.binary, "-0", str(a), "-1", str(b), "-o", str(out), "-m", self.model, "-s", f"{t:.5f}"]
        if self.gpu is not None:
            cmd += ["-g", str(self.gpu)]
        return cmd

    def pairs(self, items: list[tuple[np.ndarray, np.ndarray, float]]) -> list[np.ndarray]:
        """Interpolate each (a, b, t); t outside (0, 1) returns the end frame itself."""
        out: list[np.ndarray | None] = [None] * len(items)
        with tempfile.TemporaryDirectory(prefix="igmp-rife-") as tmp:
            written: dict[int, Path] = {}

            def png(frame: np.ndarray) -> Path:
                if id(frame) not in written:
                    p = Path(tmp) / f"in{len(written):04d}.png"
                    Image.fromarray(_u8(frame)).save(p, compress_level=1)
                    written[id(frame)] = p
                return written[id(frame)]

            jobs = []
            for k, (a, b, t) in enumerate(items):
                if t <= 1e-3:
                    out[k] = a
                elif t >= 1 - 1e-3:
                    out[k] = b
                else:
                    jobs.append((k, png(a), png(b), t))

            def one(job):
                k, pa, pb, t = job
                dest = Path(tmp) / f"out{k:04d}.png"
                proc = self.run(self.command(pa, pb, dest, t), capture_output=True, timeout=900)
                if proc.returncode != 0 or not dest.exists():
                    err = (proc.stderr or b"")
                    err = err.decode(errors="replace") if isinstance(err, bytes) else str(err)
                    raise RuntimeError(f"rife-ncnn-vulkan failed ({proc.returncode}): {err.strip()[-400:]}")
                with Image.open(dest) as im:
                    return k, np.asarray(im.convert("RGB"), np.float32) / 255.0

            with ThreadPoolExecutor(self.jobs) as pool:
                for k, frame in pool.map(one, jobs):
                    out[k] = frame
        return out  # type: ignore[return-value]

    def at(self, frames: list[np.ndarray], positions: list[float]) -> list[np.ndarray]:
        """Frames at fractional positions into a sequence."""
        items = []
        for u in positions:
            k = min(max(int(math.floor(u)), 0), len(frames) - 2) if len(frames) > 1 else 0
            items.append((frames[k], frames[min(k + 1, len(frames) - 1)], u - k))
        return self.pairs(items)


class MinterpInterpolator:
    """ffmpeg minterpolate (motion-compensated: mci, aobmc, bidirectional epzs search). The sequence
    (plus a copy of its last frame) plays at 1 fps and is interpolated to `factor` fps; each
    position takes the nearest output frame (within 1/(2 factor) of a frame)."""
    name = "minterpolate"
    tag = "minterpolate"

    def __init__(self, ffmpeg: str = "ffmpeg", factor: int = 8):
        self.ffmpeg, self.factor = ffmpeg, factor

    def at(self, frames: list[np.ndarray], positions: list[float]) -> list[np.ndarray]:
        if not positions:
            return []
        h, w = frames[0].shape[:2]
        k = self.factor
        idx = [int(round(min(max(u, 0.0), len(frames) - 1) * k)) for u in positions]
        want = sorted(set(idx))
        stream = [*frames, frames[-1]]          # the trailing copy lets the last interval complete
        sel = "+".join(f"eq(n\\,{i})" for i in want)
        vf = (f"format=yuv444p,minterpolate=fps={k}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:me=epzs:"
              f"vsbmc=1:scd=none,select='{sel}',format=rgb48le")
        raw = _run([self.ffmpeg, "-hide_banner", "-nostdin", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb48le",
                    "-s", f"{w}x{h}", "-r", "1", "-i", "-", "-vf", vf, "-fps_mode", "passthrough",
                    "-f", "rawvideo", "-"], timeout=1800,
                   input=b"".join(_u16(f).tobytes() for f in stream)).stdout
        per = w * h * 6
        got = [np.frombuffer(raw[i * per:(i + 1) * per], "<u2").reshape(h, w, 3) for i in range(len(raw) // per)]
        if len(got) != len(want):
            raise RuntimeError(f"minterpolate gave {len(got)} frames, wanted {len(want)}")
        by = dict(zip(want, got))
        return [_f(by[i]) for i in idx]


def interpolator_for(cfg: Config) -> RifeInterpolator | MinterpInterpolator:
    st = settings(cfg)
    if st["interp"] != "minterpolate":
        rife = find_rife(cfg)
        if rife:
            gpu = st["rife_gpu"]
            return RifeInterpolator(rife, st["rife_model"], None if gpu is None else int(gpu), st["rife_jobs"])
        if st["interp"] == "rife":
            log.warning("rife-ncnn-vulkan not found; using ffmpeg minterpolate")
    return MinterpInterpolator(cfg.ffmpeg)


# =========================================================================== AI: depth


def _device(want: str) -> str:
    if want != "auto":
        return want
    import torch
    if getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
        return "mps"
    return "cuda" if torch.cuda.is_available() else "cpu"


def _hf_path(repo: str, allow_download: bool) -> str:
    """A local path for a Hugging Face repo: from the cache only, unless downloads are allowed."""
    if Path(repo).expanduser().exists():
        return str(Path(repo).expanduser())
    from huggingface_hub import snapshot_download
    return snapshot_download(repo, local_files_only=not allow_download)


class DepthAnything:
    """Depth Anything V2 (Small) via the transformers depth-estimation pipeline. Returns relative
    inverse depth scaled to 0 (far) .. 1 (near) by its 1st/99th percentiles."""

    def __init__(self, model: str = DEPTH_MODEL, device: str = "auto", allow_download: bool = False):
        from transformers import pipeline
        self.pipe = pipeline("depth-estimation", model=_hf_path(model, allow_download), device=_device(device))
        self.name = f"depth-anything:{Path(model).name}"

    def __call__(self, rgb: np.ndarray, size: tuple[int, int] = (540, 960)) -> np.ndarray:
        im = Image.fromarray(_u8(rgb)).resize(size, Image.BILINEAR)
        d = self.pipe(im)["predicted_depth"]
        d = np.asarray(d.detach().float().cpu().numpy() if hasattr(d, "detach") else d, np.float32).squeeze()
        if d.shape != (size[1], size[0]):
            d = _resize(d, *size)
        lo, hi = np.percentile(d, [1, 99])
        return np.clip((d - lo) / max(hi - lo, 1e-6), 0, 1).astype(np.float32)


def heuristic_depth(rgb: np.ndarray, size: tuple[int, int] = (540, 960)) -> np.ndarray:
    """No-model depth for landscapes: a smooth low-texture region connected to the top edge is sky
    (far, 0); below its edge depth rises toward the bottom of the frame, with a little extra for
    high-contrast detail. A frame with no sky gets a plain bottom-near ramp."""
    small = _resize(luma(rgb), 68, 120, Image.BOX)           # stars and grain average out here
    h, w = small.shape
    gy = np.abs(np.diff(small, axis=0, append=small[-1:]))
    gx = np.abs(np.diff(small, axis=1, append=small[:, -1:]))
    tex = box_blur(gx + gy, 1, 1)
    lo, hi = np.percentile(small, [1, 99])
    thr = max(0.006, 0.3 * float(np.percentile(tex, 85)), 0.08 * float(hi - lo))
    band = tex[int(0.1 * h):int(0.95 * h)]
    thr = np.maximum(thr, 0.4 * box_blur(band.max(axis=0, keepdims=True), 3, 1))    # per column
    first = np.logical_and.accumulate(tex < thr, axis=0).sum(axis=0).astype(np.float32)
    padded = np.pad(first, 4, mode="edge")      # running median over 9 columns: a sun, a bright star or
    edge = np.median(np.stack([padded[i:i + w] for i in range(9)]), axis=0)   # a dust lane can't cut the sky
    rows = (np.arange(h, dtype=np.float32) + 0.5)[:, None]
    sky = rows < edge[None, :]
    horizon = edge[None, :] / h
    rows = rows / h
    if float(np.median(horizon)) < 0.08:
        d = 0.15 + 0.7 * rows + np.zeros((h, w), np.float32)
    else:
        below = np.clip((rows - horizon) / np.maximum(1 - horizon, 1e-3), 0, 1)
        d = np.where(sky, 0.0, 0.3 + 0.7 * below ** 0.8)
    detail = tex / (float(tex.max()) + 1e-6)
    d = np.clip(d + 0.12 * box_blur(detail, 2) * (~sky), 0, 1)
    return _resize(box_blur(d.astype(np.float32), 1, 1), *size)


class _HeuristicDepth:
    name = "heuristic"

    def __call__(self, rgb: np.ndarray, size: tuple[int, int] = (540, 960)) -> np.ndarray:
        return heuristic_depth(rgb, size)


class _FlatDepth:
    name = "flat"

    def __call__(self, rgb: np.ndarray, size: tuple[int, int] = (540, 960)) -> np.ndarray:
        return np.full((size[1], size[0]), 0.5, np.float32)


_BACKENDS: dict[tuple, object] = {}       # per process: loaded models are reused


def depth_for(cfg: Config):
    st = settings(cfg)
    mode = st["depth"]
    key = ("depth", mode, st["depth_model"], st["device"])
    if key in _BACKENDS:
        return _BACKENDS[key]
    est = None
    if mode in ("auto", "depth-anything"):
        try:
            est = DepthAnything(st["depth_model"], st["device"], st["downloads"])
        except Exception as e:                      # not installed or not downloaded
            (log.warning if mode == "depth-anything" else log.info)(
                "Depth Anything unavailable (%s: %s); using the heuristic depth", type(e).__name__, e)
    if est is None:
        est = _FlatDepth() if mode == "flat" else _HeuristicDepth()
    _BACKENDS[key] = est
    return est


def depth_available(cfg: Config) -> str:
    """Which depth backend `auto` would use, without loading a model."""
    st = settings(cfg)
    if st["depth"] in ("heuristic", "flat"):
        return st["depth"]
    try:
        import importlib.util
        if not (importlib.util.find_spec("transformers") and importlib.util.find_spec("torch")):
            return "heuristic (transformers/torch not installed)"
        _hf_path(st["depth_model"], False)
        return f"depth-anything:{Path(st['depth_model']).name}"
    except Exception:
        return "heuristic (model not downloaded)"


# =========================================================================== AI: 2.5D parallax

EPS_D = 0.03            # depth softness of a plane's edge
MESH_STEP = 12          # output pixels per mesh cell


@dataclass
class _Move:
    """A 2.5D camera move as an image map: a source point x at depth q (0 far .. 1 near) lands at
    c + (x - c) * z0 * (s_far + (s_near - s_far) q) + (tx W, ty H) q."""
    cx: float = 0.5
    cy: float = 0.5
    z0: float = 1.0
    s_far: float = 1.0
    s_near: float = 1.0
    tx: float = 0.0
    ty: float = 0.0

    def identity(self) -> bool:
        return (abs(self.z0 - 1) < 1e-7 and abs(self.s_far - 1) < 1e-7 and abs(self.s_near - 1) < 1e-7
                and abs(self.tx) < 1e-7 and abs(self.ty) < 1e-7)

    def scale_mid(self) -> float:
        return self.z0 * 0.5 * (self.s_far + self.s_near)


@dataclass
class _Plane:
    color: list[Image.Image]
    alpha: Image.Image | None
    depth: np.ndarray            # half resolution, smooth across this plane's own edges


@dataclass
class ParallaxScene:
    img: np.ndarray
    planes: list[_Plane]
    taus: list[float]

    @property
    def size(self) -> tuple[int, int]:
        return self.img.shape[1], self.img.shape[0]


def _depth_thresholds(d: np.ndarray, max_planes: int) -> list[float]:
    """Depth values at which the scene splits into planes: the strongest depth edges (pixel pairs four
    apart whose depth jumps by more than 0.1; at least the weight of an edge across 15% of the width),
    each leaving at least 3% of the frame on both sides."""
    if max_planes <= 1:
        return []
    mids, jumps = [], []
    for a, b in ((d[:, 4:], d[:, :-4]), (d[4:, :], d[:-4, :])):
        j = np.abs(a - b)
        m = j > 0.10
        mids.append(((a + b) / 2)[m])
        jumps.append(j[m])
    mid, jump = np.concatenate(mids), np.concatenate(jumps)
    if mid.size == 0:
        return []
    hist, edges = np.histogram(mid, bins=40, range=(0, 1), weights=jump)
    hist = np.convolve(hist, [1, 2, 1], mode="same") / 4
    order = np.argsort(hist)[::-1]
    flat = np.sort(d.ravel())
    taus: list[float] = []
    for i in order:
        if hist[i] < 0.15 * d.shape[1] or len(taus) >= max_planes - 1:
            break
        tau = float((edges[i] + edges[i + 1]) / 2)
        below = np.searchsorted(flat, tau) / flat.size
        if below < 0.03 or below > 0.97 or any(abs(tau - t) < 0.12 for t in taus):
            continue
        taus.append(tau)
    return sorted(taus)


def parallax_scene(img: np.ndarray, depth: np.ndarray, max_planes: int = 3) -> ParallaxScene:
    """Split a frame into depth planes, far to near. Plane k covers everything nearer than its
    threshold (alpha soft over EPS_D), keeps the original pixels wherever the next plane does not
    fully cover them (so with no move the composite is the frame itself), and has its hidden part
    and its depth push-pull filled from its own band, so a move reveals an extension of the right
    surface instead of a smear of the edge in front of it."""
    H, W = img.shape[:2]
    h2, w2 = H // 2, W // 2
    dq = _resize(depth.astype(np.float32), w2, h2)
    dd = _maxfilter3(dq)                           # edges go with the nearer side
    taus = _depth_thresholds(dq, max_planes)
    dd_full = _resize(dd, W, H)
    img2 = _resize(img, w2, h2, Image.BOX)
    planes = []
    for k in range(len(taus) + 1):
        lo = taus[k - 1] if k > 0 else None
        hi = taus[k] if k < len(taus) else None
        alpha = None if lo is None else smoothstep(lo - EPS_D, lo + EPS_D, dd_full)
        band = np.ones_like(dd, bool) if hi is None else dd < hi + EPS_D
        if lo is not None:
            band &= dd >= lo - EPS_D
        if band.mean() < 0.002:
            band = np.ones_like(dd, bool)
        pdepth = push_pull(dq, band.astype(np.float32))
        if hi is None:
            color = img
        else:
            fill = _resize(push_pull(img2, band.astype(np.float32)), W, H)
            color = np.where((dd_full < hi + EPS_D)[..., None], img, fill)
        planes.append(_Plane(_chans(color), None if alpha is None else Image.fromarray(alpha, "F"), pdepth))
    return ParallaxScene(img, planes, taus)


def _mesh(W: int, H: int, step: int = MESH_STEP) -> tuple[np.ndarray, np.ndarray]:
    xs = np.unique(np.r_[np.arange(0, W, step), W]).astype(np.float64)
    ys = np.unique(np.r_[np.arange(0, H, step), H]).astype(np.float64)
    return xs, ys


def _source_points(depth: np.ndarray, mv: _Move, W: int, H: int, xs: np.ndarray, ys: np.ndarray):
    """Invert the move at the mesh vertices by fixed-point iteration on the plane's depth."""
    px, py = np.meshgrid(xs, ys)
    cx, cy = mv.cx * W, mv.cy * H
    x, y = px.copy(), py.copy()
    for _ in range(6):
        q = _bilinear(depth, x, y, W, H)
        s = mv.z0 * (mv.s_far + (mv.s_near - mv.s_far) * q)
        x = cx + (px - cx - mv.tx * W * q) / s
        y = cy + (py - cy - mv.ty * H * q) / s
    return np.clip(x, 0, W), np.clip(y, 0, H)


def _mesh_warp(chs: list[Image.Image], sx: np.ndarray, sy: np.ndarray, xs: np.ndarray, ys: np.ndarray,
               W: int, H: int) -> list[Image.Image]:
    gy, gx = sx.shape
    x0, x1 = xs[:-1].astype(int), xs[1:].astype(int)
    y0, y1 = ys[:-1].astype(int), ys[1:].astype(int)
    boxes = np.stack(np.broadcast_arrays(x0[None, :], y0[:, None], x1[None, :], y1[:, None]), -1).reshape(-1, 4)
    quads = np.stack([sx[:-1, :-1], sy[:-1, :-1], sx[1:, :-1], sy[1:, :-1],
                      sx[1:, 1:], sy[1:, 1:], sx[:-1, 1:], sy[:-1, 1:]], -1).reshape(-1, 8)
    mesh = list(zip(map(tuple, boxes.tolist()), map(tuple, quads.tolist())))
    return [c.transform((W, H), Image.MESH, mesh, resample=Image.BILINEAR) for c in chs]


def render_parallax(scene: ParallaxScene, mv: _Move) -> np.ndarray:
    """One frame of the scene seen through the move: planes mesh-warped by their own depth and
    composited back to front."""
    if mv.identity():
        return scene.img
    W, H = scene.size
    xs, ys = _mesh(W, H)
    out = None
    for pl in scene.planes:
        sx, sy = _source_points(pl.depth, mv, W, H, xs, ys)
        warped = _mesh_warp(pl.color + ([pl.alpha] if pl.alpha is not None else []), sx, sy, xs, ys, W, H)
        rgb = _stack(warped[:3])
        if out is None:
            out = rgb
        else:
            a = np.asarray(warped[3], np.float32)[..., None]
            out = out + (rgb - out) * a
    return out


MOVES = ("dolly_in", "dolly_out", "truck_left", "truck_right", "pedestal_up", "pedestal_down", "dolly_zoom")


def _still_move(move: str, p: float, strength: float, focus: tuple[float, float]) -> _Move:
    """Move `move` at progress p (0..1) for parallax_still: gentle, constant-speed (geometric zoom)."""
    k = strength
    cx, cy = focus
    if move in ("dolly_in", "dolly_out"):
        q = p if move == "dolly_in" else 1 - p
        return _Move(cx, cy, 1.0, 1.06 ** (k * q), 1.20 ** (k * q))
    if move == "dolly_zoom":       # far grows, near holds: the background looms
        return _Move(cx, cy, 1.0, 1.14 ** (k * p), 1.0)
    span = 0.035 * k
    z0 = 1 + 2.2 * span
    lat = {"truck_left": (span, 0), "truck_right": (-span, 0),
           "pedestal_up": (0, span), "pedestal_down": (0, -span)}.get(move)
    if lat is None:
        raise ValueError(f"unknown move {move!r}; use one of {MOVES}")
    t = 2 * p - 1                  # far plane centred, near plane sweeps through
    return _Move(cx, cy, z0, 1.0, 1.0, lat[0] * t, lat[1] * t)


def cut_916(a: np.ndarray, focus=(0.5, 0.5), size: tuple[int, int] = (OUT_W, OUT_H)) -> np.ndarray:
    """The largest box of the target aspect around focus (kept inside), resized to size. Works for
    frames (h, w, 3) and depth maps (h, w) alike, so a depth map stays registered with its image."""
    H, W = a.shape[:2]
    aspect = size[0] / size[1]
    cw, ch = (H * aspect, H) if W / H > aspect else (W, W / aspect)
    x0 = min(max(focus[0] * W - cw / 2, 0), W - cw)
    y0 = min(max(focus[1] * H - ch / 2, 0), H - ch)
    box = a[int(round(y0)):int(round(y0 + ch)), int(round(x0)):int(round(x0 + cw))].astype(np.float32)
    if box.shape[:2] == (size[1], size[0]):
        return box
    return np.clip(_resize(box, *size, Image.LANCZOS), float(box.min()), float(box.max()))   # no ringing


def _as_frame(image, size: tuple[int, int] | None = None, focus=(0.5, 0.5)) -> np.ndarray:
    """A path (cut to 9:16 around focus with render.prepare_still), a PIL image or an array -> frame.
    size defaults to 1080x1920, or the array's own size when it is already 9:16."""
    if isinstance(image, Image.Image):
        image = np.asarray(image.convert("RGB"))
    if size is None:
        size = (OUT_W, OUT_H)
        if isinstance(image, np.ndarray) and image.shape[0] * OUT_W == image.shape[1] * OUT_H:
            size = (image.shape[1], image.shape[0])
    if isinstance(image, np.ndarray):
        a = image.astype(np.float32)
        a = a / (65535.0 if image.dtype == np.uint16 else 255.0 if image.dtype == np.uint8 else 1.0)
        return np.clip(cut_916(a, focus, size), 0, 1)
    from . import render
    with tempfile.TemporaryDirectory(prefix="igmp-px-") as tmp:
        path, _ = render.prepare_still(image, focus, Path(tmp) / "still.ppm", size)
        with Image.open(path) as im:
            return np.asarray(im.convert("RGB"), np.float32) / 255.0


def parallax_frames(image, depth: np.ndarray | None = None, duration: float = 3.0, move: str = "dolly_in",
                    *, strength: float = 1.0, focus: tuple[float, float] = (0.5, 0.5),
                    center: tuple[float, float] = (0.5, 0.5), depth_fn=None,
                    motion_blur: bool = True) -> Iterator[np.ndarray]:
    """Frames of a 2.5D move over one still: every still can move, and parallax reads as depth where a
    flat zoom reads as a zoom. image: a path, PIL image or array, cut 9:16 around focus; depth: 0 far
    .. 1 near, of the cut frame or of the whole source; None estimates it with depth_fn (default: the
    heuristic). center: the point the camera moves toward (fractions of the cut frame). Moves:
    dolly_in, dolly_out, truck_left/right, pedestal_up/down, dolly_zoom."""
    img = _as_frame(image, focus=focus)
    if depth is None:
        depth = (depth_fn or heuristic_depth)(img)
    elif depth.shape[0] * img.shape[1] != depth.shape[1] * img.shape[0]:   # the uncut source's depth
        depth = cut_916(depth, focus, (img.shape[1] // 2, img.shape[0] // 2))
    scene = parallax_scene(img, depth)
    n = max(1, int(round(duration * FPS)))
    for i in range(n):
        p = i / (n - 1) if n > 1 else 0.0
        mv = _still_move(move, p, strength, center)
        frame = render_parallax(scene, mv)
        if motion_blur and 0 < i < n - 1:
            d = 0.5 / (n - 1)
            z_lo = _still_move(move, max(0, p - d), strength, center).scale_mid()
            z_hi = _still_move(move, min(1, p + d), strength, center).scale_mid()
            frame = radial_blur(frame, center[0] * frame.shape[1], center[1] * frame.shape[0],
                                max(z_lo, z_hi) / min(z_lo, z_hi), max_passes=3)
        yield frame


def parallax_still(image, depth: np.ndarray | None = None, duration: float = 3.0, move: str = "dolly_in",
                   *, out: str | Path, cfg: Config, strength: float = 1.0,
                   focus: tuple[float, float] = (0.5, 0.5), center: tuple[float, float] = (0.5, 0.5),
                   fmt: str = "x264") -> Path:
    """parallax_frames written as a segment (1080x1920, 30 fps, all-intra x264 or ProRes, with a silent
    stem). Without a depth map it uses the configured depth backend (Depth Anything when available;
    the heuristic otherwise, so check supports()/depth_available() before choosing this for a hook)."""
    n = max(1, int(round(duration * FPS)))
    fn = None if depth is not None else depth_for(cfg)
    w = ClipWriter(out, cfg, fmt, n, (OUT_W, OUT_H), audio=[AudioPart(None, 0.0, n / FPS)])   # a silent stem
    try:
        for frame in parallax_frames(image, depth, duration, move, strength=strength, focus=focus, center=center,
                                     depth_fn=fn):
            w.write(frame)
        return w.close()
    except BaseException:
        w.abort()
        raise


# =========================================================================== AI: generative


class GenerativeUnavailable(RuntimeError):
    pass


class GenerationBudgetExceeded(RuntimeError):
    pass


def ltx_factory(model: str = LTX_MODEL, device: str = "auto", allow_download: bool = False):
    """(pipeline, condition class) for LTX-Video's keyframe-conditioned pipeline in diffusers
    (LTXConditionPipeline + LTXVideoCondition, diffusers >= 0.33; checked against 0.41)."""
    try:
        import torch
        from diffusers import LTXConditionPipeline
        from diffusers.pipelines.ltx.pipeline_ltx_condition import LTXVideoCondition
    except ImportError as e:
        raise GenerativeUnavailable(
            "generative transitions need: pip install torch 'diffusers>=0.33' transformers sentencepiece "
            f"accelerate imageio ({e})") from e
    try:
        path = _hf_path(model, allow_download)
    except Exception as e:
        raise GenerativeUnavailable(f"{model} is not downloaded (set aitx_allow_downloads, or "
                                    f"`huggingface-cli download {model}`): {e}") from e
    dev = _device(device)
    pipe = LTXConditionPipeline.from_pretrained(path, torch_dtype=torch.bfloat16)
    pipe.to(dev)
    if hasattr(pipe, "vae") and hasattr(pipe.vae, "enable_tiling"):
        pipe.vae.enable_tiling()
    return pipe, LTXVideoCondition


class Generative:
    """First/last-frame-conditioned video generation for one hero transition. The pipeline runs at
    gen_size (multiples of 32, 9:16), N = 8k + 1 frames >= n, aborts past the time budget (checked
    after every denoising step), and its frames are resampled to n and upscaled to the segment."""

    def __init__(self, cfg: Config, factory: Callable | None = None):
        st = settings(cfg)
        self.st = st
        self.factory = factory or (lambda: ltx_factory(st["gen_model"], st["device"], st["downloads"]))
        self.tag = f"ltx:{Path(st['gen_model']).name}:{st['gen_steps']}:{st['gen_size'][0]}x{st['gen_size'][1]}"
        self._pipe = None

    def pipeline(self):
        if self._pipe is None:
            key = ("gen", self.tag, id(self.factory))
            if key not in _BACKENDS:
                _BACKENDS[key] = self.factory()
            self._pipe = _BACKENDS[key]
        return self._pipe

    def __call__(self, first: np.ndarray, last: np.ndarray, n: int, prompt: str = "", seed: int = 0) -> list[np.ndarray]:
        w, h = self.st["gen_size"]
        if w % 32 or h % 32:
            raise ValueError(f"generative size {w}x{h}: both sides must be multiples of 32")
        frames_n = 8 * math.ceil((max(n, 2) - 1) / 8) + 1
        if frames_n > self.st["gen_max_frames"]:
            raise GenerationBudgetExceeded(f"{n} frames is over the generative budget of {self.st['gen_max_frames']}")
        pipe, cond = self.pipeline()
        start = time.monotonic()
        budget = self.st["gen_budget_s"]

        def check(_pipe, step, _t, kwargs):
            if time.monotonic() - start > budget:
                raise GenerationBudgetExceeded(f"generation passed its {budget:.0f}s budget at step {step}")
            return kwargs

        conditions = [cond(image=Image.fromarray(_u8(first)).resize((w, h), Image.LANCZOS), frame_index=0),
                      cond(image=Image.fromarray(_u8(last)).resize((w, h), Image.LANCZOS), frame_index=frames_n - 1)]
        kwargs = dict(conditions=conditions,
                      prompt=prompt or ("smooth cinematic camera move from the first scene into the second, "
                                        "natural light, photorealistic travel footage, sharp, stable"),
                      negative_prompt="worst quality, inconsistent motion, blurry, jittery, distorted, text, watermark",
                      width=w, height=h, num_frames=frames_n, frame_rate=FPS,
                      num_inference_steps=self.st["gen_steps"], decode_timestep=0.05, decode_noise_scale=0.025,
                      callback_on_step_end=check, output_type="pil")
        try:
            import torch
            kwargs["generator"] = torch.Generator("cpu").manual_seed(seed)
        except ImportError:
            pass
        result = pipe(**kwargs)
        frames = result.frames[0] if hasattr(result, "frames") else result[0][0]
        if len(frames) < 2:
            raise RuntimeError("generation returned no frames")
        H, W = first.shape[:2]
        pick = [round(j * (len(frames) - 1) / (n - 1)) for j in range(n)]
        return [np.asarray(frames[k].convert("RGB").resize((W, H), Image.LANCZOS), np.float32) / 255.0 for k in pick]


def generative_available(cfg: Config) -> str:
    st = settings(cfg)
    if not st["generative"]:
        return "off (aitx_generative = false)"
    import importlib.util
    if not (importlib.util.find_spec("diffusers") and importlib.util.find_spec("torch")):
        return "unavailable (diffusers/torch not installed)"
    try:
        _hf_path(st["gen_model"], False)
    except Exception:
        return f"unavailable ({st['gen_model']} not downloaded)"
    return f"ltx:{Path(st['gen_model']).name}"


# =========================================================================== the transitions
# Each is a generator of exactly bd.n float frames. Frame 0 is A's frame at the trim point and frame
# n-1 is B's last frame inside the transition, exactly (continuity with the trimmed segments).


class _Ctx:
    def __init__(self, cfg: Config, interpolator=None, depth=None, generative=None):
        self.cfg = cfg
        self._interp, self._depth, self._gen = interpolator, depth, generative

    def interpolator(self):
        if self._interp is None:
            self._interp = interpolator_for(self.cfg)
        return self._interp

    def depth(self):
        if self._depth is None:
            self._depth = depth_for(self.cfg)
        return self._depth

    def generative(self) -> Generative:
        if self._gen is None:
            if not settings(self.cfg)["generative"]:
                raise GenerativeUnavailable("generative transitions are off (aitx_generative = false)")
            self._gen = Generative(self.cfg)
        return self._gen


def _morph(bd: Boundary, spec: TransitionSpec, ctx: _Ctx) -> Iterator[np.ndarray]:
    n = bd.n
    interp = ctx.interpolator()
    ts = [float(smoothstep(0, 1, bd.p(i))) for i in range(n)]
    if isinstance(interp, RifeInterpolator):     # both shots keep playing; one RIFE pair per frame
        frames = interp.pairs([(bd.A(i), bd.B(i), t) for i, t in zip(range(n), ts)])
    else:                                         # one minterpolate run between the two keyframes
        ka, kb = bd.A(0), bd.B(n - 1)
        frames = interp.at([ka, kb], ts)
        frames = _guard_morph(ka, kb, ts, frames)
    frames[0], frames[-1] = bd.A(0), bd.B(n - 1)
    yield from frames


def _guard_morph(a: np.ndarray, b: np.ndarray, ts: list[float], frames: list[np.ndarray]) -> list[np.ndarray]:
    """minterpolate breaks up when motion is beyond its search (blocks, holes, dark patches). If any
    frame strays far from the straight blend, or darkens below both ends, dissolve instead."""
    la, lb = luma(_resize(a, 135, 240, Image.BOX)), luma(_resize(b, 135, 240, Image.BOX))
    base = float(np.mean(np.abs(la - lb))) + 0.01
    floor = min(float(la.mean()), float(lb.mean()))
    for t, f in zip(ts, frames):
        lf = luma(_resize(f, 135, 240, Image.BOX))
        blend = la + (lb - la) * t
        if float(np.mean(np.abs(lf - blend))) > 0.8 * base or float(lf.mean()) < 0.7 * floor - 0.01:
            log.warning("minterpolate morph strays from its ends; dissolving instead")
            return [a + (b - a) * t for t in ts]
    return frames


def _parallax_through(bd: Boundary, spec: TransitionSpec, ctx: _Ctx) -> Iterator[np.ndarray]:
    n = bd.n
    W, H = bd.size
    ka, kb = bd.A(0), bd.B(n - 1)
    est = ctx.depth()
    scenes = {"a": parallax_scene(ka, est(ka)), "b": parallax_scene(kb, est(kb))}
    fa = spec.focus_a or (0.5, 0.5)
    fb = spec.focus_b or (0.5, 0.5)
    k = spec.strength
    far, near = 1 + 0.10 * k, 1 + 0.38 * k
    cross, half = 0.5, max(0.14, 1.5 / max(n - 1, 1))

    def ease_a(p):      # starts moving at once, accelerates into the crossing
        u = min(1.0, max(0.0, p / (cross + half)))
        return 0.3 * u + 0.7 * u ** 3

    def ease_b(p):
        u = min(1.0, max(0.0, (p - (cross - half)) / (1 - (cross - half))))
        return 1 - (0.3 * u + 0.7 * (1 - (1 - u) ** 3))

    def side(which, prog, f, p0, p1):
        mv = _Move(f[0], f[1], 1.0, far ** prog, near ** prog)
        img = render_parallax(scenes[which], mv)
        z0 = _Move(f[0], f[1], 1.0, far ** p0, near ** p0).scale_mid()
        z1 = _Move(f[0], f[1], 1.0, far ** p1, near ** p1).scale_mid()
        return radial_blur(img, f[0] * W, f[1] * H, max(z0, z1) / min(z0, z1), max_passes=4)

    d = 0.5 / (n - 1)
    for i in range(n):
        if i == 0:
            yield ka
            continue
        if i == n - 1:
            yield kb
            continue
        p = bd.p(i)
        alpha = float(smoothstep(cross - half, cross + half, p))
        out = None
        if alpha < 1:
            out = side("a", ease_a(p), fa, ease_a(p - d), ease_a(p + d))
        if alpha > 0:
            img_b = side("b", ease_b(p), fb, ease_b(p - d), ease_b(p + d))
            out = img_b if out is None else out + (img_b - out) * alpha
        yield out


def _generative(bd: Boundary, spec: TransitionSpec, ctx: _Ctx) -> Iterator[np.ndarray]:
    n = bd.n
    ka, kb = bd.A(0), bd.B(n - 1)
    frames = ctx.generative()(ka, kb, n, spec.prompt, spec.seed)
    # ease out of / into the real frames over the first and last three (hides the resolution step)
    for j in range(min(3, n // 2)):
        w = 1 - j / 3
        frames[j] = frames[j] + (ka - frames[j]) * w
        frames[n - 1 - j] = frames[n - 1 - j] + (kb - frames[n - 1 - j]) * w
    yield from frames


# --------------------------------------------------------------------------- the classic moves


def _whip(bd: Boundary, spec: TransitionSpec, ctx: _Ctx) -> Iterator[np.ndarray]:
    """The window slides along the strip [A | B] (or [B | A]) on an ease-in-out cubic; each frame is
    the exact box integral of the strip over the shutter interval (360 degrees x strength), which
    is what a camera panning that fast records. The seam is feathered through mirrored edges."""
    n = bd.n
    d = spec.direction or "right"
    axis = 1 if d in ("left", "right") else 0
    W, H = bd.size
    L = W if axis == 1 else H
    forward = d in ("right", "down")
    shutter = 1.0 * spec.strength
    pad = L // 2 + 2
    feather = max(8, L // 24)

    def strip(a, b):
        first, second = (a, b) if forward else (b, a)
        f1, f2 = np.moveaxis(first, axis, 0), np.moveaxis(second, axis, 0)
        ext1 = np.concatenate([f1[L - feather:], f1[L - feather:][::-1]])
        ext2 = np.concatenate([f2[:feather][::-1], f2[:feather]])
        w = smoothstep(0, 1, (np.arange(2 * feather, dtype=np.float32) + 0.5) / (2 * feather))
        w = w.reshape(-1, *([1] * (f1.ndim - 1)))
        seam = ext1 + (ext2 - ext1) * w
        s = np.concatenate([f1[:pad][::-1], f1[:L - feather], seam, f2[feather:], f2[L - pad:][::-1]])
        c = np.zeros((s.shape[0] + 1, *s.shape[1:]), np.float32)
        np.cumsum(s, axis=0, out=c[1:])
        return c

    def offset(t):
        e = ease_in_out_cubic(min(1.0, max(0.0, t / (n - 1))))
        return e * L if forward else (1 - e) * L

    def integral(c, a):
        a = np.clip(a, 0, c.shape[0] - 1.0001)
        i0 = a.astype(np.int64)
        f = (a - i0).astype(np.float32).reshape(-1, *([1] * (c.ndim - 1)))
        return c[i0] + (c[i0 + 1] - c[i0]) * f

    x = np.arange(L, dtype=np.float64)
    for i in range(n):
        if i == 0:
            yield bd.A(0)
            continue
        if i == n - 1:
            yield bd.B(n - 1)
            continue
        lo, hi = sorted((offset(i - shutter / 2), offset(i + shutter / 2)))
        length = max(hi - lo, 1.0)
        start = pad + (lo + hi) / 2 - length / 2 + x
        c = strip(bd.A(i), bd.B(i))
        frame = (integral(c, start + length) - integral(c, start)) / np.float32(length)
        yield np.moveaxis(frame, 0, axis)


def _zoom_through(bd: Boundary, spec: TransitionSpec, ctx: _Ctx) -> Iterator[np.ndarray]:
    """A accelerates into its subject point (geometric zoom, ease-in), the two cross at the peak
    under radial motion blur, B decelerates out of its subject point (ease-out)."""
    n = bd.n
    W, H = bd.size
    fa, fb = spec.focus_a or (0.5, 0.5), spec.focus_b or (0.5, 0.5)
    zp = 1 + 1.4 * spec.strength
    hw = max(1.0 / (n - 1), 0.07)
    za = lambda p: zp ** ease_in_cubic(p / (0.5 + hw))
    zb = lambda p: zp ** (1 - ease_out_cubic((p - (0.5 - hw)) / (0.5 + hw)))
    d = 0.5 / (n - 1)
    for i in range(n):
        if i in (0, n - 1):
            yield bd.A(0) if i == 0 else bd.B(n - 1)
            continue
        p = bd.p(i)
        alpha = float(smoothstep(0.5 - hw, 0.5 + hw, p))
        out = None
        for img, z, f, w in ((bd.A(i), za, fa, 1 - alpha), (bd.B(i), zb, fb, alpha)):
            if w <= 0:
                continue
            z0, z1 = sorted((z(max(0.0, p - d)), z(min(1.0, p + d))))
            frame = radial_blur(zoom_about(img, z0, f[0] * W, f[1] * H), f[0] * W, f[1] * H, z1 / z0)
            out = frame if out is None else out + (frame - out) * alpha
        yield out


def _zoom_needed(a: float, s: float, zmax: float) -> float:
    """Least zoom (1 .. zmax) whose window can show source coordinate a at screen coordinate s along
    one axis without leaving the frame."""
    if s > a + 1e-9:
        z = s / max(a, 1e-6)
    elif s < a - 1e-9:
        z = (1 - s) / max(1 - a, 1e-6)
    else:
        z = 1.0
    return min(max(z, 1.0), zmax)


def _framed(img: np.ndarray, src: tuple[float, float], scr: tuple[float, float], zmax: float = 1.35) -> np.ndarray:
    """img framed so its point src sits at screen point scr (as nearly as zmax allows)."""
    W, H = img.shape[1], img.shape[0]
    z = max(_zoom_needed(src[0], scr[0], zmax), _zoom_needed(src[1], scr[1], zmax))
    w = 1 / z
    x0 = min(max(src[0] - scr[0] * w, 0.0), 1 - w)
    y0 = min(max(src[1] - scr[1] * w, 0.0), 1 - w)
    if z <= 1 + 1e-6 and abs(x0) < 1e-6 and abs(y0) < 1e-6:
        return img
    return crop_resize(img, (x0 * W, y0 * H, (x0 + w) * W, (y0 + w) * H))


def _auto_align(a: np.ndarray, b: np.ndarray) -> tuple[tuple[float, float], tuple[float, float]] | None:
    """Subject points for a match dissolve from phase correlation of the two frames' detail."""
    la, lb = luma(_resize(a, 270, 480, Image.BOX)), luma(_resize(b, 270, 480, Image.BOX))
    ga = np.hypot(*np.gradient(la))
    gb = np.hypot(*np.gradient(lb))
    dx, dy, peak = phase_shift(ga, gb)
    if peak < 0.06 or abs(dx) > 0.25 * 270 or abs(dy) > 0.25 * 480:
        return None
    return (0.5, 0.5), (0.5 + dx / 270, 0.5 + dy / 480)


def _match_dissolve(bd: Boundary, spec: TransitionSpec, ctx: _Ctx) -> Iterator[np.ndarray]:
    n = bd.n
    pa, pb = spec.focus_a, spec.focus_b
    if pa is None or pb is None:
        pa, pb = _auto_align(bd.A(n - 1), bd.B(0)) or ((0.5, 0.5), (0.5, 0.5))
    for i in range(n):
        if i in (0, n - 1):
            yield bd.A(0) if i == 0 else bd.B(n - 1)
            continue
        p = bd.p(i)
        e = ease_in_out_cubic(p)
        s = (pa[0] + (pb[0] - pa[0]) * e, pa[1] + (pb[1] - pa[1]) * e)
        alpha = float(smoothstep(0.15, 0.85, p))
        a = _framed(bd.A(i), pa, s)
        b = _framed(bd.B(i), pb, s)
        yield a + (b - a) * alpha


def _dip_image(a: np.ndarray, b: np.ndarray, light: bool) -> np.ndarray:
    """A soft vertical gradient in the colours of the darker frame (dark: about its own brightness,
    never under 5% luma, so the dip reads as passing through dusk into night, not through black),
    or of the brighter frame washed halfway to white (light)."""
    H, W = a.shape[:2]
    src = a if luma(a).mean() < luma(b).mean() else b
    if light:
        src = b if src is a else a
    rows = _resize(src, 1, 16, Image.BOX)[:, 0, :]              # 16 bands, top to bottom
    grad = _resize(rows[:, None, :], 1, H)[:, 0, :]
    if light:
        g = 1 - (1 - grad) * 0.5
    else:
        m = float(luma(grad).mean())
        target = max(0.7 * m, 0.05)
        g = np.clip(grad * (target / max(m, 1e-4)), 0.015, 1)
    return np.broadcast_to(g[:, None, :], (H, W, 3)).astype(np.float32)


def _luma_dip(bd: Boundary, spec: TransitionSpec, ctx: _Ctx) -> Iterator[np.ndarray]:
    """A leaves through a luma key (dark dip: its shadows first, highlights last) into a soft
    gradient, and B arrives the same way reversed (its highlights first: stars and lights, then the
    rest). A gentle overall fade runs under the key so it never posterises."""
    n = bd.n
    light = spec.color == "light"
    dip = _dip_image(bd.A(0), bd.B(n - 1), light)
    w = 0.22
    for i in range(n):
        if i in (0, n - 1):
            yield bd.A(0) if i == 0 else bd.B(n - 1)
            continue
        p = bd.p(i)
        leaving = p < 0.5
        frame = bd.A(i) if leaving else bd.B(i)
        u = p / 0.5 if leaving else (1 - p) / 0.5          # 0 at the shot, 1 at the dip
        k = -w + (1 + 2 * w) * u
        y = luma(frame)
        key = smoothstep(k - w, k + w, (1 - y) if light else y)
        vis = (0.75 * key + 0.25 * (1 - u))[..., None]
        yield dip + (frame - dip) * vis


def _flash(bd: Boundary, spec: TransitionSpec, ctx: _Ctx) -> Iterator[np.ndarray]:
    """A light leak (warm) or a white flash in linear light: the shot is screened with the leak and
    its highlights bloom; the cut happens under the peak (a two-frame mix)."""
    n = bd.n
    W, H = bd.size
    warm = spec.color != "white"
    sig = 0.16
    g = lambda p: math.exp(-((p - 0.5) / sig) ** 2)
    g0 = g(0.0)
    env = lambda p: max(0.0, (g(p) - g0) / (1 - g0)) * min(1.0, spec.strength)
    hw = max(1.0 / (n - 1), 0.04)
    sw, sh = 68, 120
    yy, xx = np.mgrid[0:sh, 0:sw].astype(np.float32)
    xx, yy = (xx + 0.5) / sw, (yy + 0.5) / sh
    for i in range(n):
        if i in (0, n - 1):
            yield bd.A(0) if i == 0 else bd.B(n - 1)
            continue
        p = bd.p(i)
        e = env(p)
        mix = float(smoothstep(0.5 - hw, 0.5 + hw, p))
        base = bd.A(i) if mix <= 0 else bd.B(i) if mix >= 1 else bd.A(i) + (bd.B(i) - bd.A(i)) * mix
        lin = np.power(np.clip(base, 0, 1), 2.2)
        if warm:   # a leak from the left edge: hot orange core, amber halo, a red fringe, drifting across
            leak = np.zeros((sh, sw, 3), np.float32)
            for (x0, y0, x1, y1, r, k, col) in ((-0.25, 0.30, 0.75, 0.50, 0.30, 1.6, (1.0, 0.45, 0.12)),
                                                (-0.10, 0.20, 0.95, 0.45, 0.60, 0.9, (1.0, 0.72, 0.38)),
                                                (-0.40, 0.70, 0.40, 0.60, 0.55, 0.5, (1.0, 0.28, 0.30))):
                cx, cy = x0 + (x1 - x0) * p, y0 + (y1 - y0) * p
                blob = np.exp(-(((xx - cx) * 0.5625) ** 2 + (yy - cy) ** 2) / (2 * (r * 0.5) ** 2))
                leak += (k * blob)[..., None] * np.array(col, np.float32)
            leak = _resize(np.clip(leak * e, 0, 1), W, H)
            leak = np.maximum(leak, np.float32(0.6 * e ** 3) * np.array((1.0, 0.8, 0.6), np.float32))
        else:
            leak = np.full((H, W, 3), 0.92 * e, np.float32)
        bloom = _resize(box_blur(np.clip(_resize(lin, sw, sh, Image.BOX) - 0.5, 0, None), 3), W, H)
        out = 1 - (1 - lin) * (1 - leak) + bloom * (1.5 * e)
        yield np.power(np.clip(out, 0, 1), 1 / 2.2)


def _speed_ramp_cut(bd: Boundary, spec: TransitionSpec, ctx: _Ctx) -> Iterator[np.ndarray]:
    """A's last ha frames play at a speed easing from 100% to about 40% (interpolated in between),
    then a straight cut to B, which is untouched."""
    ha, n = bd.ha, bd.n
    vmin = min(0.9, max(0.25, 1 - 0.6 * spec.strength))
    speeds = [1 - (1 - vmin) * float(smoothstep(0, 1, k / max(ha - 1, 1))) for k in range(ha)]
    pos = [0.0]
    for v in speeds[1:]:
        pos.append(pos[-1] + v)
    need = int(math.ceil(pos[-1])) + 1
    src = [bd.A(k) for k in range(min(need + 1, ha))]
    frac = [(k, u) for k, u in enumerate(pos) if abs(u - round(u)) > 0.02]
    interp = ctx.interpolator()
    if isinstance(interp, MinterpInterpolator):         # quarter-frame steps are plenty here, at half the cost
        interp = MinterpInterpolator(interp.ffmpeg, factor=4)
    got = dict(zip([k for k, _ in frac], interp.at(src, [u for _, u in frac]))) if frac else {}
    for k, u in enumerate(pos):
        yield got.get(k, src[min(int(round(u)), len(src) - 1)])
    for i in range(ha, n):
        yield bd.B(i)


def _passthrough(bd: Boundary, spec: TransitionSpec, ctx: _Ctx) -> Iterator[np.ndarray]:
    """The frames the clip replaces, untouched: a straight cut inside a clip the timeline expects."""
    for i in range(bd.n):
        yield bd.A(i) if i < bd.ha else bd.B(i)


RENDERERS: dict[str, Callable[[Boundary, TransitionSpec, _Ctx], Iterator[np.ndarray]]] = {
    "cut": _passthrough,
    "morph": _morph,
    "depth_parallax_through": _parallax_through,
    "generative": _generative,
    "whip": _whip,
    "zoom_through": _zoom_through,
    "match_dissolve": _match_dissolve,
    "luma_dip": _luma_dip,
    "flash": _flash,
    "speed_ramp_cut": _speed_ramp_cut,
}
# the clean stand-in when a kind's real backend is missing (and fallbacks are not allowed), or when
# a generation fails at run time
STAND_IN = {"generative": "depth_parallax_through", "depth_parallax_through": "zoom_through",
            "morph": "match_dissolve", "speed_ramp_cut": "cut"}


# =========================================================================== quality gating


def _cfg_or_default(cfg: Config | None) -> Config:
    return cfg if cfg is not None else Config(library_roots=[], output_dir=Path(tempfile.gettempdir()) / "igmp")


def _has_rife(cfg: Config, interpolator=None) -> bool:
    if interpolator is not None:
        return isinstance(interpolator, RifeInterpolator)
    return settings(cfg)["interp"] != "minterpolate" and find_rife(cfg) is not None


def _has_real_depth(cfg: Config, depth=None) -> bool:
    if depth is not None:
        return str(getattr(depth, "name", "")).startswith("depth-anything")
    return depth_available(cfg).startswith("depth-anything")


def effective_kind(spec, cfg: Config | None = None, *, interpolator=None, depth=None, generative=None) -> str:
    """The kind that will actually be rendered. A transition whose real backend is missing renders
    its clean stand-in instead of a visibly weaker version of itself: morph without RIFE ->
    match_dissolve, speed_ramp_cut without RIFE -> a straight cut, depth_parallax_through without
    Depth Anything -> zoom_through, generative without its pipeline -> depth_parallax_through (and
    on down). spec.allow_fallback or cfg.extra aitx_allow_fallback = true accepts the weaker
    backends (minterpolate, heuristic depth) instead."""
    cfg = _cfg_or_default(cfg)
    s = as_spec(spec)
    weak_ok = s.allow_fallback or settings(cfg)["allow_fallback"]
    kind = s.kind
    for _ in range(4):
        if kind == "generative" and generative is None and not generative_available(cfg).startswith("ltx"):
            kind = STAND_IN[kind]
        elif kind == "depth_parallax_through" and not (weak_ok or _has_real_depth(cfg, depth)):
            kind = STAND_IN[kind]
        elif kind in ("morph", "speed_ramp_cut") and not (weak_ok or _has_rife(cfg, interpolator)):
            kind = STAND_IN[kind]
        else:
            break
    return kind


def supports(spec, cfg: Config | None = None) -> bool:
    """True when aitx renders this transition at full quality with the backends at hand: its kind is
    in SUPPORTED and no stand-in would replace it (see effective_kind). morph and speed_ramp_cut
    need RIFE, depth_parallax_through needs Depth Anything, generative needs its pipeline enabled,
    installed and downloaded; allow_fallback (in the spec's params or cfg) accepts the weaker
    backends."""
    raw = spec.get("kind") if isinstance(spec, dict) else getattr(spec, "kind", None)
    raw = str(getattr(raw, "value", raw)).strip().lower()
    if raw not in SUPPORTED and raw.replace("-", "_") not in SUPPORTED:
        return False                              # the renderer's built-ins (crossfade, ...) stay its own
    try:
        s = as_spec(spec)
    except (ValueError, TypeError, KeyError):
        return False
    return effective_kind(s, cfg) == s.kind


def available_kinds(cfg: Config | None = None) -> frozenset[str]:
    """The SUPPORTED kinds that render at full quality here (what the director may offer)."""
    cfg = _cfg_or_default(cfg)
    return frozenset(k for k in SUPPORTED if effective_kind(TransitionSpec(kind=k, duration_s=0.5), cfg) == k)


# =========================================================================== the contract


def _stem_parts(a_seg, b_seg, ia: SegInfo, ib: SegInfo, ha: int, hb: int, cfg: Config):
    """The natural-sound stem of a transition: A's audio under its last ha frames, then B's under its
    first hb (the very samples the clip stands in for, so the sound runs on unbroken from the
    trimmed segments), with 15 ms fades at the cut; silence where a side has none."""
    aa, ab = probe_audio(a_seg, cfg), probe_audio(b_seg, cfg)
    parts = [AudioPart(str(a_seg) if aa else None, (ia.frames - ha) / FPS, ha / FPS),
             AudioPart(str(b_seg) if ab else None, 0.0, hb / FPS)]
    return [p for p in parts if p.duration > 0], aa or ab


def render_transition(a_seg: str | Path, b_seg: str | Path, spec, out: str | Path, cfg: Config,
                      *, interpolator=None, depth=None, generative=None) -> Path | None:
    """Write the transition clip between segments A and B to `out` (which must not exist).

    spec: anything as_spec() takes (this module's TransitionSpec or Transition, the renderer's own
    pydantic spec, a dict): .kind, .duration_s and optional .params. The clip has exactly n =
    round(duration_s * 30) frames standing in for A's last n//2 and B's first n - n//2 frames, in A's
    codec family (ProRes 422 HQ for ProRes, else all-intra x264 crf 10), with a natural-sound stem
    of exactly that length (A's tail then B's head; silence where there is none). A cut has no clip:
    returns None. A kind whose real backend is missing renders its clean stand-in (effective_kind);
    a generation that fails or runs over budget does the same. Both are logged."""
    spec = as_spec(spec)
    if spec.kind == "cut":
        return None
    out = Path(out)
    if out.exists():
        raise FileExistsError(out)
    ia, ib = probe_segment(a_seg, cfg), probe_segment(b_seg, cfg)
    bd = load_boundary(a_seg, b_seg, spec, cfg, ia, ib)
    ctx = _Ctx(cfg, interpolator, depth, generative)
    kind = effective_kind(spec, cfg, interpolator=interpolator, depth=depth, generative=generative)
    if kind != spec.kind:
        log.warning("%s: full-quality backend unavailable; rendering %s instead", spec.kind, kind)
    frames: list[np.ndarray] | None = None
    if kind == "generative":
        try:
            frames = list(_generative(bd, spec, ctx))
        except (GenerativeUnavailable, GenerationBudgetExceeded, RuntimeError, ValueError, MemoryError) as e:
            kind = effective_kind(spec.model_copy(update={"kind": STAND_IN["generative"]}), cfg,
                                  interpolator=interpolator, depth=depth)
            log.warning("generative transition failed (%s); using %s", e, kind)
    parts, ainfo = _stem_parts(a_seg, b_seg, ia, ib, bd.ha, bd.hb, cfg)
    w = ClipWriter(out, cfg, _fmt_for(ia, cfg), bd.n, bd.size, audio=parts, audio_info=ainfo)
    try:
        for frame in frames if frames is not None else RENDERERS[kind](bd, spec, ctx):
            w.write(frame)
        return w.close()
    except BaseException:
        w.abort()
        raise


def _packet_hashes(path: str | Path, cfg: Config) -> list[tuple[str, bool]]:
    """(md5 of the packet data, keyframe) per video packet, in decode order: no decoding needed."""
    out = _run([cfg.ffprobe, "-v", "error", "-select_streams", "v:0", "-show_packets", "-show_data_hash", "md5",
                "-show_entries", "packet=flags,data_hash", "-of", "csv=p=0", str(path)], timeout=120).stdout
    rows = []
    for line in out.decode().splitlines():
        parts = line.strip().split(",")
        if len(parts) >= 2:
            flags = next((p for p in parts if p[:1] in "K_" and len(p) <= 4), "")
            h = next((p for p in parts if p.startswith("MD5:")), "")
            rows.append((h, flags.startswith("K")))
    return rows


def _audio_hash(path: str | Path, start: float, dur: float, cfg: Config) -> str:
    """md5 of the decoded audio a stem takes from a file ("" when it has none)."""
    if probe_audio(path, cfg) is None:
        return ""
    out = _run([cfg.ffmpeg, "-hide_banner", "-nostdin", "-v", "error", "-ss", f"{start:.6f}", "-t", f"{dur:.6f}",
                "-i", str(path), "-map", "0:a:0", "-f", "md5", "-"], timeout=120).stdout
    return out.decode().strip()


def _backend_tag(kind: str, cfg: Config) -> str:
    if kind in ("morph", "speed_ramp_cut"):
        return getattr(interpolator_for(cfg), "tag", "?")
    if kind == "depth_parallax_through":
        return depth_available(cfg)
    if kind == "generative":
        avail = generative_available(cfg)
        st = settings(cfg)
        return f"{avail}:{st['gen_steps']}:{st['gen_size']}:{depth_available(cfg)}"
    return ""


def transition_key(a_seg: str | Path, b_seg: str | Path, spec, cfg: Config) -> str:
    """Content hash of (A's tail, B's head, spec, the kind and backend that will render it, output
    format, code version). The pictures are packet hashes (no decoding): just the frames used when
    every packet is a keyframe (all-intra x264, ProRes), else the whole stream; the sound is the
    decoded samples the stem takes."""
    spec = as_spec(spec)
    ha, hb = spec.halves()
    ia = probe_segment(a_seg, cfg)
    pa, pb = _packet_hashes(a_seg, cfg), _packet_hashes(b_seg, cfg)
    tail = [h for h, _ in pa[-ha:]] if all(k for _, k in pa) else [h for h, _ in pa]
    head = [h for h, _ in pb[:hb]] if all(k for _, k in pb) else [h for h, _ in pb]
    kind = effective_kind(spec, cfg)
    blob = json.dumps({"v": AITX_VERSION, "spec": spec.key_fields(), "a": tail, "b": head, "kind": kind,
                       "backend": _backend_tag(kind, cfg), "fmt": _fmt_for(ia, cfg),
                       "sound": [_audio_hash(a_seg, (len(pa) - ha) / FPS, ha / FPS, cfg),
                                 _audio_hash(b_seg, 0.0, hb / FPS, cfg)]}, sort_keys=True)
    return hashlib.sha256(blob.encode()).hexdigest()[:32]


def _cache_dir(cfg: Config) -> Path:
    st = settings(cfg)
    return Path(st["cache"]).expanduser() if st["cache"] else cfg.state_dir / "aitx-cache"


def cached_transition(a_seg: str | Path, b_seg: str | Path, spec, cfg: Config,
                      cache_dir: Path | None = None) -> tuple[Path | None, bool, float]:
    """(clip, cache hit, seconds) for a transition, rendered into the cache when it is not there."""
    t0 = time.monotonic()
    spec = as_spec(spec)
    if spec.kind == "cut":
        return None, True, 0.0
    cache = Path(cache_dir) if cache_dir else _cache_dir(cfg)
    cache.mkdir(parents=True, exist_ok=True)
    fmt = _fmt_for(probe_segment(a_seg, cfg), cfg)
    path = cache / f"{transition_key(a_seg, b_seg, spec, cfg)}{'.mov' if fmt == 'prores' else '.mp4'}"
    if path.exists():
        return path, True, time.monotonic() - t0
    try:
        render_transition(a_seg, b_seg, spec, path, cfg)
    except FileExistsError:                       # a parallel render of the same thing won
        pass
    return path, False, time.monotonic() - t0


def _job(args: tuple) -> tuple[str | None, bool, float]:
    a, b, spec_json, cfg, cache = args
    logging.basicConfig(level=logging.WARNING)
    path, hit, secs = cached_transition(a, b, TransitionSpec.model_validate_json(spec_json), cfg, cache)
    return (str(path) if path else None), hit, secs


def fit_specs(frames: list[int], specs: list) -> list[TransitionSpec]:
    """Shorten transitions that would eat a whole segment: every segment keeps at least one frame of
    its own and a transition never takes more than a segment has (even frame counts are kept)."""
    out = [as_spec(s) for s in specs]
    for i, s in enumerate(out):
        if s.kind == "cut":
            continue
        ha, hb = s.halves()
        room_a = frames[i] - 1 - (out[i - 1].halves()[1] if i > 0 else 0)
        room_b = frames[i + 1] - 1
        k = min(ha, max(0, room_a)), min(hb, max(0, room_b))
        if k != (ha, hb):
            m = min(k)
            if m < 1:
                log.warning("transition %d (%s) does not fit its segments; cutting", i, s.kind)
                out[i] = s.model_copy(update={"kind": "cut", "duration_s": 0.0})
            else:
                log.warning("transition %d (%s) shortened to %d frames to fit", i, s.kind, 2 * m)
                out[i] = s.model_copy(update={"duration_s": 2 * m / FPS})
    return out


def join(segments: list[str | Path], specs: list, out: str | Path, cfg: Config, *,
         audio: str | Path | None = None, audio_start: float = 0.0, workers: int | None = None,
         cache_dir: Path | None = None) -> dict:
    """Reference assembler: transitions (parallel, cached) + trimmed segments, concatenated, one final
    encode (libx264 High, as render.py; reel_encoder videotoolbox for hardware). specs: anything
    as_spec() takes. Sound: `audio` (a finished track, muxed from audio_start, copied when it is
    AAC); else the natural-sound stems of the pieces, joined exactly as the pictures are (AAC 256k);
    else silence. The result is exactly as long as the segments together. Returns timings and cache use."""
    out = Path(out)
    if out.exists():
        raise FileExistsError(out)
    if len(specs) != len(segments) - 1:
        raise ValueError(f"{len(segments)} segments need {len(segments) - 1} transition specs, got {len(specs)}")
    st = settings(cfg)
    infos = [probe_segment(s, cfg) for s in segments]
    specs = fit_specs([i.frames for i in infos], specs)
    cache = Path(cache_dir) if cache_dir else _cache_dir(cfg)
    jobs = [(str(segments[i]), str(segments[i + 1]), s.model_dump_json(), cfg, cache)
            for i, s in enumerate(specs) if s.kind != "cut"]
    t0 = time.monotonic()
    results: dict[int, tuple[str | None, bool, float]] = {}
    idx = [i for i, s in enumerate(specs) if s.kind != "cut"]
    n_workers = min(workers or st["workers"], max(1, len(jobs)))
    if jobs:
        if n_workers <= 1:
            done = [_job(j) for j in jobs]
        else:
            with ProcessPoolExecutor(n_workers) as pool:
                done = list(pool.map(_job, jobs))
        results = dict(zip(idx, done))
    t_trans = time.monotonic() - t0

    # the pieces in order: (file, first frame, frame count)
    pieces: list[tuple[str, int, int]] = []
    for i, info in enumerate(infos):
        head = specs[i - 1].halves()[1] if i > 0 else 0
        tail = specs[i].halves()[0] if i < len(specs) else 0
        pieces.append((str(segments[i]), head, info.frames - head - tail))
        if i < len(specs) and specs[i].kind != "cut":
            pieces.append((results[i][0], 0, specs[i].frames()))
    total = sum(n for _, _, n in pieces)
    seconds = total / FPS
    has_audio = {f: probe_audio(f, cfg) is not None for f in {f for f, _, _ in pieces}}
    natural = audio is None and any(has_audio.values())
    args = [cfg.ffmpeg, "-hide_banner", "-nostdin", "-v", "error", "-n"]
    chains, labels = [], []
    for k, (f, first, n) in enumerate(pieces):
        args += ["-i", f]
        chains.append(f"[{k}:v:0]trim=start_frame={first}:end_frame={first + n},setpts=PTS-STARTPTS,"
                      f"format=yuv420p,setsar=1[v{k}]")
        labels.append(f"[v{k}]")
        if natural:
            d, s0 = n / FPS, first / FPS
            src = (f"[{k}:a:0]atrim=start={s0:.6f}:duration={d:.6f},asetpts=PTS-STARTPTS,"
                   if has_audio[f] else "anullsrc=r=48000:cl=stereo,")
            chains.append(f"{src}aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,"
                          f"apad=whole_dur={d:.6f},atrim=duration={d:.6f}[a{k}]")
            labels.append(f"[a{k}]")
    n_in = len(pieces)
    graph = ";".join(chains) + ";" + "".join(labels) + \
        (f"concat=n={n_in}:v=1:a=1[vcat][aout];[vcat]fps={FPS}[vout]" if natural
         else f"concat=n={n_in}:v=1:a=0,fps={FPS}[vout]")
    if audio is not None:
        args += ["-ss", f"{audio_start:.3f}", "-t", f"{seconds + 0.5:.3f}", "-i", str(audio)]
        copy = _audio_codec(audio, cfg) == "aac"
        amap = ["-map", f"{n_in}:a:0", "-c:a", "copy"] if copy else ["-map", f"{n_in}:a:0", "-c:a", "aac", "-b:a", "256k"]
    elif natural:
        amap = ["-map", "[aout]", "-c:a", "aac", "-b:a", "256k"]
    else:
        args += ["-f", "lavfi", "-t", f"{seconds:.3f}", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]
        amap = ["-map", f"{n_in}:a", "-c:a", "aac", "-b:a", "128k"]
    args += ["-filter_complex", graph, "-map", "[vout]", *amap]
    if st["encoder"] == "videotoolbox":
        args += ["-c:v", "h264_videotoolbox", "-profile:v", "high", "-b:v", "24M", "-maxrate", "30M", "-bufsize", "60M"]
    else:
        args += ["-c:v", "libx264", "-preset", str(st["preset"]), "-crf", str(st["crf"]), "-profile:v", "high",
                 "-level:v", "4.2", "-maxrate", "30M", "-bufsize", "60M"]
    tmp = out.with_name(f".{out.stem}.{uuid.uuid4().hex[:8]}.mp4")
    args += ["-pix_fmt", "yuv420p", "-r", str(FPS), "-fps_mode", "cfr", "-g", str(2 * FPS),
             "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
             "-frames:v", str(total), "-t", f"{seconds:.3f}", "-movflags", "+faststart", str(tmp)]
    t1 = time.monotonic()
    try:
        out.parent.mkdir(parents=True, exist_ok=True)
        _run(args, timeout=3600)
        got = probe_segment(tmp, cfg)
        if got.frames != total:
            raise RuntimeError(f"joined reel has {got.frames} frames, expected {total}")
        if out.exists():
            raise FileExistsError(out)
        os.replace(tmp, out)
    finally:
        tmp.unlink(missing_ok=True)
    return {"out": str(out), "frames": total, "seconds": seconds, "transitions_s": round(t_trans, 2),
            "encode_s": round(time.monotonic() - t1, 2), "workers": n_workers,
            "sound": "track" if audio is not None else "natural" if natural else "silent",
            "transitions": [{"index": i, "kind": specs[i].kind, "rendered_as": effective_kind(specs[i], cfg),
                             "frames": specs[i].frames(), "clip": results[i][0], "cached": results[i][1],
                             "seconds": round(results[i][2], 2)} for i in idx],
            "specs": [s.wire().model_dump(mode="json") for s in specs]}


def _audio_codec(path: str | Path, cfg: Config) -> str:
    out = _run([cfg.ffprobe, "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name",
                "-of", "csv=p=0", str(path)], timeout=60).stdout.decode().strip()
    return out


def backends_report(cfg: Config) -> dict:
    rife = find_rife(cfg)
    return {"interpolator": f"rife ({rife})" if rife and settings(cfg)["interp"] != "minterpolate" else "minterpolate",
            "depth": depth_available(cfg), "generative": generative_available(cfg),
            "full_quality_kinds": sorted(available_kinds(cfg)),
            "allow_fallback": settings(cfg)["allow_fallback"],
            "workers": settings(cfg)["workers"], "cache": str(_cache_dir(cfg))}


# =========================================================================== contact sheets


def _font(px: int):
    try:
        return ImageFont.load_default(size=px)
    except TypeError:
        return ImageFont.load_default()


def contact_sheet(a_seg: str | Path, b_seg: str | Path, clip: str | Path | None, spec: TransitionSpec,
                  out_png: str | Path, cfg: Config, k: int = 5, thumb_w: int = 216) -> Path:
    """One row: A's frame before the transition, k frames across the transition clip (first and last
    included), B's frame after it. Labelled, so a move can be judged (and two sets compared) at a glance."""
    ia, ib = probe_segment(a_seg, cfg), probe_segment(b_seg, cfg)
    ha, hb = spec.halves()
    th = int(round(thumb_w * ia.height / ia.width))
    size = (thumb_w, th)
    tiles: list[tuple[np.ndarray, str]] = []
    tiles.append((read_frames(a_seg, max(0, ia.frames - ha - 1), 1, cfg, ia, size)[0], "A before"))
    if clip is not None:
        ic = probe_segment(clip, cfg)
        allf = read_frames(clip, 0, ic.frames, cfg, ic, size)
        n = len(allf)
        for j in range(k):
            t = round(j * (n - 1) / (k - 1)) if k > 1 else 0
            tiles.append((allf[t], f"T {t}/{n - 1}"))
    tiles.append((read_frames(b_seg, min(hb, ib.frames - 1), 1, cfg, ib, size)[0], "B after"))
    gap, top = 6, 26
    sheet = Image.new("RGB", (len(tiles) * (thumb_w + gap) + gap, th + top + gap), (24, 24, 24))
    draw = ImageDraw.Draw(sheet)
    font = _font(15)
    title = f"{spec.kind} {spec.duration_s:.2f}s" + (f" {spec.direction}" if spec.direction else "") + \
            (f" {spec.color}" if spec.color else "")
    draw.text((gap, 4), title, fill=(255, 255, 255), font=font)
    for j, (fr, label) in enumerate(tiles):
        x = gap + j * (thumb_w + gap)
        sheet.paste(Image.fromarray(_u8(_f(fr))), (x, top))
        draw.rectangle((x, top, x + 9 * len(label) + 6, top + 20), fill=(0, 0, 0))
        draw.text((x + 3, top + 2), label, fill=(255, 220, 120), font=_font(13))
    out_png = Path(out_png)
    out_png.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_png)
    return out_png


def frames_sheet(frames: list[np.ndarray], labels: list[str], out_png: str | Path, title: str = "",
                 thumb_w: int = 216) -> Path:
    """A labelled row of in-memory frames (for parallax_still and other generators)."""
    th = int(round(thumb_w * frames[0].shape[0] / frames[0].shape[1]))
    gap, top = 6, 26
    sheet = Image.new("RGB", (len(frames) * (thumb_w + gap) + gap, th + top + gap), (24, 24, 24))
    draw = ImageDraw.Draw(sheet)
    draw.text((gap, 4), title, fill=(255, 255, 255), font=_font(15))
    for j, (fr, label) in enumerate(zip(frames, labels)):
        x = gap + j * (thumb_w + gap)
        sheet.paste(Image.fromarray(_u8(fr)).resize((thumb_w, th), Image.LANCZOS), (x, top))
        draw.rectangle((x, top, x + 9 * len(label) + 6, top + 20), fill=(0, 0, 0))
        draw.text((x + 3, top + 2), label, fill=(255, 220, 120), font=_font(13))
    Path(out_png).parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_png)
    return Path(out_png)


# =========================================================================== synthetic media (demo, tests)


def _noise1d(n: int, rng: np.random.Generator, octaves: int = 6) -> np.ndarray:
    out = np.zeros(n, np.float32)
    x = np.linspace(0, 1, n)
    for o in range(octaves):
        k = 2 ** (o + 1)
        pts = rng.standard_normal(k + 1)
        out += np.interp(x * k, np.arange(k + 1), pts).astype(np.float32) / (1.7 ** o)
    return out


def _noise2d(h: int, w: int, rng: np.random.Generator, scale: int = 8, octaves: int = 4) -> np.ndarray:
    out = np.zeros((h, w), np.float32)
    for o in range(octaves):
        s = scale * 2 ** o
        g = rng.standard_normal((s + 1, s + 1)).astype(np.float32)
        out += _resize(g, w, h, Image.BICUBIC) / (2 ** o)
    return out


def demo_landscape(w: int = 2400, h: int = 1600, seed: int = 1, sun: float = 0.62, hour: str = "golden"
                   ) -> tuple[np.ndarray, np.ndarray]:
    """A layered mountain landscape (sky gradient, sun glow, three ridges with aerial perspective, a
    lake, textured foreground) and its true depth (0 far .. 1 near)."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    v = yy / h
    if hour == "golden":
        top, hor = np.array([0.18, 0.32, 0.62]), np.array([1.0, 0.72, 0.42])
    else:
        top, hor = np.array([0.30, 0.52, 0.86]), np.array([0.80, 0.88, 0.95])
    t = np.clip(v / 0.55, 0, 1)[..., None]
    img = top * (1 - t) ** 1.2 + hor * (1 - (1 - t) ** 1.2)
    sx, sy = sun * w, 0.42 * h
    glow = np.exp(-((xx - sx) ** 2 + (yy - sy) ** 2) / (2 * (0.18 * w) ** 2))[..., None]
    img = img + glow * np.array([0.35, 0.25, 0.10]) + np.exp(-((xx - sx) ** 2 + (yy - sy) ** 2) / (2 * (0.012 * w) ** 2))[..., None]
    cloud = np.clip(_noise2d(h, w, rng, 4, 4) * 0.5, 0, None) * np.clip(1 - v / 0.45, 0, 1)
    img = img + cloud[..., None] * np.array([0.25, 0.2, 0.18])
    depth = np.zeros((h, w), np.float32)
    ridges = [(0.46, 0.10, (0.45, 0.48, 0.62), 0.25), (0.53, 0.09, (0.30, 0.30, 0.42), 0.45),
              (0.62, 0.08, (0.16, 0.18, 0.22), 0.65)]
    for base, amp, col, dq in ridges:
        line = (base - amp * _noise1d(w, rng) * 0.35) * h
        mask = yy > line[None, :]
        tex = _noise2d(h, w, rng, 32, 3) * 0.04
        shade = np.array(col) * (1 + 0.25 * np.clip((yy - line[None, :]) / (0.2 * h), 0, 1))[..., None] * 0.9
        img = np.where(mask[..., None], shade + tex[..., None], img)
        depth = np.where(mask, dq + 0.1 * np.clip((yy - line[None, :]) / h, 0, 1), depth)
    lake = (yy > 0.70 * h) & (yy < 0.80 * h)
    refl = img[np.clip((2 * 0.70 * h - yy).astype(int), 0, h - 1), xx.astype(int)] * 0.75 + 0.03
    img = np.where(lake[..., None], refl, img)
    depth = np.where(lake, 0.7 + 0.1 * (yy - 0.7 * h) / (0.1 * h), depth)
    fg = yy > (0.80 + 0.03 * _noise1d(w, rng)[None, :]) * h
    grass = 0.12 + 0.12 * _noise2d(h, w, rng, 96, 2)[..., None] * np.array([0.6, 1.0, 0.4])
    img = np.where(fg[..., None], np.array([0.20, 0.17, 0.08]) + grass, img)
    depth = np.where(fg, 0.85 + 0.15 * (yy / h - 0.8) / 0.2, depth)
    return np.clip(img, 0, 1).astype(np.float32), np.clip(depth, 0, 1).astype(np.float32)


def demo_starfield(w: int = 2400, h: int = 1600, seed: int = 2) -> tuple[np.ndarray, np.ndarray]:
    """Night sky: deep blue-to-black gradient, a Milky Way band, stars of many sizes and colours, a
    faint horizon glow and a dark mountain silhouette."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    v = yy / h
    img = (np.array([0.012, 0.018, 0.045]) + np.array([0.06, 0.07, 0.12]) * np.clip(v / 0.75, 0, 1)[..., None] ** 2)
    band = np.exp(-(((xx / w - 0.25) - (yy / h) * 0.6) ** 2) / (2 * 0.08 ** 2))
    dust = np.clip(_noise2d(h, w, rng, 6, 5) * 0.6 + 0.5, 0, 1)
    img = img + (band * dust)[..., None] * np.array([0.10, 0.09, 0.12])
    small = np.zeros((h, w), np.float32)
    n = int(w * h / 900)
    sx = rng.integers(0, w, n)
    sy = rng.integers(0, h, n)
    b = rng.pareto(2.2, n).astype(np.float32) * 0.15 + 0.08
    np.add.at(small, (sy, sx), b)
    stars = np.stack([box_blur(small, 1, 1) * 6] * 3, -1)
    big = rng.choice(n, n // 30)
    for k in big:
        r = int(2 + 2 * b[k])
        y0, x0 = sy[k], sx[k]
        ys, xs = slice(max(0, y0 - 4 * r), min(h, y0 + 4 * r)), slice(max(0, x0 - 4 * r), min(w, x0 + 4 * r))
        gy, gx = np.mgrid[ys, xs]
        col = np.array([1.0, 0.9, 0.8]) if k % 3 == 0 else np.array([0.8, 0.88, 1.0])
        stars[ys, xs] += np.exp(-((gy - y0) ** 2 + (gx - x0) ** 2) / (2 * r ** 2))[..., None] * col * min(1.5, b[k])
    img = img + stars
    img = img + np.exp(-((v - 0.78) / 0.06) ** 2)[..., None] * np.array([0.10, 0.07, 0.05])
    line = (0.78 - 0.08 * np.clip(_noise1d(w, rng) * 0.4 + 0.3, 0, 1)) * h
    ground = yy > line[None, :]
    img = np.where(ground[..., None], np.array([0.012, 0.012, 0.018]) + 0.01 * _noise2d(h, w, rng, 64, 2)[..., None], img)
    depth = np.where(ground, 0.6 + 0.4 * (yy / h - 0.7) / 0.3, 0.0).astype(np.float32)
    return np.clip(img, 0, 1).astype(np.float32), np.clip(depth, 0, 1)


def demo_city(w: int = 2400, h: int = 1600, seed: int = 3) -> tuple[np.ndarray, np.ndarray]:
    """City at blue hour: gradient sky, building silhouettes with warm and cool lit windows, street
    light bokeh in the foreground."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    v = yy / h
    img = np.array([0.05, 0.08, 0.22]) * (1 - v[..., None]) + np.array([0.25, 0.18, 0.30]) * v[..., None]
    depth = np.zeros((h, w), np.float32)
    x = 0
    while x < w:
        bw = int(rng.integers(w // 20, w // 8))
        top = int(h * rng.uniform(0.25, 0.6))
        layer = rng.uniform(0, 1)
        shade = np.array([0.03, 0.035, 0.06]) * (1 + layer)
        img[top:, x:x + bw] = shade
        depth[top:, x:x + bw] = 0.3 + 0.4 * layer
        for wy in range(top + 12, int(h * 0.85), 26):
            for wx in range(x + 8, x + bw - 10, 18):
                if rng.random() < 0.45:
                    col = np.array([1.0, 0.75, 0.4]) if rng.random() < 0.7 else np.array([0.7, 0.85, 1.0])
                    img[wy:wy + 12, wx:wx + 9] = col * rng.uniform(0.5, 1.0)
        x += bw + int(rng.integers(0, w // 60))
    bokeh = np.zeros((h, w, 3), np.float32)
    for _ in range(40):
        cx, cy, r = rng.uniform(0, w), rng.uniform(0.8 * h, h), rng.uniform(18, 45)
        col = np.array([1.0, 0.65, 0.3]) if rng.random() < 0.7 else np.array([0.5, 0.7, 1.0])
        bokeh += (np.clip(1.2 - np.hypot(xx - cx, yy - cy) / r, 0, 1) ** 0.5)[..., None] * col * 0.5
    fg = yy > 0.85 * h
    img = np.where(fg[..., None], np.array([0.04, 0.035, 0.05]), img) + bokeh
    depth = np.where(fg, 0.9, depth)
    return np.clip(img, 0, 1).astype(np.float32), depth


def _save_png(img: np.ndarray, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(_u8(img)).save(path)
    return path


def demo_segment_from_frames(frames: Iterator[np.ndarray], n: int, out: Path, cfg: Config) -> Path:
    w = ClipWriter(out, cfg, "x264", n, (OUT_W, OUT_H))
    try:
        for f in frames:
            w.write(f)
        return w.close()
    except BaseException:
        w.abort()
        raise


def demo_kenburns(img: np.ndarray, seconds: float, out: Path, cfg: Config, z0: float = 1.0, z1: float = 1.08,
                  focus: tuple[float, float] = (0.5, 0.5)) -> Path:
    """A still segment with a Ken Burns push (geometric zoom about focus), cut 9:16 from img."""
    H, W = img.shape[:2]
    cw = min(W, H * OUT_W / OUT_H)
    ch = cw * OUT_H / OUT_W
    x0 = min(max(focus[0] * W - cw / 2, 0), W - cw)
    y0 = min(max(focus[1] * H - ch / 2, 0), H - ch)
    base = _resize(img[int(y0):int(y0 + ch), int(x0):int(x0 + cw)], OUT_W, OUT_H, Image.LANCZOS)
    n = int(round(seconds * FPS))
    gen = (zoom_about(base, z0 * (z1 / z0) ** (i / max(n - 1, 1)), OUT_W / 2, OUT_H / 2) for i in range(n))
    return demo_segment_from_frames(gen, n, out, cfg)


def demo_pan(img: np.ndarray, seconds: float, out: Path, cfg: Config, speed_px: float = 14.0) -> Path:
    """A 'video' segment: the camera pans right across img at speed_px output pixels per frame (the
    content moves left), with a little sensor noise."""
    H, W = img.shape[:2]
    s = OUT_H / H
    big = _resize(img, int(W * s), OUT_H, Image.LANCZOS)
    n = int(round(seconds * FPS))
    rng = np.random.default_rng(7)

    def gen():
        for i in range(n):
            x = min(i * speed_px, big.shape[1] - OUT_W - 1)
            fr = _affine(big[:, :OUT_W + int(x) + 2], (1, 0, x, 0, 1, 0))[:, :OUT_W]
            yield np.clip(fr + rng.normal(0, 0.006, fr.shape).astype(np.float32), 0, 1)
    return demo_segment_from_frames(gen(), n, out, cfg)


def demo_testsrc(seconds: float, out: Path, cfg: Config) -> Path:
    if out.exists():
        raise FileExistsError(out)
    _run([cfg.ffmpeg, "-hide_banner", "-nostdin", "-v", "error", "-n", "-f", "lavfi", "-i",
          f"testsrc2=s={OUT_W}x{OUT_H}:r={FPS}:d={seconds}", *_encode_args("x264"), "-colorspace", "bt709",
          "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", str(out)])
    return out


DEMO_PAIRS = {
    # kind: (A source, B source, spec)
    "morph": ("land_golden", "land_golden_later", TransitionSpec(kind="morph", duration_s=0.6)),
    "depth_parallax_through": ("land_golden", "stars", TransitionSpec(kind="depth_parallax_through", duration_s=1.0)),
    "generative": ("land_golden", "city", TransitionSpec(kind="generative", duration_s=1.0)),
    "whip": ("pan_right", "city", TransitionSpec(kind="whip", duration_s=0.3, direction="right")),
    "zoom_through": ("city", "land_day", TransitionSpec(kind="zoom_through", duration_s=0.5, focus_a=(0.5, 0.45))),
    "match_dissolve": ("land_day", "land_golden", TransitionSpec(kind="match_dissolve", duration_s=0.6)),
    "luma_dip": ("land_golden", "stars", TransitionSpec(kind="luma_dip", duration_s=0.8)),
    "flash": ("stars", "land_day", TransitionSpec(kind="flash", duration_s=0.4, color="warm")),
    "speed_ramp_cut": ("testsrc", "land_day", TransitionSpec(kind="speed_ramp_cut", duration_s=0.6)),
}


def demo(out_dir: str | Path, cfg: Config, kinds: list[str] | None = None, parallax: bool = True,
         reel: bool = True) -> dict:
    """Render every transition kind on synthetic footage (and parallax_still moves), with a contact
    sheet for each and the timings; then let the rule director pick transitions for a 14 s reel of
    the segments and join it twice (cold, then from the cache). Writes only inside out_dir."""
    out_dir = Path(out_dir)
    src, segs, clips, sheets = (out_dir / d for d in ("src", "segments", "transitions", "sheets"))
    for d in (src, segs, clips, sheets):
        d.mkdir(parents=True, exist_ok=True)
    land, land_depth = demo_landscape(seed=1, hour="golden")
    land2, _ = demo_landscape(seed=1, hour="golden", sun=0.66)
    day, _ = demo_landscape(seed=5, hour="day", sun=0.3)
    stars, stars_depth = demo_starfield()
    city, _ = demo_city()
    for name, img in (("land_golden", land), ("land_golden_later", land2), ("land_day", day), ("stars", stars),
                      ("city", city)):
        if not (src / f"{name}.png").exists():
            _save_png(img, src / f"{name}.png")

    def seg(name: str) -> Path:
        p = segs / f"{name}.mp4"
        if p.exists():
            return p
        if name == "land_golden":
            return demo_kenburns(land, 2.0, p, cfg, 1.0, 1.06, (0.55, 0.5))
        if name == "land_golden_later":
            return demo_kenburns(land2, 2.0, p, cfg, 1.04, 1.10, (0.57, 0.5))
        if name == "land_day":
            return demo_kenburns(day, 2.0, p, cfg, 1.0, 1.08, (0.4, 0.5))
        if name == "stars":
            return demo_kenburns(stars, 2.0, p, cfg, 1.0, 1.05, (0.45, 0.5))
        if name == "city":
            return demo_kenburns(city, 2.0, p, cfg, 1.08, 1.0, (0.5, 0.5))
        if name == "pan_right":
            return demo_pan(day, 2.0, p, cfg)
        if name == "testsrc":
            return demo_testsrc(2.0, p, cfg)
        raise KeyError(name)

    report: dict = {"backends": backends_report(cfg), "transitions": {}, "parallax_still": {}}
    for kind in kinds or list(DEMO_PAIRS):
        a, b, spec = DEMO_PAIRS[kind]
        if kind == "generative" and not settings(cfg)["generative"]:
            continue
        sa, sb = seg(a), seg(b)
        clip = clips / f"{kind}.mp4"
        if clip.exists():
            clip.unlink()
        t0 = time.monotonic()
        render_transition(sa, sb, spec, clip, cfg)
        dt = time.monotonic() - t0
        sheet = contact_sheet(sa, sb, clip, spec, sheets / f"{kind}.png", cfg)
        report["transitions"][kind] = {"rendered_as": effective_kind(spec, cfg), "seconds": round(dt, 2),
                                       "frames": spec.frames(),
                                       "per_frame_s": round(dt / spec.frames(), 3), "sheet": str(sheet)}
        log.info("%s: %.1fs", kind, dt)
    if reel:
        from . import direction
        order = ["pan_right", "city", "land_day", "land_golden", "land_golden_later", "stars", "testsrc"]
        files = [seg(name) for name in order]
        t0 = time.monotonic()
        feats = direction.reel_features(files, cfg)
        cuts = [direction.PlanCut(at_s=2.0 * (i + 1), beat_strength=1.0 if i % 2 == 0 else 0.6)
                for i in range(len(files) - 1)]
        specs = direction.auto_direct(cuts, feats, beat_s=0.5, reel_seconds=14.0, cfg=cfg)
        t_dir = time.monotonic() - t0
        runs = []
        for name in ("reel.mp4", "reel_cached.mp4"):
            dest = out_dir / name
            dest.unlink(missing_ok=True)
            t0 = time.monotonic()
            rep = join(files, specs, dest, cfg, cache_dir=out_dir / "cache")
            runs.append({"file": str(dest), "seconds": round(time.monotonic() - t0, 2),
                         "transitions_s": rep["transitions_s"], "encode_s": rep["encode_s"],
                         "cached": [t["cached"] for t in rep["transitions"]]})
        report["reel"] = {"direction_s": round(t_dir, 2), "workers": settings(cfg)["workers"],
                          "specs": [s.model_dump(mode="json") for s in specs],
                          "features": [f.summary() for f in feats], "runs": runs}
    if parallax:
        for name, img, depth, move in (("land_golden", land, land_depth, "dolly_in"),
                                       ("stars", stars, stars_depth, "truck_right"),
                                       ("land_day", day, None, "dolly_zoom")):
            t0 = time.monotonic()
            frames = list(parallax_frames(img, depth, 2.0, move, depth_fn=depth_for(cfg)))
            dt = time.monotonic() - t0
            pick = [0, 15, 30, 45, 59]
            sheet = frames_sheet([frames[i] for i in pick], [f"f {i}" for i in pick],
                                 sheets / f"parallax_still_{name}_{move}.png", f"parallax_still {move} ({name})")
            report["parallax_still"][f"{name}:{move}"] = {"seconds": round(dt, 2), "per_frame_s": round(dt / 60, 3),
                                                          "sheet": str(sheet)}
    (out_dir / "report.json").write_text(json.dumps(report, indent=2))
    return report


# =========================================================================== CLI


def _cfg_from(args) -> Config:
    if getattr(args, "config", None):
        from . import config as config_mod
        return config_mod.load(Path(args.config))
    out = Path(getattr(args, "out", None) or tempfile.gettempdir())
    return Config(library_roots=[], output_dir=out if out.suffix == "" else out.parent)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m igmp.aitx", description=__doc__.split("\n")[0])
    ap.add_argument("--config", help="igmp config.toml (default: none; built-in settings)")
    ap.add_argument("-v", "--verbose", action="store_true")
    ap.add_argument("--allow-fallback", action="store_true",
                    help="accept minterpolate and the heuristic depth (aitx_allow_fallback)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("doctor", help="which backends are available")
    d = sub.add_parser("demo", help="render every kind on synthetic footage, with contact sheets")
    d.add_argument("out")
    d.add_argument("--only", help="comma-separated kinds")
    d.add_argument("--no-parallax", action="store_true")
    d.add_argument("--no-reel", action="store_true")
    r = sub.add_parser("render", help="render one transition clip")
    r.add_argument("a")
    r.add_argument("b")
    r.add_argument("kind", choices=[k for k in KINDS if k != "cut"])
    r.add_argument("duration", type=float)
    r.add_argument("out")
    r.add_argument("--direction")
    r.add_argument("--color")
    r.add_argument("--sheet", help="also write a contact sheet PNG here")
    j = sub.add_parser("join", help="join segments with transitions from a JSON list of specs")
    j.add_argument("out")
    j.add_argument("specs", help="JSON file: a list of TransitionSpec objects")
    j.add_argument("segments", nargs="+")
    j.add_argument("--audio")
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO if args.verbose else logging.WARNING, format="%(levelname)s %(message)s")
    cfg = _cfg_from(args)
    if args.allow_fallback:
        cfg.extra = {**(cfg.extra or {}), "aitx_allow_fallback": True}
    if args.cmd == "doctor":
        print(json.dumps(backends_report(cfg), indent=2))
    elif args.cmd == "demo":
        rep = demo(args.out, cfg, args.only.split(",") if args.only else None, not args.no_parallax,
                   not args.no_reel)
        print(json.dumps(rep, indent=2))
    elif args.cmd == "render":
        spec = TransitionSpec(kind=args.kind, duration_s=args.duration, direction=args.direction, color=args.color)
        t0 = time.monotonic()
        render_transition(args.a, args.b, spec, args.out, cfg)
        print(f"{args.out}: {time.monotonic() - t0:.1f}s")
        if args.sheet:
            contact_sheet(args.a, args.b, args.out, spec, args.sheet, cfg)
    elif args.cmd == "join":
        specs = json.loads(Path(args.specs).read_text())         # any shape as_spec() takes
        print(json.dumps(join(args.segments, specs, args.out, cfg, audio=args.audio), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
